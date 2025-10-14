/**
 * Based on GDEH042Z96 driver from Good Display
 * https://www.good-display.com/product/214.html
 */
#include "EPD_driver.h"
#include "nrf_log.h"

// Driver command list.
#define CMD_GDO_CTR 0x01            // Driver Output control
#define CMD_GDV_CTRL 0x03           // Gate Driving voltage Control
#define CMD_SDV_CTRL 0x04           // Source Driving voltage Control
#define CMD_SOFTSTART 0x0C          // Booster Soft start Control
#define CMD_GSCAN_START 0x0F        // Gate scan start position
#define CMD_SLEEP_MODE 0x10         // Deep Sleep mode
#define CMD_ENTRY_MODE 0x11         // Data Entry mode setting
#define CMD_SW_RESET 0x12           // SW RESET
#define CMD_HV_RD_DETECT 0x14       // HV Ready Detection
#define CMD_VCI_DETECT 0x15         // VCI Detection
#define CMD_TSENSOR_CTRL 0x18       // Temperature Sensor Control
#define CMD_TSENSOR_WRITE 0x1A      // Temperature Sensor Control (Write to temperature register)
#define CMD_TSENSOR_READ 0x1B       // Temperature Sensor Control (Read from temperature register)
#define CMD_TSENSOR_WRITE_EXT 0x1C  // Temperature Sensor Control (Write Command to External temperature sensor)
#define CMD_MASTER_ACTIVATE 0x20    // Master Activation
#define CMD_DISP_CTRL1 0x21         // Display Update Control 1
#define CMD_DISP_CTRL2 0x22         // Display Update Control 2
#define CMD_WRITE_RAM1 0x24         // Write RAM (BW)
#define CMD_WRITE_RAM2 0x26         // Write RAM (RED)
#define CMD_READ_RAM 0x27           // Read RAM
#define CMD_VCOM_SENSE 0x28         // VCOM Sense
#define CMD_VCOM_SENSE_DURATON 0x29 // VCOM Sense Duration
#define CMD_PRGM_VCOM_OTP 0x2A      // Program VCOM OTP
#define CMD_VCOM_CTRL 0x2B          // Write Register for VCOM Control
#define CMD_VCOM_VOLTAGE 0x2C       // Write VCOM register
#define CMD_READ_OTP_REG 0x2D       // OTP Register Read for Display Option
#define CMD_READ_USER_ID 0x2E       // User ID Read
#define CMD_READ_STATUS 0x2F        // Status Bit Read
#define CMD_PRGM_WS_OTP 0x30        // Program WS OTP
#define CMD_LOAD_WS_OTP 0x31        // Load WS OTP
#define CMD_WRITE_LUT 0x32          // Write LUT register
#define CMD_READ_LUT 0x33           // Read LUT
#define CMD_CRC_CALC 0x34           // CRC calculation
#define CMD_CRC_STATUS 0x35         // CRC Status Read
#define CMD_PRGM_OTP_SELECTION 0x36 // Program OTP selection
#define CMD_OTP_SELECTION_CTRL 0x37 // Write OTP selection
#define CMD_USER_ID_CTRL 0x38       // Write Register for User ID
#define CMD_OTP_PROG_MODE 0x39      // OTP program mode
#define CMD_DUMMY_LINE 0x3A         // Set dummy line period
#define CMD_GATE_LINE_WIDTH 0x3B    // Set Gate line width
#define CMD_BORDER_CTRL 0x3C        // Border Waveform Control
#define CMD_RAM_READ_CTRL 0x41      // Read RAM Option
#define CMD_RAM_XPOS 0x44           // Set RAM X - address Start / End position
#define CMD_RAM_YPOS 0x45           // Set Ram Y- address Start / End position
#define CMD_AUTO_WRITE_RED_RAM 0x46 // Auto Write RED RAM for Regular Pattern
#define CMD_AUTO_WRITE_BW_RAM 0x47  // Auto Write B/W RAM for Regular Pattern
#define CMD_RAM_XCOUNT 0x4E         // Set RAM X address counter
#define CMD_RAM_YCOUNT 0x4F         // Set RAM Y address counter
#define CMD_ANALOG_BLOCK_CTRL 0x74  // Set Analog Block Control
#define CMD_DIGITAL_BLOCK_CTRL 0x7E // Set Digital Block Control
#define CMD_NOP 0x7F                // NOP

static void SSD16xx_WaitBusy(uint16_t timeout)
{
    EPD_WaitBusy(HIGH, timeout);
}

static void SSD16xx_Update(uint8_t seq)
{
    EPD_Write(CMD_DISP_CTRL2, seq);
    EPD_WriteCmd(CMD_MASTER_ACTIVATE);
}

int8_t SSD16xx_Read_Temp(void)
{
    SSD16xx_Update(0xB1);
    SSD16xx_WaitBusy(500);
    EPD_WriteCmd(CMD_TSENSOR_READ);
    return (int8_t)EPD_ReadByte();
}

static void _setPartialRamArea(uint16_t x, uint16_t y, uint16_t w, uint16_t h)
{
    epd_model_t *EPD = epd_get();

    EPD_Write(CMD_ENTRY_MODE, 0x03); // set ram entry mode: x increase, y increase
    if (EPD->id == EPD_SSD1677_750_HD_BW || EPD->id == EPD_SSD1677_750_HD_BWR) {
        EPD_Write(CMD_RAM_XPOS,
                  x % 256, x / 256,
                  (x + w - 1) % 256,
                  (x + w - 1) / 256);
        EPD_Write(CMD_RAM_XCOUNT, x % 256, x / 256);
    } else {
        EPD_Write(CMD_RAM_XPOS, x / 8, (x + w - 1) / 8);
        EPD_Write(CMD_RAM_YPOS,
                  y % 256, y / 256,
                  (y + h - 1) % 256,
                  (y + h - 1) / 256);
        EPD_Write(CMD_RAM_XCOUNT, x / 8);
    }
    EPD_Write(CMD_RAM_YPOS,
                  y % 256, y / 256,
                  (y + h - 1) % 256,
                  (y + h - 1) / 256);
    EPD_Write(CMD_RAM_YCOUNT, y % 256, y / 256);
}

void SSD16xx_Dump_LUT(void)
{
    uint8_t lut[128];

    EPD_WriteCmd(CMD_READ_LUT);
    EPD_ReadData(lut, sizeof(lut));

    NRF_LOG_DEBUG("=== LUT BEGIN ===\n");
    NRF_LOG_HEXDUMP_DEBUG(lut, sizeof(lut));
    NRF_LOG_DEBUG("=== LUT END ===\n");
}

void SSD16xx_Init()
{
    epd_model_t *EPD = epd_get();

    EPD_Reset(HIGH, 10);

    EPD_WriteCmd(CMD_SW_RESET);
    SSD16xx_WaitBusy(200);

    EPD_Write(CMD_BORDER_CTRL, 0x01);
    EPD_Write(CMD_TSENSOR_CTRL, 0x80);

    _setPartialRamArea(0, 0, EPD->width, EPD->height);
}

static void SSD16xx_Refresh(void)
{
    epd_model_t *EPD = epd_get();

    EPD_Write(CMD_DISP_CTRL1, EPD->color == BWR ? 0x80 : 0x40, 0x00);

    NRF_LOG_DEBUG("[EPD]: refresh begin\n");
    NRF_LOG_DEBUG("[EPD]: temperature: %d\n", SSD16xx_Read_Temp());
    SSD16xx_Update(0xF7);
    SSD16xx_WaitBusy(30000);
    NRF_LOG_DEBUG("[EPD]: refresh end\n");

//    SSD16xx_Dump_LUT();

    _setPartialRamArea(0, 0, EPD->width, EPD->height); // DO NOT REMOVE!
    SSD16xx_Update(0x83);                              // power off
}

void SSD16xx_Clear(bool refresh)
{
    epd_model_t *EPD = epd_get();
    uint32_t ram_bytes = ((EPD->width + 7) / 8) * EPD->height;

    _setPartialRamArea(0, 0, EPD->width, EPD->height);

    EPD_FillRAM(CMD_WRITE_RAM1, 0xFF, ram_bytes);
    EPD_FillRAM(CMD_WRITE_RAM2, 0xFF, ram_bytes);

    if (refresh)
        SSD16xx_Refresh();
}

void SSD16xx_Write_Image(uint8_t *black, uint8_t *color, uint16_t x, uint16_t y, uint16_t w, uint16_t h)
{
    epd_model_t *EPD = epd_get();
    uint16_t wb = (w + 7) / 8; // width bytes, bitmaps are padded
    x -= x % 8;                // byte boundary
    w = wb * 8;                // byte boundary
    if (x + w > EPD->width || y + h > EPD->height)
        return;

    _setPartialRamArea(x, y, w, h);
    EPD_WriteCmd(CMD_WRITE_RAM1);
    for (uint16_t i = 0; i < h; i++)
    {
        for (uint16_t j = 0; j < w / 8; j++)
            EPD_WriteByte(black ? black[j + i * wb] : 0xFF);
    }
    EPD_WriteCmd(CMD_WRITE_RAM2);
    for (uint16_t i = 0; i < h; i++)
    {
        for (uint16_t j = 0; j < w / 8; j++)
        {
            if (EPD->color == BWR)
                EPD_WriteByte(color ? color[j + i * wb] : 0xFF);
            else
                EPD_WriteByte(black[j + i * wb]);
        }
    }
}

void SSD16xx_Write_Ram(uint8_t cfg, uint8_t *data, uint8_t len)
{
    bool begin = (cfg >> 4) == 0x00;
    bool black = (cfg & 0x0F) == 0x0F;
    if (begin) {
        epd_model_t *EPD = epd_get();
        if (EPD->color == BWR)
            EPD_WriteCmd(black ? CMD_WRITE_RAM1 : CMD_WRITE_RAM2);
        else
            EPD_WriteCmd(CMD_WRITE_RAM1);
    }
    EPD_WriteData(data, len);
}

void SSD16xx_Sleep(void)
{
    EPD_Write(CMD_SLEEP_MODE, 0x01);
    delay(100);
}

static epd_driver_t epd_drv_ssd1619 = {
    .init = SSD16xx_Init,
    .clear = SSD16xx_Clear,
    .write_image = SSD16xx_Write_Image,
    .write_ram = SSD16xx_Write_Ram,
    .refresh = SSD16xx_Refresh,
    .sleep = SSD16xx_Sleep,
    .read_temp = SSD16xx_Read_Temp,
};

// SSD1619 400x300 Black/White/Red
const epd_model_t epd_ssd1619_420_bwr = {
    .id = EPD_SSD1619_420_BWR,
    .color = BWR,
    .drv = &epd_drv_ssd1619,
    .width = 400,
    .height = 300,
};

// SSD1619 400x300 Black/White
const epd_model_t epd_ssd1619_420_bw = {
    .id = EPD_SSD1619_420_BW,
    .color = BW,
    .drv = &epd_drv_ssd1619,
    .width = 400,
    .height = 300,
};

// SSD1677 880x528 Black/White/Red
const epd_model_t epd_ssd1677_750_bwr = {
    .id = EPD_SSD1677_750_HD_BWR,
    .color = BWR,
    .drv = &epd_drv_ssd1619,
    .width = 880,
    .height = 528,
};

// SSD1677 880x528 Black/White
const epd_model_t epd_ssd1677_750_bw = {
    .id = EPD_SSD1677_750_HD_BW,
    .color = BW,
    .drv = &epd_drv_ssd1619,
    .width = 880,
    .height = 528,
};
