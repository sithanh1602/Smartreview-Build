// Shapes of what the API returns. They are the server's own types, so the UI and the
// API cannot drift apart without a type error.
import type { Case, MemberRole, ProjectRole, User } from '../server/types.ts';
import type { InviteCodes, Person, ProjectPeople } from '../server/projects/members.ts';
import type {
  Handoff,
  HandoffError,
  HandoffMissing,
  HandoffReport,
  HandoffResult,
  Outcome,
} from '../server/projects/handoff.ts';
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
  Handoff,
  HandoffError,
  HandoffMissing,
  HandoffReport,
  HandoffResult,
  InviteCodes,
  MemberRole,
  Metrics,
  MissingRegion,
  Outcome,
  Person,
  ProjectPeople,
  ProjectRole,
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
// A missing-object suggestion always carries the box the model proposed.
export type AiSuggestion = AiFindingView & { prediction: NonNullable<AiFinding['prediction']> };
export interface FrameInfo {
  id: string;
  media_id: string;
  media_name: string;
  index: number;
  width: number;
  height: number;
  image_url: string | null;
}
// The engine's verdict on a frame (core/risk/engine.ts triage); null for engines before 3.0.0.
export interface FrameTriage {
  tier: 'auto_accept' | 'verify' | 'relabel';
  reason: string;
  rules: { rule_id: string; blocking: boolean; reason: string }[];
}
export interface FrameSummary extends FrameInfo {
  annotation_count: number;
  triage: FrameTriage | null;
  // Objects the model found that nobody drew, from a scored import (ai-service/score_boxes.py).
  missing_hints: { label: string; confidence: number }[];
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
  triage: FrameTriage | null;
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
  created_by: string | null;
  creator_name: string | null;
  reviewer_count: number;
  annotator_count: number;
  // The signed-in user's role in this project.
  my_role: ProjectRole;
  // Set once the review was completed and sent to annotators; decisions are locked while it is.
  handoff?: Handoff | null;
}
// A 3D project: one LiDAR segment with its labelled cuboids. Kept apart from the 2D projects.
export interface Project3D {
  id: string;
  name: string;
  description: string;
  format: string;
  status: ProjectStatus;
  error_message: string | null;
  metadata: {
    // The revision of the stored scene; part of the address its files are read from.
    dataset_id: string;
    segment: string;
    total_frames: number;
    total_boxes: number;
    total_points: number;
    boxes_by_type: Record<string, number>;
    tracked_objects: number;
    lasers: string[];
    duration_seconds: number;
    // Cameras with images, left to right; empty when the project has none.
    cameras?: string[];
    total_images?: number;
    motion_compensated: boolean;
    stored_bytes: number;
  } | null;
  created_at: string;
  created_by: string | null;
  creator_name: string | null;
  reviewer_count: number;
  annotator_count: number;
  my_role: ProjectRole;
  // How many cuboids have a review decision; present once the project is READY.
  review_summary?: { reviewed: number; correct: number; errors: number; unsure: number };
  // Present while this backend is importing the project.
  progress?: {
    step: 'export' | 'cameras' | 'sheets' | 'publish';
    done: number;
    total: number | null;
  } | null;
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
