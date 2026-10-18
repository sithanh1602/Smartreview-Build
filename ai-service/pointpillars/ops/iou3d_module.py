import torch
import torchvision.ops

def boxes_overlap_bev(boxes_a, boxes_b):
    """
    Approximate or axis-aligned BEV overlap in PyTorch.
    boxes_a: (M, 5) [x1, y1, x2, y2, angle]
    boxes_b: (N, 5) [x1, y1, x2, y2, angle]
    """
    x1 = torch.maximum(boxes_a[:, 0].unsqueeze(1), boxes_b[:, 0].unsqueeze(0))
    y1 = torch.maximum(boxes_a[:, 1].unsqueeze(1), boxes_b[:, 1].unsqueeze(0))
    x2 = torch.minimum(boxes_a[:, 2].unsqueeze(1), boxes_b[:, 2].unsqueeze(0))
    y2 = torch.minimum(boxes_a[:, 3].unsqueeze(1), boxes_b[:, 3].unsqueeze(0))
    w = torch.clamp(x2 - x1, min=0)
    h = torch.clamp(y2 - y1, min=0)
    return w * h


def boxes_iou_bev(boxes_a, boxes_b):
    """
    boxes_a: (M, 5) [x1, y1, x2, y2, angle]
    boxes_b: (N, 5) [x1, y1, x2, y2, angle]
    """
    overlap = boxes_overlap_bev(boxes_a, boxes_b)
    area_a = ((boxes_a[:, 2] - boxes_a[:, 0]) * (boxes_a[:, 3] - boxes_a[:, 1])).unsqueeze(1)
    area_b = ((boxes_b[:, 2] - boxes_b[:, 0]) * (boxes_b[:, 3] - boxes_b[:, 1])).unsqueeze(0)
    union = area_a + area_b - overlap + 1e-8
    return overlap / union


def nms_cuda(boxes, scores, thresh, pre_maxsize=None, post_max_size=None):
    """
    Fast GPU / CPU NMS using torchvision.ops.nms.
    boxes: [N, 5] ([x1, y1, x2, y2, ry])
    scores: [N]
    thresh: float
    """
    if boxes.shape[0] == 0:
        return torch.empty((0,), dtype=torch.long, device=boxes.device)

    order = scores.sort(0, descending=True)[1]
    if pre_maxsize is not None:
        order = order[:pre_maxsize]
    
    sorted_boxes = boxes[order]
    sorted_scores = scores[order]

    # BEV boxes [x1, y1, x2, y2]
    bev_boxes = sorted_boxes[:, :4]
    keep = torchvision.ops.nms(bev_boxes, sorted_scores, thresh)

    if post_max_size is not None:
        keep = keep[:post_max_size]

    return order[keep]


def nms_normal_gpu(boxes, scores, thresh):
    return nms_cuda(boxes, scores, thresh)
