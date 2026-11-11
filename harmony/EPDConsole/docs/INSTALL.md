# 安装与签名说明

## 1. Release 资产

- `EPDConsole-unsigned.hap`：未签名的 HarmonyOS 应用包。
- `SHA256SUMS.txt`：以上文件的校验值。

仓库和 Release **不包含任何私钥、证书或 profile**。

## 2. 在华为商用设备上安装（推荐小白安装助手）

HarmonyOS NEXT 商用设备不信任 OpenHarmony 公共测试证书，必须用你自己的华为开发者证书和 profile 重新签名。

1. 在电脑上安装并打开「小白安装助手」（第三方工具，本仓库不捆绑、不背书）。
2. 手机开启「开发者选项 → USB 调试」，用数据线连接电脑并授权。
3. 在工具中导入 `EPDConsole-unsigned.hap`。
4. 选择/导入你的华为开发者证书与 profile（或在工具内按提示申请调试签名）。
5. 执行「签名并安装」。
6. 首次打开时授予「附近设备/蓝牙」权限。

如果工具要求填写包名，使用 `com.dyc.epdconsole`。

## 3. 使用 DevEco Studio 安装（开发者）

1. 用 DevEco Studio 打开 `harmony/EPDConsole`。
2. `File → Project Structure → Signing Configs`，登录华为账号并勾选自动签名。
3. 连接设备，运行 `entry` 模块。

OpenHarmony 设备/模拟器可使用 SDK 自带的公共测试证书，但商用 HarmonyOS NEXT 设备不适用。

## 4. 固件升级（可选）

> 仅适用于 7.5 寸三色（驱动 07）。刷错型号会导致花屏；请确认电池电量充足。

1. 打开 App，连接 `NRF_EPD` 设备。
2. 设置 → 固件升级 → 选择 `EPD-nRF52-7.5-ota*.zip`。
3. 保持设备供电，等待写入完成并自动重启。
4. 若升级失败，重新连接后重试；恢复时使用**不低于当前版本**的 OTA。厂商 0x19 恢复包可能被 bootloader 防降级拒绝。

## 5. 常见问题

- **扫描不到设备**：确认已授予蓝牙权限；设备刚上电时会广播；远离其他已连接的主机。
- **安装被拒绝**：商用设备必须使用华为开发者证书/profile 签名，公共测试证书无效。
- **DFU 失败**：确认包与屏幕型号匹配、电池电量充足。若收到 `20 01 01` 后找不到 DfuTarg，这只表示请求被接受、bootloader 未被 App 发现；需进一步检查 indication 确认、断连时序、设备复位和扫描，不能据此断定必须 SWD。SWD 可作为备用恢复方案。

## 6. 许可

本项目代码按仓库的 GPL-3.0 许可分发，不提供任何担保。
