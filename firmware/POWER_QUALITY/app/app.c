#include "app.h"

#include <stdio.h>
#include <string.h>

#include "FreeRTOS.h"
#include "Hardware/led/led.h"
#include "Hardware/pzem/pzem.h"
#include "middle/uart_debug/uart_debug.h"
#include "task.h"

a_app app;

#define GATEWAY_TIMEOUT_MS 2000
#define SEND_INTERVAL_MS 1000

static char s_ack_line[64];
static uint8_t s_ack_idx = 0;

void app_init(void) {
    memset((void *)&app, 0, sizeof(a_app));
    app.state = IDLE;
    app.next_state = IDLE;
    app.last_tx_time = 0;
    app.last_rx_time = 0;
    app.is_gateway_connected = false;
    s_ack_idx = 0;
}

static void app_check_gateway_response(void) {
    uint8_t byte = 0;
    bool got_valid_ack = false;

    while (uart_debug_read_byte(&byte)) {
        if (byte == '\n' || byte == '\r') {
            if (s_ack_idx > 0) {
                s_ack_line[s_ack_idx] = '\0';
                /* Kiểm tra chuỗi phản hồi hợp lệ từ Gateway chứa "ack" hoặc "ok" */
                if (strstr(s_ack_line, "ack") != NULL || strstr(s_ack_line, "pzem") != NULL) {
                    got_valid_ack = true;
                }
                s_ack_idx = 0;
            }
        } else if (s_ack_idx < sizeof(s_ack_line) - 1) {
            /* Chỉ nhận ký tự in được (ASCII 32-126) để loại bỏ hoàn toàn nhiễu ngắt dây */
            if (byte >= 32 && byte <= 126) {
                s_ack_line[s_ack_idx++] = (char)byte;
            }
        } else {
            s_ack_idx = 0;
        }
    }

    if (got_valid_ack) {
        app.last_rx_time = xTaskGetTickCount();
    }

    uint32_t now = xTaskGetTickCount();
    if (app.last_rx_time > 0 && (now - app.last_rx_time) < pdMS_TO_TICKS(GATEWAY_TIMEOUT_MS)) {
        app.is_gateway_connected = true;
    } else {
        app.is_gateway_connected = false;
    }
}

void app_process(void) {
    app_check_gateway_response();

    switch (app.state) {
        case IDLE:
            if (app.is_gateway_connected) {
                app.next_state = CONNECTED;
            } else {
                app.next_state = CONNECTING;
            }
            break;

        case CONNECTING:
            if (app.is_gateway_connected) {
                app.next_state = CONNECTED;
            }
            break;

        case CONNECTED:
            if (!app.is_gateway_connected) {
                app.next_state = IDLE;
            }
            break;

        case ERROR:
            uart_debug_flush();
            app.next_state = IDLE;
            break;

        default:
            app.next_state = IDLE;
            break;
    }

    app.state = app.next_state;

    uint32_t now = xTaskGetTickCount();
    if (now - app.last_tx_time >= pdMS_TO_TICKS(SEND_INTERVAL_MS)) {
        app.last_tx_time = now;

        pzem_data_t pzem_metric;
        pzem_get_data(&pzem_metric);

        pzem_send_json(&pzem_metric);
    }
}

a_state app_get_state(void) {
    return app.state;
}

bool app_is_gateway_connected(void) {
    return (app.state == CONNECTED);
}
