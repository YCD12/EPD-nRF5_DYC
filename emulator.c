// GUI emulator for Windows
// This code is a simple Windows GUI application that emulates the display of an e-paper device.
#include <windows.h>
#include <stdint.h>
#include <time.h>
#include <string.h>
#include <wchar.h>
#include "GUI.h"

#define BITMAP_WIDTH   400
#define BITMAP_HEIGHT  300
#define WINDOW_WIDTH   450
#define WINDOW_HEIGHT  380

// Global variables
HINSTANCE g_hInstance;
HWND g_hwnd;
HDC g_paintHDC = NULL;
display_mode_t g_display_mode = MODE_CALENDAR; // Default to calendar mode
BOOL g_bwr_mode = TRUE;  // Default to BWR mode
uint8_t g_week_start = 0; // Default week start (0=Sunday, 1=Monday, etc.)
time_t g_display_time;
struct tm g_tm_time;

// Implementation of the buffer_callback function
void DrawBitmap(void *user_data, uint8_t *black, uint8_t *color, uint16_t x, uint16_t y, uint16_t w, uint16_t h) {
    HDC hdc = g_paintHDC;
    if (!hdc) return;
    
    RECT clientRect;
    int scale = 1;
    
    // Get client area for positioning
    GetClientRect(g_hwnd, &clientRect);
    
    // Calculate position to center the entire bitmap in the window
    int drawX = (clientRect.right - BITMAP_WIDTH * scale) / 2;
    int drawY = (clientRect.bottom - BITMAP_HEIGHT * scale) / 2;
    
    // Use 4-bit approach (16 colors, but we only use 3)
    BITMAPINFO bmi;
    ZeroMemory(&bmi, sizeof(BITMAPINFO));
    bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth = w;
    bmi.bmiHeader.biHeight = -h; // Negative for top-down bitmap
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 4; // 4 bits per pixel
    bmi.bmiHeader.biCompression = BI_RGB;
    bmi.bmiHeader.biClrUsed = 16; // 16 colors (2^4)
    
    // Initialize all 16 palette entries to white first
    for (int i = 0; i < 16; i++) {
        bmi.bmiColors[i].rgbBlue = 255;
        bmi.bmiColors[i].rgbGreen = 255;
        bmi.bmiColors[i].rgbRed = 255;
        bmi.bmiColors[i].rgbReserved = 0;
    }
    
    // Set specific colors for our pixel values
    // Color 0: White
    bmi.bmiColors[0].rgbBlue = 255;
    bmi.bmiColors[0].rgbGreen = 255;
    bmi.bmiColors[0].rgbRed = 255;
    
    // Color 1: Black
    bmi.bmiColors[1].rgbBlue = 0;
    bmi.bmiColors[1].rgbGreen = 0;
    bmi.bmiColors[1].rgbRed = 0;
    
    // Color 2: Red
    bmi.bmiColors[2].rgbBlue = 0;
    bmi.bmiColors[2].rgbGreen = 0;
    bmi.bmiColors[2].rgbRed = 255;
    
    // Create 4-bit bitmap data
    // Each byte contains 2 pixels (4 bits each)
    int pixelsPerByte = 2;
    int bytesPerRow = ((w + pixelsPerByte - 1) / pixelsPerByte);
    // Align to DWORD boundary (4 bytes)
    bytesPerRow = ((bytesPerRow + 3) / 4) * 4;
    int totalSize = bytesPerRow * h;
    
    uint8_t *bitmap4bit = (uint8_t*)malloc(totalSize);
    if (!bitmap4bit) {
        return;
    }
    memset(bitmap4bit, 0, totalSize); // Initialize to white (0)
    
    int ePaperBytesPerRow = (w + 7) / 8;
    for (int row = 0; row < h; row++) {
        for (int col = 0; col < w; col++) {
            int bytePos = row * ePaperBytesPerRow + col / 8;
            int bitPos = 7 - (col % 8);
            
            int blackBit = !((black[bytePos] >> bitPos) & 0x01);
            int colorBit = color ? !((color[bytePos] >> bitPos) & 0x01) : 0;
            
            // Determine pixel value: 0=white, 1=black, 2=red
            uint8_t pixelValue = colorBit ? 2 : (blackBit ? 1 : 0);
            
            // Pack into 4-bit format
            // Each byte stores 2 pixels: [pixel0][pixel1]
            // High nibble = first pixel, low nibble = second pixel
            int bitmap4bitBytePos = row * bytesPerRow + col / pixelsPerByte;
            int isHighNibble = (col % pixelsPerByte) == 0;
            
            if (isHighNibble) {
                // Clear high nibble and set new value
                bitmap4bit[bitmap4bitBytePos] &= 0x0F;
                bitmap4bit[bitmap4bitBytePos] |= (pixelValue << 4);
            } else {
                // Clear low nibble and set new value
                bitmap4bit[bitmap4bitBytePos] &= 0xF0;
                bitmap4bit[bitmap4bitBytePos] |= pixelValue;
            }
        }
    }
    
    // Draw the bitmap
    StretchDIBits(hdc,
                 drawX + x * scale, drawY + y * scale,
                 w * scale, h * scale,
                 0, 0, w, h,
                 bitmap4bit, &bmi,
                 DIB_RGB_COLORS, SRCCOPY);
    
    free(bitmap4bit);
}

// Window procedure
LRESULT CALLBACK WndProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
        case WM_CREATE:
            // Initialize the display time
            g_display_time = time(NULL) + 8*3600;
            // Set a timer to update the CLOCK periodically (every second)
            SetTimer(hwnd, 1, 1000, NULL);
            return 0;

        case WM_TIMER:
            if (g_display_mode == MODE_CLOCK) {
                g_display_time = time(NULL) + 8*3600;
                if (g_display_time % 60 == 0) {
                    InvalidateRect(hwnd, NULL, FALSE);
                }
            }
            return 0;

        case WM_PAINT: {
            PAINTSTRUCT ps;
            HDC hdc = BeginPaint(hwnd, &ps);
            
            // Set the global HDC for DrawBitmap to use
            g_paintHDC = hdc;
            
            // Get client rect for calculations
            RECT clientRect;
            GetClientRect(hwnd, &clientRect);

            // Clear the entire client area with a solid color
            HBRUSH bgBrush = CreateSolidBrush(RGB(240, 240, 240));
            FillRect(hdc, &clientRect, bgBrush);
            DeleteObject(bgBrush);
            
            // Calculate border position (same as bitmap position)
            int scale = 1;
            int drawX = (clientRect.right - BITMAP_WIDTH * scale) / 2;
            int drawY = (clientRect.bottom - BITMAP_HEIGHT * scale) / 2;
            
            // Draw border around the bitmap area
            HPEN borderPen = CreatePen(PS_DOT, 1, RGB(0, 0, 255));
            HPEN oldPen = SelectObject(hdc, borderPen);
            HBRUSH oldBrush = SelectObject(hdc, GetStockObject(NULL_BRUSH)); // No fill
            
            Rectangle(hdc, drawX - 1, drawY - 1, 
                     drawX + BITMAP_WIDTH * scale + 1, 
                     drawY + BITMAP_HEIGHT * scale + 1);
            
            SelectObject(hdc, oldPen);
            SelectObject(hdc, oldBrush);
            DeleteObject(borderPen);
            
            // Display current mode at the top of the bitmap
            const wchar_t* modeText = (g_display_mode == MODE_CLOCK) ? L"时钟模式" : L"日历模式";
            int modeTextY = drawY - 20; // Above the bitmap
            SetTextColor(hdc, RGB(50, 50, 50));
            SetBkMode(hdc, TRANSPARENT);
            
            // Create a font for mode text
            HFONT modeFont = CreateFont(
                16, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE,
                DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                DEFAULT_QUALITY, DEFAULT_PITCH | FF_SWISS, "Arial"
            );
            HFONT oldFont = SelectObject(hdc, modeFont);
            
            // Calculate text width for centering mode text
            SIZE modeTextSize;
            GetTextExtentPoint32W(hdc, modeText, wcslen(modeText), &modeTextSize);
            int modeCenteredX = drawX + (BITMAP_WIDTH - modeTextSize.cx) / 2;
            
            TextOutW(hdc, modeCenteredX, modeTextY, modeText, wcslen(modeText));
            
            // Draw help text below the bitmap
            const wchar_t helpText[] = L"空格 - 切换模式 | R - 切换颜色 | W - 星期起点 | 方向键 - 调整日期/月份";
            int helpTextY = drawY + BITMAP_HEIGHT * scale + 5;
            SetTextColor(hdc, RGB(80, 80, 80));
            
            // Create a smaller font for help text
            HFONT helpFont = CreateFont(
                14, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
                DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                DEFAULT_QUALITY, DEFAULT_PITCH | FF_SWISS, "Arial"
            );
            SelectObject(hdc, modeFont);
            DeleteObject(modeFont);
            SelectObject(hdc, helpFont);
            
            // Calculate text width for centering help text
            SIZE textSize;
            GetTextExtentPoint32W(hdc, helpText, wcslen(helpText), &textSize);
            int centeredX = drawX + (BITMAP_WIDTH - textSize.cx) / 2;
            
            TextOutW(hdc, centeredX, helpTextY, helpText, wcslen(helpText));
            
            SelectObject(hdc, oldFont);
            DeleteObject(helpFont);
            
            // Use the stored timestamp
            gui_data_t data = {
                .mode            = g_display_mode,
                .color           = g_bwr_mode ? 2 : 1,
                .width           = BITMAP_WIDTH,
                .height          = BITMAP_HEIGHT,
                .timestamp       = g_display_time,
                .week_start      = g_week_start,
                .temperature     = 25,
                .voltage         = 3.2f,
                .ssid            = "NRF_EPD_84AC",
            };
            
            // Call DrawGUI to render the interface
            DrawGUI(&data, DrawBitmap, NULL);
            
            // Clear the global HDC
            g_paintHDC = NULL;
            
            EndPaint(hwnd, &ps);
            return 0;
        }
        
        case WM_KEYDOWN:
            // Toggle display mode with spacebar
            if (wParam == VK_SPACE) {
                if (g_display_mode == MODE_CLOCK)
                    g_display_mode = MODE_CALENDAR;
                else
                    g_display_mode = MODE_CLOCK;
                
                InvalidateRect(hwnd, NULL, TRUE);
            }
            // Toggle BWR mode with R key
            else if (wParam == 'R') {
                g_bwr_mode = !g_bwr_mode;
                InvalidateRect(hwnd, NULL, TRUE);
            }
            // Increase week start with W key
            else if (wParam == 'W') {
                g_week_start++;
                if (g_week_start > 6) g_week_start = 0; // Wrap around
                InvalidateRect(hwnd, NULL, TRUE);
            }
            // Handle arrow keys for month/day adjustment
            else if (wParam == VK_UP || wParam == VK_DOWN || wParam == VK_LEFT || wParam == VK_RIGHT) {
                // Get the current time structure
                g_tm_time = *localtime(&g_display_time);
                
                // Up/Down adjusts month
                if (wParam == VK_UP) {
                    g_tm_time.tm_mon++;
                    if (g_tm_time.tm_mon > 11) {
                        g_tm_time.tm_mon = 0;
                        g_tm_time.tm_year++;
                    }
                }
                else if (wParam == VK_DOWN) {
                    g_tm_time.tm_mon--;
                    if (g_tm_time.tm_mon < 0) {
                        g_tm_time.tm_mon = 11;
                        g_tm_time.tm_year--;
                    }
                }
                // Left/Right adjusts day
                else if (wParam == VK_RIGHT) {
                    g_tm_time.tm_mday++;
                }
                else if (wParam == VK_LEFT) {
                    g_tm_time.tm_mday--;
                }
                
                // Convert back to time_t
                g_display_time = mktime(&g_tm_time);
                
                // Force redraw
                InvalidateRect(hwnd, NULL, TRUE);
            }
            return 0;
            
        case WM_DESTROY:
            KillTimer(hwnd, 1);
            PostQuitMessage(0);
            return 0;
            
        default:
            return DefWindowProcW(hwnd, message, wParam, lParam);
    }
}

// Main entry point
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    g_hInstance = hInstance;
    
    // Register window class
    WNDCLASSW wc = {0};
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW+1);
    wc.lpszClassName = L"Emurator";
    
    if (!RegisterClassW(&wc)) {
        MessageBoxW(NULL, L"Window Registration Failed!", L"Error", MB_ICONEXCLAMATION | MB_OK);
        return 0;
    }

    // Create the window
    g_hwnd = CreateWindowW(
        L"Emurator",
        L"模拟器",
        WS_POPUPWINDOW | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX,
        CW_USEDEFAULT, CW_USEDEFAULT,
        WINDOW_WIDTH, WINDOW_HEIGHT,
        NULL, NULL, hInstance, NULL
    );
    
    if (!g_hwnd) {
        MessageBoxW(NULL, L"Window Creation Failed!", L"Error", MB_ICONEXCLAMATION | MB_OK);
        return 0;
    }
    
    // Show window
    ShowWindow(g_hwnd, nCmdShow);
    UpdateWindow(g_hwnd);
    
    // Main message loop
    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
    
    return (int)msg.wParam;
}