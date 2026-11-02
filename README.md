# EPD-nRF5_DYC — 鸿蒙墨水屏控制台

本仓库是一个面向 **7.5 寸三色 UC8179（驱动 07）** 墨水屏的固件与鸿蒙控制台工程：保留 nRF5 墨水屏固件底座，并新增 HarmonyOS NEXT（ArkTS / API 12）控制台 App、Nordic Secure DFU 升级流程与配套文档。

- 默认分支 `Tmp`：nRF52 固件底座、面板驱动、GUI 与 DFU 工具链。
- 分支 `feat/harmony-epdconsole`：鸿蒙 App、安装/DFU 文档与测试，以 PR 形式提交。
- Releases：未签名 HAP、升级 OTA、`SHA256SUMS.txt`。仓库不含任何私钥、证书或 profile。

> 本仓库是 `YCD12/EPD-nRF5_DYC` 的 fork；固件底座沿用其 nRF5 工程及上游 `tsl0922/EPD-nRF5` 的基础。鸿蒙 App、文档、测试与发布包是本仓库新增的内容。代码按 GPL-3.0 分发。

## 功能

### 鸿蒙 App

- BLE 扫描与连接：按服务/名称过滤，也支持全量列表；支持自动连接、直连 MAC、读取固件版本、订阅通知、连接后按设备配置选择驱动/画布尺寸/颜色。
- 设备控制：写入驱动与引脚（`0x00` + `0x01`）、星期起始（`0x21`）、日历/时钟/相册模式（`0x20`）、清屏（`0x02`）、原始十六进制命令。
- 图片处理：裁剪（默认按设备比例，支持拖拽边/角）、拉伸/裁剪填充/适应留白、旋转/镜像/翻转、亮度/伽马/饱和/对比度、抖动（线性光 + 蛇形扫描）、黑白/三色/四色打包；`UC8159`（驱动 08/09）2bpp 重排；导出 `imagedata.h`。
- 传输：CRC16 分块传输（固件 ≥ 0x20）与传统 `0x30` 传输（< 0x20）；MTU/确认间隔可调，进度与日志显示。
- 固件升级：Nordic Secure DFU（`.zip`：manifest + `EPD-nRF52.bin` + `EPD-nRF52.dat`）；校验 `hw_version=0x34`、`sd_req=0x126`、文件名与设备型号；支持 buttonless 进入 Bootloader、断点续传、对象级重试。
- 连接状态码：App 与固件使用 `70 00/01/02`（IDLE/HOLD/TRANSFER）与 `B0 <state>` ACK；HOLD 每 15 秒心跳，连续 2 次无回复断开；HOLD 握手失败时重试一次，仍失败则进入兼容模式并保持连接。
- 相册模式低功耗：固件 0x24 起（0x26 修复链接布局）每 60 秒开放约 2 秒广播窗口；App 扫描 70 秒、连接超时 75 秒，连接建立后窗口停止，保持正常连接。

### 固件

- 平台：`nRF52811` / `nRF52810`，SoftDevice `S112 7.3.0`（`sd_req 0x126`），`hw_version 0x34`。
- 面板驱动：`UC8176` / `UC8179` / `SSD16xx` / `UC8159` / `JD79668` 等黑白/三色/四色型号；当前发布包针对 **7.5 寸三色 UC8179（驱动 07，800×480）**。
- GUI：日历（月历、农历、节气、节假日）、时钟、相册（图片）；相册模式停 1 Hz 时钟定时器。
- 配置：驱动/引脚/显示模式/星期起始保存在 DFU 预留页（`0x27000`，带魔数与字段校验）；非法或 4.2 寸型号配置会回退到 7.5 寸默认配置，避免错误驱动阻塞主循环。
- 升级：DFU 区 `0x19000..0x27000`（约 57,344 字节），镜像超限会在 init 包 EXECUTE 阶段返回 `INSUFFICIENT_RESOURCES`；当前 7.5 寸镜像约 54–55 KB。
- 广播：相册模式 60 秒周期 / 约 2 秒窗口；其他模式持续广播；断开后自动回到窗口。看门狗在空闲与刷屏 busy 等待中持续喂狗。
- 电池：4×CR2450（约 2,400 mAh）；相册模式窗口 + 停 1 Hz 时平均约 1–3 µA，实际寿命主要受 CR2450 自放电/保存寿命限制，约 5–10 年（保守 3–8 年）；连接/传图时电流更高。

## 仓库结构

```
EPD/                 nRF5 墨水屏固件：BLE 服务、面板驱动、配置
GUI/                 日历/时钟/相册界面与字体
SDK/                 nRF5 SDK 17.1.0、S112 7.3.0
tools/               nrfutil/mergehex、bootloader、OTA 脚本
html/                历史浏览器上位机（保留）
Keil/                Keil 工程（可选）
main.c               固件入口、BLE 事件、广播/连接/看门狗
Makefile.nRF52       GCC 构建入口（另有 nRF51/win32 变体）
emulator.c           GUI 的 PC 模拟器
harmony/EPDConsole/  鸿蒙 App（仅 feat/harmony-epdconsole 分支）
  entry/src/main/ets/common/    BLE、DFU、协议、抖动、图片、固件包
  entry/src/main/ets/pages/     连接/模式/传图/设置、图片编辑、固件升级
  docs/INSTALL.md               安装与签名
  docs/dfu-official-research.md DFU 官方流程核对
  test/                         抖动/协议逐字节对拍脚本
  firmware-lowpower.md          相册模式低功耗设计记录
```

## 构建

### 固件

前置：nRF5 SDK 17.1.0、S112 7.3.0、`arm-none-eabi-gcc`。在仓库根目录执行：

```bash
mingw32-make -j4          # 或 make -f Makefile.nRF52
```

产物为 `_build/nrf52811_xxaa.bin` / `.hex`。生成 OTA：

```bat
tools\make-ota-nrf52.bat _build\nrf52811_xxaa
```

脚本使用 `tools/bin/nrfutil.exe`（6.1.7）、`tools/priv.pem`、`--hw-version 52 --sd-req 0x126 --sd-id 0x126`，并用 `mergehex` 生成 full hex。脚本输出文件名跟随输入 HEX 的 basename；正式交付时以 `EPD-nRF52.hex` 为输入，包内为 `EPD-nRF52.bin`、`EPD-nRF52.dat`、`manifest.json`。

### 鸿蒙 App

前置：OpenHarmony SDK API 12、JDK 17、Node 24。

```bat
cd harmony\EPDConsole
build.bat
```

或使用 hvigor：

```bash
node node_modules/@ohos/hvigor/bin/hvigor.js assembleHap --mode module \
  -p product=default -p buildMode=debug --no-daemon
```

产物：`entry/build/default/outputs/default/entry-default-unsigned.hap`。

## 使用

1. **安装 App**：Release 中的 HAP 未签名。HarmonyOS NEXT 商用设备请用「小白安装助手」或 DevEco Studio，配合自己的华为开发者证书/profile 签名后安装；包名 `com.dyc.epdconsole`。仓库不提供证书或私钥。
2. **连接**：打开 App，授予附近设备/蓝牙权限；相册模式下设备每 60 秒广播约 2 秒，App 会扫描 70 秒并等待连接（最长 75 秒）。连接后发送 HOLD，收到 ACK 后进入就绪；失败时进入兼容模式保持连接。
3. **传图**：选择图片，调整适配/抖动/颜色，发送；App 使用 CRC16 分块传输并在完成后发送 REFRESH。
4. **固件升级**：设置 → 固件升级 → 选择 OTA `.zip`；确认 `hw=0x34`、`sd_req=0x126`、7.5 寸三色型号与电量后开始。升级期间保持供电；失败可重试或使用不低于当前版本的 OTA（厂商 0x19 可能被防降级拒绝）。
5. **电池**：使用 4 颗同品牌新 CR2450；不要使用 0x92 深睡（本设备没有可用唤醒源，深睡后会无法连接）。

## BLE 协议

- Service：`62750001-d828-918d-fb46-b6c11c675aec`
- 数据特征：`62750002-…`；版本特征：`62750003-…`
- 常用命令：`0x20` 时间/模式、`0x21` 星期起始、`0x30–0x33` 图片块、`0x02` 清屏、`0x90–0x92` 电源/深睡、`0x99` 原始命令、`0x70` 链路状态（`00/01/02`）、`0xB0` 状态 ACK。
- 图片块 CRC16-CCITT：poly `0x8408`，init `0xFFFF`，仅 payload。
- DFU：Nordic Secure DFU Service `0xFE59`，控制点 `8EC90001`、数据点 `8EC90002`、buttonless `8EC90003`；App 模式使用 indication，Bootloader 使用 notification；CRC32 为整包累计值，对象 4096 字节对齐（末对象除外）。

## 发布与签名

- Release 资产：`EPDConsole-unsigned.hap`、`EPD-nRF52-7.5-ota*.zip`、`SHA256SUMS.txt`。
- 固件版本以 OTA 包内 init 的 `fw_version` 为准；当前升级包按 7.5 寸三色驱动 07 构建。
- HAP 不含签名；商用设备必须使用自己的华为开发者证书/profile。详细步骤见 `harmony/EPDConsole/docs/INSTALL.md`。
- 仓库和 Release 不包含任何私钥、证书或 profile。

## 兼容性与限制

- 当前发布固件仅针对 **7.5 寸三色 UC8179（驱动 07，800×480）**；其他尺寸/颜色需匹配对应驱动与固件。
- DFU 区上限约 57,344 字节；超限包会在 init 阶段被拒绝。
- 相册模式的 60 秒广播窗口意味着首次连接/重连最多需要约 1 分钟扫描 + 约 1 分钟连接；连接建立后不受影响。
- 未签名 HAP 无法直接在 HarmonyOS NEXT 商用设备安装；请使用自己的证书/profile。
- 电池寿命为估算值，实际取决于电池自放电、温度、连接/刷新频率；准确电流需用 PPK2 实测。

## 许可与来源

- 代码按 **GPL-3.0** 分发，不提供任何担保。
- 本仓库为 `YCD12/EPD-nRF5_DYC` 的 fork；固件底座源自其 nRF5 工程及 `tsl0922/EPD-nRF5`。鸿蒙 App、文档与发布包为本仓库新增。

## 0x26 修正状态（2026-11-02）

故障交付固件为 **0x26**。修正 App 收到 buttonless 响应后立即主动断开的时序，改为等待设备断开再扫描 DfuTarg。2026-11-02 实机在约 5.2 秒后收到断开事件，第一轮扫描发现并连接 DfuTarg，11:09:56 完成固件传输；**升级后未回连，设备持续快速闪灯，连接验收未通过，当前不建议刷入此包**。A/B 结果支持过早主动断开是故障因素，但未捕获设备端 HVC，不能断言具体内部失败环节。此前“0x20 必须先 SWD 烧入”的结论已撤回，本次传输未使用 SWD。

App 1.0.2 的新构建等待设备主动断开后再扫描，恢复 DfuTarg 服务与名称过滤，并包含三色 Web 算法、预览 R/B 修正及亮度/伽马/饱和度步进；默认亮度/伽马/饱和度为 0/1/1。构建、包校验与待实测项目见 [0x26 验收记录](docs/026-validation.md)。

本次失联已完成源码与交付二进制条件链分析：日历/时钟的 Limited 广播标志与无限时长冲突，配置迁移回退可能触发错误复位。实机错误码仍需送修读取。见 [故障分析](docs/026-incident-analysis.md) 与 [维修取证单](docs/026-repair-handoff.md)。

## 0x27 维修候选

仅修正 S112 广播标志为 General，并同步版本0x27；应用与故障0x26仅两字节差异。离线构建与包校验通过，实机启动/连接尚未验证，不作为稳定版推荐。见 [维修候选试刷单](docs/027-repair-candidate.md)。本次构建来源为本仓库；旧的 epd-tools/repo-src 副本保留作0x26对照。
