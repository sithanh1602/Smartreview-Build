// TypeScript view of annotation-v1.schema.json. The JSON schema stays the runtime authority.
export type SourceKind = 'human' | 'model' | 'import' | 'unknown';
export interface Source {
  kind: SourceKind;
  name?: string;
  model?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
export interface Media {
  id: string;
  name: string;
  type: 'image' | 'video';
  width: number;
  height: number;
  fps?: number;
  frame_count?: number;
  source?: Source;
}
export interface Frame {
  id: string;
  media_id: string;
  index: number;
  image?: string;
  timestamp_ms?: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface BBox extends Rect {
  type: 'bbox';
}
export type Point = [number, number];
export interface Polygon {
  type: 'polygon';
  points: Point[];
}
export interface Polyline {
  type: 'polyline';
  points: Point[];
}
export interface Mask {
  type: 'mask';
  encoding: 'rle';
  size: [number, number];
  counts: string | number[];
}
export interface Cuboid {
  type: 'cuboid';
  center: [number, number, number];
  size: [number, number, number];
  rotation: [number, number, number];
  coordinate_system: string;
}
export type Geometry = BBox | Polygon | Polyline | Mask | Cuboid;
export interface Annotation {
  id: string;
  object_id?: string;
  frame_id: string;
  label: string;
  geometry: Geometry;
  track_id?: string;
  confidence?: number;
  source?: Source;
  // Free-form importer data; the schema only requires an object.
  attributes?: Record<string, any>;
}
export type BBoxAnnotation = Annotation & { geometry: BBox };
export interface DatasetInfo {
  id: string;
  name: string;
  source?: Source;
  metadata?: Record<string, unknown>;
}
export interface Dataset {
  schema_version: '1.0.0';
  dataset: DatasetInfo;
  media: Media[];
  frames: Frame[];
  annotations: Annotation[];
}
