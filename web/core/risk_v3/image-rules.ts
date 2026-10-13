import { POLICY, VEHICLES } from './policy.ts';
import type { ImageRule, MeasuredBox } from './types.ts';

// Frame rules score no box: they keep the whole frame out of auto_accept.
// Rules about bonus labels are reported but do not block.
const C = POLICY.coverage;
const count = (boxes: MeasuredBox[], labels: string[]) =>
  boxes.filter((b) => labels.includes(b.label)).length;
const rule = (id: string, run: ImageRule['run'], blocking = true): ImageRule => ({
  id,
  blocking,
  run,
});

export const imageRules: ImageRule[] = [
  rule('coverage.no_draft_box', ({ drafts }) =>
    drafts.length ? null : { reason: 'Ảnh không có box nháp nào.', evidence: { drafts: 0 } },
  ),
  // N6. The policy leaves the grey-box count open; nightGrey is a placeholder.
  rule('coverage.night_grey', ({ greys, env_risk }) =>
    env_risk !== undefined && env_risk >= POLICY.poorEnv && greys.length > C.nightGrey
      ? {
          reason: `Ảnh tối có ${greys.length} box vùng xám.`,
          evidence: { env_risk, grey_boxes: greys.length, threshold: C.nightGrey },
        }
      : null,
  ),
  rule('coverage.bus_present', ({ drafts }) =>
    count(drafts, ['bus'])
      ? { reason: 'Ảnh có xe buýt.', evidence: { bus_boxes: count(drafts, ['bus']) } }
      : null,
  ),
  rule('coverage.grey_vehicles', ({ missing }) => {
    const n = count(missing, VEHICLES);
    return n >= C.greyVehicles
      ? {
          reason: `${n} box vùng xám lớp xe: nghi sót nhiều xe.`,
          evidence: { grey_boxes: n, threshold: C.greyVehicles },
        }
      : null;
  }),
  rule('coverage.dense_traffic', ({ drafts }) => {
    const n = count(drafts, VEHICLES);
    return n >= C.denseTraffic
      ? {
          reason: `Xe dày đặc: ${n} box.`,
          evidence: { vehicle_boxes: n, threshold: C.denseTraffic },
        }
      : null;
  }),
  // N7: missing a person weighs more than missing anything else, so one grey box is enough.
  rule('coverage.grey_person', ({ missing }) => {
    const n = count(missing, ['person']);
    return n ? { reason: 'Có dấu hiệu một người bị sót.', evidence: { grey_boxes: n } } : null;
  }),
  rule('coverage.crowd', ({ drafts }) => {
    const n = count(drafts, ['person']);
    return n >= C.crowd
      ? { reason: `Đám đông: ${n} box người.`, evidence: { person_boxes: n, threshold: C.crowd } }
      : null;
  }),
  rule(
    'coverage.many_lights',
    ({ drafts }) => {
      const n = count(drafts, ['traffic_light']);
      return n > C.manyLights
        ? {
            reason: `Quá nhiều đèn tín hiệu: ${n} box.`,
            evidence: { light_boxes: n, threshold: C.manyLights },
          }
        : null;
    },
    false,
  ),
  rule(
    'coverage.many_stop_signs',
    ({ drafts }) => {
      const n = count(drafts, ['traffic_sign']);
      return n > C.manyStopSigns
        ? {
            reason: `Quá nhiều biển stop: ${n} box.`,
            evidence: { sign_boxes: n, threshold: C.manyStopSigns },
          }
        : null;
    },
    false,
  ),
];
