# TÀI LIỆU KỸ THUẬT: TÍCH HỢP BỘ ĐO ĐIỆN NĂNG PZEM-004T (STM32) VÀO HỆ THỐNG GATEWAY & WEB APP

Tài liệu này được biên soạn để ghi chép toàn bộ kiến trúc, sơ đồ kết nối, giao thức truyền thông và cách thức hoạt động của phân hệ đo lường chất lượng điện năng PZEM-004T qua vi điều khiển STM32F103C8T6 sang ESP32-S3 Gateway và hiển thị trên Web App.

---

## 1. Phân Biệt Hai Thiết Bị Node Trong Hệ Thống

| Tiêu Chí | Node Cảm Biến C3 (Con Nhận Diện) | Bộ Đo Điện Năng PZEM (Con Đo Điện) |
| :--- | :--- | :--- |
| **Phần cứng vi điều khiển** | ESP32-C3 RISC-V | STM32F103C8T6 (ARM Cortex-M3 72MHz) |
| **Module ngoại vi** | Radar LD2410 + Cảm biến nhiệt ẩm SHT30 | Cảm biến điện năng đa năng PZEM-004T v3.0 |
| **Giao thức truyền về Gateway**| Không dây **ESP-NOW 2.4GHz** | Có dây **UART 115200 baud** (PA9/TX, PA10/RX) |
| **Dữ liệu thu thập** | Nhiệt độ (°C), Độ ẩm (%), Trạng thái có người / phòng trống, Điện áp pin (V) | Điện áp (V), Dòng điện (A), Công suất (W), Năng lượng (kWh), Tần số (Hz), Hệ số Cosφ (PF) |
| **Định danh trên Web App** | `dev_espnow_node_1` (Type: `sensor`) | `dev_pzem_meter_1` (Type: `pzem`) |
| **Màu sắc & Biểu tượng thẻ** | Lục giác màu Tím (`#8b5cf6`), icon Radar | Lục giác màu Hổ phách (`#f59e0b`), icon Tia sét |

---

## 2. Sơ Đồ Đấu Nối Phần Cứng (Hardware Wiring)

```
 [Lưới Điện AC 220V]
        │
        ▼ (Biến dòng CT & Cầu đo áp)
 ┌──────────────────────┐
 │ Module PZEM-004T     │
 │ TX (Modbus-RTU 9600) ├──> STM32 PB11 (USART3 RX)
 │ RX (Modbus-RTU 9600) <──┤ STM32 PB10 (USART3 TX)
 └──────────────────────┘
 
 ┌────────────────────────────────────────────────────────┐
 │ STM32F103C8T6 (firmware/POWER_QUALITY)                │
 │ PA9  (USART1 TX, 115200 baud) ──> ESP32-S3 GPIO 18 (RX1)│
 │ PA10 (USART1 RX, 115200 baud) <── ESP32-S3 GPIO 17 (TX1)│
 │ GND                           ─── ESP32-S3 GND         │
 └────────────────────────────────────────────────────────┘
```

---

## 3. Định Dạng Gói Tin UART (STM32 -> ESP32-S3)

STM32 định kỳ đóng gói dữ liệu JSON và truyền sang ESP32-S3 qua USART1 với chu kỳ 1000ms:

```json
{
  "type": "pzem",
  "volt": 221.8,
  "curr": 1.34,
  "power": 285.3,
  "energy": 12.54,
  "freq": 50.0,
  "pf": 0.96
}
```

- `type`: Định danh loại dữ liệu `pzem` để Gateway phân luồng không bị lẫn với các bản tin ESP-NOW hay điều hòa IR.
- `volt`: Điện áp hiệu dụng (V, dải đo 80 – 260V).
- `curr`: Dòng điện hiệu dụng (A, dải đo 0 – 100A).
- `power`: Công suất tác dụng tức thời (W).
- `energy`: Tổng điện năng tiêu thụ tích lũy (kWh).
- `freq`: Tần số điện lưới (Hz, thông thường 50.0Hz).
- `pf`: Hệ số công suất Power Factor ($0.00 \le \cos\varphi \le 1.00$).

---

## 4. Xử Lý Phía Gateway ESP32-S3 (`firmware/GATE`)

1. Task nhận UART đọc từng byte qua ngắt hoặc Ring Buffer, kiểm tra ký tự mở đầu `{` và kết thúc `}\n`.
2. Trích xuất gói JSON bằng bộ giải mã siêu nhẹ `jsmn`.
3. Đưa thông số vào biến toàn cục và đóng gói vào bản tin MQTT Telemetry gửi lên Topic:
   - **Topic MQTT:** `gate/telemetry`
   - **QoS:** `1`
   - **Broker:** HiveMQ Cloud (TLS 8883)

---

## 5. Xử Lý Phía Backend FastAPI (`web_app/backend`)

1. **`app/mqtt_service.py`:**
   - Lắng nghe topic `gate/telemetry`. Khi phát hiện `msg.get("type") == "pzem"`:
     - Ghi nhận `latest_pzem_data` và cập nhật `latest_gateway_status["pzem"]`.
     - Cập nhật dấu thời gian `last_seen = datetime.now(timezone.utc).isoformat()`.

2. **`app/routers/sensor_router.py`:**
   - Cung cấp API `GET /api/sensors/pzem/latest`:
     - Kiểm tra khoảng cách thời gian `seconds_ago = now - last_seen`.
     - **Watchdog:** Nếu `seconds_ago <= 15` và Gateway đang trực tuyến -> `is_online: true`, ngược lại là `false`.

3. **`app/routers/gateway_router.py`:**
   - Trong `GET /api/gateway/status`, trường `pzem` luôn phản ánh đúng trạng thái thực tế: nếu mất nguồn STM32 hoặc Gateway offline, `pzem.is_online` lập tức bị gán thành `false`.

---

## 6. Giao Diện Người Dùng Web App (`web_app/frontend`)

### 6.1. Thẻ Thiết Bị Trên Dashboard & Subview
- **ID:** `dev_pzem_meter_1`.
- **Top Right:** Hiển thị pill điện áp màu cam hổ phách: `<span class="sensor-batt-pill">⚡ 221.8V</span>`.
- **Top Metrics:** Hiển thị công suất và dòng điện: `⚡ 285.3 W` • `🔌 1.34 A`.
- **Bottom Status:** Hiển thị tổng kWh tích lũy: `12.54 kWh • Hoạt động` (màu xanh lá) hoặc `Mất kết nối` (màu xám) khi ngoại tuyến.

### 6.2. Right Detail Drawer
Khi người dùng bấm vào thẻ `Đo Điện Năng PZEM`, một Drawer trượt từ bên phải ra ngoài:
1. **Banner Trạng Thái:** Hiển thị biểu tượng tia sét phát sáng hoạt họa, dòng chữ `Đang Đo Lường Realtime` và chú thích `Dữ liệu truyền từ STM32F103 qua cổng UART mỗi giây`.
2. **Lưới 6 Thẻ Đo Lường:**
   - Điện áp (U)
   - Dòng điện (I)
   - Công suất (P)
   - Tiêu thụ (E)
   - Tần số (F)
   - Hệ số công suất (PF)
3. **Hardware Link Strip:** Hiển thị dải liên kết phần cứng `STM32F103 (USART1) -> ESP32-S3 (UART1) • 115200 baud`.
4. **Cài Đặt:** Cho phép người dùng tùy ý đổi tên thiết bị, đổi phòng quản lý hoặc xóa khỏi trạm Gateway.

---

## 7. Quy Trình Bảo Trì & Triển Khai (Deploy)

Khi có thay đổi liên quan đến frontend hoặc backend:
```bash
# 1. Commit với user name & email quy chuẩn
git add .
git -c user.name="NamTran1235-la" -c user.email="ncao67984@gmail.com" commit -m "<noi_dung_commit>"
git push origin main

# 2. Deploy lên VPS (180.93.113.40)
sshpass -p "Zdinhquangha1234" ssh root@180.93.113.40 "cd /root/DATN_NAM && git pull origin main && docker restart gate_datn_backend"
```
> **Lưu ý an toàn:** Tuyệt đối không can thiệp, tắt hoặc khởi động lại các container của dự án khác chạy cùng server (`pump_*`, `smarthome_*`).
