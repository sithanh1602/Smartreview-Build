# CVAT: CSRF Origin checking failed qua HTTPS domain

Cho CVAT 2.74.x chạy sau proxy HTTPS. Domain public phải đúng với URL trên trình duyệt. Không cần tắt CSRF hoặc thay Origin của browser.

## Áp dụng trên máy/VPS đang chạy CVAT

1. Cập nhật repo SmartReview, lấy đường dẫn tuyệt đối của checkout:

```bash
export SMARTREVIEW_REPO=/duong-dan-tuyet-doi/smartreview
export CVAT_PUBLIC_URL=https://cvat.mixi-t028.cloud
```

2. Vào thư mục stack CVAT (chứa docker-compose.yml), dùng đúng project và các file override của lần deploy hiện tại. Thêm override của SmartReview ở cuối. Ví dụ stack chỉ dùng compose gốc:

```bash
cd /duong-dan/cvat
docker compose -f docker-compose.yml \
  -f "$SMARTREVIEW_REPO/cvat-panel/docker-compose.cvat-domain.yml" \
  config --quiet
docker compose -f docker-compose.yml \
  -f "$SMARTREVIEW_REPO/cvat-panel/docker-compose.cvat-domain.yml" \
  up -d --no-deps cvat_server
```

Nếu stack đang dùng thêm override HTTPS, external DB, file --env-file hoặc project name -p, phải giữ nguyên các tham số đó. Không tạo stack mới hoặc xóa volumes.

3. Nạp lại proxy SmartReview đã bổ sung X-Forwarded-Host và X-Forwarded-Proto:

```bash
docker exec smartreview_cvat_proxy nginx -t
docker exec smartreview_cvat_proxy nginx -s reload
```

Nếu proxy không mount nginx.conf từ checkout này, cần đồng bộ nginx.conf vào vị trí mount thực tế trước khi reload.

4. Kiểm tra Django thật sự nhận settings:

```bash
docker exec cvat_server python manage.py shell -c \
 'from django.conf import settings; print(settings.CSRF_TRUSTED_ORIGINS); print(settings.SECURE_PROXY_SSL_HEADER)'
```

Kết quả phải có https://cvat.mixi-t028.cloud và ('HTTP_X_FORWARDED_PROTO', 'https'). Tải lại trang, đăng nhập lại nếu cần rồi tạo task mới.

Chỉ khai báo biến CSRF_TRUSTED_ORIGINS trong environment chưa đủ nếu bản CVAT không đọc biến này. Override dùng module settings nhỏ import production settings của CVAT rồi bổ sung origin cụ thể.

Các dịch vụ CVAT khác giữ settings mặc định; custom module chỉ gắn vào cvat_server nhận HTTP. Không đặt DJANGO_SETTINGS_MODULE vào environment chung cho tất cả worker nếu chưa mount module tương ứng.
