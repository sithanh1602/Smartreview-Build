import { scanCvat3D } from './scan3d.ts';
import { randomUUID } from 'node:crypto';
import { analyzeDataset } from '../../core/risk/engine.ts';
import { comparePredictions } from '../../core/risk/ai-compare.ts';
import { ReviewError } from '../../shared/review.ts';
import { loadCvatJob } from './client.ts';
import { mapCvatJob } from './mapper.ts';
import { runYoloOnJobFrames } from './yolo.ts';
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
  cuboid?: { center: number[]; size: number[]; heading: number };
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
    const data = await loadCvatJob(jobId);
    if (data.job.dimension === '3d') {
      const result = await scanCvat3D(data),
        id = randomUUID();
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
      return (await this.get(user.id, id))!;
    }
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

    // 2. Run YOLO inference on frames
    const yolo = await runYoloOnJobFrames(
      jobId,
      annotatedFrames.length ? annotatedFrames : [0],
      (f) => `cvat-${jobId}-frame-${f}:0`,
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
        JSON.stringify({ skipped, risks, ai_model: yolo.available ? yolo.model : null }),
        user.username,
      ],
    );

    return (await this.get(user.id, id))!;
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
