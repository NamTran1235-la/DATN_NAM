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
} pzem_data_t;

/**
 * @brief Khởi tạo module giả lập cảm biến PZEM-004T
 */
void pzem_fake_init(void);

/**
 * @brief Cập nhật dữ liệu đo đạc (dao động thực tế theo tải)
 */
void pzem_fake_update(pzem_data_t *data);

/**
 * @brief Gửi dữ liệu đo qua UART ở định dạng chuẩn JSON cho Gateway ESP32-S3
 */
void pzem_send_json(const pzem_data_t *data);

#ifdef __cplusplus
}
#endif

#endif // __PZEM_H__
