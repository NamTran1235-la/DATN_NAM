#include "pzem.h"
#include <stdio.h>

static uint32_t s_tick_counter = 0;
static float s_accumulated_energy = 12.345f;

void pzem_fake_init(void) {
    s_tick_counter = 0;
    s_accumulated_energy = 12.345f;
}

void pzem_fake_update(pzem_data_t *data) {
    if (!data) return;
    s_tick_counter++;

    // 1. Điện áp dao động thực tế quanh 220V (219.2V ~ 221.8V)
    int v_noise = (int)(s_tick_counter % 27) - 13;
    data->voltage = 220.5f + ((float)v_noise * 0.1f);

    // 2. Giả lập tải điều hòa không khí inverter đang làm mát: dao động 1.20A ~ 1.38A
    int i_noise = (int)(s_tick_counter % 19) - 9;
    data->current = 1.28f + ((float)i_noise * 0.01f);

    // 3. Tần số lưới điện & Hệ số công suất
    data->frequency = 50.0f;
    data->pf = 0.96f;

    // 4. Công suất tác dụng P = U * I * cos(phi) (khoảng 270W ~ 290W)
    data->power = data->voltage * data->current * data->pf;

    // 5. Điện năng tiêu thụ tích lũy (tăng dần theo thời gian thực)
    s_accumulated_energy += (data->power / 3600.0f) * 0.001f;
    data->energy = s_accumulated_energy;
}

void pzem_send_json(const pzem_data_t *data) {
    if (!data) return;

    // Gửi chuỗi JSON chuẩn có kết thúc bằng \r\n sang UART1 (PA9 TX)
    printf("{\"type\":\"pzem\",\"volt\":%.1f,\"curr\":%.2f,\"power\":%.1f,\"energy\":%.3f,\"freq\":%.1f,\"pf\":%.2f}\r\n",
           data->voltage,
           data->current,
           data->power,
           data->energy,
           data->frequency,
           data->pf);
}
