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
const exec = promisify(execFile);
export async function scanCvat3D(data: CvatJobData) {
  const mapped = mapCvat3D(data);
  let scene = mapped.scene;
  const skipped = mapped.skipped;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smartreview-cvat3d-'));
  try {
    const populated = scene.frames.filter((f) => f.boxes.length);
    // Bounded scan; unmeasured frames still receive geometry checks and an explicit notice.
    for (const [i, frame] of populated.entries()) {
      if (i >= 30) {
        skipped.push({
          object_id: '*',
          frame: frame.timestamp,
          reason: 'Chưa đo LiDAR: giới hạn 30 frame có nhãn mỗi lượt quét.',
        });
        continue;
      }
      try {
        await fs.writeFile(
          path.join(root, `${frame.timestamp}.pcd`),
          await getCvatFrameImage(data.job.id, frame.timestamp),
        );
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
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
  const risks: Risk[] = [];
  // CVAT carries no ego/world poses. Isolate frames so temporal rules cannot mistake ego
  // motion for an annotation error. Keep original IDs for review navigation.
  for (const frame of scene.frames) {
    const report = analyzeScene({ segment: scene.segment, frames: [frame] });
    for (const c of report.cases) {
      const src = mapped.sources.get(`${frame.timestamp}:${c.object_id}`)!;
      const box = frame.boxes.find((b) => b.id === c.object_id)!;
      risks.push({
        id: `3d:${frame.timestamp}:${c.object_id}`,
        frame: frame.timestamp,
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
        cuboid: { center: box.center, size: box.size, heading: box.heading },
        evidence: c.findings.map((f) => ({ rule: f.check_id, ...f.evidence })),
      });
    }
  }
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
      temporal: false,
    },
    notes: [
      '3D: dùng core risk 3D; không chạy YOLO 2D.',
      'Chưa có ego pose: bỏ qua rule temporal, frame-1 và các rule fit cần chuỗi frame.',
      'Không có risk không đồng nghĩa tất cả cuboid đúng; xem các mục bỏ qua.',
    ],
  };
}
