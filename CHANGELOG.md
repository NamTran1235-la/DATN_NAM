# NHẬT KÝ THAY ĐỔI & LỊCH SỬ PHÁT TRIỂN (CHANGELOG)
## Dự án: Đồ Án Tốt Nghiệp - Hệ Thống IoT Smart Home & Power Quality (DATN_NAM)

---

### [2026-11-18] - Đồng Bộ Cấu Hình Thiết Bị Tập Trung Theo Tài Khoản (Server-Side Sync)

#### 1. Vấn Đề Thực Tế
- Trước đây, danh sách thiết bị và cờ xóa (`gate_custom_devices`, `gate_pzem_deleted`,...) chỉ được lưu trữ cục bộ trong `localStorage` của trình duyệt.
- Hậu quả: Khi người dùng đăng nhập cùng 1 tài khoản trên Điện thoại và thực hiện xóa thiết bị, bộ nhớ trên Laptop không hề biết sự kiện này. Khi reload lại Laptop, thiết bị đã xóa trên điện thoại vẫn còn hiển thị.

#### 2. Giải Pháp Triển Khai
1. **Mô hình Database & Backend:**
   - Tạo bảng `user_device_configs` (`UserDeviceConfig`) trong PostgreSQL lưu cấu hình danh sách thiết bị `devices_json` và cờ trạng thái xóa `deleted_flags_json` gắn chặt với `user_id`.
   - Xây dựng Router `web_app/backend/app/routers/user_router.py`:
     - `GET /api/user/devices`: Tự động truy xuất danh sách thiết bị và cờ xóa của tài khoản người dùng đang đăng nhập.
     - `POST /api/user/devices`: Lưu trữ, cập nhật trạng thái thiết bị thời gian thực khi có bất kỳ thao tác Thêm, Sửa hoặc Xóa nào.
2. **Frontend Đồng Bộ Hai Chiều:**
   - Khi mở trang web trên bất kỳ máy nào: Tự động gọi `syncUserDevicesFromServer()` để nạp danh sách thiết bị từ server về.
   - Khi có bất kỳ hành động Thêm/Sửa tên/Xóa thiết bị: Lập tức gọi `saveUserDevicesToServer()` đẩy lên Database PostgreSQL.
   - Thêm cơ chế lắng nghe sự kiện `window.addEventListener("focus", syncUserDevicesFromServer)` và chu kỳ polling 10s: Khi người dùng thao tác xóa trên điện thoại xong và chuyển sang tab Laptop, Laptop tự động phát hiện thay đổi và đồng bộ xóa thiết bị tức thời.

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


---

### [2026-11-19] - Firmware STM32 FreeRTOS, Sửa Lỗi Ngắt Dây UART & Tính Tiền Điện Realtime

#### 1. Tái Cấu Trúc Firmware STM32F103 (Power Quality) Sang FreeRTOS & FSM
- **Kiến trúc đa nhiệm FreeRTOS:**
  - `AppTask` (Priority 3 - Cao nhất): Quản lý máy trạng thái `app.state` (`IDLE`, `CONNECTING`, `CONNECTED`, `APP_ERROR`), gửi JSON mỗi 1000ms qua UART1 (115200 baud), kiểm tra và phân tích phản hồi ACK từ Gateway.
  - `SensorTask` (Priority 2 - Trung bình): Đọc cảm biến PZEM-004T thật qua USART2 (PA2 TX, PA3 RX) Modbus-RTU 9600 8N1, tính toán CRC16, truy vấn chu kỳ 500ms.
  - `LedTask` (Priority 1 - Thấp nhất): Điều khiển LED trạng thái PC13 theo trạng thái kết nối UART.

#### 2. Khắc Phục Lỗi LED PC13 & Lỗi Ngắt Kết Nối UART
1. **Lỗi Active-LOW của LED PC13:**
   - Bo STM32 Blue Pill có LED PC13 kích mức thấp (Active-LOW: mức 0V là SÁNG, 3.3V là TẮT).
   - Trong `main.c`, nhánh `CONNECTED` đã được sửa từ `led_off()` sang `led_on()` để LED luôn sáng liên tục khi có kết nối.
2. **Khắc phục lỗi rút dây UART nhưng LED vẫn không blink:**
   - **Nguyên nhân:** Chân PA10 (RX) trước đó cấu hình là `IN_FLOATING`. Do nằm sát chân PA9 (TX) trên chip, khi rút dây hở mạch, xung 115200 baud của PA9 tạo hiện tượng **nhiễu xuyên kênh (crosstalk)** làm PA10 thu các xung nhiễu giả lập byte. Bộ kiểm tra `received_any` nhận diện nhầm là Gateway vẫn gửi dữ liệu nên không bao giờ timeout.
   - **Khắc phục triệt để:**
     - Đổi cấu hình PA10 thành `GPIO_Mode_IPU` (Input Pull-Up), tự động kéo lên 3.3V (IDLE chuẩn) khi rút dây, triệt tiêu 100% nhiễu.
     - Lọc bỏ byte lỗi trong ngắt `USART1_IRQHandler` khi cờ `Framing Error (FE)` hoặc `Noise Error (NE)` xuất hiện.
     - Xác thực nội dung chuỗi: Chỉ reset timeout khi nhận đúng phản hồi chứa từ khóa `"ack"` hoặc `"pzem"` từ Gateway.
     - Giảm `GATEWAY_TIMEOUT_MS` từ 3500ms xuống **2000ms (2 giây)** để phát hiện ngắt dây tức thời.
     - Thêm từ khóa `volatile` cho các trường của cấu trúc `a_app` để đồng bộ dữ liệu giữa các task FreeRTOS.
3. **Gateway ESP32-S3:**
   - Bổ sung cơ chế phản hồi ACK 2 chiều: Khi nhận được bản tin PZEM hợp lệ từ STM32, Gateway gửi ngay `{"ack":"pzem","status":"ok"}\n` qua GPIO 43 TX.

#### 3. Cấu Hình Đơn Giá Điện & Tính Tiền Điện Realtime Trên Web App
1. **Drawer Chi Tiết Đo Điện Năng:**
   - Thêm nhóm **Đơn giá điện (VNĐ/kWh)** trong phần Chỉnh Sửa Thiết Bị.
   - 4 nút chọn nhanh biểu giá: `1.893 đ` (Bậc 1), `2.167 đ` (Bậc TB), `2.500 đ` (Chuẩn), `3.500 đ` (Trọ/KD) kèm ô nhập giá tùy chỉnh.
   - Tính năng **Live Preview**: Hiển thị tức thời `Tạm tính: ... đ` khi chọn hoặc gõ giá.
   - Thêm dòng thành tiền tạm tính vào ô **TIÊU THỤ (E)** (`💰 Tạm tính: ... đ`).
2. **Thẻ Banner Màu Xanh Ngoài Dashboard:**
   - Bổ sung thẻ phụ hiển thị thành tiền: `TIỀN ĐIỆN TẠM TÍNH` -> `... đ` (định dạng phân cách hàng nghìn) ngay cạnh số kWh.
   - Chân thẻ hiển thị: `⚡ 0.0V • 0.00A • Giá: 2.500 đ/kWh` cùng công suất `⚡ 0.0 W`.
   - Bấm vào thẻ xanh trên Dashboard sẽ mở ngay Drawer PZEM để chỉnh giá điện.
3. **Đồng Bộ Tập Trung Với Server PostgreSQL:**
   - Lưu trữ đơn giá điện trong thiết bị và `curSettings.gate_electricity_rate`.
   - Đồng bộ tự động qua API `POST /api/user/devices` và `GET /api/user/devices` (áp dụng đồng nhất 100% giữa điện thoại & laptop).
4. **Triển Khai Máy Chủ VPS (`180.93.113.40`):**
   - Đẩy commit lên GitHub (`origin/main`), kéo về VPS và khởi động lại container `gate_datn_frontend` an toàn.
   - Nâng phiên bản cache busting lên `?v=141`.
