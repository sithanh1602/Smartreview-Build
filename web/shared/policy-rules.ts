import { POLICY } from '../core/risk/policy.ts';

// What each check of the built-in policy enforces, in one line, for comparing it with a rule
// drafted from a guideline. Thresholds are read from the policy itself so they cannot drift.
const percent = (value: number) => `${Math.round(value * 100)}%`;
export const POLICY_RULES: Record<string, string> = {
  'temporal.class_inconsistency':
    'Trong một track, frame giữa mang lớp khác hai frame trước và sau thì bị gắn cờ.',
  'confidence.neighbor_drop':
    'Độ tin cậy của một frame thấp hơn trung bình hai frame kề từ 0,2 trở lên thì bị gắn cờ.',
  'geometry.bbox_area':
    'Diện tích khung lệch từ 50% so với trung bình hai frame kề trong cùng track thì bị gắn cờ.',
  'geometry.bbox_position':
    'Tâm khung lệch khỏi điểm giữa của hai frame kề từ nửa đường chéo khung trở lên thì bị gắn cờ.',
  'confidence.low_score': `Khung của mô hình có độ tin cậy dưới ${percent(POLICY.lowScore)} thì bị gắn cờ.`,
  'confidence.class_margin': `Điểm của lớp đứng đầu và lớp thứ hai cách nhau dưới ${percent(POLICY.classMargin)} thì bị gắn cờ (mô hình phân vân giữa hai nhãn).`,
  'confidence.vehicle_confusion': `Lớp thứ hai là một loại xe gần giống và cách lớp đứng đầu dưới ${percent(POLICY.confusionMargin)} thì bị gắn cờ.`,
  'confidence.person_vs_two_wheeler': `Mô hình phân vân giữa người và xe hai bánh, hai điểm cách nhau dưới ${percent(POLICY.confusionMargin)}, thì bị gắn cờ.`,
  'geometry.bbox_validity': 'Khung có chiều rộng hoặc chiều cao không hợp lệ thì bị gắn cờ.',
  'geometry.cross_class_overlap': `Hai khung khác lớp chồng nhau từ ${percent(POLICY.duplicateIou)} (IoU) bị coi là một vật thể gán hai tên; người ngồi trên xe hai bánh được loại trừ.`,
  'geometry.edge_truncated': `Khung sát mép ảnh, chỉ còn một dải hẹp của vật thể và có độ tin cậy dưới ${percent(POLICY.lowScore)} thì bị gắn cờ.`,
  'env.poor_condition': `Khung có độ tin cậy dưới ${percent(POLICY.lowScore)} trong frame có điều kiện xấu (env_risk từ ${percent(POLICY.poorEnv)}) thì bị gắn cờ.`,
  'geometry.manual_overlap':
    'Hai khung cùng lớp do người vẽ chồng nhau từ 50% (IoU) thì khung vẽ sau bị gắn cờ.',
  'context.vehicle_in_large_vehicle':
    'Xe nằm gần trọn trong khung xe tải hoặc xe buýt bị coi là một bộ phận của xe lớn.',
  'context.ego_vehicle':
    'Khung xe chạm mép dưới ảnh mà không vươn tới giữa ảnh bị coi là nắp ca-pô của xe gắn camera.',
  'geometry.vehicle_position':
    'Khung xe nằm trọn ở phần trên cùng của ảnh (trên đường chân trời) thì bị gắn cờ.',
  'geometry.vehicle_aspect':
    'Khung ô tô, xe tải, xe buýt cao hoặc dẹt bất thường (tỉ lệ cao/rộng trên 2 hoặc dưới 0,2) thì bị gắn cờ.',
  'geometry.two_wheeler_aspect':
    'Khung xe hai bánh cao bất thường (thường do ôm cả người lái) thì bị gắn cờ.',
  'context.person_in_vehicle':
    'Khung người nằm trong khung xe bốn bánh theo kiểu hành khách sau kính thì bị gắn cờ.',
  'context.person_two_wheeler':
    'Khung người và khung xe hai bánh gần trùng nhau (một khung ôm cả hai) thì bị gắn cờ.',
  'geometry.person_aspect': 'Khung người có tỉ lệ cao/rộng bất thường thì bị gắn cờ.',
  'context.light_in_vehicle':
    'Khung đèn tín hiệu nằm trọn trong khung xe bị coi là đèn hậu của xe.',
  'geometry.light_position':
    'Khung đèn tín hiệu nằm thấp sát mặt đường (tâm dưới 65% chiều cao ảnh) thì bị gắn cờ.',
  'geometry.light_below_vehicles':
    'Khung đèn tín hiệu có tâm thấp hơn mép trên của ít nhất ba phần tư số xe trong ảnh thì bị gắn cờ (thường là đèn hậu hoặc bóng phản chiếu).',
  'geometry.light_aspect': 'Khung đèn tín hiệu có hình dạng quá khác thường thì bị gắn cờ.',
  'geometry.light_overlap': 'Hai khung đèn tín hiệu gần trùng nhau bị coi là gán trùng.',
  'context.sign_in_vehicle': 'Khung biển báo do mô hình sinh ra nằm trong khung xe thì bị gắn cờ.',
  'geometry.stop_sign_aspect':
    'Khung biển dừng do mô hình sinh ra có tỉ lệ cạnh bất thường thì bị gắn cờ.',
  'geometry.sign_position': 'Khung biển báo ở vị trí bất thường trong ảnh thì bị gắn cờ.',
  'geometry.sign_overlap': 'Hai khung biển báo gần trùng nhau bị coi là gán trùng.',
  'geometry.barrier_aspect': 'Khung rào chắn có tỉ lệ cạnh bất thường thì bị gắn cờ.',
  'context.barrier_spans_vehicle':
    'Rào chắn bị xe cắt ngang mà vẫn gán một khung liền thì bị gắn cờ (phải tách hai đoạn).',
  'geometry.pole_aspect': 'Khung cột có tỉ lệ cạnh bất thường thì bị gắn cờ.',
  'context.pole_covers_objects':
    'Khung cột ôm cả đèn hoặc biển gắn trên cột thì bị gắn cờ (chỉ gán thân cột).',
  'geometry.duplicate_draft':
    'Hai khung cùng lớp do mô hình sinh ra chồng nhau từ 60% (IoU) thì khung có độ tin cậy thấp hơn bị coi là khung thừa.',
  'geometry.stronger_duplicate':
    'Khung xe tải hoặc xe buýt gần trùng với một khung khác lớp có độ tin cậy thấp hơn vẫn bị gắn cờ: tên lớp còn đáng ngờ.',
  'visibility.mostly_hidden':
    'Vật thể bị che hoặc nằm ngoài khung hình quá nửa và có từ hai dấu hiệu khó xác nhận (độ tin cậy thấp, ảnh xấu, khung nhỏ, phân vân lớp) thì bị gắn cờ.',
  'visibility.barely_visible':
    'Vật thể chỉ còn thấy dưới 5% (ước lượng từ các khung đứng gần camera hơn) thì bị gắn cờ là khung thừa.',
  'attribute.required':
    'Bộ dữ liệu có attribute occluded hoặc truncated thì khung nào thiếu hoặc mang giá trị không hợp lệ bị gắn cờ.',
  'attribute.truncated_edge':
    'Khung chạm mép ảnh mà truncated không phải true, hoặc không chạm mép mà truncated là true, thì bị gắn cờ.',
  'pair.same_place':
    'Một khung ô tô và một khung xe tải gần trùng chỗ thì khung xe tải bị gắn cờ và ô tô được gợi ý, dù khung nào có độ tin cậy cao hơn.',
  'pair.second_opinion_margin':
    'Khung ô tô mà mô hình nghiêng hẳn về xe tải (xe tải cao hơn trên 15%) được cảnh báo, không cộng điểm.',
  'pair.unsupported_name':
    'Khung xe tải có độ tin cậy dưới 70% và không có ý kiến thứ hai của mô hình thì bị gắn cờ: tên lớp chưa đủ căn cứ.',
  'pair.relative_size':
    'Khung xe tải không cao hơn 1,3 lần các khung ô tô đứng cùng tầm xa thì bị gắn cờ.',
};
