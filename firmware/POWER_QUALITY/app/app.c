#include "app.h"

#include <stdio.h>
#include <string.h>

#include "FreeRTOS.h"
#include "Hardware/led/led.h"
#include "Hardware/pzem/pzem.h"
#include "middle/uart_debug/uart_debug.h"
#include "task.h"

a_app app;

#define GATEWAY_TIMEOUT_MS 3500
#define SEND_INTERVAL_MS 1000

void app_init(void) {
    memset(&app, 0, sizeof(a_app));
    app.state = IDLE;
    app.next_state = IDLE;
    app.last_tx_time = 0;
    app.last_rx_time = 0;
    app.is_gateway_connected = false;
}

static void app_check_gateway_response(void) {
    uint8_t byte = 0;
    bool received_any = false;

    while (uart_debug_read_byte(&byte)) {
        received_any = true;
    }

    if (received_any) {
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
