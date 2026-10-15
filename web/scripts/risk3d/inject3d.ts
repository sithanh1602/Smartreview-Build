import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeScene } from '../../core/risk3d/engine.ts';
import type { Scene, SceneBox } from '../../core/risk3d/engine.ts';

// A trial of the 3D Risk Engine (docs/risk-3d.md, "Số đo"): plants one kind of error at a time
// into an exported scene whose labels are taken as right, and counts how many the engine
// queues. A cuboid that is moved, turned or resized has its points counted again from the
// frame's .bin file by the exporter's own count_points (recount3d.py).
// Usage, from web/: node scripts/risk3d/inject3d.ts EXPORT_DIRECTORY [--each 150]
// The Python with numpy is SmartReview/.venv, or PYTHON. EXTRA=1 lists the extra cases.
const [directory, , eachArg] = process.argv.slice(2);
if (!directory)
  throw new Error('Usage: node scripts/risk3d/inject3d.ts EXPORT_DIRECTORY [--each N]');
const EACH = Number(eachArg) || 150;
const clean: Scene = JSON.parse(await fs.readFile(path.join(directory, 'scene.json'), 'utf8'));

// A small seeded generator, so a run can be repeated.
let seed = 20261013;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32);
// A cuboid changed by a trial is measured again by the exporter's own count_points
// (recount3d.py), all of a scene's in one call before the engine runs.
const queue: { timestamp: number; box: SceneBox; frameBoxes: SceneBox[] }[] = [];
async function recount(timestamp: number, box: SceneBox, frameBoxes: SceneBox[]) {
  queue.push({ timestamp, box, frameBoxes });
}
async function measure() {
  if (!queue.length) return;
  const items = new Map<SceneBox[], { timestamp: number; boxes: SceneBox[] }>();
  for (const { timestamp, frameBoxes } of queue)
    items.set(frameBoxes, { timestamp, boxes: frameBoxes });
  const order = [...items.keys()];
  const request = {
    directory,
    items: order.map((frameBoxes) => ({
      timestamp: items.get(frameBoxes)!.timestamp,
      boxes: frameBoxes,
      targets: queue
        .filter((q) => q.frameBoxes === frameBoxes)
        .map((q) => frameBoxes.indexOf(q.box)),
    })),
  };
  const python = process.env.PYTHON ?? path.join(import.meta.dirname, '../../../.venv/bin/python');
  const result = spawnSync(python, ['-I', path.join(import.meta.dirname, 'recount3d.py')], {
    input: JSON.stringify(request),
    maxBuffer: 1 << 28,
  });
  if (result.status !== 0) throw new Error(String(result.stderr));
  const measured: Record<string, unknown>[][] = JSON.parse(String(result.stdout));
  request.items.forEach((item, k) =>
    item.targets.forEach((at, n) => {
      const box = item.boxes[at];
      for (const field of ['counted', 'outside', 'slack', 'moved', 'lift'] as const)
        delete box[field];
      Object.assign(box, measured[k][n]);
    }),
  );
  queue.length = 0;
}
const OTHER: Record<string, string> = {
  VEHICLE: 'PEDESTRIAN',
  PEDESTRIAN: 'VEHICLE',
  SIGN: 'VEHICLE',
};
const shift = (metres: number) => (box: SceneBox) => {
  const angle = random() * Math.PI * 2;
  box.center = [
    box.center[0] + Math.cos(angle) * metres,
    box.center[1] + Math.sin(angle) * metres,
    box.center[2],
  ];
};
const KINDS: Record<string, (box: SceneBox) => void> = {
  'đổi loại': (box) => void (box.type = OTHER[box.type] ?? 'VEHICLE'),
  'lệch 0,5 m': shift(0.5),
  'lệch 1 m': shift(1),
  'lệch 2 m': shift(2),
  'nâng 0,6 m': (box) => void (box.center = [box.center[0], box.center[1], box.center[2] + 0.6]),
  'hạ 0,6 m': (box) => void (box.center = [box.center[0], box.center[1], box.center[2] - 0.6]),
  'quay ngược đầu': (box) => void (box.heading += Math.PI),
  'quay 30°': (box) => void (box.heading += Math.PI / 6),
  'phóng to 1,3 lần': (box) => void (box.size = box.size.map((s) => s * 1.3)),
};
const cleanReport = analyzeScene(clean);
const cleanCases = new Set(cleanReport.cases.map((c) => c.id));
console.log(
  `Nhãn gốc: ${cleanReport.total_boxes} cuboid, ${cleanReport.cases.length} case (${((cleanReport.cases.length / cleanReport.total_boxes) * 100).toFixed(2)}%).`,
);
// Which cuboids have the object in the frame before and the frame after.
const seenAt = new Map<string, Set<number>>();
clean.frames.forEach((frame, index) =>
  frame.boxes.forEach((box) =>
    (seenAt.get(box.id) ?? seenAt.set(box.id, new Set()).get(box.id)!).add(index),
  ),
);
const places = clean.frames.flatMap((frame, index) => frame.boxes.map((_, at) => ({ index, at })));
console.log('Lỗi cài'.padEnd(20), 'bắt được'.padEnd(18), 'ở giữa track'.padEnd(18), 'case thừa');
for (const [kind, plant] of Object.entries(KINDS)) {
  const scene: Scene = structuredClone(clean);
  const planted = new Map<string, boolean>();
  // Spread out, so that two planted errors are never neighbours in one track.
  const taken = new Set<string>();
  while (planted.size < EACH) {
    const { index, at } = places[Math.floor(random() * places.length)];
    const frame = scene.frames[index],
      box = frame.boxes[at];
    if ([-2, -1, 0, 1, 2].some((d) => taken.has(`${index + d}:${box.id}`))) continue;
    taken.add(`${index}:${box.id}`);
    plant(box);
    if (kind !== 'đổi loại') await recount(frame.timestamp, box, frame.boxes);
    const frames = seenAt.get(box.id)!;
    planted.set(`${frame.timestamp}:${box.id}`, frames.has(index - 1) && frames.has(index + 1));
  }
  await measure();
  const report = analyzeScene(scene);
  const cases = new Set(report.cases.map((c) => c.id));
  const caught = [...planted.keys()].filter((id) => cases.has(id)).length;
  const inner = [...planted].filter(([, middle]) => middle);
  const innerCaught = inner.filter(([id]) => cases.has(id)).length;
  const extra = [...cases].filter((id) => !planted.has(id) && !cleanCases.has(id)).length;
  if (process.env.EXTRA)
    for (const c of report.cases.filter((c) => !planted.has(c.id) && !cleanCases.has(c.id)))
      console.log(
        '  thừa',
        c.frame_index,
        c.object_id.slice(0, 8),
        c.type,
        c.findings.map((f) => f.check_id).join(','),
      );
  const share = (n: number, of: number) => `${n}/${of} (${Math.round((n / of) * 100)}%)`;
  console.log(
    kind.padEnd(20),
    share(caught, planted.size).padEnd(18),
    share(innerCaught, inner.length).padEnd(18),
    extra,
  );
}
// A cuboid taken out of the middle of a track should come back as a gap.
{
  const scene: Scene = structuredClone(clean);
  let removed = 0;
  const middle = places.filter(({ index, at }) => {
    const frames = seenAt.get(clean.frames[index].boxes[at].id)!;
    return frames.has(index - 1) && frames.has(index + 1);
  });
  const gone = new Set<string>();
  while (removed < EACH) {
    const { index, at } = middle[Math.floor(random() * middle.length)];
    const id = clean.frames[index].boxes[at].id;
    if ([-2, -1, 0, 1, 2].some((d) => gone.has(`${index + d}:${id}`))) continue;
    gone.add(`${index}:${id}`);
    removed++;
  }
  scene.frames.forEach(
    (frame, index) => (frame.boxes = frame.boxes.filter((b) => !gone.has(`${index}:${b.id}`))),
  );
  const report = analyzeScene(scene);
  const found = report.gaps.filter((g) =>
    g.frame_indexes.some((i) => gone.has(`${i}:${g.object_id}`)),
  ).length;
  console.log(
    'xoá cuboid'.padEnd(20),
    `${found}/${removed} trong gaps`.padEnd(37),
    report.cases.filter((c) => !cleanCases.has(c.id)).length,
  );
}

// One object boxed twice: a copy of a cuboid, a little off, should come back as pair.duplicate.
{
  const scene: Scene = structuredClone(clean);
  const copies = new Set<string>();
  while (copies.size < EACH) {
    const { index, at } = places[Math.floor(random() * places.length)];
    const frame = scene.frames[index],
      box = frame.boxes[at];
    if ((box.counted ?? 0) < 20 || copies.has(`${frame.timestamp}:${box.id}`)) continue;
    const copy = structuredClone(box);
    copy.id = `copy-${copies.size}`;
    shift(0.3)(copy);
    frame.boxes.push(copy);
    await recount(frame.timestamp, copy, frame.boxes);
    copies.add(`${frame.timestamp}:${box.id}`);
  }
  await measure();
  const report = analyzeScene(scene);
  const found = report.cases.filter((c) =>
    c.findings.some((f) => f.check_id === 'pair.duplicate'),
  ).length;
  console.log(
    'gán trùng (+0,3 m)'.padEnd(20),
    `${found}/${EACH} case pair.duplicate`.padEnd(37),
    report.cases.filter(
      (c) =>
        !cleanCases.has(c.id) &&
        !c.findings.some((f) => f.check_id === 'pair.duplicate') &&
        !c.object_id.startsWith('copy-'),
    ).length,
  );
}

// An error that lasts: the same change on every cuboid of a run of frames, or of the whole
// track. The rules against the next frames only see where a run starts and ends; a whole track
// moved the same way gives them nothing.
{
  const RUN = 10;
  const tracks = new Map<string, number[]>();
  clean.frames.forEach((frame, index) =>
    frame.boxes.forEach((box) => {
      if ((box.counted ?? 0) >= 20)
        (tracks.get(box.id) ?? tracks.set(box.id, []).get(box.id)!).push(index);
    }),
  );
  // Runs of RUN frames in a row with points, one per object, and whole tracks of RUN or more.
  const runs: { id: string; frames: number[] }[] = [];
  const wholes: { id: string; frames: number[] }[] = [];
  for (const [id, frames] of tracks) {
    if (frames.length >= RUN)
      wholes.push({
        id,
        frames: clean.frames.flatMap((f, i) => (f.boxes.some((b) => b.id === id) ? [i] : [])),
      });
    for (let i = 0; i + RUN <= frames.length; i++)
      if (frames[i + RUN - 1] - frames[i] === RUN - 1) {
        const start = i + Math.floor(random() * (frames.length - RUN - i + 1));
        if (frames[start + RUN - 1] - frames[start] === RUN - 1)
          runs.push({ id, frames: frames.slice(start, start + RUN) });
        else runs.push({ id, frames: frames.slice(i, i + RUN) });
        break;
      }
  }
  // A change fixed to the object: the same side of it every frame.
  const angle = random() * Math.PI * 2;
  const LASTING: Record<string, (box: SceneBox) => void> = {
    'lệch 0,5 m': (box) => {
      const a = box.heading + angle;
      box.center = [
        box.center[0] + Math.cos(a) * 0.5,
        box.center[1] + Math.sin(a) * 0.5,
        box.center[2],
      ];
    },
    'lệch 1 m': (box) => {
      const a = box.heading + angle;
      box.center = [box.center[0] + Math.cos(a), box.center[1] + Math.sin(a), box.center[2]];
    },
    'quay 30°': (box) => void (box.heading += Math.PI / 6),
    'phóng to 1,3 lần': (box) => void (box.size = box.size.map((s) => s * 1.3)),
    'thu nhỏ 0,8 lần': (box) => void (box.size = box.size.map((s) => s * 0.8)),
    'nâng 0,5 m': (box) => void (box.center = [box.center[0], box.center[1], box.center[2] + 0.5]),
    'hạ 0,3 m': (box) => void (box.center = [box.center[0], box.center[1], box.center[2] - 0.3]),
    'hạ 0,5 m': (box) => void (box.center = [box.center[0], box.center[1], box.center[2] - 0.5]),
    'nâng 1 m': (box) => void (box.center = [box.center[0], box.center[1], box.center[2] + 1]),
    'hạ 1 m': (box) => void (box.center = [box.center[0], box.center[1], box.center[2] - 1]),
  };
  console.log();
  console.log(
    `Lỗi kéo dài: ${runs.length} đoạn ${RUN} frame (mỗi đối tượng một đoạn), ${wholes.length} track trọn vẹn.`,
  );
  console.log(
    'Lỗi cài'.padEnd(20),
    'đoạn: bắt / fit.*'.padEnd(22),
    'track: bắt / fit.*'.padEnd(22),
    'case thừa',
  );
  for (const [kind, plant] of Object.entries(LASTING)) {
    const cells: string[] = [];
    let extra = 0;
    const byRule = new Map<string, number>();
    const perType: string[] = [];
    for (const set of [runs, wholes]) {
      const scene: Scene = structuredClone(clean);
      const planted = new Map<string, string>();
      for (const { id, frames } of set)
        for (const index of frames) {
          const frame = scene.frames[index];
          const box = frame.boxes.find((b) => b.id === id)!;
          plant(box);
          await recount(frame.timestamp, box, frame.boxes);
          planted.set(`${frame.timestamp}:${id}`, id);
        }
      await measure();
      const cases = analyzeScene(scene).cases;
      const any = new Set(cases.filter((c) => planted.has(c.id)).map((c) => c.object_id));
      const fit = new Set(
        cases
          .filter((c) => planted.has(c.id) && c.findings.some((f) => f.check_id.startsWith('fit.')))
          .map((c) => c.object_id),
      );
      // A case on a cuboid of another object; a cuboid next to a planted run is the same object.
      const extras = cases.filter(
        (c) =>
          !planted.has(c.id) && !cleanCases.has(c.id) && !set.some((r) => r.id === c.object_id),
      );
      extra += extras.length;
      if (process.env.EXTRA)
        for (const c of extras)
          console.log(
            '  thừa',
            c.frame_index,
            c.object_id.slice(0, 8),
            c.type,
            c.findings.map((f) => f.check_id).join(','),
          );
      for (const c of cases)
        if (planted.has(c.id))
          for (const f of c.findings) byRule.set(f.check_id, (byRule.get(f.check_id) ?? 0) + 1);
      const share = (n: number) => `${n}/${set.length} (${Math.round((n / set.length) * 100)}%)`;
      cells.push(`${share(any.size)} / ${fit.size}`.padEnd(22));
      const typeOf = (id: string) =>
        clean.frames.flatMap((f) => f.boxes).find((b) => b.id === id)!.type;
      const types = new Map<string, number[]>();
      for (const { id } of set) {
        const t = types.get(typeOf(id)) ?? [0, 0];
        t[0] += fit.has(id) ? 1 : 0;
        t[1]++;
        types.set(typeOf(id), t);
      }
      perType.push([...types].map(([t, [n, of]]) => `${t} ${n}/${of}`).join(', '));
    }
    console.log(
      kind.padEnd(20),
      ...cells,
      String(extra).padEnd(4),
      [...byRule].map(([id, n]) => `${id} ${n}`).join(', '),
    );
    console.log(''.padEnd(20), `fit.* theo loại: đoạn ${perType[0]}; track ${perType[1]}`);
  }
}
