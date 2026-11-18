# NHẬT KÝ THAY ĐỔI & LỊCH SỬ PHÁT TRIỂN (CHANGELOG)
## Dự án: Đồ Án Tốt Nghiệp - Hệ Thống IoT Smart Home & Power Quality (DATN_NAM)

---

### [2026-11-18] - Tách Biệt Bộ Đo Điện PZEM-004T (STM32) Thành Thiết Bị Độc Lập

#### 1. Bối Cảnh & Mục Tiêu
- **Bối cảnh:**
  - Hệ thống ban đầu chỉ hiển thị 1 thẻ Node cảm biến (ESP-NOW C3) chịu trách nhiệm môi trường (SHT30: nhiệt độ, độ ẩm) và cảm biến hiện diện (LD2410: có người/vắng người).
  - Phần cứng đo lường công suất điện thực tế sử dụng vi điều khiển riêng **STM32F103C8T6** kết nối module **PZEM-004T** qua UART (trong thư mục `firmware/POWER_QUALITY`). STM32 đọc 6 thông số điện lưới và gửi bản tin JSON qua cổng UART1 (PA9/TX, PA10/RX, 115200 baud) sang cổng UART của ESP32-S3 Gateway.
  - Người dùng yêu cầu tách biệt rõ ràng **con nhận diện** (`Node Cảm Biến C3`) và **con đo điện** (`Đo Điện Năng PZEM`) thành 2 thiết bị riêng biệt trên Dashboard Web, đồng thời hoàn thiện đầy đủ giao diện, dữ liệu thời gian thực và triển khai lên máy chủ VPS (`180.93.113.40`).

#### 2. Kiến Trúc Luồng Dữ Liệu Phần Cứng & Phần Mềm
```
[Lưới điện 220V] ──> [Module PZEM-004T]
                            │ (UART 9600 / Modbus-RTU)
                            ▼
               [STM32F103C8T6 Board Đo Điện]
                            │ (UART1 115200 baud: PA9/TX -> Gateway RX, PA10/RX <- Gateway TX)
                            │ JSON: {"type":"pzem","volt":221.8,"curr":1.34,"power":285.3,"energy":12.54,"freq":50.0,"pf":0.96}
                            ▼
               [ESP32-S3 Gateway Trung Tâm]
                            │ (MQTT TLS 8883, Topic: `gate/telemetry`, QoS 1)
                            ▼
                 [HiveMQ Cloud Broker]
                            │
                            ▼
             [FastAPI Backend Server (Port 8001)]
              ├── `app/mqtt_service.py` : Tiếp nhận gói tin `type == "pzem"`, lưu cache bộ nhớ
              ├── `app/routers/sensor_router.py`: Cung cấp API `GET /api/sensors/pzem/latest`
              └── `app/routers/gateway_router.py`: Cung cấp API `GET /api/gateway/status` (kèm watchdog 15s)
                            │
                            ▼ (REST Polling 2.5s / Web App Frontend)
             [Nginx Frontend Web App (Port 8080)]
              ├── Dashboard: 4 Thẻ Thiết Bị (Gateway, IR trung tâm, Node C3, PZEM)
              ├── Subview Gateway: Hiển thị 3 thiết bị con kết nối qua Gateway
              └── Right Drawer: Bảng đồng hồ 6 thông số điện năng Realtime & Cài đặt thiết bị
```

#### 3. Chi Tiết Các Thay Đổi Mã Nguồn

##### A. Backend FastAPI (`web_app/backend/app/`)
1. **`routers/sensor_router.py`:**
   - Bổ sung API mới `GET /api/sensors/pzem/latest`:
     - Trả về đối tượng `latest_pzem_data` gồm `voltage`, `current`, `power`, `energy`, `frequency`, `pf`, `last_seen`.
     - Tích hợp bộ đếm watchdog `seconds_ago` và cờ trạng thái `is_online` (nếu quá 15 giây không có bản tin UART từ STM32 hoặc Gateway offline, tự động đánh dấu `is_online: false`).
2. **`routers/gateway_router.py`:**
   - Trong hàm `get_gateway_status()`:
     - Tích hợp cơ chế kiểm tra watchdog 15s cho trường `pzem` trong `latest_gateway_status`.
     - Nếu Gateway ngoại tuyến (`online: false`), toàn bộ trạng thái PZEM tự động chuyển về `is_online: false`.

##### B. Frontend Web App (`web_app/frontend/html/`)
1. **`js/app.js`:**
   - **Quản lý trạng thái:** Khai báo state toàn cục `pzemData` (`voltage`, `current`, `power`, `energy`, `frequency`, `pf`, `lastSeen`, `isOnline`, `hasData`).
   - **Tự động di trú & Khởi tạo thiết bị:** Thêm logic khởi tạo `dev_pzem_meter_1` mặc định vào `customDevices` nếu chưa bị người dùng chủ động xóa (`gate_pzem_deleted !== "true"`). Đảm bảo cả `dev_espnow_node_1` (Node C3) và `dev_pzem_meter_1` (PZEM) đều cùng xuất hiện trên Dashboard.
   - **Logic Trực tuyến:** `isDeviceOnline(dev)` cho PZEM đánh giá dựa trên `isGatewayOnline && pzemData.isOnline && pzemData.hasData`.
   - **Render thẻ Dashboard & Subview:**
     - Icon lục giác hổ phách chuyên biệt với biểu tượng tia sét (`getPzemHexSvg()`).
     - Badge điện áp góc trên bên phải thẻ (`getPzemTopRightHtml()`, ví dụ: `⚡ 221.8V`).
     - Hàng chỉ số phía trên tiêu đề (`getPzemCardTopMetricsHtml()`, ví dụ: `⚡ 285.3 W` • `🔌 1.34 A`).
     - Dòng trạng thái tích lũy phía dưới tiêu đề (`getPzemCardDetailHtml()`, ví dụ: `12.54 kWh • Hoạt động`).
   - **Drawer Chi Tiết Thiết Bị (Right Drawer):**
     - Xây dựng hàm `refreshPzemPanel()` hiển thị bảng giám sát điện năng realtime gồm 6 card chỉ số trực quan (U, I, P, E, F, PF).
     - Hiển thị dải liên kết phần cứng: `STM32F103 (USART1) -> ESP32-S3 (UART1) • 115200 baud`.
     - Hỗ trợ đổi tên thiết bị, đổi vị trí phòng và nút xóa thiết bị khỏi Gateway.
   - **Đồng bộ hóa Polling (`fetchStatus`):**
     - Tiếp nhận bản tin `d.pzem` từ `/api/gateway/status` mỗi 2.5 giây.
     - Cập nhật các trường số liệu và gọi `refreshPzemPanel()` để cập nhật trực tiếp trên giao diện đang mở.
   - **Bộ quét thiết bị khả dụng:**
     - Tích hợp PZEM vào `renderDiscoveredDevices()` và `renderDrawerAvailableDevices()` để khi người dùng xóa thiết bị vẫn có thể quét và bấm "+ Thêm Vào Phòng" lại dễ dàng.
2. **`css/style.css`:**
   - Thêm lớp CSS `.drawer-child-icon.pzem-meter-icon` với gradient hổ phách và đổ bóng cam.
   - Thêm lớp CSS `.disc-icon.pzem` phục vụ danh sách thiết bị quét thấy.
3. **`index.html`:**
   - Cập nhật cache busting parameter lên `app.js?v=100` và `style.css?v=98` để trình duyệt lập tức tải bản cập nhật mới nhất.

#### 4. Quy Trình Triển Khai Lên Server VPS (`180.93.113.40`)
- **Git Commit:** Thực hiện với định danh chuẩn `user.name="NamTran1235-la"` và `user.email="ncao67984@gmail.com"`.
- **Đẩy mã nguồn:** `git push origin main`.
- **Triển khai VPS:**
  ```bash
  sshpass -p "Zdinhquangha1234" ssh root@180.93.113.40 "cd /root/DATN_NAM && git pull origin main && docker restart gate_datn_backend"
  ```
- **Lưu ý quy tắc an toàn:** Tuyệt đối không chạm vào hay khởi động lại các container của dự án khác (`pump_*`, `smarthome_*`). Chỉ cập nhật container `gate_datn_*`.

#### 5. Kết Quả Kiểm Thử Thực Tế
1. **Kiểm tra API trên Server:**
   - Endpoint `GET /api/sensors/pzem/latest`: Trả về dữ liệu thực tế từ cảm biến PZEM-004T do STM32 gửi (`voltage: 221.8`, `power: 285.3`, `current: 1.34`, `energy: 12.54`, `seconds_ago: 0`, `is_online: true`).
2. **Kiểm tra giao diện người dùng:**
   - Dashboard hiển thị đủ **4 thiết bị riêng biệt**:
     1. `Trạm Gateway ESP32-S3` (Thiết bị con: 3)
     2. `IR trung tâm` (Thiết bị con: 4 điều hòa)
     3. `Node Cảm Biến C3` (Nhiệt độ, Độ ẩm, Radar người, Pin 3.30V)
     4. `Đo Điện Năng PZEM` (Điện áp 221.8V, Công suất 285.3W, Dòng 1.34A, Tiêu thụ 12.54 kWh)
   - Bấm vào thẻ `Đo Điện Năng PZEM`: Mở Drawer bên phải hiển thị đầy đủ bảng 6 chỉ số thời gian thực, có hiệu ứng icon nhấp nháy theo nhịp đo.
   - Bấm vào `Trạm Gateway ESP32-S3`: Mở Subview hiển thị đầy đủ cả 3 thiết bị con trực thuộc.
