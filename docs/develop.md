## 开发

> **注意:**
> - 推荐使用 [Keil 5.36](https://img.anfulai.cn/bbs/96992/MDK536.EXE) 或以下版本（如遇到 pack 无法下载，可到群文件下载）
> - `sdk10` 分支为旧版 SDK 代码，蓝牙协议栈占用的空间小一些，用于支持 128K Flash 芯片（不再更新）

这里以 nRF51 版本项目为例 (`Keil/EPD-nRF51.uvprojx`)，项目配置有几个 `Target`：

- `nRF51822_xxAA`: 用于编译 256K Flash 固件
- `flash_softdevice`: 刷蓝牙协议栈用（只需刷一次）

烧录器可以使用 J-Link 或者 DAPLink（可使用 [RTTView](https://github.com/XIVN1987/RTTView) 查看 RTT 日志）。

**刷机流程:**

> **注意:** 这是自己编译代码的刷机流程。如不改代码，强烈建议到 [Releases](https://github.com/tsl0922/EPD-nRF5/releases) 下载编译好的固件，**不需要单独下载蓝牙协议栈**，且有 [刷机教程](https://b23.tv/AaphIZp) （没有 Keil 开发经验的，请不要给自己找麻烦去编译）

1. 全部擦除 (Keil 擦除后刷不了的话，使用烧录器的上位机软件擦除试试)
2. 切换到 `flash_softdevice`，下载蓝牙协议栈，**不要编译直接下载**（只需刷一次）
3. 切换到 `nRF51822_xxAA`，先编译再下载

### 晶振配置

本项目默认都没有使用外部低速晶振 (频率: `32.768kHz`)，因为不是所有的板子都有这个晶振，没有低速晶振的板子刷了开启低速晶振的固件是运行不起来的。
如果你的板子有外部低速晶振，建议修改为使用外部晶振，这样时钟走时会更准确一些。以下是修改方法：

**nRF51**

修改 `main.c`:

```c
#define NRF_CLOCK_LFCLKSRC      {.source        = NRF_CLOCK_LF_SRC_XTAL,             \
                                 .rc_ctiv       = 0,                                 \
                                 .rc_temp_ctiv  = 0,                                 \
                                 .xtal_accuracy = NRF_CLOCK_LF_XTAL_ACCURACY_20_PPM}
```
**nRF52**

修改 `sdk_config.h`:

```c
#define NRF_SDH_CLOCK_LF_SRC 1
#define NRF_SDH_CLOCK_LF_RC_CTIV 0
#define NRF_SDH_CLOCK_LF_RC_TEMP_CTIV 0
#define NRF_SDH_CLOCK_LF_ACCURACY 7
```

### 模拟器

本项目提供了一个可在 Windows 下运行界面代码的模拟器，修改了界面代码后无需下载到单片机即可查看效果。

仿真效果图：

![](images/4.jpg)


**编译方法：**

下载并安装 [MSYS2](https://www.msys2.org) 后，打开 `MSYS2 MINGW64` 命令窗口执行以下命令安装依赖：

```bash
pacman -Syu
pacman -S make mingw-w64-x86_64-gcc
```

然后 cd 到项目目录，执行 `make -f Makefile.win32` 即可编译出模拟器的可执行文件。

**修改界面：**

修改 GUI 目录下的代码后，重新执行上面的 make 命令编译即可。

> **注意:** GUI 目录下的代码不可依赖平台相关的东西，比如单片机特有的 API 接口，否则在 Windows 下编译会失败。正确的做法是：在调用 `DrawGUI(gui_data_t *data, buffer_callback draw, display_mode_t mode)` 函数前就把数据算好并放到 `gui_data_t` 里，然后通过 `data` 参数传进去。
