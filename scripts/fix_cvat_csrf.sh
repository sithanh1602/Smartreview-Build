#!/bin/bash
set -e

echo "=== [1/3] Cấu hình CSRF_TRUSTED_ORIGINS & HTTPS header trong cvat_server ==="
docker exec -u 0 cvat_server bash -c 'cat << "EOF" >> /opt/cvat/cvat/settings/production.py

# --- SMARTREVIEW HTTPS & CSRF FIX ---
CSRF_TRUSTED_ORIGINS = ["https://cvat.mixi-t028.cloud", "http://cvat.mixi-t028.cloud"]
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
EOF
'

echo "=== [2/3] Khởi động lại container cvat_server ==="
docker restart cvat_server

echo "=== [3/3] Cập nhật Nginx Reverse Proxy (ép HTTPS header) ==="
if which nginx >/dev/null 2>&1; then
  sudo sed -i 's/proxy_set_header X-Forwarded-Proto \$scheme;/proxy_set_header X-Forwarded-Proto https;/g' /etc/nginx/sites-available/* /etc/nginx/conf.d/* /etc/nginx/nginx.conf 2>/dev/null || true
  sudo nginx -t && sudo nginx -s reload || true
fi

if docker ps | grep -q smartreview_cvat_proxy; then
  docker exec smartreview_cvat_proxy nginx -s reload 2>/dev/null || true
fi

echo "=== [Kiểm tra xác nhận cài đặt Django] ==="
docker exec cvat_server python manage.py shell -c \
  "from django.conf import settings; print('>>> CSRF_TRUSTED_ORIGINS:', settings.CSRF_TRUSTED_ORIGINS); print('>>> SECURE_PROXY_SSL_HEADER:', settings.SECURE_PROXY_SSL_HEADER)"

echo ""
echo "=== HOÀN TẤT THÀNH CÔNG! Hãy nhấn Ctrl+Shift+R (hoặc F5) trên trình duyệt và tạo task mới. ==="
