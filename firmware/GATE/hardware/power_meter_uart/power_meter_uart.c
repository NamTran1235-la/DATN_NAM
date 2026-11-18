#include "power_meter_uart.h"
#include "config.h"
#include "driver/uart.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "jsmn.h"
#include "led.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *TAG = "STM32_PZEM_UART";

#define UART_RX_BUF_SIZE 1024
#define LINE_BUF_SIZE 384

static power_meter_data_cb_t s_data_cb = NULL;
static power_meter_reading_t s_latest_reading = {0};
static SemaphoreHandle_t s_data_mutex = NULL;

static bool json_token_eq(const char *json, const jsmntok_t *tok,
                          const char *s) {
  if (tok->type == JSMN_STRING && (int)strlen(s) == tok->end - tok->start &&
      strncmp(json + tok->start, s, tok->end - tok->start) == 0) {
    return true;
  }
  return false;
}

static float json_token_float(const char *json, const jsmntok_t *tok) {
  char buf[32] = {0};
  int len = tok->end - tok->start;
  if (len > 0 && len < (int)sizeof(buf)) {
    memcpy(buf, json + tok->start, len);
    buf[len] = '\0';
    return (float)atof(buf);
  }
  return 0.0f;
}

static bool parse_pzem_json(const char *json, power_meter_reading_t *out) {
  if (!json || !out)
    return false;

  jsmn_parser parser;
  jsmntok_t tokens[32];
  jsmn_init(&parser);

  int num_tokens = jsmn_parse(&parser, json, strlen(json), tokens,
                              sizeof(tokens) / sizeof(tokens[0]));
  if (num_tokens < 1 || tokens[0].type != JSMN_OBJECT) {
    return false;
  }

  memset(out, 0, sizeof(power_meter_reading_t));
  bool has_pzem_type = false;

  for (int i = 1; i < num_tokens - 1; i++) {
    if (json_token_eq(json, &tokens[i], "type")) {
      char type_buf[16] = {0};
      int len = tokens[i + 1].end - tokens[i + 1].start;
      if (len > 0 && len < sizeof(type_buf)) {
        memcpy(type_buf, json + tokens[i + 1].start, len);
        if (strcmp(type_buf, "pzem") == 0) {
          has_pzem_type = true;
        }
      }
      i++;
    } else if (json_token_eq(json, &tokens[i], "volt") ||
               json_token_eq(json, &tokens[i], "voltage")) {
      out->voltage = json_token_float(json, &tokens[i + 1]);
      i++;
    } else if (json_token_eq(json, &tokens[i], "curr") ||
               json_token_eq(json, &tokens[i], "current")) {
      out->current = json_token_float(json, &tokens[i + 1]);
      i++;
    } else if (json_token_eq(json, &tokens[i], "power")) {
      out->power = json_token_float(json, &tokens[i + 1]);
      i++;
    } else if (json_token_eq(json, &tokens[i], "energy")) {
      out->energy = json_token_float(json, &tokens[i + 1]);
      i++;
    } else if (json_token_eq(json, &tokens[i], "freq") ||
               json_token_eq(json, &tokens[i], "frequency")) {
      out->frequency = json_token_float(json, &tokens[i + 1]);
      i++;
    } else if (json_token_eq(json, &tokens[i], "pf")) {
      out->pf = json_token_float(json, &tokens[i + 1]);
      i++;
    }
  }

  out->valid = has_pzem_type || (out->voltage > 50.0f);
  return out->valid;
}

esp_err_t power_meter_uart_init(power_meter_data_cb_t cb) {
  s_data_cb = cb;

  if (!s_data_mutex) {
    s_data_mutex = xSemaphoreCreateMutex();
  }

  uart_config_t uart_config = {
      .baud_rate = STM32_UART_BAUDRATE,
      .data_bits = UART_DATA_8_BITS,
      .parity = UART_PARITY_DISABLE,
      .stop_bits = UART_STOP_BITS_1,
      .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
      .source_clk = UART_SCLK_DEFAULT,
  };

  esp_err_t err = uart_param_config(STM32_UART_PORT, &uart_config);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "Loi cau hinh tham so UART%d: %s", STM32_UART_PORT,
             esp_err_to_name(err));
    return err;
  }

  err = uart_set_pin(STM32_UART_PORT, STM32_UART_TX_PIN, STM32_UART_RX_PIN,
                     UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "Loi gan chan UART%d (TX=%d, RX=%d): %s", STM32_UART_PORT,
             STM32_UART_TX_PIN, STM32_UART_RX_PIN, esp_err_to_name(err));
    return err;
  }

  err = uart_driver_install(STM32_UART_PORT, UART_RX_BUF_SIZE, 0, 0, NULL, 0);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "Loi cai dat UART driver: %s", esp_err_to_name(err));
    return err;
  }

  ESP_LOGI(TAG, "==========================================================");
  ESP_LOGI(TAG, "Khoi tao STM32 UART thanh cong!");
  ESP_LOGI(TAG, "Port: UART%d | Baud: %d bps", STM32_UART_PORT,
           STM32_UART_BAUDRATE);
  ESP_LOGI(TAG, "Chân Gateway RX: GPIO %d (Noi voi PA9 TX cua STM32)",
           STM32_UART_RX_PIN);
  ESP_LOGI(TAG, "Chân Gateway TX: GPIO %d (Noi voi PA10 RX cua STM32)",
           STM32_UART_TX_PIN);
  ESP_LOGI(TAG, "==========================================================");

  return ESP_OK;
}

void power_meter_uart_task(void *pvParameters) {
  uint8_t byte = 0;
  char line_buf[LINE_BUF_SIZE];
  int line_idx = 0;

  ESP_LOGI(TAG, "Task lang nghe du lieu STM32 PZEM UART da chay...");

  while (1) {
    int len = uart_read_bytes(STM32_UART_PORT, &byte, 1, pdMS_TO_TICKS(100));
    if (len > 0) {
      if (byte == '\n' || byte == '\r') {
        if (line_idx > 0) {
          line_buf[line_idx] = '\0';

          // Bỏ các ký tự trắng thừa ở đầu nếu có
          char *p = line_buf;
          while (*p == ' ' || *p == '\t')
            p++;

          if (*p == '{') {
            power_meter_reading_t reading;
            if (parse_pzem_json(p, &reading)) {
              if (s_data_mutex &&
                  xSemaphoreTake(s_data_mutex, pdMS_TO_TICKS(50))) {
                s_latest_reading = reading;
                xSemaphoreGive(s_data_mutex);
              }

              // Bắn log nổi bật để người dùng nhìn thấy rõ ràng trên console
              ESP_LOGI(TAG,
                       "⚡ [STM32 UART RX] PZEM: U=%.1fV | I=%.2fA | P=%.1fW | "
                       "E=%.3fkWh | PF=%.2f",
                       reading.voltage, reading.current, reading.power,
                       reading.energy, reading.pf);

              // Nháy LED trạng thái Gateway
              led_notify_activity();

              // Phản hồi ACK sang STM32 báo nhận thành công gói tin qua UART1
              const char *ack_msg = "{\"ack\":\"pzem\",\"status\":\"ok\"}\n";
              uart_write_bytes(STM32_UART_PORT, ack_msg, strlen(ack_msg));

              // Gọi callback chuyển tiếp sang gate_controller
              if (s_data_cb) {
                s_data_cb(&reading, p);
              }
            } else {
              ESP_LOGD(TAG, "Nhan chuoi khong phai PZEM JSON hop le: %s", p);
            }
          }
          line_idx = 0;
        }
      } else {
        if (line_idx < (int)sizeof(line_buf) - 1) {
          line_buf[line_idx++] = (char)byte;
        } else {
          // Tràn bộ đệm dòng -> reset
          line_idx = 0;
        }
      }
    }
  }
}

bool power_meter_get_latest(power_meter_reading_t *out_data) {
  if (!out_data || !s_data_mutex)
    return false;

  if (xSemaphoreTake(s_data_mutex, pdMS_TO_TICKS(50))) {
    *out_data = s_latest_reading;
    xSemaphoreGive(s_data_mutex);
    return out_data->valid;
  }
  return false;
}
