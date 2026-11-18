
#include <stdint.h>
#include <stdio.h>

#include "FreeRTOS.h"
#include "Hardware/delay/delay.h"
#include "Hardware/led/led.h"
#include "Hardware/pzem/pzem.h"
#include "app/app.h"
#include "middle/uart_debug/uart_debug.h"
#include "stm32f10x.h"
#include "task.h"

static void app_task(void *pvParameters) {
    (void)pvParameters;

    while (1) {
        app_process();
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}

static void sensor_task(void *pvParameters) {
    (void)pvParameters;

    while (1) {
        pzem_read_sensor();
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

static void led_task(void *pvParameters) {
    (void)pvParameters;

    while (1) {
        if (app.state == CONNECTED) {
            led_on(); /* Sáng và giữ ở sáng khi đã kết nối Gateway */
            vTaskDelay(pdMS_TO_TICKS(100));
        } else {
            led_toggle(); /* Nhấp nháy (blink) khi ngắt hoặc chưa kết nối */
            vTaskDelay(pdMS_TO_TICKS(300));
        }
    }
}

void vApplicationStackOverflowHook(TaskHandle_t xTask, char *pcTaskName) {
    (void)xTask;
    (void)pcTaskName;
    while (1) {
        led_toggle();
        for (volatile int i = 0; i < 200000; i++)
            ;
    }
}

void vApplicationMallocFailedHook(void) {
    while (1) {
        led_toggle();
        for (volatile int i = 0; i < 200000; i++)
            ;
    }
}

int main(void) {
    SystemInit();

    NVIC_PriorityGroupConfig(NVIC_PriorityGroup_4);

    delay_init();
    led_init();

    uart_debug_init(115200);

    pzem_init();

    app_init();

    xTaskCreate(app_task, "AppTask", 256, NULL, 3, NULL);
    xTaskCreate(sensor_task, "SensorTask", 192, NULL, 2, NULL);
    xTaskCreate(led_task, "LedTask", 128, NULL, 1, NULL);

    vTaskStartScheduler();

    while (1) {
    }

    return 0;
}
