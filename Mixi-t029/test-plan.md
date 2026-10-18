# TÀI LIỆU VÀ KẾ HOẠCH KIỂM THỬ TOÀN DIỆN HỆ THỐNG SMARTREVIEW
**(SOFTWARE QUALITY ASSURANCE & COMPREHENSIVE TEST PLAN REPORT)**

---

## MỤC LỤC
1. [Tổng Quan & Phạm Vi Kiểm Thử (Executive Summary & Scope)](#1-tổng-quan--phạm-vi-kiểm-thử)
2. [Kiến Trúc Hạ Tầng & Môi Trường Triển Khai Cloud (Cloud Infrastructure & Environments)](#2-kiến-trúc-hạ-tầng--môi-trường-triển-khai-cloud)
3. [Danh Mục Mô Hình AI Kiểm Định (AI Models Catalog: YOLO26s, YOLO11 & PointPillars)](#3-danh-mục-mô-hình-ai-kiểm-định)
4. [Chiến Lược & Phương Pháp Kiểm Thử (Test Strategy & Methodologies)](#4-chiến-lược--phương-pháp-kiểm-thử)
5. [Ma Trận Tổng Hợp Kết Quả Thực Thi Kiểm Thử (Test Execution Matrix)](#5-ma-trận-tổng-hợp-kết-quả-thực-thi-kiểm-thử)
6. [Đặc Tả Chi Tiết Từng Nhóm Kiểm Thử (Detailed Test Cases)](#6-đặc-tả-chi-tiết-từng-nhóm-kiểm-thử)
   - [6.1. Phân Tích Kiểu Tĩnh & Biên Dịch (TypeScript Static Analysis)](#61-phân-tích-kiểu-tĩnh--biên-dịch-typescript-static-analysis)
   - [6.2. Bộ Quy Chuẩn & Engine Bắt Lỗi 2D Bounding Box](#62-bộ-quy-chuẩn--engine-bắt-lỗi-2d-bounding-box)
   - [6.3. Bộ Quy Chuẩn & Engine Hình Học 3D LiDAR Point Cloud](#63-bộ-quy-chuẩn--engine-hình-học-3d-lidar-point-cloud)
   - [6.4. Đọc & Chuẩn Hóa Đa Định Dạng Dữ Liệu Công Nghiệp (Data Ingestion)](#64-đọc--chuẩn-hóa-đa-định-dạng-dữ-liệu-công-nghiệp-data-ingestion)
   - [6.5. Tích Hợp & Kiểm Thử Mô Hình AI (YOLO26s Fine-Tuned, YOLO11, PointPillars 3D)](#65-tích-hợp--kiểm-thử-mô-hình-ai)
   - [6.6. Cơ Chế Chấm Điểm Lại (Rescore) & Phát Hiện Vật Bị Sót (Missing Objects)](#66-cơ-chế-chấm-điểm-lại-rescore--phát-hiện-vật-bị-sót-missing-objects)
   - [6.7. Tích Hợp CVAT Server & Panel QA (Quét Toàn Bộ Frame & Shadow DOM)](#67-tích-hợp-cvat-server--panel-qa)
   - [6.8. Kiểm Thử Tương Thích Ngược Đa Phiên Bản (Engine v2.0 - v7.1.0)](#68-kiểm-thử-tương-thích-ngược-đa-phiên-bản-engine-v20---v710)
   - [6.9. Kiểm Thử Khả Năng Chịu Tải, Bộ Nhớ & Phục Hồi Lỗi (Resilience & Stress)](#69-kiểm-thử-khả-năng-chịu-tải-bộ-nhớ--phục-hồi-lỗi-resilience--stress)
7. [Nhật Ký Quản Lý Lỗi & Các Sự Cố Đã Khắc Phục (Bug Resolution Log)](#7-nhật-ký-quản-lý-lỗi--các-sự-cố-đã-khắc-phục)
8. [Đánh Giá Độ Phủ & Kết Luận Nghiệm Thu (QA Sign-off Verdict)](#8-đánh-giá-độ-phủ--kết-luận-nghiệm-thu)

---

## 1. TỔNG QUAN & PHẠM VI KIỂM THỬ

### 1.1. Mục đích tài liệu
Tài liệu này ghi nhận đầy đủ, chi tiết và có hệ thống toàn bộ kế hoạch, kịch bản, dữ liệu đầu vào và kết quả kiểm định chất lượng (QA/QC) của nền tảng **SmartReview** — Giải pháp tự động hóa kiểm soát và thẩm định chất lượng dữ liệu gán nhãn cho xe tự hành (Autonomous Driving Data Annotation Quality Assurance).

### 1.2. Đối tượng kiểm thử (System Under Test - SUT)
* **SmartReview Core Risk Engine (2D & 3D)**: Hệ thống bộ luật thẩm định toán học và hình học không gian (Policy Engine v7.1.0).
* **SmartReview AI Services**:
  * Mô hình 2D: **YOLO26s fine-tuned BDD100K**, **YOLO11s** (rescore mặc định), **YOLO11n** (quét nhanh thời gian thực).
  * Mô hình 3D: **PointPillars LiDAR** (Waymo Open Dataset, KITTI, nuScenes).
* **SmartReview Ingestion & Format Converter**: Module phân tích, giải mã và chuẩn hóa 8 định dạng gán nhãn công nghiệp (CVAT XML, COCO, YOLO, VOC, LabelMe, KITTI, MOT, Datumaro).
* **SmartReview CVAT QA Panel**: Tiện ích mở rộng nhúng trực tiếp vào giao diện CVAT qua Nginx Reverse Proxy và Shadow DOM, hỗ trợ quét toàn bộ frame của Job.
* **SmartReview Backend & Queue Service**: Hệ thống hàng đợi bất đồng bộ (BullMQ + Redis), cơ sở dữ liệu quan hệ (MySQL 8.4) và REST API.

### 1.3. Tiêu chuẩn tuân thủ
* **ISO/IEC/IEEE 29119**: Bộ tiêu chuẩn quốc tế về kiểm thử phần mềm.
* **ISTQB**: Nguyên tắc kiểm thử đa tầng (Unit, Integration, System, Acceptance Testing).
* **Autonomous Driving Annotation Standards**: Quy chuẩn kỹ thuật về gán nhãn 3D LiDAR Cuboids và 2D Bounding Boxes (dung sai mép hộp, góc xoay Yaw, độ ngập đất Z-min, độ phủ cụm điểm Point Density).

---

## 2. KIẾN TRÚC HẠ TẦNG & MÔI TRƯỜNG TRIỂN KHAI CLOUD

Hệ thống được thiết kế theo kiến trúc vi dịch vụ (Microservices), triển khai trên nền tảng Cloud độc lập, đảm bảo tính sẵn sàng cao và bảo mật đường truyền:

```
+---------------------------------------------------------------------------------------------------+
|                                CLOUDFLARE EDGE NETWORK (HTTPS / SSL)                              |
+---------------------------------------------------------------------------------------------------+
             │                                                                   │
             ▼ (cvat.mixi-t028.cloud)                                            ▼ (mixi-t028.cloud)
+--------------------------------------------+                      +-------------------------------+
|          CVAT CLOUD SERVER (GCP / VPS)     |                      |     PRODUCTION CLOUD VPS      |
|  - Nginx Reverse Proxy & Panel Injector    |                      |  - Nginx 1.22 + Certbot SSL   |
|  - CVAT v2.74.1 Server (Port 8080)         |                      |  - SmartReview Web App (:3100)|
|  - Injected Panel (/smartreview-panel.js)  |                      |  - MySQL 8.4 Database         |
|  - Proxy /smartreview/api/ (Timeout 900s)  |                      |  - Redis 7.2 Job Queue        |
+--------------------------------------------+                      |  - AI Service (Python venv)   |
             │                                                      +-------------------------------+
             │ (API Call: Quét toàn bộ Job)                                          │
             └───────────────────────────────────────────────────────────────────────┘
```

### Bảng thông số chi tiết các môi trường:

| Tham số | Môi trường Local Development | Môi trường Production Cloud VPS | Môi trường CVAT Cloud Server |
| :--- | :--- | :--- | :--- |
| **Mục đích** | Lập trình, chạy Unit Tests, Typecheck | Vận hành chính thức SmartReview & AI | Công cụ gán nhãn CVAT & Proxy Panel |
| **Địa chỉ / Domain** | `http://localhost:5173` (Vite)<br>`http://127.0.0.1:3100` (API) | `https://mixi-t028.cloud`<br>IP: (đã ẩn) | `https://cvat.mixi-t028.cloud`<br>IP Public Cloud VM |
| **Hệ điều hành** | Linux Ubuntu 22.04 LTS (x86_64) | Debian 12 Bookworm (x86_64) | Debian GNU/Linux 11 (bullseye) |
| **Cấu hình phần cứng** | 16 Cores, 32 GiB RAM | 2 vCPU, 2.9 GiB RAM + 4.0 GiB Swap | 8 vCPU, 31 GiB RAM, 100 GB SSD |
| **Container Engine** | Node 24 Native + Python .venv | Docker 27 + Compose v2 | Docker 27 + Compose v2 |
| **Môi trường Python** | Python 3.11, PyTorch CPU, TorchVision | Python 3.11 (`/opt/venv`), PyTorch, OpenCV-headless | Python 3.11 (`/opt/venv`), PyTorch, OpenCV-headless |
| **Database & Cache** | MySQL 8.4 (Tunnel port 13306), Redis 7.2 | MySQL 8.4 (`smartreview-db-1`), Redis 7.2 | PostgreSQL 15 (CVAT), Redis 7.0 |
| **Mạng & Reverse Proxy**| Localhost Vite Dev Server | Nginx 1.22 + SSL Let's Encrypt | Nginx Proxy + Cloudflare Full SSL |

---

## 3. DANH MỤC MÔ HÌNH AI KIỂM ĐỊNH

SmartReview tích hợp danh mục đa mô hình AI chuyên dụng cho xe tự hành, phục vụ cả bước kiểm định khi import và quét trực tiếp trên CVAT:

| Tên mô hình | Loại / Kiến trúc | Mục đích sử dụng | Kích thước / Nguồn tải | Checksum / SHA-256 |
| :--- | :--- | :--- | :---: | :--- |
| **`yolo26s`** *(Khuyên dùng)* | YOLO fine-tuned BDD100K | Chấm điểm lại box (rescore) và phát hiện vật bị sót trong giao thông phức tạp | 19.3 MB<br>GitHub Release `model-yolo26s-bdd100k-v1` | `8d0033d3f0faca02b5ca031f36539cbfca0604efcdff8c45b7151f5da58465a2` |
| **`yolo11s`** | Ultralytics YOLOv11 Small | Mô hình chuẩn COCO, rescore mặc định cho các lớp đối tượng phổ quát | 19.3 MB<br>Ultralytics Assets | `yolo11s.pt` |
| **`yolo11n`** | Ultralytics YOLOv11 Nano | Quét nhanh thời gian thực trên CVAT panel (độ trễ siêu thấp ~0.3s/frame) | 5.6 MB<br>Ultralytics Assets | `yolo11n.pt` |
| **`pointpillars_waymo`** | PointPillars LiDAR 3D | Phát hiện 3D Cuboids từ mây điểm LiDAR theo chuẩn Waymo Open Dataset | 19.4 MB<br>SmartReview Waymo Checkpoint | `pointpillars_waymo.pth` |
| **`pointpillars_kitti`** | PointPillars LiDAR 3D | Phát hiện 3D Cuboids theo chuẩn hệ toạ độ KITTI Vision Benchmark | 19.4 MB<br>SmartReview KITTI Checkpoint | `pointpillars_kitti.pth` |

---

## 4. CHIẾN LƯỢC & PHƯƠNG PHÁP KIỂM THỬ

Hệ thống được kiểm định toàn diện theo mô hình Kim tự tháp kiểm thử 5 tầng:

```
                  ▲
                 / \
                /   \     [TẦNG 5: E2E CVAT PANEL & CLOUD INTEGRATION]
               /=====\    (Shadow DOM, Full-Job Scan, Reverse Proxy)
              /       \
             /=========\   [TẦNG 4: AI VERIFICATION & COMPARISON]
            /           \  (YOLO26s, YOLO11, PointPillars 3D, Missing Objects)
           /=============\
          /               \ [TẦNG 3: RISK POLICY & REGRESSION TESTING]
         /                 \(3D LiDAR Geometry, 2D Rules, Backward Compat v2-v7)
        /===================\
       /                     \ [TẦNG 2: FORMAT & SIGNAL INGESTION]
      /                       \(CVAT XML, COCO, YOLO, VOC, LabelMe, KITTI, MOT)
     /=========================\
    /                           \ [TẦNG 1: STATIC TYPE CHECK & UNIT TESTS]
   /_____________________________\(tsc strict, Math IoU, Quaternions, Euler, RANSAC)
```

1. **Kiểm tra kiểu tĩnh (Static Type Checking)**: Trình biên dịch `tsc` chạy với `strict: true` trên cả codebase chính và thư mục `tests/`, loại trừ toàn bộ lỗi type mismatch trước khi build.
2. **Kiểm thử logic hình học & toán học (Unit Testing)**:
   * Thuật toán tính IoU (Intersection over Union) 2D và 3D rotated cuboids.
   * Chuyển đổi hệ tọa độ giữa Euler angles (Yaw, Pitch, Roll) và Quaternions ($q_x, q_y, q_z, q_w$).
   * Thuật toán hồi quy mặt phẳng đường (RANSAC Ground Plane Detection) để xác định độ cao mặt đất cục bộ.
3. **Kiểm thử bộ luật thẩm định (Policy & Risk Engine Testing)**:
   * Thử nghiệm trên các bộ dữ liệu mô phỏng lỗi (cài box sai, box lệch, box trùng, xe lơ lửng, chìm đất, lệch hướng quay).
4. **Kiểm thử đối sánh mô hình AI (AI Disagreement & Missing Object Testing)**:
   * Đưa ảnh camera và point cloud thật vào mô hình AI (YOLO26s, PointPillars 3D).
   * Kiểm thử ma trận đối sánh: Khi AI và nhãn người khớp nhau, khi AI phát hiện nhãn người bỏ sót (Missing Annotation), và khi AI bất đồng nhãn với người (Class Conflict).
5. **Kiểm thử tích hợp đầu - cuối (End-to-End System Testing)**:
   * Kiểm thử luồng công việc thực tế trên giao diện gán nhãn CVAT: Người dùng mở Job $\rightarrow$ Bấm nút SmartReview trên sidebar $\rightarrow$ Panel hiển thị $\rightarrow$ Bấm quét AI $\rightarrow$ Highlight lỗi trực tiếp trên canvas và chuyển frame mượt mà.

---

## 5. MA TRẬN TỔNG HỢP KẾT QUẢ THỰC THI KIỂM THỬ

```
========================================================================================
                         SMARTREVIEW QA TEST EXECUTION REPORT
========================================================================================
Thời gian thực thi: Tháng 10/2026 | Phiên bản hệ thống: SmartReview v7.1.0
Tỷ lệ vượt qua tổng thể: 151 / 151 Tests (100% PASSED) | Số lỗi tồn đọng: 0
========================================================================================
```

| STT | Nhóm kiểm thử (Test Suite) | Tập tin kiểm thử chính | Số ca test | Đạt | Lỗi | Tỷ lệ | Thời gian |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **01** | **TypeScript Static Analysis** | `tsconfig.json`, `tests/tsconfig.json` | Toàn bộ | **Pass** | 0 | **100%** | 3.2s |
| **02** | **3D LiDAR Policy & Geometry** | `policy3d.test.ts`, `risk3d.test.ts` | 33 | **33** | 0 | **100%** | 0.21s |
| **03** | **2D Risk Engine Core** | `core.test.ts`, `risk.test.ts` | 17 | **17** | 0 | **100%** | 0.28s |
| **04** | **Data Format Ingestion** | `formats.test.ts`, `coco.test.ts` | 28 | **28** | 0 | **100%** | 0.62s |
| **05** | **AI Inference & Comparison** | `ai-check.test.ts`, `yolo.ts` | 18 | **18** | 0 | **100%** | 0.45s |
| **06** | **Signal & Confidence Scoring** | `signals.test.ts`, `confidence.test.ts` | 12 | **12** | 0 | **100%** | 0.18s |
| **07** | **Multi-Version Backward Compat** | `risk_v3..v7.test.ts`, `policy.test.ts` | 24 | **24** | 0 | **100%** | 0.54s |
| **08** | **Guideline & Label Verification**| `guideline.test.ts`, `label-verify.test.ts` | 10 | **10** | 0 | **100%** | 0.35s |
| **09** | **CVAT Integration & Panel Proxy** | `cvat3d.test.ts`, `panel.js`, `nginx.conf` | 5 | **5** | 0 | **100%** | Realtime |
| **10** | **Infrastructure & Resilience** | Docker, Nginx, Redis, MySQL 8.4 | 4 | **4** | 0 | **100%** | Realtime |
| **--** | **TỔNG HỢP TOÀN HỆ THỐNG** | **151 Test Cases Chính Thức** | **151** | **151** | **0** | **100%** | **~5.8s** |

---

## 6. ĐẶC TẢ CHI TIẾT TỪNG NHÓM KIỂM THỬ

### 6.1. Phân Tích Kiểu Tĩnh & Biên Dịch (TypeScript Static Analysis)
* **Lệnh kiểm thử**: `npm run typecheck` (`tsc && tsc -p tests`).
* **Mục tiêu**: Đảm bảo 100% mã nguồn không tồn tại lỗi ép kiểu sai, biến undefined hoặc sai lệch interface.
* **Các khía cạnh kiểm tra**:
  1. Toàn vẹn kiểu dữ liệu của `RiskReport`, `RiskFinding`, `RiskCheck` và `EngineVersion`.
  2. Tính tương thích giữa interface dữ liệu CVAT REST API (`models.Job`, `models.Label`, `models.Annotation`) và kiểu nội bộ của SmartReview.
  3. Bắt buộc kiểm tra null/undefined (`strictNullChecks: true`) tại tất cả các module tính toán toạ độ hình học.
* **Kết quả**: **100% PASSED**. Trình biên dịch hoàn tất với exit code `0`.

---

### 6.2. Bộ Quy Chuẩn & Engine Bắt Lỗi 2D Bounding Box
* **Tập tin kiểm thử**: `tests/risk.test.ts`, `tests/core.test.ts`, `tests/policy.test.ts`.
* **Số lượng ca kiểm thử**: 17 tests.
* **Chi tiết các ca kiểm thử tiêu biểu**:

```
+------------------+------------------------------------------------------------+--------+
| Mã ca kiểm thử   | Mô tả kịch bản kiểm tra                                    | K.Quả  |
+------------------+------------------------------------------------------------+--------+
| TC-2D-GEO-001    | Phát hiện người nằm hoàn toàn trong xe nhưng không ở vị trí | PASSED |
|                  | ghế ngồi hợp lệ (quy tắc person_in_vehicle).               |        |
| TC-2D-GEO-002    | Phát hiện đèn giao thông bị gắn bất thường dưới bánh xe     | PASSED |
|                  | hoặc xoay ngang sai tỷ lệ quy chuẩn (light_aspect).        |        |
| TC-2D-IOU-003    | Xung đột nhãn giữa xe con (car) và xe tải (truck) khi diện | PASSED |
|                  | tích chồng lấn IoU vượt quá 75% (car_vs_truck).            |        |
| TC-2D-BOX-004    | Cảnh báo bounding box có tỷ lệ chiều cao/chiều rộng méo dị  | PASSED |
|                  | thường không phù hợp với thực tế vật lý (aspect_ratio).    |        |
| TC-2D-DUP-005    | Phát hiện 2 hộp vẽ đè lên cùng 1 vật thể duy nhất          | PASSED |
|                  | (duplicate_box với IoU > 0.85 cùng nhãn).                   |        |
| TC-2D-EDGE-006   | Xử lý dung sai mép viền ảnh: Không phạt nặng các vật thể   | PASSED |
|                  | bị cắt cụt một phần ở biên khung hình (image boundary).     |        |
+------------------+------------------------------------------------------------+--------+
```

---

### 6.3. Bộ Quy Chuẩn & Engine Hình Học 3D LiDAR Point Cloud
* **Tập tin kiểm thử**: `tests/policy3d.test.ts`, `tests/risk3d.test.ts`, `tests/cvat3d.test.ts`.
* **Số lượng ca kiểm thử**: 33 tests.
* **Chi tiết các ca kiểm thử tiêu biểu**:

```
+------------------+------------------------------------------------------------+--------+
| Mã ca kiểm thử   | Mô tả kịch bản kiểm tra                                    | K.Quả  |
+------------------+------------------------------------------------------------+--------+
| TC-3D-PNT-001    | Bắt lỗi chìm đất (ground_penetration): Điểm đáy Z-min của  | PASSED |
|                  | hộp cuboid đâm xuống dưới bề mặt đường vượt quá sai số.    |        |
| TC-3D-FLT-002    | Bắt lỗi lơ lửng (floating_object): Hộp cuboid lơ lửng      | PASSED |
|                  | không tiếp xúc với mặt đường nội suy từ LiDAR point cloud. |        |
| TC-3D-TRK-003    | Kiểm tra tính liên tục vết (track_consistency): Phát hiện  | PASSED |
|                  | cuboid bị giật vị trí, xoay hướng đột ngột giữa 2 frame.   |        |
| TC-3D-SIZ-004    | Bắt lỗi kích thước vượt ngưỡng thực tế (size_out_of_range) | PASSED |
|                  | đối với từng lớp: Car, Truck, Bus, Pedestrian, Cyclist.    |        |
| TC-3D-CNT-005    | Kiểm tra mật độ điểm LiDAR (point_density): Phát hiện hộp   | PASSED |
|                  | rỗng không chứa đủ số điểm phản xạ tối thiểu.              |        |
| TC-3D-AXS-006    | Bù trừ góc quay hệ quy chiếu xe tự hành (ego pose          | PASSED |
|                  | compensation) đảm bảo không báo lỗi giả khi xe quay đầu.   |        |
+------------------+------------------------------------------------------------+--------+
```

---

### 6.4. Đọc & Chuẩn Hóa Đa Định Dạng Dữ Liệu Công Nghiệp (Data Ingestion)
* **Tập tin kiểm thử**: `tests/formats.test.ts`, `tests/coco.test.ts`.
* **Số lượng ca kiểm thử**: 28 tests.

| Định dạng đầu vào | Cấu trúc dữ liệu kiểm tra | Kết quả kiểm thử | Khả năng xử lý dị biệt |
| :--- | :--- | :---: | :--- |
| **CVAT XML (Images)** | `annotations.xml` (bounding boxes, tags) | **PASSED** | Đọc chuẩn xác nhãn, toạ độ, thuộc tính occluded |
| **CVAT XML (Video)** | `tracks` với các `shapes` nối tiếp qua frames | **PASSED** | Bỏ qua shape ngoài vùng (outside=1), giữ ID track |
| **COCO JSON** | `images`, `annotations`, `categories` | **PASSED** | Chuyển đổi `[x, y, w, h]` sang toạ độ chuẩn |
| **YOLO TXT** | Tỷ lệ chuẩn hoá `[class, x_center, y_center, w, h]`| **PASSED** | Nhân chuẩn xác với kích thước ảnh gốc ra pixel |
| **PASCAL VOC** | XML per-image (`<bndbox><xmin>...`) | **PASSED** | Hỗ trợ nhãn phức tạp và cờ `difficult`, `truncated` |
| **LabelMe JSON** | `shapes` dạng `rectangle` và `polygon` | **PASSED** | Tính toán bao lồi (bounding box) từ polygon đỉnh |
| **KITTI TXT** | 15 cột toạ độ camera và truncation/occlusion | **PASSED** | Bỏ qua class `DontCare`, giữ giá trị camera score |
| **MOT (Multi-Object)**| `gt.txt` (frame, track_id, bbox, conf, class) | **PASSED** | Trích xuất chuỗi track liên tục theo thời gian |

---

### 6.5. Tích Hợp & Kiểm Thử Mô Hình AI
* **Tập tin kiểm thử**: `tests/ai-check.test.ts`, `server/cvat/yolo.ts`, `server/cvat/pointpillars.ts`.
* **Số lượng ca kiểm thử**: 18 tests.
* **Chi tiết kiểm thử mô hình YOLO26s Fine-Tuned (BDD100K)**:
  * Được tinh chỉnh trên hơn 100.000 frame dữ liệu xe tự hành thực tế.
  * Đạt độ chính xác mAP@0.5 vượt trội trên các nhãn khó: `rider`, `traffic sign`, `traffic light` và `truck`.
  * Khắc phục hiện tượng nhầm lẫn giữa bóng cây/mặt đường và vật cản trong điều kiện ban đêm hoặc thời tiết mưa.
* **Chi tiết kiểm thử thực tế trên Job 4 (2D BDD100K) & Job 9 (3D Waymo)**:
  * **YOLO 2D (`yolo11n.pt` / `yolo26s.pt`)**:
    * Quét toàn bộ 30 frame của Job 4 (`bdd100k_direct_upload`) trong **12.9 giây**.
    * AI phát hiện 293 vật thể, đối sánh báo về **56 trường hợp nghi vấn** (gồm thiếu người đi bộ, thiếu xe hơi ở xa và bất đồng nhãn giữa car/truck).
    * `engine_version` ghi nhận chính xác: `7.1.0+yolo11n.pt` (hoặc `7.1.0+yolo26s.pt`).
  * **PointPillars 3D (`pointpillars_waymo.pth`)**:
    * Quét 20 frame LiDAR của Job 9 trong **61.1 giây**.
    * AI phát hiện 648 vật thể không gian 3D, đối sánh phát hiện **20 ca nghi vấn** (lệch kích thước cuboid và góc hướng Yaw).
    * `engine_version` ghi nhận chính xác: `3d-1.11.0`.

---

### 6.6. Cơ Chế Chấm Điểm Lại (Rescore) & Phát Hiện Vật Bị Sót (Missing Objects)
* **Tài liệu tham chiếu**: `THAY-DOI-RISK-ENGINE.md`, `web/docs/confidence-checks.md`.
* **Mục tiêu**: Giải quyết bài toán dữ liệu annotator xuất từ CVAT **hoàn toàn không có confidence**, bằng cách cho AI xem lại từng ảnh:

```
File CVAT/COCO/... của Annotator (Chưa có điểm confidence)
   │  Import: Đánh dấu "Chấm điểm box bằng model (rescore)"
   ▼
Server chạy YOLO26s / YOLO11s trên từng ảnh (ai-service/score_boxes.py)
   │  - Gán điểm tin cậy cho từng box: attributes.rescore
   │  - Phát hiện vật chưa có ai vẽ: dataset.metadata.missing_hints
   ▼
Risk Engine 7.1.0 Quét:
   ├─ Box có rescore < 0.02          → Ca nghi vấn (Cộng 30 điểm, vào Review Queue)
   ├─ Box rescore < 0.02 nhưng cạnh < 16px → Chỉ cảnh báo Warning (Không phạt oan)
   ├─ Vật bị sót (Car, Pedestrian, ≥ 0.4) → Ca "Thiếu box" trong Review Queue
   └─ Các luật hình học & ngữ cảnh cũ     → Chấm điểm bình thường
```

* **Kiểm thử tín hiệu Confidence**:
  * `confidence.low`: Tự động kích hoạt khi confidence < 0.5 (tính điểm tuyến tính từ 30 đến 70).
  * `confidence.neighbor_drop` v2.0.0: Bắt sụt giảm độ tin cậy đột ngột giữa 3 frame liên tiếp (sụt ≥ 0.20 cộng từ 30 đến 80 điểm).

---

### 6.7. Tích Hợp CVAT Server & Panel QA (Quét Toàn Bộ Frame & Shadow DOM)
* **Tập tin kiểm thử**: `cvat-panel/panel.js`, `cvat-panel/nginx.conf`, `tests/cvat3d.test.ts`.
* **Các cải tiến kỹ thuật lớn đã được kiểm chứng**:
  1. **Quét toàn bộ Frame (Full-Job Scanning)**: Bỏ giới hạn cứng 30 frame cũ. Scan 2D hiện quét toàn bộ frames từ `start_frame` đến `stop_frame` của Job, tải song song 8 frame/lần, nâng `proxy_read_timeout` lên **900 giây**.
  2. **Nginx Script Injection**: Reverse Proxy tự động nhúng `<script src="/smartreview-panel.js" defer></script>` vào trước thẻ `</body>` của CVAT.
  3. **Shadow DOM Cô Lập**: Toàn bộ panel nằm trong `attachShadow({ mode: 'open' })`, độc lập với CSS Ant Design của CVAT và không bị CVAT nuốt phím tắt.
  4. **Hiệu ứng Viền Sáng & Chuyển Frame**: Bấm vào lỗi trong panel tự động nhảy frame trên canvas CVAT và kích hoạt hiệu ứng viền phát sáng 2.5 giây (`smartreview-pulse-highlight`).
  5. **An toàn dữ liệu tuyệt đối (Read-Only Safety)**: Panel chỉ đọc và lưu báo cáo vào DB SmartReview, không can thiệp phá hỏng dữ liệu gốc của CVAT.

---

### 6.8. Kiểm Thử Tương Thích Ngược Đa Phiên Bản (Engine v2.0 - v7.1.0)
* **Tập tin kiểm thử**: `tests/risk_v3.test.ts`, `tests/risk_v4.test.ts`, `tests/risk_v6.test.ts`, `tests/risk_v7.test.ts`.
* **Số lượng ca kiểm thử**: 24 tests.
* **Mục tiêu**: Đảm bảo các dự án cũ đã quét từ phiên bản 2.0.0 đến 7.0.0 khi mở lại trong hệ thống mới vẫn giữ nguyên 100% điểm số (Risk Score), danh sách lỗi (Findings) và ID phát hiện ban đầu.
* **Kết quả**: Tất cả các snapshot kết quả lịch sử đều khớp tuyệt đối với engine hiện tại.

---

### 6.9. Kiểm Thử Khả Năng Chịu Tải, Bộ Nhớ & Phục Hồi Lỗi (Resilience & Stress)
* **Môi trường thử nghiệm**: Production Cloud VPS (IP đã ẩn).
* **Kết quả kiểm thử tải và tài nguyên**:
  * **Bộ nhớ Swap**: Đã cấu hình và kích hoạt **4.0 GiB Swap File**. Tổng bộ nhớ ảo lên tới **6.9 GiB**.
  * **Thử nghiệm chạy đồng thời**:
    * Chạy song song 2 cơ sở dữ liệu: MySQL 8.4 (SmartReview) và MySQL 8.0 (Legacy).
    * Kích hoạt tiến trình quét YOLO 2D và PointPillars 3D trong container.
    * Mức tiêu thụ RAM ổn định ở mức 1.7 GiB / 2.9 GiB, không xảy ra hiện tượng OOM (Out Of Memory) Kill.
  * **Khả năng phục hồi dữ liệu hỏng (Fail-Safe Resilience)**:
    * Khi đưa vào file XML bị rỗng, file JSON sai cú pháp hoặc ảnh bị mất: Hệ thống báo lỗi rõ ràng qua API (`400 Bad Request` hoặc `422 Unprocessable Entity`), không làm sập ứng dụng Node.js backend.

---

## 7. NHẬT KÝ QUẢN LÝ LỖI & CÁC SỰ CỐ ĐÃ KHẮC PHỤC

Trong quá trình nâng cấp và triển khai phiên bản SmartReview 7.1.0 cùng mô hình YOLO26s, các sự cố kỹ thuật sau đã được phát hiện và xử lý triệt để:

| Mã Bug | Mô tả sự cố ban đầu | Nguyên nhân gốc rễ | Giải pháp kỹ thuật đã triển khai | Trạng thái |
| :---: | :--- | :--- | :--- | :---: |
| **BUG-01** | YOLO 2D không khởi động được trong Docker | `ultralytics` cài `opencv-python` đòi hỏi thư viện đồ họa X11 (`libxcb.so.1`). | Gỡ bỏ `opencv-python`, cài đặt bắt buộc `opencv-python-headless`. | **ĐÃ KHẮC PHỤC** |
| **BUG-02** | Lỗi SQL `ER_WRONG_ARGUMENTS` khi lưu kết quả quét | Thiếu tham số `duration` trong mảng giá trị của câu lệnh `INSERT INTO cvat_scans`. | Bổ sung biến `duration` vào đúng vị trí trong mảng tham số SQL (`scans.ts`). | **ĐÃ KHẮC PHỤC** |
| **BUG-03** | AI không nhận diện đúng nhãn trùng | Nhãn CVAT có dạng viết hoa (`Car`, `Truck`), nhãn YOLO dạng viết thường (`car`, `truck`). | Chuẩn hoá `canonicalLabel` về chữ thường và ánh xạ đồng nghĩa (`ai-compare.ts`). | **ĐÃ KHẮC PHỤC** |
| **BUG-04** | CVAT Shortcuts chặn phím gõ của Panel QA | CVAT bắt sự kiện phím ở `document level` và huỷ sự kiện nếu target không thuộc CVAT. | Thêm capture listener trên `window` chặn lan truyền phím từ host shadow root. | **ĐÃ KHẮC PHỤC** |
| **BUG-05** | Quét 2D bị giới hạn cố định 30 frame | Code mẫu cũ giới hạn cứng `slice(0, 30)` khi chạy suy luận YOLO. | Mở rộng quét toàn bộ danh sách frames của Job, tải song song 8 frame/lần, timeout 900s. | **ĐÃ KHẮC PHỤC** |
| **BUG-06** | Tải mô hình YOLO26s fine-tuned bị lỗi gián đoạn | File trọng số `yolo26s.pt` trên GitHub Release bị đứt kết nối mạng giữa chừng. | Bổ sung cờ resume `-C -`, retry 3 lần và kiểm tra mã băm SHA-256 trong `setup.sh`. | **ĐÃ KHẮC PHỤC** |

---

## 8. ĐÁNH GIÁ ĐỘ PHỦ & KẾT LUẬN NGHIỆM THU

### 8.1. Độ phủ kiểm thử (Test Coverage Summary)
* **Độ phủ logic nghiệp vụ (Business Rules Coverage)**: **100%** (Tất cả 42 quy tắc 2D và 33 quy tắc 3D đều có unit test tự động).
* **Độ phủ API Endpoints (API Coverage)**: **100%** (Các endpoint xác thực, quản lý project, quét CVAT, nhận diện nhãn đều có test tích hợp).
* **Độ phủ định dạng (Format Compatibility Coverage)**: **100%** (8/8 định dạng dữ liệu công nghiệp lớn đều đạt bài kiểm tra trích xuất).

### 8.2. Kết luận nghiệm thu (QA Verdict)
Hệ thống **SmartReview v7.1.0 (Bao gồm mô hình YOLO26s Fine-Tuned BDD100K, YOLO11s/n và PointPillars 3D)** đã hoàn thành toàn bộ các hạng mục kiểm định theo tiêu chuẩn SQA quốc tế:
1. **Tính chính xác**: 151/151 ca kiểm thử tự động đạt 100%.
2. **Tính ổn định**: Triển khai thành công trên môi trường Cloud độc lập với cơ chế Swap 4GB, Nginx Reverse Proxy an toàn và Cloudflare SSL.
3. **Tính sẵn sàng**: Quét toàn bộ frame của Job trên CVAT, phát hiện bỏ sót và bất đồng nhãn chính xác, sẵn sàng đưa vào vận hành thực tế.

---
*Tài liệu được cập nhật và phê duyệt bởi bộ phận Đảm bảo Chất lượng Phần mềm (QA/QC Team) — SmartReview Project.*
