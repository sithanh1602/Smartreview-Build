#!/usr/bin/env bash
# Cài các gói SmartReview cần để chạy trên máy dev.
#
#   ./setup.sh             Gói Node cho web, tạo web/.env nếu chưa có, Python venv (.venv) với
#                          numpy + pyarrow cho project 3D
#   ./setup.sh --ai        Thêm Python venv (.venv) với Ultralytics + OpenCV cho AI Check / demo
#   ./setup.sh --browser   Thêm Chromium của Playwright cho npm run test:ui
#   ./setup.sh --all       Tất cả các mục trên
#   ./setup.sh --check     Chỉ kiểm tra, không cài hay ghi gì
#
# Script không đụng tới MySQL và không ghi đè web/.env đã có. Máy đã đặt SMARTREVIEW_3D_PYTHON
# trong web/.env thì dùng Python đó, script không tạo .venv cho project 3D.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$ROOT/web"
NODE_MIN="22.18.0"

with_ai=false
with_browser=false
check_only=false
for arg in "$@"; do
  case "$arg" in
    --ai) with_ai=true ;;
    --browser) with_browser=true ;;
    --all) with_ai=true; with_browser=true ;;
    --check) check_only=true ;;
    -h | --help) sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Tham số không hợp lệ: $arg (xem ./setup.sh --help)" >&2; exit 2 ;;
  esac
done

ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
# version_at_least CURRENT MINIMUM
version_at_least() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }

step "1. Node.js"
command -v node >/dev/null || fail "Chưa có Node.js. Cài Node >= $NODE_MIN: https://nodejs.org"
node_version="$(node -p 'process.versions.node')"
version_at_least "$node_version" "$NODE_MIN" ||
  fail "Node $node_version quá cũ. Cần >= $NODE_MIN vì server chạy thẳng file .ts."
ok "Node $node_version"
command -v npm >/dev/null || fail "Chưa có npm."
ok "npm $(npm --version)"

step "2. Gói Node (web/)"
if $check_only; then
  if [ -d "$WEB/node_modules" ]; then ok "node_modules đã có"; else warn "Chưa cài: chạy ./setup.sh"; fi
else
  (cd "$WEB" && npm ci --no-audit --no-fund)
  ok "Đã cài theo package-lock.json"
fi

step "3. Cấu hình web/.env"
if [ -f "$WEB/.env" ]; then
  ok "web/.env đã có, giữ nguyên"
elif $check_only; then
  warn "Chưa có web/.env: chạy ./setup.sh rồi điền thông tin MySQL"
else
  cp "$WEB/.env.example" "$WEB/.env"
  chmod 600 "$WEB/.env"
  warn "Đã tạo web/.env từ .env.example: mở file và điền DB_HOST, DB_PORT, DB_USER, DB_PASSWORD"
fi

step "4. Python cho project 3D"
REQ_3D="$WEB/server/projects3d/requirements.txt"
has_3d_libs() { "$1" -c 'import numpy, pyarrow' >/dev/null 2>&1; }
# Giá trị đang dùng trong web/.env; dòng bị chú thích không tính.
python_3d="$(sed -n 's/^SMARTREVIEW_3D_PYTHON=//p' "$WEB/.env" 2>/dev/null | tail -n1)"
if [ -n "$python_3d" ]; then
  if has_3d_libs "$python_3d"; then
    ok "Dùng SMARTREVIEW_3D_PYTHON trong web/.env: $python_3d"
  else
    warn "SMARTREVIEW_3D_PYTHON=$python_3d không chạy được hoặc thiếu numpy, pyarrow"
  fi
elif [ -x "$ROOT/.venv/bin/python" ] && has_3d_libs "$ROOT/.venv/bin/python"; then
  ok ".venv đã có numpy và pyarrow"
elif $check_only; then
  warn "Chưa có numpy, pyarrow trong .venv: chạy ./setup.sh"
elif ! command -v python3 >/dev/null; then
  warn "Chưa có python3: bỏ qua. Tạo project 3D cần Python; cài python3 rồi chạy lại ./setup.sh"
else
  [ -d "$ROOT/.venv" ] || python3 -m venv "$ROOT/.venv"
  "$ROOT/.venv/bin/python" -m pip install --quiet --upgrade pip
  "$ROOT/.venv/bin/python" -m pip install --quiet -r "$REQ_3D"
  ok "Đã cài numpy và pyarrow vào .venv"
fi

step "5. Python cho AI Check và demo (tùy chọn)"
if $with_ai && ! $check_only; then
  command -v python3 >/dev/null || fail "Chưa có python3."
  [ -d "$ROOT/.venv" ] || python3 -m venv "$ROOT/.venv"
  "$ROOT/.venv/bin/python" -m pip install --quiet --upgrade pip
  "$ROOT/.venv/bin/python" -m pip install ultralytics opencv-python
  ok "Đã cài Ultralytics (kèm PyTorch) và OpenCV vào .venv"
fi
if [ -x "$ROOT/.venv/bin/python" ]; then
  ok ".venv đã có"
  if [ -f "$ROOT/ai-service/yolo11n.pt" ]; then
    ok "Model ai-service/yolo11n.pt đã có"
  else
    warn "Thiếu model: đặt file yolo11n.pt vào ai-service/ (hoặc đặt SMARTREVIEW_AI_MODEL trong web/.env)"
  fi
else
  warn "Bỏ qua. Review dataset không cần Python; dùng ./setup.sh --ai khi cần AI Check"
fi

step "6. Trình duyệt cho test giao diện (tùy chọn)"
if $with_browser && ! $check_only; then
  (cd "$WEB" && npx playwright install chromium)
  ok "Đã cài Chromium của Playwright"
else
  warn "Bỏ qua. Dùng ./setup.sh --browser khi cần chạy npm run test:ui"
fi

step "Bước tiếp theo"
cat <<'EOF'
  1. Điền thông tin MySQL trong web/.env (cách mở kết nối: web/README.md, mục 1)
  2. cd web && npm run db:migrate
  3. npm run user:create -- --username <tên> --role reviewer
  4. npm run dev        →  http://127.0.0.1:5173
EOF
