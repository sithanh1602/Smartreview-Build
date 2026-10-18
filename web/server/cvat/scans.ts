import { scanCvat3D } from './scan3d.ts';
import { randomUUID } from 'node:crypto';
import { analyzeDataset } from '../../core/risk/engine.ts';
import { comparePredictions } from '../../core/risk/ai-compare.ts';
import { ReviewError } from '../../shared/review.ts';
import { loadCvatJob } from './client.ts';
import { mapCvatJob } from './mapper.ts';
import { runYoloOnJobFrames } from './yolo.ts';
import { setScanProgress } from './progress.ts';
import type { Annotation, BBox } from '../../core/schema/types.ts';
import type { Db, Rows, User } from '../types.ts';

export interface Risk {
  id: string;
  frame: number | null;
  object_id: string | null;
  label: string | null;
  severity: string;
  score: number;
  reasons: string[];
  check_ids: string[];
  // Bounding box in image pixels [x, y, width, height]: lets the CVAT panel find and highlight the shape.
  bbox: [number, number, number, number] | null;
  source?: 'rule' | 'ai';
  confidence?: number;
  geometry_type?: 'cuboid';
  object_kind?: 'shape' | 'track';
  cuboid?: { center: number[]; size: number[]; heading: number; lift?: number; penetration_depth?: number };
  evidence?: Record<string, unknown>[];
}

export interface ScanSummary {
  id: string;
  job_id: number;
  annotation_hash: string;
  engine_version: string;
  ai_model?: string;
  annotation_count: number;
  risk_count: number;
  duration_ms: number;
  scanned_by_name: string;
  scanned_at: string;
  changed?: boolean;
}

export interface Scan extends ScanSummary {
  skipped: { object_id: string; frame: number; reason: string }[];
  risks: Risk[];
  dimension?: '2d' | '3d';
  policy_version?: string;
  notes?: string[];
  capabilities?: { point_cloud: boolean; temporal: boolean };
}

function boxOf(g: Annotation['geometry']): Risk['bbox'] {
  if (g.type === 'bbox') return [g.x, g.y, g.width, g.height];
  if (g.type === 'polygon' || g.type === 'polyline') {
    const xs = g.points.map((p) => p[0]),
      ys = g.points.map((p) => p[1]);
    const x = Math.min(...xs),
      y = Math.min(...ys);
    return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
  }
  return null;
}

function iou2D(b1: BBox, b2: BBox): number {
  const x1 = Math.max(b1.x, b2.x),
    y1 = Math.max(b1.y, b2.y),
    x2 = Math.min(b1.x + b1.width, b2.x + b2.width),
    y2 = Math.min(b1.y + b1.height, b2.y + b2.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const union = b1.width * b1.height + b2.width * b2.height - inter;
  return union > 0 ? inter / union : 0;
}

const summary = (r: Rows[number]): ScanSummary => ({
  id: r.id,
  job_id: r.job_id,
  annotation_hash: r.annotation_hash,
  engine_version: r.engine_version,
  ai_model: r.ai_model || undefined,
  annotation_count: r.annotation_count,
  risk_count: r.risk_count,
  duration_ms: r.duration_ms,
  scanned_by_name: r.scanned_by_name,
  scanned_at: String(r.scanned_at instanceof Date ? r.scanned_at.toISOString() : r.scanned_at),
});

export class CvatScans {
  pool: Db;
  constructor(pool: Db) {
    this.pool = pool;
  }

  async scan(input: unknown, user: User): Promise<Scan> {
    const jobId = Number((input as { job_id?: unknown } | null)?.job_id);
    if (!Number.isInteger(jobId) || jobId < 1)
      throw new ReviewError(400, 'Job ID CVAT không hợp lệ.');

    const started = Date.now();
    try {
      setScanProgress(jobId, 5, 'Đang tải thông tin Job và annotations từ CVAT...', 'loading');
      const data = await loadCvatJob(jobId);
      if (data.job.dimension === '3d') {
        const result = await scanCvat3D(data, (pct, msg, stage) => {
          setScanProgress(jobId, pct, msg, stage);
        });
        setScanProgress(jobId, 98, 'Đang lưu kết quả quét 3D vào cơ sở dữ liệu...', 'policy');
        const id = randomUUID();
        await this.pool.execute<Rows>(
          `INSERT INTO cvat_scans(id,user_id,job_id,annotation_hash,engine_version,annotation_count,risk_count,duration_ms,result,scanned_by_name) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            user.id,
            jobId,
            result.hash,
            result.engine_version,
            result.annotation_count,
            result.risks.length,
            Date.now() - started,
            JSON.stringify({ ...result, dimension: '3d' }),
            user.username,
          ],
        );
        setScanProgress(jobId, 100, 'Hoàn tất quét 3D!', 'done');
        return (await this.get(user.id, id))!;
      }
      setScanProgress(jobId, 15, 'Đang chuẩn bị dữ liệu 2D và tập hợp frame cần quét...', 'loading');
      const { dataset, skipped, hash } = mapCvatJob(data);
    const minScore = Number((input as any)?.min_score ?? 10);

    // 1. Collect annotated frames for YOLO evaluation
    const frameNumberFromId = (fId: string) => {
      const match = fId.match(/frame-(\d+):/);
      return match ? Number(match[1]) : 0;
    };

    const annotatedFrames = Array.from(
      new Set(
        dataset.annotations
          .map((a) => {
            const cvatFrame = a.attributes?.cvat_frame;
            return typeof cvatFrame === 'number' ? cvatFrame : null;
          })
          .filter((f): f is number => f !== null),
      ),
    );

    const startF = data.job.start_frame ?? 0;
    const stopF = data.job.stop_frame ?? startF;
    const totalJobFrames = Math.max(1, stopF - startF + 1);
    const allJobFrames = Array.from({ length: Math.min(totalJobFrames, 30) }, (_, i) => startF + i);
    const unannotatedFrames = allJobFrames.filter((f) => !annotatedFrames.includes(f));
    const targetFrames = Array.from(new Set([...annotatedFrames, ...unannotatedFrames])).slice(0, 30);

    // 2. Run YOLO inference on frames
    setScanProgress(jobId, 25, 'Đang tải hình ảnh và khởi chạy mô hình YOLO AI...', 'ai');
    const yolo = await runYoloOnJobFrames(
      jobId,
      targetFrames.length ? targetFrames : [startF],
      (f) => `cvat-${jobId}-frame-${f}:0`,
      (done, total) => {
        const pct = 25 + Math.round((done / total) * 45);
        setScanProgress(jobId, pct, `YOLO AI: Đang quét frame ${done}/${total}...`, 'ai');
      },
    );

    // 3. Attach matched YOLO confidence to annotations
    if (yolo.available && yolo.predictions.length) {
      for (const a of dataset.annotations) {
        if (a.geometry.type !== 'bbox') continue;
        const framePredictions = yolo.predictions.filter((p) => p.frame_id === a.frame_id);
        let bestConf = 0;
        for (const p of framePredictions) {
          const overlap = iou2D(a.geometry, p.geometry);
          if (overlap >= 0.35 && p.confidence > bestConf) {
            bestConf = p.confidence;
          }
        }
        if (bestConf > 0) {
          a.confidence = bestConf;
        }
      }
    }

    // 4. Run Policy Rule Engine
    setScanProgress(jobId, 75, 'Đang kiểm tra toàn diện các quy tắc SmartReview Policy 2D...', 'policy');
    const report = analyzeDataset(dataset, { minScore });
    const ann = new Map(dataset.annotations.map((a) => [a.id, a]));

    const risks: Risk[] = report.cases.map((r) => {
      const a = ann.get(r.reference.annotation_id);
      return {
        id: r.id,
        frame: a?.attributes?.cvat_frame ?? null,
        object_id: a?.object_id ?? null,
        label: a?.label ?? null,
        severity: r.severity,
        score: r.score,
        reasons: r.reasons,
        check_ids: r.check_ids,
        bbox: a ? boxOf(a.geometry) : null,
        source: 'rule',
        confidence: a?.confidence,
      };
    });

    // 5. Run AI Comparison with YOLO predictions
    if (yolo.available && yolo.predictions.length) {
      setScanProgress(jobId, 88, 'Đang đối chiếu phát hiện YOLO với annotations và phân loại lỗi...', 'ai');
      const supportedLabels = Array.from(
        new Set([...dataset.annotations.map((a) => a.label), ...yolo.labels]),
      );
      const aiComp = comparePredictions(dataset, yolo.predictions, supportedLabels);

      for (const f of aiComp.findings) {
        const a = f.annotation_id ? ann.get(f.annotation_id) : null;
        const frameIndex = a?.attributes?.cvat_frame ?? frameNumberFromId(f.frame_id);

        let riskBbox: Risk['bbox'] = null;
        if (a) {
          riskBbox = boxOf(a.geometry);
        } else if (f.prediction?.geometry) {
          riskBbox = [
            f.prediction.geometry.x,
            f.prediction.geometry.y,
            f.prediction.geometry.width,
            f.prediction.geometry.height,
          ];
        }

        risks.push({
          id: `ai-${f.id}`,
          frame: frameIndex,
          object_id: a?.object_id ?? null,
          label: a?.label ?? f.prediction?.label ?? null,
          severity: f.severity,
          score: f.score,
          reasons: [f.reason],
          check_ids: [f.check_id],
          bbox: riskBbox,
          source: 'ai',
          confidence: f.prediction?.confidence,
        });
      }
    }

    // Sort risks by score descending (high severity first)
    risks.sort((a, b) => b.score - a.score);

    const id = randomUUID(),
      duration = Date.now() - started;

    setScanProgress(jobId, 98, 'Đang lưu kết quả quét 2D vào cơ sở dữ liệu...', 'policy');
    await this.pool.execute<Rows>(
      `INSERT INTO cvat_scans(id,user_id,job_id,annotation_hash,engine_version,annotation_count,risk_count,duration_ms,result,scanned_by_name)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        user.id,
        jobId,
        hash,
        `${report.engine_version}+${yolo.available ? yolo.model : 'rules'}`,
        dataset.annotations.length,
        risks.length,
        duration,
        JSON.stringify({
          skipped,
          risks,
          ai_model: yolo.available ? yolo.model : null,
          dimension: '2d',
          notes: [
            yolo.available
              ? `YOLO 2D (${yolo.model}): đã quét ${targetFrames.length} frame, AI thấy ${yolo.predictions.length} vật thể.`
              : 'YOLO 2D: chưa kích hoạt (chỉ kiểm tra bộ quy tắc Policy 2D).',
          ],
        }),
        user.username,
      ],
    );

    setScanProgress(jobId, 100, 'Hoàn tất quét 2D!', 'done');
    return (await this.get(user.id, id))!;
    } catch (err) {
      setScanProgress(jobId, 0, (err as Error).message || 'Lỗi khi quét', 'error');
      throw err;
    }
  }

  async get(userId: string, id: string): Promise<Scan | null> {
    const [[row]] = await this.pool.execute<Rows>(
      'SELECT * FROM cvat_scans WHERE user_id=? AND id=?',
      [userId, id],
    );
    if (!row) return null;
    const result = JSON.parse(row.result);
    return {
      ...summary(row),
      skipped: result.skipped ?? [],
      risks: result.risks ?? [],
      ai_model: result.ai_model ?? undefined,
      dimension: result.dimension ?? '2d',
      policy_version: result.policy_version,
      notes: result.notes,
      capabilities: result.capabilities,
    };
  }

  async history(userId: string): Promise<ScanSummary[]> {
    const [rows] = await this.pool.execute<Rows>(
      `SELECT id,job_id,annotation_hash,engine_version,annotation_count,risk_count,duration_ms,scanned_by_name,scanned_at
       FROM cvat_scans WHERE user_id=? ORDER BY scanned_at DESC LIMIT 50`,
      [userId],
    );
    const list = rows.map(summary);
    return list.map((s, i) => {
      const before = list.slice(i + 1).find((o) => o.job_id === s.job_id);
      return before ? { ...s, changed: before.annotation_hash !== s.annotation_hash } : s;
    });
  }
}
