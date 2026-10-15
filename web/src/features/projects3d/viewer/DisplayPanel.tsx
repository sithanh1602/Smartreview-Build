import React from 'react';
import { Check, Group, Swatch } from './controls';
import { BOX_COLORS, LASER_COLORS, REVIEW_COLORS } from './colors.ts';
import type { ColorMode, FrameInfo, Scene3D, ViewSettings } from './engine.ts';

const COLOR_MODES: [ColorMode, string][] = [
  ['height', 'Độ cao'],
  ['intensity', 'Cường độ'],
  ['range', 'Khoảng cách'],
  ['laser', 'Theo lidar'],
];
const REVIEW_LEGEND: [string, string][] = [
  ['NONE', 'Chưa review'],
  ['CORRECT', 'Đúng'],
  ['ERROR', 'Lỗi'],
  ['UNSURE', 'Chưa chắc'],
];

// What the viewer draws and how. Each group names the Waymo component its data comes from.
export function DisplayPanel({
  scene,
  settings,
  info,
  types,
  compensated,
  set,
  onResetCamera,
}: {
  scene: Scene3D;
  settings: ViewSettings;
  info: FrameInfo | null;
  types: string[];
  // Whether the segment came with lidar_pose.
  compensated: boolean;
  set: (change: Partial<ViewSettings>) => void;
  onResetCamera: () => void;
}) {
  return (
    <>
      <Group title="Hệ toạ độ" source="vehicle_pose">
        <div className="flex gap-2">
          {(
            [
              ['vehicle', 'Xe'],
              ['world', 'Toàn cục'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="sr-button min-h-8 flex-1 py-1 text-xs"
              aria-pressed={settings.frame === id}
              onClick={() => set({ frame: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <Check
          label="Camera bám theo xe"
          checked={settings.follow}
          onChange={(follow) => set({ follow })}
        />
        <Check
          label="Quỹ đạo xe"
          checked={settings.trajectory}
          onChange={(trajectory) => set({ trajectory })}
        />
        <button type="button" className="sr-button min-h-8 py-1 text-xs" onClick={onResetCamera}>
          Đặt lại góc nhìn
        </button>
      </Group>
      <Group title="Point cloud" source="lidar">
        <label className="block text-sm">
          Màu
          <select
            className="field mt-1.5 min-h-9 py-1"
            aria-label="Màu"
            value={settings.color}
            onChange={(e) => set({ color: e.target.value as ColorMode })}
          >
            {COLOR_MODES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="flex justify-between">
            Cỡ điểm <span className="tabular-nums text-muted">{settings.pointSize}</span>
          </span>
          <input
            type="range"
            className="mt-1.5 w-full accent-teal-600"
            aria-label="Cỡ điểm"
            min={1}
            max={5}
            step={0.5}
            value={settings.pointSize}
            onChange={(e) => set({ pointSize: Number(e.target.value) })}
          />
        </label>
        {scene.lasers.map((laser, i) => (
          <Check
            key={laser.name}
            label={laser.name}
            checked={settings.lasers[laser.name]}
            onChange={(on) => set({ lasers: { ...settings.lasers, [laser.name]: on } })}
          >
            <Swatch color={LASER_COLORS[i % LASER_COLORS.length]} />
          </Check>
        ))}
      </Group>
      <Group title="Bù chuyển động" source="lidar_pose">
        <Check
          label="Bù chuyển động (TOP)"
          checked={compensated && settings.motionCompensation}
          disabled={!compensated}
          onChange={(motionCompensation) => set({ motionCompensation })}
        />
        {!compensated && <p className="text-xs text-muted">Segment này không có lidar_pose.</p>}
      </Group>
      <Group title="Cuboid" source="lidar_box">
        <Check label="Hiện cuboid" checked={settings.boxes} onChange={(boxes) => set({ boxes })} />
        <Check
          label="Hướng cuboid (orientation)"
          checked={settings.orientation}
          disabled={!settings.boxes}
          onChange={(orientation) => set({ orientation })}
        />
        {settings.boxes && settings.orientation && (
          <p className="text-xs text-muted">
            Mũi tên trên box biểu thị hướng trong nhãn, giúp kiểm tra box xoay sai.
          </p>
        )}
        <Check
          label="Tên cuboid"
          checked={settings.labels}
          disabled={!settings.boxes}
          onChange={(labels) => set({ labels })}
        />
        <label className="block text-sm">
          Màu cuboid
          <select
            className="field mt-1.5 min-h-9 py-1"
            aria-label="Màu cuboid"
            value={settings.boxColor}
            onChange={(e) => set({ boxColor: e.target.value as ViewSettings['boxColor'] })}
          >
            <option value="type">Theo loại</option>
            <option value="review">Theo kết quả review</option>
          </select>
        </label>
        {settings.boxColor === 'review' && (
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {REVIEW_LEGEND.map(([id, label]) => (
              <span key={id} className="inline-flex items-center gap-1.5">
                <Swatch color={REVIEW_COLORS[id]} />
                {label}
              </span>
            ))}
          </p>
        )}
        {types.map((type) => (
          <Check
            key={type}
            label={`${type} · ${info?.byType[type] ?? 0}`}
            checked={settings.types[type] ?? true}
            disabled={!settings.boxes}
            onChange={(on) => set({ types: { ...settings.types, [type]: on } })}
          >
            <Swatch color={BOX_COLORS[type] ?? BOX_COLORS.UNKNOWN} />
          </Check>
        ))}
      </Group>
      <Group title="Cảm biến" source="lidar_calibration">
        <Check
          label="Hiện vị trí lidar trên xe"
          checked={settings.sensors}
          onChange={(sensors) => set({ sensors })}
        />
      </Group>
      <p className="pt-4 text-xs text-muted">
        Kéo chuột để xoay, chuột phải để dời, cuộn để thu phóng. Phím cách: phát / dừng. ← →: từng
        frame.
      </p>
    </>
  );
}
