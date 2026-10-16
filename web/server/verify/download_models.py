"""Downloads the label verifier's models into the folders web/.env names for them.

  python download_models.py                 download both, or resume an interrupted download
  python download_models.py siglip          only SigLIP 2 base (about 1.5 GB)
  python download_models.py qwen            only Qwen2.5-VL 3B (about 7.5 GB)
  python download_models.py --check         only list what is still missing

Each model has its own folder outside this repo, named by LABEL_VERIFIER_SIGLIP_DIR and
LABEL_VERIFIER_QWEN_DIR (paths relative to web/). The files land there as plain files, so a
folder can be copied to another machine as it is. The model names come from
policy/_verifier.json.
"""

import argparse
import json
import os
import sys
from pathlib import Path

from huggingface_hub import snapshot_download

WEB = Path(__file__).resolve().parents[2]
ENV = {"siglip": "LABEL_VERIFIER_SIGLIP_DIR", "qwen": "LABEL_VERIFIER_QWEN_DIR"}


def env_file():
    """The values of web/.env, for a run that did not come through Node."""
    values = {}
    path = WEB / ".env"
    for line in path.read_text(encoding="utf-8").splitlines() if path.is_file() else []:
        key, sep, value = line.partition("=")
        if sep and not key.lstrip().startswith("#"):
            values[key.strip()] = value.strip().strip('"')
    return values


def main():
    parser = argparse.ArgumentParser(description="Tải mô hình của label verifier")
    parser.add_argument("engines", nargs="*", help="siglip, qwen; mặc định: cả hai")
    parser.add_argument("--check", action="store_true", help="chỉ kiểm tra, không tải")
    args = parser.parse_args()
    unknown = [engine for engine in args.engines if engine not in ENV]
    if unknown:
        parser.error(f"engine không có: {', '.join(unknown)}")

    policy = json.loads((WEB / "policy/_verifier.json").read_text(encoding="utf-8"))
    engines = policy["verifier_policy"]["engines"]
    settings = env_file()
    incomplete = False
    for engine in args.engines or list(ENV):
        repo = engines[engine]["model"]
        folder = os.environ.get(ENV[engine]) or settings.get(ENV[engine])
        if not folder:
            sys.exit(f"Chưa đặt {ENV[engine]} trong web/.env (thư mục chứa {repo}).")
        folder = (WEB / folder).resolve()
        folder.mkdir(parents=True, exist_ok=True)
        files = snapshot_download(repo, local_dir=folder, dry_run=True)
        missing = [f for f in files if f.will_download]
        if not missing:
            print(f"{repo} đã có đủ ở {folder}")
            continue
        size = sum(f.file_size for f in missing) / 1e9
        print(f"{repo}: còn thiếu {len(missing)}/{len(files)} file ({size:.1f} GB) ở {folder}")
        if args.check:
            incomplete = True
            continue
        # A dropped connection keeps the partial files; running again continues from them.
        try:
            snapshot_download(repo, local_dir=folder)
        except (OSError, KeyboardInterrupt) as error:
            sys.exit(f"Tải chưa xong ({type(error).__name__}). Chạy lại lệnh này để tải tiếp.")
        print(f"Xong: {folder}")
    if incomplete:
        sys.exit(1)


if __name__ == "__main__":
    main()
