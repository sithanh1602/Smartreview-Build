import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { analyzeScene, ENGINE_3D_VERSION, POLICY_3D_VERSION } from '../../core/risk3d/engine.ts';
import { projectRoot } from '../config.ts';
import type { CvatJobData } from './mapper.ts';
import { mapCvat3D } from './mapper3d.ts';
import type { Risk } from './scans.ts';
import { getCvatFrameImage } from './client.ts';
import { runPointPillarsOnPointClouds, evaluatePointPillars3DRisks } from './pointpillars.ts';
const exec = promisify(execFile);
export async function scanCvat3D(
  data: CvatJobData,
  onProgress?: (percent: number, message: string, stage?: 'loading' | 'ai' | 'policy' | 'done') => void,
) {
  onProgress?.(5, 'Đang chuẩn bị nạp dữ liệu annotation và cấu trúc 3D...', 'loading');
  const mapped = mapCvat3D(data);
  let scene = mapped.scene;
  const skipped = mapped.skipped;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smartreview-cvat3d-'));
  let pointPillarsRisks: Risk[] = [];
  let ppNote = 'PointPillars 3D: chưa chạy (không có frame có nhãn).';
  try {
    const populated = scene.frames.filter((f) => f.boxes.length);
    const MAX_FRAMES = 30;
    // Labeled frames first (policy + AI cross-check), then unlabeled frames sampled evenly so
    // an unlabeled dataset still gets PointPillars detections (reported as "missing object").
    const unlabeled = scene.frames.filter((f) => !f.boxes.length);
    const room = Math.max(0, MAX_FRAMES - populated.length);
    const step = room ? Math.max(1, Math.ceil(unlabeled.length / room)) : 1;
    const sampledUnlabeled = room ? unlabeled.filter((_, i) => i % step === 0).slice(0, room) : [];
    const toScan = [...populated.slice(0, MAX_FRAMES), ...sampledUnlabeled];
    for (const frame of populated.slice(MAX_FRAMES)) {
      skipped.push({
        object_id: '*',
        frame: frame.timestamp,
        reason: 'Chưa đo LiDAR: giới hạn 30 frame mỗi lượt quét.',
      });
    }
    const downloaded: number[] = [];
    for (let i = 0; i < toScan.length; i++) {
      const frame = toScan[i];
      onProgress?.(
        10 + Math.round(((i + 1) / toScan.length) * 20),
        `Đang tải point cloud frame ${frame.timestamp} (${i + 1}/${toScan.length})...`,
        'loading',
      );
      try {
        await fs.writeFile(
          path.join(root, `${frame.timestamp}.pcd`),
          await getCvatFrameImage(data.job.id, frame.timestamp),
        );
        downloaded.push(frame.timestamp);
      } catch {
        skipped.push({
          object_id: '*',
          frame: frame.timestamp,
          reason: 'Không tải được point cloud từ CVAT.',
        });
      }
    }
    await fs.writeFile(path.join(root, 'scene.json'), JSON.stringify(scene));
    if (populated.length) {
      onProgress?.(35, 'Đang đo đạc mật độ điểm LiDAR và phân tích mặt đường...', 'policy');
      try {
        await exec(
          process.env.SMARTREVIEW_AI_PYTHON || path.join(projectRoot, '.venv/bin/python'),
          [fileURLToPath(new URL('./measure3d.py', import.meta.url)), root],
          { timeout: 90000, maxBuffer: 1024 * 1024 },
        );
        const measured = JSON.parse(await fs.readFile(path.join(root, 'measured.json'), 'utf8'));
        scene = measured.scene;
        skipped.push(...measured.skipped);
      } catch {
        skipped.push({
          object_id: '*',
          frame: -1,
          reason:
            'Chưa đo LiDAR: kiểm tra Python, numpy, pyarrow hoặc thời gian xử lý. Chỉ chấm hình học cuboid.',
        });
      }
    }

    // Run PointPillars 3D AI inference on every downloaded frame (labeled or not)
    if (downloaded.length) {
      try {
        const pcdFiles = downloaded.map((ts) => ({
          frame_index: ts,
          path: path.join(root, `${ts}.pcd`),
        }));
        const t0 = Date.now();
        onProgress?.(45, `Đang khởi chạy mô hình AI PointPillars 3D (${pcdFiles.length} frames)...`, 'ai');
        const ppResult = await runPointPillarsOnPointClouds(pcdFiles, (done, total) => {
          const pct = 45 + Math.round((done / total) * 35);
          onProgress?.(pct, `PointPillars 3D: Đang quét frame ${done}/${total}...`, 'ai');
        });
        if (!ppResult.available) {
          ppNote = 'PointPillars 3D: KHÔNG chạy được (thiếu model/python).';
        } else {
          pointPillarsRisks = evaluatePointPillars3DRisks(ppResult.predictions, scene.frames);
          ppNote = `PointPillars 3D: đã quét ${pcdFiles.length} frame${populated.length ? '' : ' (chưa có nhãn)'}, AI thấy ${ppResult.predictions.length} vật thể, ${pointPillarsRisks.length} ca ${populated.length ? 'nghi vấn (bỏ sót/sai nhãn)' : 'chưa được gán nhãn'} · ${((Date.now() - t0) / 1000).toFixed(1)}s.`;
        }
      } catch (e) {
        console.warn('PointPillars 3D AI error:', e);
        ppNote = `PointPillars 3D: LỖI - ${String((e as Error).message).slice(0, 220)}`;
      }
    } else {
      ppNote = 'PointPillars 3D: không tải được point cloud nào từ CVAT.';
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
  // 1. Run the official SmartReview 3D Risk Engine across the entire scene sequence
  onProgress?.(85, 'Đang phân tích bộ quy tắc SmartReview 3D Policy...', 'policy');
  const sceneReport = analyzeScene(scene);
  const riskMap = new Map<string, Risk>();

  for (const c of sceneReport.cases) {
    const frame = scene.frames.find((f) => f.timestamp === c.timestamp);
    const box = frame?.boxes.find((b) => b.id === c.object_id);
    const src = mapped.sources.get(`${c.timestamp}:${c.object_id}`);
    if (!box || !src) continue;

    const riskId = `3d:${c.timestamp}:${c.object_id}`;
    riskMap.set(riskId, {
      id: riskId,
      frame: c.timestamp,
      object_id: src.object_id,
      label: src.label,
      severity: c.severity,
      score: c.score,
      reasons: c.reasons,
      check_ids: c.findings.map((f) => f.check_id),
      bbox: null,
      source: 'rule',
      geometry_type: 'cuboid',
      object_kind: src.kind,
      cuboid: {
        center: box.center,
        size: box.size,
        heading: box.heading,
        lift: box.lift,
        penetration_depth: box.lift !== undefined && box.lift < 0 ? -box.lift : 0,
      },
      evidence: c.findings.map((f) => ({ rule: f.check_id, ...f.evidence })),
    });
  }

  // 2. Augment with single-box Policy Rules for isolated shapes / keyframes
  onProgress?.(92, 'Đang kiểm tra chi tiết hình học cuboid (độ chìm/nổi, kích thước, góc xoay)...', 'policy');
  for (const frame of scene.frames) {
    for (const box of frame.boxes) {
      const src = mapped.sources.get(`${frame.timestamp}:${box.id}`);
      if (!src) continue;
      const riskId = `3d:${frame.timestamp}:${box.id}`;
      const existing = riskMap.get(riskId);

      const findings: {
        check_id: string;
        reason: string;
        score: number;
        severity: 'high' | 'medium' | 'low';
      }[] = [];

      // Check A: Sunk below ground (box.below_ground)
      if (box.lift !== undefined && box.lift < -0.25) {
        if (!existing?.check_ids.includes('box.below_ground')) {
          const depth = -box.lift;
          findings.push({
            check_id: 'box.below_ground',
            reason: `Đáy cuboid chìm ${depth.toFixed(2)} m dưới mặt đường cục bộ; vượt dung sai 0.25 m. Cần kiểm tra vị trí trục Z.`,
            score: 70,
            severity: 'high',
          });
        }
      }

      // Check B: Floating above ground (fit.floating)
      if (
        box.lift !== undefined &&
        box.lift > 0.4 &&
        ['VEHICLE', 'PEDESTRIAN', 'CYCLIST'].includes(box.type)
      ) {
        if (!existing?.check_ids.includes('fit.floating')) {
          const isCertain = box.lift >= 1.0;
          findings.push({
            check_id: 'fit.floating',
            reason: `Đáy cuboid lơ lửng ${box.lift.toFixed(2)} m trên mặt đường cục bộ; vượt dung sai 0.40 m. Cần hạ thấp cuboid sát mặt đường.`,
            score: isCertain ? 70 : 40,
            severity: isCertain ? 'high' : 'medium',
          });
        }
      }

      // Check C: Empty box near sensor (points.empty_near)
      const dist = Math.hypot(box.center[0], box.center[1]);
      if (box.counted !== undefined && box.counted === 0 && dist <= 30) {
        if (!existing?.check_ids.includes('points.empty_near')) {
          findings.push({
            check_id: 'points.empty_near',
            reason: `Cuboid ở khoảng cách ${dist.toFixed(1)} m gần xe nhưng không có điểm LiDAR nào bên trong (rỗng).`,
            score: 40,
            severity: 'medium',
          });
        }
      }

      // Check D: Sparse points (< 5 points)
      if (box.counted !== undefined && box.counted > 0 && box.counted < 5) {
        if (!existing?.check_ids.includes('points.sparse')) {
          findings.push({
            check_id: 'points.sparse',
            reason: `Cuboid chỉ có ${box.counted} điểm LiDAR (dưới 5): quá ít để kiểm tra độ khít, cần đối chiếu ảnh camera.`,
            score: 20,
            severity: 'low',
          });
        }
      }

      // Check E: Misaligned from LiDAR points (fit.moved)
      if (box.moved && box.moved[3] >= 25) {
        const missRatio = 1 - box.moved[2] / box.moved[3];
        if (missRatio > 0.45 && !existing?.check_ids.includes('fit.moved')) {
          findings.push({
            check_id: 'fit.moved',
            reason: `Cuboid lệch khỏi cụm điểm: dời tới 1 m sẽ ôm thêm ${Math.round(missRatio * 100)}% điểm của vật.`,
            score: 40,
            severity: 'medium',
          });
        }
      }

      if (findings.length) {
        if (existing) {
          for (const f of findings) {
            existing.check_ids.push(f.check_id);
            existing.reasons.push(f.reason);
            existing.score = Math.max(existing.score, f.score);
            if (f.severity === 'high') existing.severity = 'high';
          }
        } else {
          const maxFinding = findings.reduce((prev, curr) =>
            curr.score > prev.score ? curr : prev,
          );
          riskMap.set(riskId, {
            id: riskId,
            frame: frame.timestamp,
            object_id: src.object_id,
            label: src.label,
            severity: maxFinding.severity,
            score: maxFinding.score,
            reasons: findings.map((f) => f.reason),
            check_ids: findings.map((f) => f.check_id),
            bbox: null,
            source: 'rule',
            geometry_type: 'cuboid',
            object_kind: src.kind,
            cuboid: {
              center: box.center,
              size: box.size,
              heading: box.heading,
              lift: box.lift,
              penetration_depth: box.lift !== undefined && box.lift < 0 ? -box.lift : 0,
            },
            evidence: findings.map((f) => ({ rule: f.check_id })),
          });
        }
      }
    }
  }

  const risks: Risk[] = Array.from(riskMap.values());
  risks.push(...pointPillarsRisks);
  risks.sort((a, b) => b.score - a.score);

  return {
    risks,
    skipped,
    hash: mapped.hash,
    annotation_count: scene.frames.reduce((n, f) => n + f.boxes.length, 0),
    engine_version: ENGINE_3D_VERSION,
    policy_version: POLICY_3D_VERSION,
    capabilities: {
      point_cloud: scene.frames.some((f) => f.boxes.some((b) => b.counted !== undefined)),
      temporal: true,
    },
    notes: [
      '3D: Kiểm tra toàn diện theo SmartReview 3D Policy (chìm đất, lơ lửng, kích thước, rỗng, lệch điểm, track) và PointPillars AI 3D.',
      ppNote,
    ],
  };
}

