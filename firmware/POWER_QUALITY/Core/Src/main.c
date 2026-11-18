#include <stdint.h>
#include <stdio.h>

#include "Hardware/delay/delay.h"
#include "Hardware/led/led.h"
#include "Hardware/pzem/pzem.h"
#include "middle/uart_debug/uart_debug.h"
#include "stm32f10x.h"
#include "third_party/ringbuff/ringbuff.h"

int main(void) {
    SystemInit();
    delay_init();
    led_init();

    /* Khởi tạo UART1 (PA9 TX, PA10 RX) tốc độ 115200 bps */
    uart_debug_init(115200);

    /* Khởi tạo module giả lập đo điện PZEM-004T */
    pzem_fake_init();
    pzem_data_t pzem_metric;

    delay_ms(500);

    while (1) {
        /* Cập nhật thông số điện đo đạc */
        pzem_fake_update(&pzem_metric);

        /* Gửi gói tin JSON sang Gateway ESP32-S3 qua UART1 (PA9 TX) */
        pzem_send_json(&pzem_metric);

        /* Nháy LED PC13 trên bo Blue Pill báo hiệu vừa gửi 1 gói tin */
        led_toggle();

        /* Chu kỳ gửi định kỳ 1000ms */
        delay_ms(1000);
    }

    return 0;
}
