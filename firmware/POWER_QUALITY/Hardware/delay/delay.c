#include "delay.h"
#include "FreeRTOS.h"
#include "task.h"

void delay_init(void) {
    /* Khởi tạo delay tương thích FreeRTOS */
}

void delay_us(uint32_t us) {
    volatile uint32_t count = us * 9;
    while (count--) {
        __asm__ volatile ("nop");
    }
}

void delay_ms(uint32_t ms) {
    if (xTaskGetSchedulerState() != taskSCHEDULER_NOT_STARTED) {
        vTaskDelay(pdMS_TO_TICKS(ms));
    } else {
        while (ms--) {
            delay_us(1000);
        }
    }
}
