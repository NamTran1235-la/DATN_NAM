#ifndef __APP_H__
#define __APP_H__

#include <stdint.h>
#include <stdbool.h>
#include "stm32f10x.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    IDLE = 1,
    CONNECTING,
    CONNECTED,
    APP_ERROR
} a_state;

/* Map ERROR sang APP_ERROR để không xung đột với ErrorStatus của CMSIS stm32f10x.h */
#define ERROR APP_ERROR

typedef struct {
    a_state state;
    a_state next_state;
    uint32_t last_tx_time;
    uint32_t last_rx_time;
    bool is_gateway_connected;
} a_app;

extern a_app app;

void app_init(void);
void app_process(void);

a_state app_get_state(void);
bool app_is_gateway_connected(void);

#ifdef __cplusplus
}
#endif

#endif  //__APP_H__
