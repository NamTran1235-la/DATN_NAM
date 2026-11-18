#ifndef __POWER_METER_UART_H__
#define __POWER_METER_UART_H__

#include "esp_err.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  float voltage;     // Điện áp (V)
  float current;     // Dòng điện (A)
  float power;       // Công suất tức thời (W)
  float energy;      // Năng lượng tích lũy (kWh)
  float frequency;   // Tần số lưới (Hz)
  float pf;          // Hệ số công suất
  bool valid;        // Dữ liệu hợp lệ
} power_meter_reading_t;

/**
 * @brief Con trỏ hàm callback khi nhận được bản tin đo điện từ STM32
 * @param reading Cấu trúc dữ liệu đã được parse
 * @param raw_json Chuỗi JSON gốc gửi từ STM32
 */
typedef void (*power_meter_data_cb_t)(const power_meter_reading_t *reading,
                                      const char *raw_json);

/**
 * @brief Khởi tạo module UART giao tiếp STM32F103 (PZEM-004T)
 * @param cb Callback nhận dữ liệu (có thể NULL)
 * @return esp_err_t
 */
esp_err_t power_meter_uart_init(power_meter_data_cb_t cb);

/**
 * @brief FreeRTOS Task nhận và giải mã dữ liệu UART từ STM32
 */
void power_meter_uart_task(void *pvParameters);

/**
 * @brief Lấy bản ghi đo điện mới nhất
 */
bool power_meter_get_latest(power_meter_reading_t *out_data);

#ifdef __cplusplus
}
#endif

#endif // __POWER_METER_UART_H__
