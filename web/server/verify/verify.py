"""Scores how well each annotated box matches each label, from the pixels inside the box.

Reads one JSON request on stdin (or from the file named as the first argument) and writes one
JSON response on stdout. Progress goes to stderr as "progress <done> <total>" lines.

Request:
  {
    "engine": "siglip" | "qwen",                          which of the two engines below answers
    "model": "google/siglip2-base-patch16-224",          the model's name
    "model_dir": "/abs/siglip2-base-patch16-224",        optional: a folder holding the model
    "margin": 0.15,                                       context kept around a box
    "shape": "stretch" | "pad" | "context",               how a crop becomes square
    "pool": "max" | "mean",                               siglip: how a label's captions combine
    "labels": {"car": ["a photo of a car", ...], ...},    the captions that describe each label
    "boxes": [{"id": "box-1", "image": "/abs/a.jpg", "x": 1, "y": 2, "width": 30, "height": 40}]
  }

Response:
  {
    "model": "...", "device": "cuda",
    "results": [{"id": "box-1", "scores": {"car": 0.91, ...}, "caption": "a photo of a car"}],
    "skipped": [{"id": "box-2", "reason": "image_not_found"}]
  }

A label's score is the share it takes among all labels of the request (they sum to 1). The
model does not decide anything: the caller turns scores into findings. Every setting comes
with the request, from policy/_verifier.json; nothing here has a default of its own.

Two engines answer the same request:
  - "siglip" compares the crop with every caption; a label's score comes from its
    best-matching caption, or from the mean of its captions with "pool": "mean".
  - "qwen" (Qwen2.5-VL) is asked which label the crop shows, as a multiple-choice question; a
    label's score is the probability of its letter. "pool" does not apply and no "caption" is
    returned.

The model is loaded from "model_dir" when the request names one (download_models.py fills it),
and otherwise from the Hugging Face cache under the name in "model".
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import torch
from PIL import Image
from transformers import AutoModel, AutoProcessor


def crop(image, box, margin, shape):
    """The box with `margin` of its own size added on every side, clipped to the image.

    The model looks at a square. `shape` says how a box that is not square gets there:
    "stretch" resizes it as it is, "pad" centres it on a grey square, and "context" widens
    the short side with more of the image.
    """
    x, y, w, h = box["x"], box["y"], box["width"], box["height"]
    grow_x, grow_y = w * margin, h * margin
    if shape == "context":
        side = max(w + 2 * grow_x, h + 2 * grow_y)
        grow_x, grow_y = (side - w) / 2, (side - h) / 2
    left = max(0, int(x - grow_x))
    top = max(0, int(y - grow_y))
    right = min(image.width, int(x + w + grow_x + 0.5))
    bottom = min(image.height, int(y + h + grow_y + 0.5))
    if right - left < 2 or bottom - top < 2:
        return None
    cut = image.crop((left, top, right, bottom))
    if shape != "pad" or cut.width == cut.height:
        return cut
    side = max(cut.size)
    square = Image.new("RGB", (side, side), (128, 128, 128))
    square.paste(cut, ((side - cut.width) // 2, (side - cut.height) // 2))
    return square


def features(output):
    # Newer transformers wrap the embedding in an output object; older ones return the tensor.
    return output if isinstance(output, torch.Tensor) else output.pooler_output


def siglip(source, labels, described, pool, device):
    """Compares a crop with every caption. Returns the batch size and a function that scores
    a list of crops: for each, the labels' shares and the best-matching caption."""
    captions = [(label, text) for label in labels for text in described[label]]
    if not captions:
        raise SystemExit("request.labels holds no caption")
    if pool not in ("max", "mean"):
        raise SystemExit(f"request.pool: unknown value {pool}")
    model = AutoModel.from_pretrained(source).to(device).eval()
    processor = AutoProcessor.from_pretrained(source)

    with torch.no_grad():
        # SigLIP was trained with captions padded to a fixed length.
        tokens = processor(
            text=[text for _, text in captions],
            padding="max_length",
            max_length=64,
            truncation=True,
            return_tensors="pt",
        ).to(device)
        text = features(model.get_text_features(**tokens))
        text = text / text.norm(dim=-1, keepdim=True)
    scale = model.logit_scale.exp()
    owner = torch.tensor([labels.index(label) for label, _ in captions], device=device)
    if pool == "mean":
        # One direction per label: the average of its captions, so a label described by many
        # captions gets no more chances to match than a label described by one.
        mean = torch.zeros((len(labels), text.shape[1]), device=device, dtype=text.dtype)
        mean = mean.index_add(0, owner, text)
        label_text = mean / mean.norm(dim=-1, keepdim=True)

    def score(crops):
        with torch.no_grad():
            pixels = processor(images=crops, return_tensors="pt").to(device)
            image = features(model.get_image_features(**pixels))
            image = image / image.norm(dim=-1, keepdim=True)
            logits = image @ text.T * scale
            pooled = image @ label_text.T * scale if pool == "mean" else None
        scored = []
        for i, row in enumerate(logits):
            if pooled is not None:
                best = pooled[i]
            else:
                # One logit per label: its best caption.
                best = torch.full((len(labels),), float("-inf"), device=device)
                best = best.scatter_reduce(0, owner, row, reduce="amax")
            # The labels share one unit of belief.
            scored.append((torch.softmax(best, dim=0).tolist(), captions[int(row.argmax())][1]))
        return scored

    return 32, score


LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
# Qwen sees a crop at between 64 and 256 visual tokens (28 px each side per token): small
# crops are enlarged enough to be read, and a batch still fits a 4 GB GPU.
QWEN_MIN_PIXELS, QWEN_MAX_PIXELS = 64 * 28 * 28, 256 * 28 * 28


def qwen(source, labels, described, pool, device):
    """Asks Qwen2.5-VL which label a crop shows, as a multiple-choice question, and reads the
    probability of each answer letter instead of generating text. Same return as siglip()."""
    from transformers import AutoModelForImageTextToText

    if len(labels) > len(LETTERS):
        raise SystemExit(f"request.labels: at most {len(LETTERS)} labels for the qwen engine")
    if device == "cuda":
        # 4-bit weights: the 3B model takes about 3 GB of GPU memory instead of 8.
        from transformers import BitsAndBytesConfig

        quantized = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.float16
        )
        model = AutoModelForImageTextToText.from_pretrained(
            source, quantization_config=quantized, device_map={"": 0}
        )
    else:
        model = AutoModelForImageTextToText.from_pretrained(source, dtype=torch.float32)
    model.eval()
    processor = AutoProcessor.from_pretrained(
        source, min_pixels=QWEN_MIN_PIXELS, max_pixels=QWEN_MAX_PIXELS
    )
    # The answer is read after the last token, so a batch is padded on the left.
    processor.tokenizer.padding_side = "left"

    # A label is described to Qwen by what its captions name: "car (sedan, hatchback, taxi)".
    def kinds(label):
        names = [re.sub(r"^a photo of (an? )?", "", text) for text in described[label]]
        plain = label.replace("_", " ")
        return ", ".join(dict.fromkeys(n for n in names if n != plain))

    options = "\n".join(
        f"{letter}. {label.replace('_', ' ')}" + (f" ({kinds(label)})" if kinds(label) else "")
        for letter, label in zip(LETTERS, labels)
    )
    question = (
        "This is a crop from a street scene. Which one of these is the main object in it?\n"
        f"{options}\nAnswer with the letter only."
    )
    chat = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": question}]}]
    prompt = processor.apply_chat_template(chat, add_generation_prompt=True, tokenize=False)
    letters = [processor.tokenizer.encode(l, add_special_tokens=False) for l in LETTERS[: len(labels)]]
    if any(len(ids) != 1 for ids in letters):
        raise SystemExit(f"{source}: an answer letter is not a single token")
    letters = torch.tensor([ids[0] for ids in letters], device=device)

    def score(crops):
        with torch.no_grad():
            inputs = processor(
                text=[prompt] * len(crops), images=crops, padding=True, return_tensors="pt"
            ).to(device)
            # Only the position after the prompt is turned into token scores: doing it for
            # every position of a batch takes more memory than the model itself.
            hidden = model.model(**inputs).last_hidden_state[:, -1, :]
            last = model.lm_head(hidden)
            # The labels share one unit of belief: only the answer letters are compared.
            share = torch.softmax(last[:, letters].float(), dim=-1)
        return [(row, None) for row in share.tolist()]

    return 4 if device == "cuda" else 2, score


ENGINES = {"siglip": siglip, "qwen": qwen}


def main():
    request = json.load(open(sys.argv[1], encoding="utf-8") if len(sys.argv) > 1 else sys.stdin)
    required = ("engine", "model", "margin", "shape", "labels", "boxes")
    missing = [key for key in required if key not in request]
    if missing:
        raise SystemExit(f"request: missing {', '.join(missing)}")
    name, margin, shape = request["model"], float(request["margin"]), request["shape"]
    if request["engine"] not in ENGINES:
        raise SystemExit(f"request.engine: unknown value {request['engine']}")
    if shape not in ("stretch", "pad", "context"):
        raise SystemExit(f"request.shape: unknown value {shape}")
    labels = list(request["labels"])
    if not labels:
        raise SystemExit("request.labels holds no label")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    source = name
    if request.get("model_dir"):
        source = request["model_dir"]
        if not (Path(source) / "config.json").is_file():
            raise SystemExit(f"request.model_dir: no model in {source} (download_models.py fills it)")
    load = ENGINES[request["engine"]]
    batch, score = load(source, labels, request["labels"], request.get("pool"), device)

    by_image = defaultdict(list)
    for box in request["boxes"]:
        by_image[box["image"]].append(box)
    results, skipped = [], []
    total, done = len(request["boxes"]), 0

    def flush(pending):
        for (box, _), (share, caption) in zip(pending, score([cut for _, cut in pending])):
            result = {"id": box["id"], "scores": {l: round(p, 4) for l, p in zip(labels, share)}}
            if caption:
                result["caption"] = caption
            results.append(result)

    pending = []
    for path, boxes in by_image.items():
        try:
            image = Image.open(path).convert("RGB")
        except OSError:
            skipped += [{"id": box["id"], "reason": "image_not_found"} for box in boxes]
            done += len(boxes)
            continue
        for box in boxes:
            cut = crop(image, box, margin, shape)
            if cut is None:
                skipped.append({"id": box["id"], "reason": "empty_crop"})
            else:
                pending.append((box, cut))
            done += 1
            if len(pending) == batch:
                flush(pending)
                pending = []
                print(f"progress {done} {total}", file=sys.stderr, flush=True)
    if pending:
        flush(pending)
    print(f"progress {total} {total}", file=sys.stderr, flush=True)
    json.dump(
        {
            "engine": request["engine"],
            "model": name,
            "device": device,
            "results": results,
            "skipped": skipped,
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
