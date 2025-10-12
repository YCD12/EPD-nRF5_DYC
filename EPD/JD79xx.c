/**
 * Based on GDEM042F52 driver from Good Display
 * https://www.good-display.com/product/564.html
 */
#include "EPD_driver.h"
#include "nrf_log.h"

// Driver command list.
#define CMD_PSR 0x00     // Panel Setting Register
#define CMD_PWR 0x01     // Power Setting Register
#define CMD_POF 0x02     // Power OFF Command
#define CMD_PFS 0x03     // Power OFF Sequence Setting
#define CMD_PON 0x04     // Power ON Command
#define CMD_BTST 0x06    // Booster Soft Start Command
#define CMD_DSLP 0x07    // Deep sleep Command
#define CMD_DTM 0x10     // Display Start Transmission Register
#define CMD_DSP 0x11     // Data Stop Command
#define CMD_DRF 0x12     // Display Refresh Command
#define CMD_AUTO 0x17    // Auto Sequence
#define CMD_PLL 0x30     // PLL control Register
#define CMD_TSC 0x40     // Temperature Sensor Command
#define CMD_TSE 0x41     // Temperature Sensor Calibration Register
#define CMD_TSW 0x42     // Temperature Sensor Write Register
#define CMD_TSR 0x43     // Temperature Sensor Read Register
#define CMD_CDI 0x50     // VCOM and DATA interval setting Register
#define CMD_LPD 0x51     // Lower Power Detection Register
#define CMD_TRES 0x61    // Resolution setting
#define CMD_GSST 0x65    // Gate/Source Start Setting Register
#define CMD_REV 0x70     // REVISION Register
#define CMD_AMV 0x80     // Auto Measure VCOM Register
#define CMD_VV 0x81      // VCOM Value Register
#define CMD_VDCS 0x82    // VCOM_DC Setting Register
#define CMD_PTL 0x83     // Partial Window Register
#define CMD_PGM 0x90     // Program Mode
#define CMD_APG 0x91     // Active Program
#define CMD_RMTP 0x92    // Read MTP Data
#define CMD_PGM_CFG 0xA2 // MTP Program Config Register
#define CMD_CCSET 0xE0   // Cascade Setting
#define CMD_PWS 0xE3     // Power Saving Register
#define CMD_LVSEL 0xE4   // LVD Voltage Select Register

static void JD79xx_WaitBusy(uint16_t timeout)
{
    EPD_WaitBusy(LOW, timeout);
}

static void JD79xx_PowerOn(void)
{
    EPD_WriteCmd(CMD_PON);
    JD79xx_WaitBusy(200);
}

static void JD79xx_PowerOff(void)
{
    EPD_WriteCmd(CMD_POF);
    JD79xx_WaitBusy(200);
}

int8_t JD79xx_Read_Temp(void)
{
    EPD_WriteCmd(CMD_TSC);
    JD79xx_WaitBusy(100);
    return (int8_t)EPD_ReadByte();
}

static void _setPartialRamArea(uint16_t x, uint16_t y, uint16_t w, uint16_t h)
{
    EPD_Write(CMD_PTL,
              x / 256, x % 256,
              (x + w - 1) / 256, (x + w - 1) % 256,
              y / 256, y % 256,
              (y + h - 1) / 256, (y + h - 1) % 256,
              0x01);
}

// Full update: 20s
void JD79xx_Init()
{
    epd_model_t *EPD = epd_get();

    EPD_Reset(HIGH, 50);

    EPD_Write(0x4D, 0x78);
    EPD_Write(CMD_PSR, 0x0F, 0x29);
    EPD_Write(CMD_BTST, 0x0D, 0x12, 0x24, 0x25, 0x12, 0x29, 0x10);
    EPD_Write(CMD_PLL, 0x08);
    EPD_Write(CMD_CDI, 0x37);
    EPD_Write(CMD_TRES,
              EPD->width / 256, EPD->width % 256,
              EPD->height / 256, EPD->height % 256);

    EPD_Write(0xAE, 0xCF);
    EPD_Write(0xB0, 0x13);
    EPD_Write(0xBD, 0x07);
    EPD_Write(0xBE, 0xFE);
    EPD_Write(0xE9, 0x01);

    JD79xx_PowerOn();
}

// Fast update: 12s
void JD79xx_Init_Fast()
{
    epd_model_t *EPD = epd_get();

    EPD_Reset(HIGH, 50);

    EPD_Write(0x4D, 0x78);
    EPD_Write(CMD_PSR, 0x0F, 0x29);
    EPD_Write(CMD_PWR, 0x07, 0x00);
    EPD_Write(CMD_PFS, 0x10, 0x54, 0x44);
    EPD_Write(CMD_BTST, 0x0F, 0x0A, 0x2F, 0x25, 0x22, 0x2E, 0x21);
    EPD_Write(CMD_CDI, 0x37);
    EPD_Write(CMD_TRES,
              EPD->width / 256, EPD->width % 256,
              EPD->height / 256, EPD->height % 256);

    EPD_Write(CMD_PWS, 0x22);
    EPD_Write(0xB6, 0x6F);
    EPD_Write(0xB4, 0xD0);
    EPD_Write(0xE9, 0x01);
    EPD_Write(CMD_PLL, 0x08);

    JD79xx_PowerOn();
    EPD_Write(CMD_CCSET, 0x02);
    EPD_Write(0xE6, 0x5A);
    EPD_Write(0xA5, 0x00);
    JD79xx_WaitBusy(200);
}

static void JD79xx_Refresh(void)
{
    NRF_LOG_DEBUG("[EPD]: refresh begin\n");
    epd_model_t *EPD = epd_get();
    _setPartialRamArea(0, 0, EPD->width, EPD->height);
    EPD_Write(CMD_DRF, 0x00);
    JD79xx_WaitBusy(30000);
    NRF_LOG_DEBUG("[EPD]: refresh end\n");
}

void JD79xx_Clear(bool refresh)
{
    epd_model_t *EPD = epd_get();
    uint32_t ram_bytes = ((EPD->width + 3) / 4) * EPD->height;

    EPD_FillRAM(CMD_DTM, 0x55, ram_bytes);
    if (refresh)
        JD79xx_Refresh();
}

void JD79xx_Write_Image(uint8_t *black, uint8_t *color, uint16_t x, uint16_t y, uint16_t w, uint16_t h)
{
    epd_model_t *EPD = epd_get();
    uint16_t wb = (w + 7) / 8; // width bytes, bitmaps are padded
    x -= x % 8;                // byte boundary
    w = wb * 8;                // byte boundary
    if (x + w > EPD->width || y + h > EPD->height)
        return;

    _setPartialRamArea(x, y, w, h);
    EPD_WriteCmd(CMD_DTM);
    for (uint16_t i = 0; i < h * 2; i++) // 2 bits per pixel
    {
        for (uint16_t j = 0; j < w / 8; j++)
            EPD_WriteByte(black ? black[j + i * wb] : 0x55);
    }
}

void JD79xx_Wite_Ram(bool begin, bool black, uint8_t *data, uint8_t len)
{
    if (begin)
        EPD_WriteCmd(CMD_DTM);
    EPD_WriteData(data, len);
}

void JD79xx_Sleep(void)
{
    JD79xx_PowerOff();
    delay(100);
    EPD_Write(CMD_DSLP, 0xA5); // deep sleep
}

static epd_driver_t epd_drv_JD79668 = {
    .init = JD79xx_Init,
    .clear = JD79xx_Clear,
    .write_image = JD79xx_Write_Image,
    .write_ram = JD79xx_Wite_Ram,
    .refresh = JD79xx_Refresh,
    .sleep = JD79xx_Sleep,
    .read_temp = JD79xx_Read_Temp,
};

// JD79668 400x300 Black/White/Red/Yellow
const epd_model_t epd_jd79668_420 = {
    .id = EPD_JD79668_420_BWRY,
    .color = BWRY,
    .drv = &epd_drv_JD79668,
    .width = 400,
    .height = 300,
};
