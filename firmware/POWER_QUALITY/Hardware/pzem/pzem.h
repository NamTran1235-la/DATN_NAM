#ifndef __PZEM_H__
#define __PZEM_H__

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    float voltage;     // Điện áp (V), vd: 220.5
    float current;     // Dòng điện (A), vd: 1.25
    float power;       // Công suất tác dụng (W), vd: 275.6
    float energy;      // Năng lượng tiêu thụ (kWh), vd: 15.820
    float frequency;   // Tần số lưới điện (Hz), vd: 50.0
    float pf;          // Hệ số công suất, vd: 0.95
    bool  is_valid;    // Dữ liệu hợp lệ từ cảm biến PZEM-004T thật
} pzem_data_t;

/**
 * @brief Khởi tạo giao tiếp USART2 (PA2 TX, PA3 RX) kết nối cảm biến PZEM-004T v3.0 thật
 */
void pzem_init(void);

/**
 * @brief Đọc bản tin Modbus-RTU từ cảm biến PZEM-004T thật
 * @return true nếu đọc và xác thực CRC thành công, false nếu lỗi/timeout
 */
bool pzem_read_sensor(void);

/**
 * @brief Lấy bản sao dữ liệu đo đạc mới nhất (Thread-safe)
 */
void pzem_get_data(pzem_data_t *out_data);

/**
 * @brief Gửi dữ liệu đo qua UART1 ở định dạng chuẩn JSON cho Gateway ESP32-S3
 */
void pzem_send_json(const pzem_data_t *data);

#ifdef __cplusplus
}
#endif

#endif // __PZEM_H__
