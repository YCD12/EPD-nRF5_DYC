#ifndef __EPD_CONFIG_H
#define __EPD_CONFIG_H
#include <stdbool.h>
#include <stdint.h>

typedef struct {
    uint8_t mosi_pin;
    uint8_t sclk_pin;
    uint8_t cs_pin;
    uint8_t dc_pin;
    uint8_t rst_pin;
    uint8_t busy_pin;
    uint8_t bs_pin;
    uint8_t model_id;
    uint8_t wakeup_pin;
    uint8_t led_pin;
    uint8_t en_pin;
    uint8_t display_mode;
    uint8_t week_start;
} epd_config_t;

#define EPD_CONFIG_SIZE (sizeof(epd_config_t) / sizeof(uint8_t))

void epd_config_init(epd_config_t* cfg);
void epd_config_read(epd_config_t* cfg);
void epd_config_write(epd_config_t* cfg);
void epd_config_clear(epd_config_t* cfg);
bool epd_config_empty(epd_config_t* cfg);

#endif
