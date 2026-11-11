# 墨水屏控制台（HarmonyOS / OpenHarmony）

基于仓库 BLE 协议的 ArkTS 控制台，支持连接设备、传图、编辑和 Nordic Secure DFU。

- BLE 扫描、连接、设备配置与版本读取；旧版本固件支持兼容模式。
- 图片裁剪、适配、旋转、镜像、色调调整与抖动；支持黑白、三色和四色打包。
- 三色预览使用实际传输的色层数据。预览和真实屏幕的颜色仍受屏幕与环境光影响。
- 支持传统图像传输，以及兼容固件上的 CRC 分块传输。
- WebView 图片编辑器、日历/时钟控制与固件升级页面。

## 构建和安装

需要 OpenHarmony SDK API 12、JDK 17 和 Node.js。运行 `build.bat` 或使用 DevEco Studio 构建。生成的 HAP 需要签名；商用设备需使用对应设备授权的开发者证书和 profile，详见 [安装说明](docs/INSTALL.md)。

## 使用与验证

连接设备并确认驱动和画布尺寸后，选择图片、调整并发送。截图与实屏三色、同图预览已在一台驱动 07 设备上对照；颜色外观不能保证完全一致。固件升级需要对应型号和 bootloader 的兼容包；传输完成不代表设备启动及升级后连接已验证。

测试：在本目录运行 `node test/verify.js`、`node test/preview.js`、`node test/tone.js` 和 `node test/dfu-disconnect.js`。Web 对拍依赖仓库根目录的 `html/js/dithering.js`。

仓库不包含 HAP 签名私钥、证书或设备 profile。代码遵循仓库 GPL-3.0 许可。