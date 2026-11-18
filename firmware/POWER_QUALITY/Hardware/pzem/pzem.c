#include "pzem.h"

#include <stdio.h>
#include <string.h>

#include "Hardware/delay/delay.h"
#include "stm32f10x.h"
#include "third_party/ringbuff/ringbuff.h"

#define PZEM_UART USART2
#define PZEM_UART_CLK RCC_APB1Periph_USART2
#define PZEM_GPIO_CLK RCC_APB2Periph_GPIOA
#define PZEM_GPIO_PORT GPIOA
#define PZEM_TX_PIN GPIO_Pin_2
#define PZEM_RX_PIN GPIO_Pin_3
#define PZEM_IRQn USART2_IRQn

#define PZEM_RX_BUF_SIZE 128

static uint8_t s_pzem_raw_buf[PZEM_RX_BUF_SIZE];
static ringbuff_t s_pzem_rb;
static pzem_data_t s_latest_data = {.voltage = 0.0f,
                                    .current = 0.0f,
                                    .power = 0.0f,
                                    .energy = 0.0f,
                                    .frequency = 50.0f,
                                    .pf = 1.0f,
                                    .is_valid = false};

static uint16_t pzem_calc_crc(const uint8_t *data, uint16_t len) {
    uint16_t crc = 0xFFFF;
    for (uint16_t i = 0; i < len; i++) {
        crc ^= (uint16_t)data[i];
        for (uint8_t j = 0; j < 8; j++) {
            if (crc & 0x0001) {
                crc = (crc >> 1) ^ 0xA001;
            } else {
                crc = crc >> 1;
            }
        }
    }
    return crc;
}

void pzem_init(void) {
    GPIO_InitTypeDef GPIO_InitStructure;
    USART_InitTypeDef USART_InitStructure;
    NVIC_InitTypeDef NVIC_InitStructure;

    ringbuff_init(&s_pzem_rb, s_pzem_raw_buf, sizeof(s_pzem_raw_buf));

    RCC_APB1PeriphClockCmd(PZEM_UART_CLK, ENABLE);
    RCC_APB2PeriphClockCmd(PZEM_GPIO_CLK | RCC_APB2Periph_AFIO, ENABLE);

    GPIO_InitStructure.GPIO_Pin = PZEM_TX_PIN;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AF_PP;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(PZEM_GPIO_PORT, &GPIO_InitStructure);

    GPIO_InitStructure.GPIO_Pin = PZEM_RX_PIN;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IN_FLOATING;
    GPIO_Init(PZEM_GPIO_PORT, &GPIO_InitStructure);

    USART_InitStructure.USART_BaudRate = 9600;
    USART_InitStructure.USART_WordLength = USART_WordLength_8b;
    USART_InitStructure.USART_StopBits = USART_StopBits_1;
    USART_InitStructure.USART_Parity = USART_Parity_No;
    USART_InitStructure.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    USART_InitStructure.USART_Mode = USART_Mode_Rx | USART_Mode_Tx;
    USART_Init(PZEM_UART, &USART_InitStructure);

    USART_ITConfig(PZEM_UART, USART_IT_RXNE, ENABLE);

    NVIC_InitStructure.NVIC_IRQChannel = PZEM_IRQn;
    NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 6;
    NVIC_InitStructure.NVIC_IRQChannelSubPriority = 0;
    NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&NVIC_InitStructure);

    USART_Cmd(PZEM_UART, ENABLE);
}

void USART2_IRQHandler(void) {
    if (USART_GetITStatus(PZEM_UART, USART_IT_RXNE) != RESET) {
        uint8_t byte = (uint8_t)USART_ReceiveData(PZEM_UART);
        ringbuff_write(&s_pzem_rb, &byte, 1);
        USART_ClearITPendingBit(PZEM_UART, USART_IT_RXNE);
    }

    if (USART_GetFlagStatus(PZEM_UART, USART_FLAG_ORE) != RESET) {
        (void)USART_ReceiveData(PZEM_UART);
    }
}

static void pzem_send_bytes(const uint8_t *data, uint16_t len) {
    for (uint16_t i = 0; i < len; i++) {
        uint32_t timeout = 100000;
        while ((USART_GetFlagStatus(PZEM_UART, USART_FLAG_TXE) == RESET) && --timeout)
            ;
        USART_SendData(PZEM_UART, (uint16_t)data[i]);
    }
    uint32_t timeout = 100000;
    while ((USART_GetFlagStatus(PZEM_UART, USART_FLAG_TC) == RESET) && --timeout)
        ;
}

static bool pzem_query_and_parse(uint8_t addr) {
    uint8_t query[8];
    query[0] = addr;  // Địa chỉ Slave
    query[1] = 0x04;  // Read Input Registers
    query[2] = 0x00;  // Register Start High
    query[3] = 0x00;  // Register Start Low
    query[4] = 0x00;  // Number of Regs High
    query[5] = 0x0A;  // Number of Regs Low (10 registers = 20 bytes)
    uint16_t crc = pzem_calc_crc(query, 6);
    query[6] = (uint8_t)(crc & 0xFF);
    query[7] = (uint8_t)((crc >> 8) & 0xFF);

    ringbuff_reset(&s_pzem_rb);
    pzem_send_bytes(query, 8);

    uint32_t wait_ms = 0;
    while (ringbuff_get_full(&s_pzem_rb) < 25 && wait_ms < 150) {
        delay_ms(5);
        wait_ms += 5;
    }

    if (ringbuff_get_full(&s_pzem_rb) < 25) {
        return false;
    }

    uint8_t resp[25];
    ringbuff_read(&s_pzem_rb, resp, 25);

    if (resp[0] != addr || resp[1] != 0x04 || resp[2] != 0x14) {
        return false;
    }

    uint16_t expected_crc = pzem_calc_crc(resp, 23);
    uint16_t received_crc = (uint16_t)resp[23] | ((uint16_t)resp[24] << 8);
    if (expected_crc != received_crc) {
        return false;
    }

    uint16_t raw_volt = ((uint16_t)resp[3] << 8) | resp[4];
    s_latest_data.voltage = (float)raw_volt * 0.1f;

    uint32_t raw_curr =
        ((uint32_t)resp[7] << 24) | ((uint32_t)resp[8] << 16) | ((uint32_t)resp[5] << 8) | resp[6];
    s_latest_data.current = (float)raw_curr * 0.001f;

    uint32_t raw_power = ((uint32_t)resp[11] << 24) | ((uint32_t)resp[12] << 16) |
                         ((uint32_t)resp[9] << 8) | resp[10];
    s_latest_data.power = (float)raw_power * 0.1f;

    uint32_t raw_energy = ((uint32_t)resp[15] << 24) | ((uint32_t)resp[16] << 16) |
                          ((uint32_t)resp[13] << 8) | resp[14];
    s_latest_data.energy = (float)raw_energy / 1000.0f;

    uint16_t raw_freq = ((uint16_t)resp[17] << 8) | resp[18];
    s_latest_data.frequency = (float)raw_freq * 0.1f;

    uint16_t raw_pf = ((uint16_t)resp[19] << 8) | resp[20];
    s_latest_data.pf = (float)raw_pf * 0.01f;

    s_latest_data.is_valid = true;
    return true;
}

bool pzem_read_sensor(void) {
    if (pzem_query_and_parse(0x01)) {
        return true;
    }
    if (pzem_query_and_parse(0xF8)) {
        return true;
    }
    s_latest_data.is_valid = false;
    return false;
}

void pzem_get_data(pzem_data_t *out_data) {
    if (!out_data)
        return;
    *out_data = s_latest_data;
}

void pzem_send_json(const pzem_data_t *data) {
    if (!data)
        return;

    printf(
        "{\"type\":\"pzem\",\"volt\":%.1f,\"curr\":%.2f,\"power\":%.1f,\"energy\":%.3f,\"freq\":%."
        "1f,\"pf\":%.2f}\r\n",
        data->voltage, data->current, data->power, data->energy, data->frequency, data->pf);
}
