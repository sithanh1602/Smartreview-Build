#!/usr/bin/env bash
# Cài mọi thứ SmartReview cần, tất cả nằm trong repo (web/node_modules, .venv, model/).
#
#   ./setup.sh               Gói Node, web/.env (nếu chưa có), .venv cho project 3D và AI Check,
#                            model AI Check ai-service/yolo11n.pt và model chấm điểm yolo11s
#   ./setup.sh --no-ai       Bỏ phần AI Check (PyTorch nặng vài GB)
#   ./setup.sh --verifier    Thêm gói Python của label verifier (transformers, bitsandbytes…)
#   ./setup.sh --browser     Thêm Chromium của Playwright cho npm run test:ui
#   ./setup.sh --all         Tất cả các mục trên
#   ./setup.sh --model A,B   Tải các model đã nêu (lặp lại --model được)
#   ./setup.sh --all_model   Tải mọi model tải được
#   ./setup.sh --check       Chỉ kiểm tra, không cài hay tải gì
#
# Model (./setup.sh --model list để xem lại):
#   model/Model_rescore/  yolo11n yolo11s yolo11m yolo26n yolo26s-coco   (chấm điểm box khi import)
#   model/Model_bbox/     siglip (1,5 GB) qwen (7,5 GB)                  (đọc và xét box)
#   yolo26s (bản fine-tune BDD100K) không tải được: copy tay vào model/Model_rescore/yolo26s.pt
#
# Script không đụng tới MySQL và không ghi đè web/.env đã có.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$ROOT/web"
VENV="$ROOT/.venv"
PY="$VENV/bin/python"
# Git Bash trên Windows: venv đặt Python ở Scripts/.
[ -x "$VENV/Scripts/python.exe" ] && PY="$VENV/Scripts/python.exe"
NODE_MIN="22.18.0"
REQ_3D="$WEB/server/projects3d/requirements.txt"
REQ_AI="$ROOT/ai-service/requirements.txt"
REQ_VERIFIER="$WEB/server/verify/requirements.txt"
MODEL="$ROOT/ai-service/yolo11n.pt"
# Popup tạo project liệt kê model từ hai thư mục này (web/server/ai/rescore.ts, verify/models.ts).
RESCORE_DIR="$ROOT/model/Model_rescore"
BBOX_DIR="$ROOT/model/Model_bbox"

# Model tải được: tên → "thư mục|nguồn". Nguồn là file release của Ultralytics hoặc repo
# Hugging Face; yolo26s-coco là yolo26s.pt gốc COCO, đổi tên để không trùng bản fine-tune.
RESCORE_MODELS="yolo11n yolo11s yolo11m yolo26n yolo26s-coco"
BBOX_MODELS="siglip qwen"
model_source() {
  case "$1" in
    yolo11n | yolo11s | yolo11m | yolo26n) echo "rescore|$1.pt" ;;
    yolo26s-coco) echo "rescore|yolo26s.pt" ;;
    siglip) echo "bbox|google/siglip2-base-patch16-224" ;;
    qwen) echo "bbox|Qwen/Qwen2.5-VL-3B-Instruct" ;;
    *) return 1 ;;
  esac
}
usage() { sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

with_ai=true
with_browser=false
with_verifier=false
check_only=false
models=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-ai) with_ai=false ;;
    --ai) with_ai=true ;; # Tên cũ: AI Check giờ được cài mặc định.
    --browser) with_browser=true ;;
    --verifier) with_verifier=true ;;
    --all) with_ai=true; with_browser=true; with_verifier=true ;;
    --all_model | --all-models) models="$RESCORE_MODELS $BBOX_MODELS" ;;
    --model=*) models="$models ${1#--model=}" ;;
    --model)
      [ $# -ge 2 ] || { echo "--model cần tên model (xem ./setup.sh --help)" >&2; exit 2; }
      models="$models $2"; shift ;;
    --check) check_only=true ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Tham số không hợp lệ: $1 (xem ./setup.sh --help)" >&2; exit 2 ;;
  esac
  shift
done
models="$(echo "$models" | tr ',' ' ' | xargs -n1 2>/dev/null | awk '!seen[$0]++' | xargs)"
if [ "$models" = "list" ]; then usage; exit 0; fi
for name in $models; do
  if [ "$name" = "yolo26s" ]; then
    echo "yolo26s là bản fine-tune, không tải được: copy file vào model/Model_rescore/yolo26s.pt" >&2
    exit 2
  fi
  model_source "$name" >/dev/null || {
    echo "Không có model \"$name\". Chọn trong: $RESCORE_MODELS $BBOX_MODELS" >&2
    exit 2
  }
done

missing=0
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
# Thiếu một thứ ./setup.sh cài được: --check kết thúc với mã lỗi khi có mục như vậy.
lack() { missing=$((missing + 1)); warn "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
# version_at_least CURRENT MINIMUM
version_at_least() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }
# Giá trị đang dùng của một biến trong web/.env; dòng bị chú thích không tính.
env_value() { sed -n "s/^$1=//p" "$WEB/.env" 2>/dev/null | tail -n1 | sed 's/^"\(.*\)"$/\1/'; }
# Đường dẫn trong web/.env tính từ web/.
from_web() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s' "$WEB/$1" ;; esac; }
has_modules() { local python="$1"; shift; "$python" -c "import $(IFS=,; echo "$*")" >/dev/null 2>&1; }
ensure_venv() {
  command -v python3 >/dev/null || fail "Chưa có python3. Cài Python 3 rồi chạy lại ./setup.sh"
  if [ ! -x "$PY" ]; then
    python3 -m venv "$VENV" || fail "Không tạo được .venv (thiếu gói python3-venv?)"
    "$PY" -m pip install --quiet --upgrade pip
  fi
}

step "1. Node.js"
command -v node >/dev/null || fail "Chưa có Node.js. Cài Node >= $NODE_MIN: https://nodejs.org"
node_version="$(node -p 'process.versions.node')"
version_at_least "$node_version" "$NODE_MIN" ||
  fail "Node $node_version quá cũ. Cần >= $NODE_MIN vì server chạy thẳng file .ts."
ok "Node $node_version"
command -v npm >/dev/null || fail "Chưa có npm."
ok "npm $(npm --version)"

step "2. Gói Node (web/)"
# Đủ và đúng phiên bản theo package.json; gói thừa không tính là lỗi.
node_ready() { (cd "$WEB" && npm ls --depth=0 >/dev/null 2>&1); }
# Đã khớp thì không cài lại: npm ci xóa node_modules, làm hỏng npm run dev đang chạy.
if node_ready; then
  ok "node_modules khớp package.json"
elif $check_only; then
  lack "Gói Node thiếu hoặc lệch phiên bản"
else
  (cd "$WEB" && npm ci --no-audit --no-fund)
  ok "Đã cài theo package-lock.json"
fi

step "3. Cấu hình web/.env"
if [ -f "$WEB/.env" ]; then
  ok "web/.env đã có, giữ nguyên"
elif $check_only; then
  lack "Chưa có web/.env"
else
  cp "$WEB/.env.example" "$WEB/.env"
  chmod 600 "$WEB/.env"
  warn "Đã tạo web/.env từ .env.example: mở file và điền DB_HOST, DB_PORT, DB_USER, DB_PASSWORD"
fi
if [ "$(env_value DEV_SSH_TUNNEL)" = "true" ]; then
  if command -v ssh >/dev/null; then
    ok "ssh có sẵn cho DEV_SSH_TUNNEL"
  else
    warn "DEV_SSH_TUNNEL=true nhưng máy chưa có lệnh ssh: cài OpenSSH client"
  fi
fi

step "4. Python cho project 3D (.venv)"
if [ -x "$PY" ] && has_modules "$PY" numpy pyarrow; then
  ok ".venv đã có numpy và pyarrow"
elif $check_only; then
  lack "Chưa có numpy, pyarrow trong .venv"
else
  ensure_venv
  "$PY" -m pip install --quiet -r "$REQ_3D"
  ok "Đã cài numpy và pyarrow vào .venv"
fi
python_3d="$(env_value SMARTREVIEW_3D_PYTHON)"
if [ -n "$python_3d" ] && [ "$python_3d" != "$PY" ]; then
  if has_modules "$python_3d" numpy pyarrow; then
    warn "web/.env đang dùng Python ngoài repo cho project 3D: $python_3d. Xóa dòng SMARTREVIEW_3D_PYTHON để dùng .venv"
  else
    warn "SMARTREVIEW_3D_PYTHON=$python_3d không chạy được hoặc thiếu numpy, pyarrow. Xóa dòng đó để dùng .venv"
  fi
fi

step "5. Python cho AI Check và demo (.venv)"
if ! $with_ai; then
  warn "Bỏ qua (--no-ai). AI Check sẽ báo chưa sẵn sàng; review dataset không cần phần này"
else
  if [ -x "$PY" ] && has_modules "$PY" ultralytics cv2; then
    ok ".venv đã có Ultralytics (kèm PyTorch) và OpenCV"
  elif $check_only; then
    lack "Chưa có Ultralytics, OpenCV trong .venv"
  else
    ensure_venv
    "$PY" -m pip install -r "$REQ_AI"
    ok "Đã cài Ultralytics (kèm PyTorch) và OpenCV vào .venv"
  fi
  model_env="$(env_value SMARTREVIEW_AI_MODEL)"
  if [ -n "$model_env" ]; then
    if [ -f "$model_env" ]; then ok "Model theo SMARTREVIEW_AI_MODEL: $model_env"; else warn "SMARTREVIEW_AI_MODEL=$model_env không tồn tại"; fi
  elif [ -f "$MODEL" ]; then
    ok "Model ai-service/yolo11n.pt đã có"
  elif $check_only; then
    lack "Thiếu model ai-service/yolo11n.pt"
  else
    # Ultralytics tải trọng số có tên chuẩn về thư mục đang đứng.
    (cd "$ROOT/ai-service" && "$PY" -c "from ultralytics import YOLO; YOLO('yolo11n.pt')" >/dev/null)
    [ -f "$MODEL" ] || fail "Không tải được yolo11n.pt. Đặt file vào ai-service/ rồi chạy lại."
    ok "Đã tải model ai-service/yolo11n.pt"
  fi
  python_ai="$(env_value SMARTREVIEW_AI_PYTHON)"
  if [ -n "$python_ai" ] && [ "$python_ai" != "$PY" ]; then
    warn "web/.env đang dùng Python ngoài repo cho AI Check: $python_ai"
  fi
fi

step "6. Trình duyệt cho test giao diện (tùy chọn)"
if $with_browser && ! $check_only; then
  (cd "$WEB" && npx playwright install chromium)
  ok "Đã cài Chromium của Playwright"
else
  warn "Bỏ qua. Dùng ./setup.sh --browser khi cần chạy npm run test:ui"
fi

step "7. Repo guideline-rules (tùy chọn, chỉ kiểm tra)"
rules="$(env_value GUIDELINE_RULES_DIR)"
if [ -z "$rules" ]; then
  ok "GUIDELINE_RULES_DIR không đặt: guideline được phân tích trong một lần gọi"
elif [ -d "$(from_web "$rules")/src" ]; then
  if [ -d "$(from_web "$rules")/node_modules" ]; then
    ok "guideline-rules: $(from_web "$rules")"
  else
    warn "guideline-rules chưa cài gói: cd $(from_web "$rules") && npm ci"
  fi
else
  warn "GUIDELINE_RULES_DIR=$rules không có repo guideline-rules"
fi

step "8. Label verifier (tùy chọn)"
verifier_python="$(env_value LABEL_VERIFIER_PYTHON)"
verifier_python="${verifier_python:-$PY}"
if [ -x "$verifier_python" ] && has_modules "$verifier_python" torch transformers PIL sentencepiece; then
  ok "Python của label verifier đã đủ gói: $verifier_python"
elif ! $with_verifier; then
  warn "Bỏ qua. Dùng ./setup.sh --verifier khi cần quét nhãn bằng SigLIP / Qwen"
elif $check_only; then
  lack "Chưa có các gói của label verifier trong .venv"
else
  ensure_venv
  "$PY" -m pip install -r "$REQ_VERIFIER"
  ok "Đã cài các gói của label verifier vào .venv"
fi

step "9. Model (model/)"
# Không nêu --model thì chỉ cần model chấm điểm mặc định.
wanted="${models:-yolo11s}"
for name in $wanted; do
  IFS='|' read -r kind source <<<"$(model_source "$name")"
  if [ "$kind" = rescore ]; then
    target="$RESCORE_DIR/$name.pt"
    if [ -e "$target" ]; then ok "$name: model/Model_rescore/$name.pt"; continue; fi
    if $check_only; then lack "Chưa có model/Model_rescore/$name.pt"; continue; fi
    if ! [ -x "$PY" ] || ! has_modules "$PY" ultralytics; then
      warn "$name: cần Ultralytics trong .venv (chạy ./setup.sh không có --no-ai)"; continue
    fi
    mkdir -p "$RESCORE_DIR/.download"
    if "$PY" -c "import sys; from ultralytics.utils.downloads import attempt_download_asset as get; get(sys.argv[1])" \
      "$RESCORE_DIR/.download/$source" >/dev/null 2>&1 && [ -f "$RESCORE_DIR/.download/$source" ]; then
      mv "$RESCORE_DIR/.download/$source" "$target"
      ok "Đã tải $name vào model/Model_rescore/$name.pt"
    else
      warn "Không tải được $name ($source). Kiểm tra mạng rồi chạy lại"
    fi
    rmdir "$RESCORE_DIR/.download" 2>/dev/null || true
  else
    target="$BBOX_DIR/${source#*/}"
    # Đủ khi có config.json, file trọng số và không còn file tải dở trong cache của thư mục.
    if [ -f "$target/config.json" ] &&
      [ -n "$(find "$target/" -maxdepth 1 \( -name '*.safetensors' -o -name '*.bin' \) -print -quit)" ] &&
      [ -z "$(find "$target/" -path '*/.cache/*' -name '*.incomplete' -print -quit 2>/dev/null)" ]; then
      ok "$name: model/Model_bbox/${source#*/}"; continue
    fi
    if $check_only; then lack "Chưa có model/Model_bbox/${source#*/}"; continue; fi
    ensure_venv
    has_modules "$PY" huggingface_hub || "$PY" -m pip install --quiet huggingface_hub
    mkdir -p "$target"
    # Mất kết nối thì giữ file đã tải; chạy lại lệnh để tải tiếp.
    if "$PY" -c "import sys; from huggingface_hub import snapshot_download; snapshot_download(sys.argv[1], local_dir=sys.argv[2])" \
      "$source" "$target"; then
      ok "Đã tải $name vào model/Model_bbox/${source#*/}"
    else
      warn "Chưa tải xong $name. Chạy lại lệnh để tải tiếp"
    fi
  fi
done
if [ -n "$(env_value LABEL_VERIFIER_MODELS_DIR)" ] || [ -n "$(env_value SMARTREVIEW_RESCORE_MODELS_DIR)" ]; then
  warn "web/.env đặt thư mục model khác model/: popup đọc theo web/.env, không theo thư mục vừa tải"
fi

if $check_only; then
  step "Kết quả kiểm tra"
  if [ "$missing" -eq 0 ]; then
    ok "Không thiếu thư viện nào"
  else
    warn "$missing mục còn thiếu: chạy ./setup.sh"
    exit 1
  fi
  exit 0
fi

step "Bước tiếp theo"
cat <<'EOF'
  1. Điền thông tin MySQL trong web/.env (cách mở kết nối: web/README.md, mục 1)
  2. cd web && npm run db:migrate
  3. npm run user:create -- --username <tên> --role leader
  4. npm run dev        →  http://127.0.0.1:5173
EOF
