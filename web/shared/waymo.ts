import type { Untrusted } from './review.ts';

// The Waymo Open Dataset v2 components a 3D project is built from. Shared by the form, which
// sorts the chosen files into components, and the server, which receives one field for each.
export const WAYMO_COMPONENTS = [
  'lidar',
  'lidar_calibration',
  'vehicle_pose',
  'lidar_box',
  'lidar_pose',
  'camera_image',
] as const;
export type WaymoComponent = (typeof WAYMO_COMPONENTS)[number];

export const WAYMO_INFO: Record<
  WaymoComponent,
  // `without` says what the project lacks when an optional component is left out.
  { required: boolean; holds: string; without?: string }
> = {
  lidar: { required: true, holds: 'Range image của 5 lidar: nguồn của point cloud.' },
  lidar_calibration: {
    required: true,
    holds: 'Vị trí gắn và góc nghiêng các tia của từng lidar.',
  },
  vehicle_pose: { required: true, holds: 'Vị trí của xe ở từng frame.' },
  lidar_box: { required: true, holds: 'Cuboid 3D đã gán nhãn: thứ sẽ được review.' },
  lidar_pose: {
    required: false,
    holds: 'Pose từng điểm của lidar TOP, dùng để bù chuyển động khi lidar quay.',
    without: 'point cloud của lidar TOP sẽ không được bù chuyển động.',
  },
  camera_image: {
    required: false,
    holds: 'Ảnh JPEG của các camera ở từng frame, để đối chiếu khi review.',
    without: 'viewer sẽ không có ảnh camera.',
  },
};
export const WAYMO_FORMAT = 'waymo-v2';
export const WAYMO_LIMITS = {
  total: 2 * 1024 * 1024 * 1024,
  // A segment is one file for each component; a few more allow a component split into parts.
  filesPerComponent: 4,
  // Camera images sent as loose files instead of the camera_image component.
  images: 4000,
  image: 20 * 1024 * 1024,
};
// Waymo's camera numbers, and the order the cameras are shown in: left to right as they look
// out of the vehicle. Cameras with other names follow, by name.
export const WAYMO_CAMERAS: Record<number, string> = {
  1: 'FRONT',
  2: 'FRONT_LEFT',
  3: 'FRONT_RIGHT',
  4: 'SIDE_LEFT',
  5: 'SIDE_RIGHT',
};
const CAMERA_ORDER = ['SIDE_LEFT', 'FRONT_LEFT', 'FRONT', 'FRONT_RIGHT', 'SIDE_RIGHT'];
export function orderCameras(names: Iterable<string>): string[] {
  const rank = (name: string) => (CAMERA_ORDER.indexOf(name) + 1 || CAMERA_ORDER.length + 1) - 1;
  return [...new Set(names)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
// Every frame with camera images also gets one small image holding all its cameras side by
// side in that order, each in a tile of this size. The viewer shows that one image and loads
// a camera's full image only when asked.
export const CAMERA_TILE = { width: 240, height: 160 };
// A camera image sent as a loose file is named <camera>/<frame>.jpg: the folder is the camera
// and the number is the frame's timestamp, or its position in the segment counted from 0.
export function cameraImage(path: string): { camera: string; frame: string } | null {
  const found = path.match(/(?:^|\/)([A-Za-z0-9][A-Za-z0-9_-]{0,39})\/(\d{1,20})\.jpe?g$/i);
  return found ? { camera: found[1].toUpperCase(), frame: found[2] } : null;
}

const KNOWN = new Set<string>(WAYMO_COMPONENTS);
// Which component a parquet file belongs to: the folder it sits in (lidar_box/x.parquet), else
// the name Waymo gives it (validation_lidar_box_<segment>.parquet). Null for anything else,
// including the other Waymo components (camera_box, lidar_segmentation, …).
export function waymoComponent(path: string): WaymoComponent | null {
  if (!path.toLowerCase().endsWith('.parquet')) return null;
  const parts = path.split('/');
  const file = parts.pop()!;
  const folder = parts.pop();
  if (folder && KNOWN.has(folder)) return folder as WaymoComponent;
  const named = file.match(/^(?:training|validation|testing)_([a-z_]+?)_\d+(?:_\d+)*\.parquet$/);
  return named && KNOWN.has(named[1]) ? (named[1] as WaymoComponent) : null;
}

// The segment a file is named after (validation_lidar_<segment>.parquet), when it says so.
export function waymoSegment(path: string): string | null {
  const file = path.split('/').pop()!;
  return (
    file.match(/^(?:training|validation|testing)_[a-z_]+?_(\d+(?:_\d+)*)\.parquet$/)?.[1] ?? null
  );
}

export interface Scene3DSummary {
  segment: string;
  total_frames: number;
  total_boxes: number;
  total_points: number;
  boxes_by_type: Record<string, number>;
  tracked_objects: number;
  lasers: string[];
  duration_seconds: number;
  // Cameras with images, in display order, and how many images there are in all.
  cameras: string[];
  total_images: number;
}
// What a project card shows about an exported scene (scene.json of the 3D viewer). Throws when
// the scene is not in that shape.
export function summarizeScene(scene: Untrusted): Scene3DSummary {
  if (
    typeof scene?.segment !== 'string' ||
    !Array.isArray(scene.lasers) ||
    !Array.isArray(scene.frames) ||
    !scene.frames.length
  )
    throw new Error('Scene không có frame nào.');
  const byType: Record<string, number> = {},
    objects = new Set<string>();
  let boxes = 0,
    points = 0,
    images = 0;
  for (const frame of scene.frames) {
    if (
      !Number.isSafeInteger(frame?.timestamp) ||
      frame.file !== `frames/${frame.timestamp}.bin` ||
      !Array.isArray(frame.laserCounts) ||
      !Array.isArray(frame.boxes)
    )
      throw new Error('Frame trong scene sai khuôn dạng.');
    for (const count of frame.laserCounts) points += count;
    images += frame.cameras?.length ?? 0;
    for (const box of frame.boxes) {
      boxes++;
      byType[box.type] = (byType[box.type] ?? 0) + 1;
      objects.add(box.id);
    }
  }
  const first = scene.frames[0].timestamp,
    last = scene.frames[scene.frames.length - 1].timestamp;
  return {
    segment: scene.segment,
    total_frames: scene.frames.length,
    total_boxes: boxes,
    total_points: points,
    boxes_by_type: byType,
    tracked_objects: objects.size,
    lasers: scene.lasers.map((l: { name: string }) => l.name),
    duration_seconds: Math.round((last - first) / 1e4) / 100,
    cameras: scene.cameras ?? [],
    total_images: images,
  };
}
