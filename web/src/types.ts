// Shapes of what the API returns. They are the server's own types, so the UI and the
// API cannot drift apart without a type error.
import type { Case, User } from '../server/types.ts';
import type { DatasetMeta } from '../server/repository.ts';
import type { Metrics, Review } from '../server/reviews/store.ts';
import type { FrameReview } from '../server/frames/store.ts';
import type { MissingRegion } from '../shared/frame-review.ts';
import type { Annotation, BBox, Geometry } from '../core/schema/types.ts';
import type { AiComparison, AiFinding } from '../core/risk/ai-compare.ts';
import type { ContextPosition } from '../core/risk/types.ts';

export type {
  AiFinding,
  Annotation,
  BBox,
  Case,
  ContextPosition,
  DatasetMeta,
  FrameReview,
  Geometry,
  Metrics,
  MissingRegion,
  Review,
  User,
};
export type Observation = NonNullable<Case['context']['current']>;
// Anything the frame viewers can draw: an annotation, an observation or an AI suggestion.
export interface Drawable {
  id?: string;
  annotation_id?: string | null;
  label?: string;
  class_name?: string;
  geometry: Geometry;
}
// A drawable placed on its frame image.
export interface ViewerObservation extends Drawable {
  image_url: string | null;
  width: number;
  height: number;
  frame_id?: number | string;
}
// An AI Check finding as the job reports it, with the observation it points at.
export type AiFindingView = AiFinding & {
  observation: ViewerObservation & { media_name?: string };
};
export interface FrameInfo {
  id: string;
  media_id: string;
  media_name: string;
  index: number;
  width: number;
  height: number;
  image_url: string | null;
}
export interface FrameSummary extends FrameInfo {
  annotation_count: number;
  review: { status: FrameReview['status']; missing_count: number; version: number } | null;
}
export interface FrameList {
  dataset_revision: string;
  name: string;
  frames: FrameSummary[];
  summary: {
    total: number;
    reviewed: number;
    in_progress: number;
    missing_regions: number;
    available_images: number;
  };
}
export interface FrameDetail {
  dataset_revision: string;
  frame: FrameInfo;
  annotations: Annotation[];
  review: FrameReview | null;
}
// What GET /ai-check returns: an idle marker, a running job or a finished comparison.
interface AiJob {
  available: boolean;
  dataset_revision: string;
  completed: number;
  total: number;
  skipped_frames: number;
}
export type AiReport =
  | { status: 'IDLE'; available: boolean }
  | (AiJob & { status: 'RUNNING' })
  | (AiJob & { status: 'FAILED'; error: string })
  | (AiJob &
      Omit<AiComparison, 'findings'> & {
        status: 'READY';
        model: { name: string; [detail: string]: unknown };
        findings: AiFindingView[];
      });
export interface Dashboard {
  project: Project;
  dataset: DatasetMeta;
  metrics: Metrics;
}
export type ApiError = Error & { status?: number };
export type ProjectStatus =
  | 'CREATED'
  | 'UPLOADING'
  | 'VALIDATING'
  | 'NORMALIZING'
  | 'ANALYZING'
  | 'READY'
  | 'FAILED';
export interface Project {
  id: string;
  name: string;
  description: string;
  format: string;
  status: ProjectStatus;
  error_message: string | null;
  metadata: DatasetMeta | null;
  created_at: string;
}
export interface DatasetData {
  meta: DatasetMeta;
  cases: Case[];
  reviews: Record<string, Review>;
  metrics: Metrics;
}
// Values of the review form, before the dataset revision and version are added.
export interface ReviewValues {
  decision: string;
  error_type: string | null;
  corrected_value: string | null;
  note: string | null;
}
