import { image } from '@kit.ImageKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { fileIo, picker } from '@kit.CoreFileKit';
import { promptAction, router } from '@kit.ArkUI';
import { util } from '@kit.ArkTS';
import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { Cmd, frame, buildTimeData, hexToBytes, bytesToHex } from '../common/Protocol';
import { BleClient, DeviceItem } from '../common/BleClient';
import { processImage, ProcessOptions, convertUC8159, applyImageTone, ditherImage, packImage, previewThreeColor } from '../common/Dither';
import { RawImage, rotate90, mirrorH, mirrorV, fitToCanvas } from '../common/ImageOps';
import { sendLayerCrc, sendLayerLegacy } from '../common/Transfer';

class DriverInfo {
  code: string = '';
  label: string = '';
  color: string = '';
  size: string = '';

  constructor(code: string, label: string, color: string, size: string) {
    this.code = code;
    this.label = label;
    this.color = color;
    this.size = size;
  }
}

class CanvasSize {
  name: string = '';
  w: number = 0;
  h: number = 0;

  constructor(name: string, w: number, h: number) {
    this.name = name;
    this.w = w;
    this.h = h;
  }
}

const DRIVERS: DriverInfo[] = [
  new DriverInfo('01', '4.2寸 黑白 UC8176', 'blackWhiteColor', '4.2_400_300'),
  new DriverInfo('03', '4.2寸 三色 UC8176', 'threeColor', '4.2_400_300'),
  new DriverInfo('04', '4.2寸 黑白 SSD1619', 'blackWhiteColor', '4.2_400_300'),
  new DriverInfo('02', '4.2寸 三色 SSD1619', 'threeColor', '4.2_400_300'),
  new DriverInfo('05', '4.2寸 四色 JD79668', 'fourColor', '4.2_400_300'),
  new DriverInfo('06', '7.5寸 黑白 UC8179', 'blackWhiteColor', '7.5_800_480'),
  new DriverInfo('07', '7.5寸 三色 UC8179', 'threeColor', '7.5_800_480'),
  new DriverInfo('0c', '7.5寸 四色 JD79668', 'fourColor', '7.5_800_480'),
  new DriverInfo('08', '7.5寸低分 黑白 UC8159', 'blackWhiteColor', '7.5_640_384'),
  new DriverInfo('09', '7.5寸低分 三色 UC8159', 'threeColor', '7.5_640_384'),
  new DriverInfo('0a', '7.5寸HD 黑白 SSD1677', 'blackWhiteColor', '7.5_880_528'),
  new DriverInfo('0b', '7.5寸HD 三色 SSD1677', 'threeColor', '7.5_880_528')
];

const SIZES: CanvasSize[] = [
  new CanvasSize('1.54_152_152', 152, 152),
  new CanvasSize('1.54_200_200', 200, 200),
  new CanvasSize('2.13_212_104', 212, 104),
  new CanvasSize('2.13_250_122', 250, 122),
  new CanvasSize('2.66_296_152', 296, 152),
  new CanvasSize('2.9_296_128', 296, 128),
  new CanvasSize('2.9_384_168', 384, 168),
  new CanvasSize('3.5_384_184', 384, 184),
  new CanvasSize('3.7_416_240', 416, 240),
  new CanvasSize('3.97_800_480', 800, 480),
  new CanvasSize('4.2_400_300', 400, 300),
  new CanvasSize('5.79_792_272', 792, 272),
  new CanvasSize('5.83_600_448', 600, 448),
  new CanvasSize('5.83_648_480', 648, 480),
  new CanvasSize('7.5_640_384', 640, 384),
  new CanvasSize('7.5_800_480', 800, 480),
  new CanvasSize('7.5_880_528', 880, 528),
  new CanvasSize('10.2_960_640', 960, 640),
  new CanvasSize('10.85_1360_480', 1360, 480),
  new CanvasSize('11.6_960_640', 960, 640),
  new CanvasSize('4E_600_400', 600, 400),
  new CanvasSize('7.3E6', 480, 800)
];

const COLOR_MODES: string[] = ['blackWhiteColor', 'threeColor', 'fourColor', 'sixColor'];
const COLOR_LABELS: string[] = ['双色(黑白)', '三色(黑白红)', '四色(黑白红黄)', '六色(仅导出)'];
const DITHER_ALGS: string[] = ['floydSteinberg', 'atkinson', 'bayer', 'stucki', 'jarvis', 'none'];
const DITHER_LABELS: string[] = ['Floyd-Steinberg', 'Atkinson', 'Bayer', 'Stucki', 'Jarvis-Judice-Ninke', '无抖动'];
const WEEK_LABELS: string[] = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const CONFIG_CACHE: Map<string, string> = new Map<string, string>();
const FIT_LABELS: string[] = ['拉伸铺满', '裁剪填充', '适应留白'];

@Entry
@Component
struct Index {
  @State devices: DeviceItem[] = [];
  @State allDevices: DeviceItem[] = [];
  @State onlyEpd: boolean = true;
  @State scanning: boolean = false;
  @State connected: boolean = false;
  @State connecting: boolean = false;
  @State logs: string[] = [];
  @State driverIndex: number = 0;
  @State sizeIndex: number = 10;
  @State colorIndex: number = 0;
  @State ditherIndex: number = 0;
  @State strength: number = 1.0;
  @State contrastValue: number = 1.2;
  @State mtu: number = 20;
  @State ackInterval: number = 50;
  @State weekStart: number = 1;
  @State rawCmd: string = '';
  @State pins: string = '';
  @State directMac: string = 'E6:47:B1:07:3E:73';
  @State autoConnect: boolean = false;
  @State progress: string = '';
  @State versionText: string = '-';
  @State preview: image.PixelMap | undefined = undefined;
  @State hasImage: boolean = false;
  @State canvasW: number = 400;
  @State canvasH: number = 300;
  @State busy: boolean = false;
  @State fitIndex: number = 1;
  @State rotateQuarter: number = 0;
  @State mirrorHFlag: boolean = false;
  @State mirrorVFlag: boolean = false;
  @State brightnessValue: number = 0.0;
  @State gammaValue: number = 1.0;
  @State saturationValue: number = 1.0;
  @State redSensitivity: number = 0.35;
  @State autoDisconnect: boolean = false;
  @State manualOverride: boolean = false;
  @State frameW: number = 0;
  @State frameH: number = 0;
  @State idleSec: number = 120;
  @State clearBeforeSend: boolean = true;
  @State cropMode: boolean = false;
  @State cropX: number = 0;
  @State cropY: number = 0;
  @State cropW: number = 1;
  @State cropH: number = 1;
  @State cropViewW: number = 1;
  @State cropViewH: number = 1;

  private client: BleClient = new BleClient();
  private srcImage: RawImage | null = null;
  private srcPixelMap: image.PixelMap | undefined = undefined;
  private cropDrag: number = 0;
  private cropLastX: number = 0;
  private cropLastY: number = 0;
  private baseImage: RawImage | null = null;
  private packed: Uint8Array | null = null;
  private notifyIndex: number = 0;
  private gotConfig: boolean = false;
  private configTimer: number = -1;
  private pendingDeviceId: string = '';
  private lastDeviceName: string = '';
  private reconnecting: boolean = false;
  private deviceModelCode: string = '';

  private toDisplayBuffer(src: ArrayBuffer): ArrayBuffer {
    const copy = new Uint8ClampedArray(src.slice(0));
    for (let i: number = 0; i + 2 < copy.length; i += 4) {
      const r: number = copy[i];
      copy[i] = copy[i + 2];
      copy[i + 2] = r;
    }
    return copy.buffer as ArrayBuffer;
  }

  aboutToAppear(): void {
    PersistentStorage.persistProp('lastDeviceId', '');
    const lastId = AppStorage.get<string>('lastDeviceId');
    if (lastId !== undefined && lastId.length > 0) {
      this.directMac = lastId;
    }
    this.client.onLog = (msg: string): void => {
      this.log(msg);
    };
    this.client.onNotify = (data: Uint8Array): void => {
      this.handleNotify(data);
    };
    this.client.onDisconnected = (reason: string): void => {
      this.connected = false;
      this.log('设备连接已断开（' + reason + '）');
      if (reason === 'remote') {
        this.autoReconnect();
      }
    };
    this.requestPermission();
    this.client.setIdleTimeout(this.idleSec * 1000);
    PersistentStorage.persistProp('driverCode', '');
    PersistentStorage.persistProp('deviceSize', '');
    const savedCode = AppStorage.get<string>('driverCode');
    if (savedCode !== undefined && savedCode.length > 0) {
      this.applyModelCode(savedCode);
    } else {
      this.applyDriverSelection(false);
    }
  }

  onPageShow(): void {
    const res = AppStorage.get<string>('editResult');
    if (res !== undefined && res.startsWith('data:')) {
      AppStorage.setOrCreate('editResult', '');
      this.applyEdited(res);
    }
  }

  private async openEditor(): Promise<void> {
    if (this.baseImage === null) {
      this.toast('请先选择图片');
      return;
    }
    try {
      const opts: image.InitializationOptions = {
        size: { width: this.baseImage.width, height: this.baseImage.height },
        pixelFormat: image.PixelMapFormat.RGBA_8888,
        editable: false
      };
      const pm = await image.createPixelMap(this.baseImage.data.buffer as ArrayBuffer, opts);
      const packer = image.createImagePacker();
      const png = await packer.packing(pm, { format: 'image/png', quality: 100 });
      const b64 = new util.Base64Helper().encodeToStringSync(new Uint8Array(png));
      AppStorage.setOrCreate('editSource', 'data:image/png;base64,' + b64);
      AppStorage.setOrCreate('editResult', '');
      await pm.release();
      await packer.release();
      router.pushUrl({ url: 'pages/Editor' });
    } catch (err) {
      this.log('打开编辑器失败: ' + (err as Error).message);
    }
  }

  private async applyEdited(dataUrl: string): Promise<void> {
    try {
      const comma: number = dataUrl.indexOf(',');
      const b64: string = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
      const bytes: Uint8Array = new util.Base64Helper().decodeSync(b64);
      const source = image.createImageSource(bytes.buffer as ArrayBuffer);
      const pm = await source.createPixelMap({ desiredPixelFormat: image.PixelMapFormat.RGBA_8888 });
      const info = await pm.getImageInfo();
      const w: number = info.size.width;
      const h: number = info.size.height;
      const buf = new ArrayBuffer(w * h * 4);
      await pm.readPixelsToBuffer(buf);
      this.srcImage = new RawImage(new Uint8ClampedArray(buf), w, h);
      if (this.srcPixelMap !== undefined) {
        this.srcPixelMap.release();
      }
      const srcOpts: image.InitializationOptions = {
        size: { width: w, height: h },
        pixelFormat: image.PixelMapFormat.RGBA_8888,
        editable: false
      };
      this.srcPixelMap = await image.createPixelMap(this.toDisplayBuffer(buf), srcOpts);
      await pm.release();
      await source.release();
      await this.rebuild();
      this.log('编辑结果已应用 (' + w + 'x' + h + ')');
    } catch (err) {
      this.log('应用编辑失败: ' + (err as Error).message);
    }
  }

  private async requestPermission(): Promise<void> {
    try {
      const atManager = abilityAccessCtrl.createAtManager();
      const ctx = getContext(this) as common.UIAbilityContext;
      const perms: Permissions[] = ['ohos.permission.ACCESS_BLUETOOTH'];
      await atManager.requestPermissionsFromUser(ctx, perms);
    } catch (err) {
      const e = err as BusinessError;
      this.log('权限申请失败: ' + e.message);
    }
  }

  private log(msg: string): void {
    console.info('EPDConsole: ' + msg);
    const now = new Date();
    const hh: string = now.getHours().toString().padStart(2, '0');
    const mm: string = now.getMinutes().toString().padStart(2, '0');
    const ss: string = now.getSeconds().toString().padStart(2, '0');
    const next: string[] = this.logs.concat([hh + ':' + mm + ':' + ss + ' ' + msg]);
    this.logs = next.length > 200 ? next.slice(next.length - 200) : next;
  }

  private toast(msg: string): void {
    promptAction.showToast({ message: msg, duration: 2000 });
  }

  private ascii(data: Uint8Array): string {
    let s: string = '';
    for (let i: number = 0; i < data.length; i++) {
      s += String.fromCharCode(data[i]);
    }
    return s;
  }

  private clearConfigTimeout(): void {
    if (this.configTimer >= 0) {
      clearTimeout(this.configTimer);
      this.configTimer = -1;
    }
  }

  private startConfigTimeout(deviceId: string): void {
    this.clearConfigTimeout();
    this.configTimer = setTimeout(() => {
      this.configTimer = -1;
      if (this.gotConfig) {
        return;
      }
      const cached = CONFIG_CACHE.get(deviceId);
      if (cached !== undefined) {
        this.log('配置通知超时，使用缓存型号: ' + cached);
        this.applyModelCode(cached);
      } else {
        this.log('配置通知超时，使用默认值');
        this.toast('未获取到设备配置，使用默认值');
      }
    }, 5000);
  }

  private applyModelCode(code: string): void {
    let found: number = -1;
    for (let i: number = 0; i < DRIVERS.length; i++) {
      if (DRIVERS[i].code === code) {
        found = i;
      }
    }
    if (found < 0) {
      this.log('未知型号: ' + code + '，请手动选择');
      this.toast('未知设备型号 0x' + code + '，请手动选择');
      return;
    }
    this.driverIndex = found;
    this.deviceModelCode = code;
    AppStorage.setOrCreate('driverCode', code);
    AppStorage.setOrCreate('deviceSize', DRIVERS[found].size);
    this.applyDriverSelection(false);
    this.manualOverride = false;
  }

  aboutToDisappear(): void {
    this.autoConnect = false;
    this.client.stopScan();
    if (this.connected) {
      this.client.disconnectGracefully('应用退出');
      this.connected = false;
    }
  }

  private handleNotify(data: Uint8Array): void {
    const text: string = this.ascii(data);
    const isText: boolean = text.startsWith('mtu=') || text.startsWith('t=');
    if (!this.gotConfig && !isText && data.length > 7) {
      this.gotConfig = true;
      let pinHex: string = bytesToHex(data.slice(0, 7));
      if (data.length > 10) {
        pinHex += bytesToHex(data.slice(10, 11));
      }
      this.pins = pinHex;
      const code: string = bytesToHex(data.slice(7, 8));
      CONFIG_CACHE.set(this.pendingDeviceId, code);
      this.applyModelCode(code);
      this.log('设备配置: 驱动 ' + code + ', 引脚 ' + pinHex);
      this.log('配置原始: ' + bytesToHex(data));
      if (data.length > 8) {
        const wk: string = bytesToHex(data.slice(8, 9));
        this.log('wakeup_pin=0x' + wk + (wk === 'ff' ? '（无唤醒脚）' : ''));
      }
      return;
    }
    const msg: string = this.ascii(data);
    if (msg.length > 0) {
      this.log('设备: ' + msg);
    }
    if (msg.startsWith('mtu=')) {
      const v: number = parseInt(msg.substring(4));
      if (!isNaN(v)) {
        this.mtu = v;
      }
    }
  }

  private applyDriverSelection(clearImage: boolean): void {
    const d: DriverInfo = DRIVERS[this.driverIndex];
    for (let i: number = 0; i < COLOR_MODES.length; i++) {
      if (COLOR_MODES[i] === d.color) {
        this.colorIndex = i;
      }
    }
    let newW: number = this.canvasW;
    let newH: number = this.canvasH;
    for (let i: number = 0; i < SIZES.length; i++) {
      if (SIZES[i].name === d.size) {
        this.sizeIndex = i;
        newW = SIZES[i].w;
        newH = SIZES[i].h;
      }
    }
    const sizeChanged: boolean = (newW !== this.canvasW || newH !== this.canvasH);
    this.canvasW = newW;
    this.canvasH = newH;
    if (this.srcImage !== null) {
      this.rebuild();
      if (sizeChanged && !clearImage) {
        this.log('画布随设备切换为 ' + newW + 'x' + newH + '，已重新适配');
      }
    } else if (clearImage) {
      this.baseImage = null;
      this.packed = null;
      this.preview = undefined;
      this.hasImage = false;
    }
  }

  private applyDeviceFilter(): void {
    if (this.onlyEpd) {
      this.devices = this.allDevices.filter((d: DeviceItem) => d.name.startsWith('NRF_EPD'));
    } else {
      this.devices = this.allDevices;
    }
  }

  private startScan(): void {
    if (this.connected) {
      this.toast('请先断开当前连接');
      return;
    }
    this.devices = [];
    this.scanning = true;
    this.log('开始扫描 70 秒（等待相册模式的广播窗口）...');
    this.client.startScan((list: DeviceItem[]): void => {
      this.allDevices = list;
      this.applyDeviceFilter();
    }, 70000);
    setTimeout(() => {
      this.scanning = false;
      this.log('扫描结束，发现 ' + this.devices.length + ' 个设备');
    }, 70300);
  }

  private async startAutoConnect(): Promise<void> {
    if (this.autoConnect) {
      this.autoConnect = false;
      this.log('自动连接已停止');
      return;
    }
    if (this.connected || this.connecting) {
      this.toast('当前已在连接或已连接');
      return;
    }
    this.autoConnect = true;
    this.log('自动连接已开启：每 70 秒扫描一次，发现 NRF_EPD 即连接（相册模式窗口）');
    while (this.autoConnect && !this.connected) {
      const list: DeviceItem[] = await this.client.scanOnce(70000);
      let target: DeviceItem | null = null;
      for (let i: number = 0; i < list.length; i++) {
        if (list[i].name.indexOf('NRF_EPD') >= 0) {
          target = list[i];
          break;
        }
      }
      if (target !== null) {
        this.log('自动连接：发现 ' + target.name + ' (' + target.deviceId + ')');
        await this.connectTo(target);
        if (this.connected) {
          this.autoConnect = false;
          this.log('自动连接成功');
          return;
        }
      }
      if (!this.autoConnect) {
        return;
      }
    }
    this.autoConnect = false;
  }

  private async autoReconnect(): Promise<void> {
    if (this.reconnecting || this.connecting || this.busy) {
      return;
    }
    this.reconnecting = true;
    this.log('连接失效，尝试自动重连...');
    try {
      const list: DeviceItem[] = await this.client.scanOnce(70000);
      let target: DeviceItem | null = null;
      for (let i: number = 0; i < list.length; i++) {
        if (list[i].name.startsWith('NRF_EPD') || list[i].name === this.lastDeviceName) {
          target = list[i];
          break;
        }
      }
      if (target === null) {
        this.log('自动重连失败：未发现设备，请靠近后重试');
        return;
      }
      this.log('自动重连到 ' + target.name);
      await this.connectTo(target);
    } catch (err) {
      this.log('自动重连失败: ' + (err as Error).message);
    } finally {
      this.reconnecting = false;
    }
  }

  private async connectTo(item: DeviceItem): Promise<void> {
    if (this.connecting) {
      return;
    }
    this.connecting = true;
    this.client.stopScan();
    this.scanning = false;
    this.gotConfig = false;
    this.notifyIndex = 0;
    this.pendingDeviceId = item.deviceId;
    this.lastDeviceName = item.name;
    this.progress = '正在连接 ' + item.name + ' ...';
    try {
      await this.client.connect(item.deviceId);
      this.connected = true;
      AppStorage.setOrCreate('lastDeviceId', item.deviceId);
      this.directMac = item.deviceId;
      this.startConfigTimeout(item.deviceId);
      this.notifyIndex = 0;
      this.versionText = '0x' + this.client.appVersion.toString(16);
      AppStorage.setOrCreate('appVersion', this.client.appVersion);
      AppStorage.setOrCreate('deviceName', item.name);
      this.log('发送 INIT 命令...');
      await this.client.write(frame(Cmd.INIT), true);
      this.log('INIT 已发送');
      this.log('已连接 ' + item.name + '，固件版本 0x' + this.client.appVersion.toString(16));
      if (this.client.appVersion < 0x16) {
        this.log('警告：固件版本过低，部分功能不可用');
      }
    } catch (err) {
      const e = err as Error;
      this.log('连接失败: ' + e.message);
      this.client.disconnect();
      this.connected = false;
    } finally {
      this.connecting = false;
      this.progress = '';
    }
  }

  private disconnect(): void {
    this.clearConfigTimeout();
    this.client.disconnectGracefully('用户断开');
    this.connected = false;
    this.gotConfig = false;
    this.log('已断开连接');
  }

  private async sendDriver(): Promise<void> {
    if (!this.connected) {
      this.toast('请先连接设备');
      return;
    }
    try {
      await this.client.write(frame(Cmd.SET_PINS, hexToBytes(this.pins)), true);
      await this.client.write(frame(Cmd.INIT, hexToBytes(DRIVERS[this.driverIndex].code)), true);
      this.log('驱动配置已发送');
    } catch (err) {
      this.log('设置驱动失败: ' + (err as Error).message);
    }
  }

  private async syncTime(mode: number): Promise<void> {
    if (!this.connected) {
      this.toast('请先连接设备');
      return;
    }
    try {
      await this.client.write(frame(Cmd.SET_WEEK_START, new Uint8Array([this.weekStart])), true);
      await this.client.write(frame(Cmd.SET_TIME, buildTimeData(mode)), true);
      this.log('已发送时间/模式命令: ' + mode.toString());
    } catch (err) {
      this.log('时间同步失败: ' + (err as Error).message);
    }
  }

  private async clearScreen(): Promise<void> {
    if (!this.connected) {
      this.toast('请先连接设备');
      return;
    }
    try {
      await this.client.write(frame(Cmd.CLEAR), true);
      this.log('清屏命令已发送');
    } catch (err) {
      this.log('清屏失败: ' + (err as Error).message);
    }
  }

  private async sendRawCmd(): Promise<void> {
    if (!this.connected) {
      this.toast('请先连接设备');
      return;
    }
    const bytes: Uint8Array = hexToBytes(this.rawCmd);
    if (bytes.length === 0) {
      return;
    }
    const data: Uint8Array = bytes.length > 1 ? bytes.slice(1) : new Uint8Array(0);
    try {
      await this.client.write(frame(bytes[0], data), true);
      this.log('命令已发送: ' + bytesToHex(bytes));
    } catch (err) {
      this.log('命令发送失败: ' + (err as Error).message);
    }
  }

  private async pickImage(): Promise<void> {
    try {
      const p = new photoAccessHelper.PhotoViewPicker();
      const options: photoAccessHelper.PhotoSelectOptions = {
        MIMEType: photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE,
        maxSelectNumber: 1
      };
      const res = await p.select(options);
      if (res.photoUris.length === 0) {
        return;
      }
      const file = fileIo.openSync(res.photoUris[0], fileIo.OpenMode.READ_ONLY);
      const source = image.createImageSource(file.fd);
      const info = await source.getImageInfo();
      const maxDim: number = Math.max(info.size.width, info.size.height);
      const scale: number = maxDim > 1600 ? 1600 / maxDim : 1;
      const dw: number = Math.max(1, Math.round(info.size.width * scale));
      const dh: number = Math.max(1, Math.round(info.size.height * scale));
      const opts: image.DecodingOptions = {
        desiredSize: { width: dw, height: dh },
        desiredPixelFormat: image.PixelMapFormat.RGBA_8888
      };
      const pixelMap = await source.createPixelMap(opts);
      const buffer = new ArrayBuffer(dw * dh * 4);
      await pixelMap.readPixelsToBuffer(buffer);
      this.srcImage = new RawImage(new Uint8ClampedArray(buffer), dw, dh);
      // 预览显示缓冲：平台 PixelMap 按 BGR 解释，这里交换 R/B，保证预览颜色=最终效果。
      if (this.srcPixelMap !== undefined) {
        try {
          this.srcPixelMap.release();
        } catch (err) {
        }
      }
      const srcOpts: image.InitializationOptions = {
        size: { width: dw, height: dh },
        pixelFormat: image.PixelMapFormat.RGBA_8888,
        editable: false
      };
      this.srcPixelMap = await image.createPixelMap(this.toDisplayBuffer(buffer), srcOpts);
      this.cropMode = false;
      this.rotateQuarter = 0;
      this.mirrorHFlag = false;
      this.mirrorVFlag = false;
      await pixelMap.release();
      await source.release();
      fileIo.closeSync(file);
      this.log('图像: ' + info.size.width + 'x' + info.size.height + ' 格式: ' + info.pixelFormat);
      await this.rebuild();
      this.log('图片已载入并抖动处理');
    } catch (err) {
      const e = err as BusinessError;
      this.log('选择图片失败: ' + e.message);
    }
  }

  private async rebuild(): Promise<void> {
    if (this.srcImage === null) {
      return;
    }
    let img: RawImage = this.srcImage;
    for (let i: number = 0; i < this.rotateQuarter; i++) {
      img = rotate90(img);
    }
    if (this.mirrorHFlag) {
      img = mirrorH(img);
    }
    if (this.mirrorVFlag) {
      img = mirrorV(img);
    }
    this.baseImage = fitToCanvas(img, this.canvasW, this.canvasH, this.fitIndex);
    this.hasImage = true;
    await this.process();
  }

  private async process(): Promise<void> {
    if (this.baseImage === null) {
      return;
    }
    if (this.baseImage.width !== this.canvasW || this.baseImage.height !== this.canvasH) {
      await this.rebuild();
      return;
    }
    const work = new Uint8ClampedArray(this.baseImage.data);
    const mode: string = COLOR_MODES[this.colorIndex];
    if (mode === 'threeColor') {
      // Web 参考路径（与 html/js/dithering.js 逐字节对拍）：RGB 误差扩散 +
      // r>120 && r>1.5g && r>1.5b 的红色判定。
      const opt = new ProcessOptions();
      opt.contrast = this.contrastValue;
      opt.brightness = this.brightnessValue;
      opt.gamma = this.gammaValue;
      opt.saturation = this.saturationValue;
      applyImageTone(work, opt);
      ditherImage(this.canvasW, this.canvasH, work, DITHER_ALGS[this.ditherIndex], this.strength, mode);
      this.packed = packImage(work, this.canvasW, this.canvasH, mode);
    } else {
      const opt = new ProcessOptions();
      opt.mode = mode;
      opt.alg = DITHER_ALGS[this.ditherIndex];
      opt.strength = this.strength;
      opt.contrast = this.contrastValue;
      opt.brightness = this.brightnessValue;
      opt.gamma = this.gammaValue;
      opt.saturation = this.saturationValue;
      opt.redSensitivity = this.redSensitivity;
      this.packed = processImage(work, this.canvasW, this.canvasH, opt);
    }
    if (this.preview !== undefined) {
      try {
        await this.preview.release();
      } catch (err) {
      }
      this.preview = undefined;
    }
    const initOpts: image.InitializationOptions = {
      size: { width: this.canvasW, height: this.canvasH },
      pixelFormat: image.PixelMapFormat.RGBA_8888,
      editable: false
    };
    try {
      const previewData: Uint8ClampedArray = mode === 'threeColor' && this.packed !== null
        ? previewThreeColor(this.packed, this.canvasW, this.canvasH) : work;
      this.preview = await image.createPixelMap(this.toDisplayBuffer(previewData.buffer as ArrayBuffer), initOpts);
    } catch (err) {
      this.log('预览生成失败');
    }
  }

  private enterCrop(): void {
    if (this.srcImage === null) {
      this.toast('请先选择图片');
      return;
    }
    const imgAspect: number = this.srcImage.width / this.srcImage.height;
    const devAspect: number = this.canvasW / this.canvasH;
    if (imgAspect > devAspect) {
      this.cropH = 1;
      this.cropW = devAspect / imgAspect;
      this.cropX = (1 - this.cropW) / 2;
      this.cropY = 0;
    } else {
      this.cropW = 1;
      this.cropH = imgAspect / devAspect;
      this.cropX = 0;
      this.cropY = (1 - this.cropH) / 2;
    }
    this.cropMode = true;
  }

  private cancelCrop(): void {
    this.cropMode = false;
  }

  private async applyCrop(): Promise<void> {
    if (this.srcImage === null) {
      return;
    }
    const sx: number = Math.floor(this.cropX * this.srcImage.width);
    const sy: number = Math.floor(this.cropY * this.srcImage.height);
    const sw: number = Math.max(1, Math.floor(this.cropW * this.srcImage.width));
    const sh: number = Math.max(1, Math.floor(this.cropH * this.srcImage.height));
    const out = new Uint8ClampedArray(sw * sh * 4);
    for (let y: number = 0; y < sh; y++) {
      const srcOff: number = ((sy + y) * this.srcImage.width + sx) * 4;
      out.set(this.srcImage.data.subarray(srcOff, srcOff + sw * 4), y * sw * 4);
    }
    this.srcImage = new RawImage(out, sw, sh);
    const opts: image.InitializationOptions = {
      size: { width: sw, height: sh },
      pixelFormat: image.PixelMapFormat.RGBA_8888,
      editable: false
    };
    try {
      if (this.srcPixelMap !== undefined) {
        this.srcPixelMap.release();
      }
      this.srcPixelMap = await image.createPixelMap(out.buffer as ArrayBuffer, opts);
    } catch (err) {
      this.log('裁剪预览刷新失败');
    }
    this.cropMode = false;
    await this.rebuild();
    this.log('已裁剪为 ' + sw + 'x' + sh);
  }

  private onCropTouch(event: TouchEvent): void {
    if (event.touches.length === 0) {
      return;
    }
    const x: number = event.touches[0].x;
    const y: number = event.touches[0].y;
    const w: number = this.cropViewW;
    const h: number = this.cropViewH;
    if (w <= 1 || h <= 1) {
      return;
    }
    const l: number = this.cropX * w;
    const tp: number = this.cropY * h;
    const rr: number = (this.cropX + this.cropW) * w;
    const bb: number = (this.cropY + this.cropH) * h;
    const th: number = 30;
    if (event.type === TouchType.Down) {
      const nearL: boolean = Math.abs(x - l) < th;
      const nearR: boolean = Math.abs(x - rr) < th;
      const nearT: boolean = Math.abs(y - tp) < th;
      const nearB: boolean = Math.abs(y - bb) < th;
      if (nearL && nearT) {
        this.cropDrag = 1;
      } else if (nearR && nearT) {
        this.cropDrag = 2;
      } else if (nearL && nearB) {
        this.cropDrag = 3;
      } else if (nearR && nearB) {
        this.cropDrag = 4;
      } else if (nearL) {
        this.cropDrag = 5;
      } else if (nearR) {
        this.cropDrag = 6;
      } else if (nearT) {
        this.cropDrag = 7;
      } else if (nearB) {
        this.cropDrag = 8;
      } else if (x > l && x < rr && y > tp && y < bb) {
        this.cropDrag = 9;
      } else {
        this.cropDrag = 0;
      }
      this.cropLastX = x;
      this.cropLastY = y;
    } else if (event.type === TouchType.Move && this.cropDrag > 0) {
      const dx: number = (x - this.cropLastX) / w;
      const dy: number = (y - this.cropLastY) / h;
      this.cropLastX = x;
      this.cropLastY = y;
      this.dragCrop(dx, dy);
    } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
      this.cropDrag = 0;
    }
  }

  private dragCrop(dx: number, dy: number): void {
    const minSize: number = 0.12;
    let nx: number = this.cropX;
    let ny: number = this.cropY;
    let nw: number = this.cropW;
    let nh: number = this.cropH;
    if (this.cropDrag === 9) {
      nx = Math.min(Math.max(0, nx + dx), 1 - nw);
      ny = Math.min(Math.max(0, ny + dy), 1 - nh);
    } else {
      if (this.cropDrag === 1 || this.cropDrag === 3 || this.cropDrag === 5) {
        const nv: number = Math.min(Math.max(0, nx + dx), nx + nw - minSize);
        nw = nw + (nx - nv);
        nx = nv;
      }
      if (this.cropDrag === 2 || this.cropDrag === 4 || this.cropDrag === 6) {
        nw = Math.min(Math.max(minSize, nw + dx), 1 - nx);
      }
      if (this.cropDrag === 1 || this.cropDrag === 2 || this.cropDrag === 7) {
        const nv: number = Math.min(Math.max(0, ny + dy), ny + nh - minSize);
        nh = nh + (ny - nv);
        ny = nv;
      }
      if (this.cropDrag === 3 || this.cropDrag === 4 || this.cropDrag === 8) {
        nh = Math.min(Math.max(minSize, nh + dy), 1 - ny);
      }
    }
    this.cropX = nx;
    this.cropY = ny;
    this.cropW = nw;
    this.cropH = nh;
  }

  private async transfer(data: Uint8Array, isBw: boolean, useCrc: boolean): Promise<void> {
    if (useCrc) {
      await sendLayerCrc(this.client, data, isBw, this.mtu, (sent: number, total: number): void => {
        this.progress = sent.toString() + '/' + total.toString() + ' 块';
      });
    } else {
      await sendLayerLegacy(this.client, data, isBw, this.mtu, this.ackInterval,
        (sent: number, total: number): void => {
          this.progress = sent.toString() + '/' + total.toString() + ' 块';
        });
    }
  }

  private async sendImage(): Promise<void> {
    if (!this.connected) {
      this.toast('请先连接设备');
      return;
    }
    if (this.busy) {
      return;
    }
    const drv = DRIVERS[this.driverIndex];
    const mode = COLOR_MODES[this.colorIndex];
    if (drv.color !== mode) {
      this.toast('颜色模式与设备驱动不匹配，请恢复设备配置或改选');
      return;
    }
    const parts = drv.size.split('_');
    if (parts.length >= 3) {
      const dw = parseInt(parts[1]);
      const dh = parseInt(parts[2]);
      const exact = (this.canvasW === dw && this.canvasH === dh);
      const rotated = (this.canvasW === dh && this.canvasH === dw);
      if (!exact && !rotated) {
        this.toast('画布尺寸与设备不匹配，请恢复设备配置或同步尺寸');
        return;
      }
    }
    if (this.baseImage === null) {
      this.toast('请先选择图片');
      return;
    }
    if (this.clearBeforeSend) {
      this.progress = '清屏中（去除残影，约 15 秒）...';
      try {
        await this.client.write(frame(Cmd.CLEAR), true);
        this.log('已发送清屏指令，等待全刷完成...');
        await new Promise<void>((resolve: () => void) => {
          setTimeout(() => {
            resolve();
          }, 16000);
        });
      } catch (err) {
        this.log('清屏失败，继续发送: ' + (err as Error).message);
      }
    }
    await this.process();
    const packed = this.packed;
    if (packed === null) {
      this.toast('六色模式仅支持导出数组，不能蓝牙发送');
      return;
    }
    this.busy = true;
    this.progress = '发送中...';
    try {
      await this.client.beginTransfer();
      await this.client.write(frame(Cmd.INIT), true);
      const useCrc: boolean = this.client.appVersion >= 0x20;
      const mode: string = COLOR_MODES[this.colorIndex];
      const driver: string = DRIVERS[this.driverIndex].code;
      if (mode === 'fourColor') {
        await this.transfer(packed, false, useCrc);
      } else if (mode === 'threeColor') {
        const half: number = Math.floor(packed.length / 2);
        const bw: Uint8Array = packed.slice(0, half);
        const rw: Uint8Array = packed.slice(half);
        if (driver === '08' || driver === '09') {
          await this.transfer(convertUC8159(bw, rw), true, useCrc);
        } else {
          await this.transfer(bw, true, useCrc);
          await this.transfer(rw, false, useCrc);
        }
      } else if (mode === 'blackWhiteColor') {
        if (driver === '08' || driver === '09') {
          const empty = new Uint8Array(packed.length);
          empty.fill(0xFF);
          await this.transfer(convertUC8159(packed, empty), true, useCrc);
        } else {
          await this.transfer(packed, true, useCrc);
        }
      } else {
        this.toast('当前固件不支持六色发送');
        return;
      }
      await this.client.write(frame(Cmd.REFRESH), true);
      this.progress = '发送完成';
      this.log('图片发送完成');
      this.toast('图片发送完成');
      if (this.autoDisconnect) {
        await new Promise<void>((resolve: () => void) => {
          setTimeout(() => {
            resolve();
          }, 800);
        });
        await this.client.disconnectGracefully('发送后断开');
        this.connected = false;
        this.log('已自动断开连接以省电');
      }
    } catch (err) {
      this.progress = '发送失败';
      this.log('发送失败: ' + (err as Error).message);
      this.toast('发送失败: ' + (err as Error).message);
    } finally {
      await this.client.endTransfer();
      this.busy = false;
    }
  }

  private async exportArray(): Promise<void> {
    if (this.packed === null) {
      this.toast('请先选择图片');
      return;
    }
    let text: string = 'const uint8_t imageData[] PROGMEM = {\n';
    for (let i: number = 0; i < this.packed.length; i += 16) {
      const parts: string[] = [];
      const end: number = Math.min(i + 16, this.packed.length);
      for (let j: number = i; j < end; j++) {
        parts.push('0x' + this.packed[j].toString(16).padStart(2, '0'));
      }
      text += parts.join(', ') + ',\n';
    }
    text += '};\n';
    text += 'const uint16_t imageWidth = ' + this.canvasW.toString() + ';\n';
    text += 'const uint16_t imageHeight = ' + this.canvasH.toString() + ';\n';
    const mode: string = COLOR_MODES[this.colorIndex];
    const modeValue: number = mode === 'sixColor' ? 0 : mode === 'fourColor' ? 1 : mode === 'blackWhiteColor' ? 2 : 3;
    text += 'const uint8_t colorMode = ' + modeValue.toString() + ';\n';
    try {
      const savePicker = new picker.DocumentViewPicker();
      const opts: picker.DocumentSaveOptions = { newFileNames: ['imagedata.h'] };
      const uris = await savePicker.save(opts);
      if (uris.length === 0) {
        return;
      }
      const f = fileIo.openSync(uris[0],
        fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC);
      fileIo.writeSync(f.fd, text);
      fileIo.closeSync(f);
      this.toast('已保存 imagedata.h');
      this.log('数组已导出');
    } catch (err) {
      this.log('导出失败: ' + (err as Error).message);
    }
  }

  @Builder
  LogPanel() {
    Column() {
      Text('日志')
        .fontSize(14)
        .fontWeight(FontWeight.Bold)
        .width('100%')
        .padding({ left: 8, top: 6, bottom: 4 })
      List() {
        ForEach(this.logs, (line: string) => {
          ListItem() {
            Text(line)
              .fontSize(11)
              .fontColor('#333333')
              .width('100%')
              .padding({ left: 8, right: 8, top: 2, bottom: 2 })
          }
        }, (line: string, index: number) => index.toString() + line)
      }
      .layoutWeight(1)
      .width('100%')
    }
    .backgroundColor('#F5F5F5')
    .borderRadius(8)
    .margin({ top: 8 })
    .height(180)
  }

  @Builder
  ConnectTab() {
    Scroll() {
      Column({ space: 10 }) {
        Row({ space: 8 }) {
          Button(this.scanning ? '扫描中...' : '扫描设备')
            .enabled(!this.scanning)
            .onClick(() => {
              this.startScan();
            })
          Button(this.onlyEpd ? '显示全部' : '仅看 NRF_EPD')
            .fontSize(11)
            .backgroundColor('#0F766E')
            .onClick(() => {
              this.onlyEpd = !this.onlyEpd;
              this.applyDeviceFilter();
            })
          Button(this.connected ? '断开' : '未连接')
            .enabled(this.connected)
            .backgroundColor(this.connected ? '#D9534F' : '#CCCCCC')
            .onClick(() => {
              this.disconnect();
            })
          Button('清空日志')
            .backgroundColor('#888888')
            .onClick(() => {
              this.logs = [];
            })
        }
        .width('100%')

        Row({ space: 6 }) {
          TextInput({ text: this.directMac, placeholder: '设备 MAC（如 E6:47:B1:07:3E:73）' })
            .fontSize(11)
            .height(36)
            .layoutWeight(1)
            .onChange((v: string) => {
              this.directMac = v;
            })
          Button('直连')
            .fontSize(11)
            .height(36)
            .enabled(!this.connecting && !this.connected)
            .onClick(() => {
              const mac: string = this.directMac.trim();
              if (mac.length === 0) {
                this.toast('请输入设备 MAC');
                return;
              }
              const it = new DeviceItem();
              it.deviceId = mac;
              it.name = '(直连)';
              this.connectTo(it);
            })
        }
        .width('100%')

        Button(this.autoConnect ? '停止自动连接' : '自动连接（等待设备广播）')
          .width('100%')
          .fontSize(12)
          .height(36)
          .backgroundColor(this.autoConnect ? '#D9534F' : '#2563EB')
          .onClick(() => {
            this.startAutoConnect();
          })

        if (this.connecting) {
          Row({ space: 8 }) {
            LoadingProgress().width(22).height(22)
            Text(this.progress).fontSize(13)
          }
          .width('100%')
        }

        Text('发现 ' + this.devices.length.toString() + ' 个设备' + (this.onlyEpd ? '（仅 NRF_EPD）' : '（全部）'))
          .fontSize(12)
          .fontColor('#666666')
          .width('100%')

        if (this.onlyEpd && this.devices.length === 0 && this.allDevices.length > 0) {
          Text('未发现 NRF_EPD，点上方“显示全部”查看全部设备')
            .fontSize(11)
            .fontColor('#B26A00')
            .width('100%')
        }

        List({ space: 6 }) {
          ForEach(this.devices, (item: DeviceItem) => {
            ListItem() {
              Row() {
                Column({ space: 2 }) {
                  Text(item.name.length > 0 ? item.name : '(未命名设备)')
                    .fontSize(15)
                    .fontWeight(FontWeight.Medium)
                  Text(item.deviceId)
                    .fontSize(10)
                    .fontColor('#888888')
                }
                .alignItems(HorizontalAlign.Start)
                .layoutWeight(1)

                Text(item.rssi.toString() + ' dBm')
                  .fontSize(12)
                  .fontColor('#666666')
                  .margin({ right: 8 })

                Button('连接')
                  .height(32)
                  .fontSize(13)
                  .enabled(this.connected && !this.connecting ? false : true)
                  .onClick(() => {
                    this.connectTo(item);
                  })
              }
              .width('100%')
              .padding(8)
              .backgroundColor(Color.White)
              .borderRadius(8)
              .border({ width: 1, color: '#E0E0E0' })
            }
          }, (item: DeviceItem) => item.deviceId)
        }
        .width('100%')
        .height(this.devices.length > 0 ? 220 : 1)

        if (!this.connected && this.devices.length === 0 && !this.scanning) {
          Text('相册模式为低功耗广播窗口：每 60 秒广播约 2 秒。请保持扫描 70 秒，并确保设备未被其他手机连接。')
            .fontSize(11)
            .fontColor('#888888')
        }

        this.LogPanel()
      }
      .padding(12)
      .width('100%')
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  ControlTab() {
    Scroll() {
      Column({ space: 10 }) {
        Text('驱动配置').fontSize(15).fontWeight(FontWeight.Bold).width('100%')
        Row({ space: 8 }) {
          Text('驱动').fontSize(13)
          Select(this.driverOptions())
            .selected(this.driverIndex)
            .value(DRIVERS[this.driverIndex].label)
            .layoutWeight(1)
            .onSelect((index: number) => {
              this.driverIndex = index;
              this.applyDriverSelection(true);
              this.manualOverride = true;
            })
        }
        .width('100%')

        Row({ space: 8 }) {
          Text('引脚').fontSize(13)
          TextInput({ text: this.pins, placeholder: '如 0508090A0B0C0D' })
            .layoutWeight(1)
            .onChange((v: string) => {
              this.pins = v;
            })
        }
        .width('100%')

        Button('应用驱动与引脚')
          .width('100%')
          .onClick(() => {
            this.sendDriver();
          })

        Button('重新读取设备配置')
          .width('100%')
          .backgroundColor('#0F766E')
          .enabled(this.connected)
          .onClick(() => {
            if (!this.connected) {
              this.toast('请先连接设备');
              return;
            }
            this.gotConfig = false;
            this.startConfigTimeout(this.pendingDeviceId);
            this.client.refreshConfig().then(() => {
              this.log('已请求设备重新下发配置');
            }).catch((err: Error) => {
              this.log('重新读取配置失败: ' + err.message);
            });
          })

        Divider().margin({ top: 6, bottom: 6 })

        Text('时间与模式').fontSize(15).fontWeight(FontWeight.Bold).width('100%')
        Row({ space: 8 }) {
          Text('星期起始').fontSize(13)
          Select(WEEK_LABELS.map((label: string): SelectOption => {
            return { value: label };
          }))
            .selected(this.weekStart)
            .value(WEEK_LABELS[this.weekStart])
            .onSelect((index: number) => {
              this.weekStart = index;
            })
        }
        .width('100%')

        Row({ space: 8 }) {
          Button('日历模式')
            .layoutWeight(1)
            .onClick(() => {
              this.syncTime(1);
            })
          Button('时钟模式')
            .layoutWeight(1)
            .backgroundColor('#E67E22')
            .onClick(() => {
              this.syncTime(2);
            })
          Button('老款时钟')
            .layoutWeight(1)
            .backgroundColor('#777777')
            .onClick(() => {
              this.syncTime(3);
            })
        }
        .width('100%')

        Button('清除屏幕')
          .width('100%')
          .backgroundColor('#D9534F')
          .onClick(() => {
            this.clearScreen();
          })

        Text('老款时钟固件源码未实现（待确认），仅对 UC8179 7.5 寸有效').fontSize(11).fontColor('#999999')

        Divider().margin({ top: 6, bottom: 6 })

        Text('原始命令').fontSize(15).fontWeight(FontWeight.Bold).width('100%')
        Row({ space: 8 }) {
          TextInput({ text: this.rawCmd, placeholder: '十六进制，如 01' })
            .layoutWeight(1)
            .onChange((v: string) => {
              this.rawCmd = v;
            })
          Button('发送')
            .onClick(() => {
              this.sendRawCmd();
            })
        }
        .width('100%')

        this.LogPanel()
      }
      .padding(12)
      .width('100%')
    }
    .width('100%')
    .height('100%')
  }

  private deviceScreenWidth(): number {
    const parts = DRIVERS[this.driverIndex].size.split('_');
    if (parts.length >= 3) {
      const w = parseInt(parts[1]);
      if (w > 0) {
        return w;
      }
    }
    return 800;
  }

  private deviceScreenHeight(): number {
    const parts = DRIVERS[this.driverIndex].size.split('_');
    if (parts.length >= 3) {
      const h = parseInt(parts[2]);
      if (h > 0) {
        return h;
      }
    }
    return 480;
  }

  private canvasMatchesDevice(): boolean {
    const dw = this.deviceScreenWidth();
    const dh = this.deviceScreenHeight();
    return (this.canvasW === dw && this.canvasH === dh) ||
      (this.canvasW === dh && this.canvasH === dw);
  }

  @Builder
  DevicePreview() {
    Stack() {
      if (this.preview !== undefined) {
        Image(this.preview)
          .width(this.frameW * 0.90816)
          .height(this.frameH * 0.83504)
          .position({ x: this.frameW * 0.05102, y: this.frameH * 0.09079 })
          .objectFit(ImageFit.Contain)
      } else {
        Column() {
          Text('尚未选择图片')
            .fontSize(12)
            .fontColor('#B3ADA2')
        }
        .width(this.frameW * 0.90816)
        .height(this.frameH * 0.83504)
        .position({ x: this.frameW * 0.05102, y: this.frameH * 0.09079 })
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#F2F2F2')
      }
      Image($r('app.media.device_frame'))
        .width('100%')
        .height('100%')
        .objectFit(ImageFit.Fill)
      if (!this.canvasMatchesDevice()) {
        Text('画布方向/尺寸与设备不一致')
          .fontSize(10)
          .fontColor('#B26A00')
          .backgroundColor('#F5F0E6')
          .padding({ left: 6, right: 6, top: 2, bottom: 2 })
          .borderRadius(4)
          .position({ x: 8, y: 8 })
      }
    }
    .width('100%')
    .aspectRatio(1176 / 782)
    .onAreaChange((oldValue: Area, newValue: Area) => {
      this.frameW = Number(newValue.width);
      this.frameH = Number(newValue.height);
    })
  }

  @Builder
  CropEditor() {
    Column({ space: 6 }) {
      Text('拖动边框或角点调整裁剪范围（默认按设备比例）')
        .fontSize(11)
        .fontColor('#888888')
        .width('100%')
      Stack() {
        if (this.srcPixelMap !== undefined) {
          Image(this.srcPixelMap)
            .width('100%')
            .height('100%')
            .objectFit(ImageFit.Contain)
        }
        Row()
          .position({ x: this.cropX * this.cropViewW, y: this.cropY * this.cropViewH })
          .width(this.cropW * this.cropViewW)
          .height(this.cropH * this.cropViewH)
          .border({ width: 2, color: '#F5B301' })
        Row().width(18).height(18).borderRadius(9).backgroundColor('#F5B301')
          .position({ x: this.cropX * this.cropViewW - 9, y: this.cropY * this.cropViewH - 9 })
        Row().width(18).height(18).borderRadius(9).backgroundColor('#F5B301')
          .position({ x: (this.cropX + this.cropW) * this.cropViewW - 9, y: this.cropY * this.cropViewH - 9 })
        Row().width(18).height(18).borderRadius(9).backgroundColor('#F5B301')
          .position({ x: this.cropX * this.cropViewW - 9, y: (this.cropY + this.cropH) * this.cropViewH - 9 })
        Row().width(18).height(18).borderRadius(9).backgroundColor('#F5B301')
          .position({ x: (this.cropX + this.cropW) * this.cropViewW - 9, y: (this.cropY + this.cropH) * this.cropViewH - 9 })
      }
      .width('100%')
      .aspectRatio(this.srcImage !== null ? this.srcImage.width / this.srcImage.height : 1.3333)
      .backgroundColor('#111111')
      .onAreaChange((oldV: Area, newV: Area) => {
        this.cropViewW = Number(newV.width);
        this.cropViewH = Number(newV.height);
      })
      .onTouch((event: TouchEvent) => {
        this.onCropTouch(event);
      })
    }
    .width('100%')
  }

  @Builder
  ImageTab() {
    Scroll() {
      Column({ space: 10 }) {
        Row({ space: 8 }) {
          Button('选择图片')
            .onClick(() => {
              this.pickImage();
            })
          Button('裁剪')
            .backgroundColor('#555555')
            .enabled(this.hasImage && !this.cropMode)
            .onClick(() => {
              this.enterCrop();
            })
          Text(this.canvasW.toString() + ' x ' + this.canvasH.toString())
            .fontSize(13)
            .fontColor('#666666')
        }
        .width('100%')

        if (this.cropMode) {
          this.CropEditor()
          Row({ space: 8 }) {
            Button('应用裁剪')
              .layoutWeight(1)
              .onClick(() => {
                this.applyCrop();
              })
            Button('取消')
              .layoutWeight(1)
              .backgroundColor('#888888')
              .onClick(() => {
                this.cancelCrop();
              })
          }
          .width('100%')
        } else {
          this.DevicePreview()
        }

        if (this.manualOverride) {
          Row({ space: 8 }) {
            Text('已手动覆盖设备配置').fontSize(11).fontColor('#B26A00').layoutWeight(1)
            Button('恢复设备配置')
              .fontSize(11)
              .height(28)
              .onClick(() => {
                if (this.deviceModelCode.length === 0) {
                  this.toast('尚未获取到设备配置');
                  return;
                }
                this.applyModelCode(this.deviceModelCode);
              })
          }
          .width('100%')
        }

        Button('编辑图片：文字 / 画笔 / 待办 / 课表')
          .width('100%')
          .backgroundColor('#0F766E')
          .enabled(this.hasImage)
          .onClick(() => {
            this.openEditor();
          })

        Row() {
          Text('发送前清屏（去残影，约多 15 秒）').fontSize(12).layoutWeight(1)
          Toggle({ type: ToggleType.Switch, isOn: this.clearBeforeSend })
            .onChange((on: boolean) => {
              this.clearBeforeSend = on;
            })
        }
        .width('100%')

        Row({ space: 8 }) {
          Text('适配').fontSize(13)
          Select(FIT_LABELS.map((label: string): SelectOption => {
            return { value: label };
          }))
            .selected(this.fitIndex)
            .value(FIT_LABELS[this.fitIndex])
            .layoutWeight(1)
            .onSelect((index: number) => {
              this.fitIndex = index;
              if (this.srcImage !== null) {
                this.rebuild();
              }
            })
        }
        .width('100%')

        Row({ space: 8 }) {
          Button('旋转90°')
            .layoutWeight(1)
            .fontSize(13)
            .onClick(() => {
              this.rotateQuarter = (this.rotateQuarter + 1) % 4;
              if (this.srcImage !== null) {
                this.rebuild();
              }
            })
          Button(this.mirrorHFlag ? '取消镜像' : '左右镜像')
            .layoutWeight(1)
            .fontSize(13)
            .onClick(() => {
              this.mirrorHFlag = !this.mirrorHFlag;
              if (this.srcImage !== null) {
                this.rebuild();
              }
            })
          Button(this.mirrorVFlag ? '取消翻转' : '上下翻转')
            .layoutWeight(1)
            .fontSize(13)
            .onClick(() => {
              this.mirrorVFlag = !this.mirrorVFlag;
              if (this.srcImage !== null) {
                this.rebuild();
              }
            })
        }
        .width('100%')

        Row({ space: 8 }) {
          Text('抖动').fontSize(13)
          Select(DITHER_LABELS.map((label: string): SelectOption => {
            return { value: label };
          }))
            .selected(this.ditherIndex)
            .value(DITHER_LABELS[this.ditherIndex])
            .layoutWeight(1)
            .onSelect((index: number) => {
              this.ditherIndex = index;
              if (this.hasImage) {
                this.process();
              }
            })
        }
        .width('100%')

        Row({ space: 8 }) {
          Text('强度').fontSize(13).width(40)
          Button('−').type(ButtonType.Capsule).backgroundColor('#2563EB').fontColor(Color.White)
            .width(36).height(30).fontSize(16)
            .onClick(() => {
              this.strength = Math.max(0, Math.min(5, Math.round((this.strength - 0.1) * 10) / 10));
              if (this.hasImage) { this.process(); }
            })
          Text(this.strength.toFixed(1)).fontSize(12).layoutWeight(1).textAlign(TextAlign.Center)
          Button('+').type(ButtonType.Capsule).backgroundColor('#2563EB').fontColor(Color.White)
            .width(36).height(30).fontSize(16)
            .onClick(() => {
              this.strength = Math.max(0, Math.min(5, Math.round((this.strength + 0.1) * 10) / 10));
              if (this.hasImage) { this.process(); }
            })
        }
        .width('100%')

        Row({ space: 8 }) {
          Text('对比').fontSize(13).width(40)
          Button('−').type(ButtonType.Capsule).backgroundColor('#2563EB').fontColor(Color.White)
            .width(36).height(30).fontSize(16)
            .onClick(() => {
              this.contrastValue = Math.max(0.5, Math.min(2, Math.round((this.contrastValue - 0.1) * 10) / 10));
              if (this.hasImage) { this.process(); }
            })
          Text(this.contrastValue.toFixed(1)).fontSize(12).layoutWeight(1).textAlign(TextAlign.Center)
          Button('+').type(ButtonType.Capsule).backgroundColor('#2563EB').fontColor(Color.White)
            .width(36).height(30).fontSize(16)
            .onClick(() => {
              this.contrastValue = Math.max(0.5, Math.min(2, Math.round((this.contrastValue + 0.1) * 10) / 10));
              if (this.hasImage) { this.process(); }
            })
        }
        .width('100%')

        Row({ space: 8 }) {
          Text('亮度').fontSize(13).width(40)
          Button('−').type(ButtonType.Capsule).backgroundColor('#2563EB').fontColor(Color.White)
            .width(36).height(30).fontSize(16)
            .onClick(() => {
              this.brightnessValue = Math.max(-1, Math.min(1, Math.round((this.brightnessValue - 0.1) * 10) / 10));
              if (this.hasImage) { this.process(); }
            })
          Text(this.brightnessValue.toFixed(1)).fontSize(12).layoutWeight(1).textAlign(TextAlign.Center)
          Button('+').type(ButtonType.Capsule).backgroundColor('#2563EB').fontColor(Color.White)
            .width(36).height(30).fontSize(16)
            .onClick(() => {
              this.brightnessValue = Math.max(-1, Math.min(1, Math.round((this.brightnessValue + 0.1) * 10) / 10));
              if (this.hasImage) { this.process(); }
            })
        }
        .width('100%')

        Row({ space: 8 }) {
          Text('伽马').fontSize(13).width(40)
          Button('−').type(ButtonType.Capsule).backgroundColor('#2563EB').fontColor(Color.White)
            .width(36).height(30).fontSize(16)
            .onClick(() => {
              this.gammaValue = Math.max(0.2, Math.min(3, Math.round((this.gammaValue - 0.1) * 10) / 10));
              if (this.hasImage) { this.process(); }
            })
          Text(this.gammaValue.toFixed(1)).fontSize(12).layoutWeight(1).textAlign(TextAlign.Center)
          Button('+').type(ButtonType.Capsule).backgroundColor('#2563EB').fontColor(Color.White)
            .width(36).height(30).fontSize(16)
            .onClick(() => {
              this.gammaValue = Math.max(0.2, Math.min(3, Math.round((this.gammaValue + 0.1) * 10) / 10));
              if (this.hasImage) { this.process(); }
            })
        }
        .width('100%')

        Row({ space: 8 }) {
          Text('饱和').fontSize(13).width(40)
          Button('−').type(ButtonType.Capsule).backgroundColor('#2563EB').fontColor(Color.White)
            .width(36).height(30).fontSize(16)
            .onClick(() => {
              this.saturationValue = Math.max(0, Math.min(2, Math.round((this.saturationValue - 0.1) * 10) / 10));
              if (this.hasImage) { this.process(); }
            })
          Text(this.saturationValue.toFixed(1)).fontSize(12).layoutWeight(1).textAlign(TextAlign.Center)
          Button('+').type(ButtonType.Capsule).backgroundColor('#2563EB').fontColor(Color.White)
            .width(36).height(30).fontSize(16)
            .onClick(() => {
              this.saturationValue = Math.max(0, Math.min(2, Math.round((this.saturationValue + 0.1) * 10) / 10));
              if (this.hasImage) { this.process(); }
            })
        }
        .width('100%')

        Text('说明：预览为设备与上传后的组合效果；支持适配、旋转、镜像、抖动与裁剪。')
          .fontSize(11)
          .fontColor('#999999')

        if (this.progress.length > 0) {
          Text(this.progress).fontSize(13).fontColor('#2563EB')
        }

        Row({ space: 8 }) {
          Button(this.busy ? '发送中...' : '发送图片')
            .layoutWeight(1)
            .enabled(!this.busy)
            .onClick(() => {
              this.sendImage();
            })
          Button('导出数组')
            .layoutWeight(1)
            .backgroundColor('#555555')
            .enabled(this.hasImage)
            .onClick(() => {
              this.exportArray();
            })
        }
        .width('100%')

        this.LogPanel()
      }
      .padding(12)
      .width('100%')
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  SettingsTab() {
    Scroll() {
      Column({ space: 12 }) {
        Text('设备信息').fontSize(15).fontWeight(FontWeight.Bold).width('100%')
        Row() {
          Text('连接状态').fontSize(13).layoutWeight(1)
          Text(this.connected ? '已连接' : '未连接').fontSize(13).fontColor(this.connected ? '#2E7D32' : '#999999')
        }.width('100%')
        Row() {
          Text('固件版本').fontSize(13).layoutWeight(1)
          Text(this.versionText).fontSize(13)
        }.width('100%')
        Row() {
          Text('当前 MTU').fontSize(13).layoutWeight(1)
          Text(this.mtu.toString()).fontSize(13)
        }.width('100%')

        Divider()
        Text('省电').fontSize(15).fontWeight(FontWeight.Bold).width('100%')
        Row() {
          Text('发送后断开（不推荐，会断开连接）').fontSize(13).layoutWeight(1)
          Toggle({ type: ToggleType.Switch, isOn: this.autoDisconnect })
            .onChange((on: boolean) => {
              this.autoDisconnect = on;
            })
        }.width('100%')
        Text('本设备没有可用的唤醒源，深睡 (0x92) 已禁用。')
          .fontSize(11)
          .fontColor('#999999')
        Row({ space: 8 }) {
          Text('空闲断开(秒)').fontSize(13).layoutWeight(1)
          TextInput({ text: this.idleSec.toString() })
            .type(InputType.Number)
            .width(80)
            .onChange((v: string) => {
              const n: number = parseInt(v);
              if (!isNaN(n) && n >= 30) {
                this.idleSec = n;
                this.client.setIdleTimeout(n * 1000);
              }
            })
        }
        .width('100%')
        Divider()
        Text('固件升级').fontSize(15).fontWeight(FontWeight.Bold).width('100%')
        Button('选择固件包并升级')
          .width('100%')
          .backgroundColor('#D9534F')
          .onClick(() => {
            if (this.connected) {
              this.disconnect();
            }
            router.pushUrl({ url: 'pages/Firmware' });
          })
        Text('OTA 通过 Nordic Secure DFU 完成；升级前请确认包与 7.5 寸三色（驱动 07）匹配，并保证 4 颗 CR2450 电量充足。')
          .fontSize(11)
          .fontColor('#999999')
        Divider()
        Text('关于').fontSize(15).fontWeight(FontWeight.Bold).width('100%')
        Text('墨水屏控制台（HarmonyOS 版）v1.0.0').fontSize(13)
        Text('协议与网页版 EPD-nRF5_DYC 一致：Service 62750001-…，指令 0x00–0x99，CRC16 块传输。')
          .fontSize(12)
          .fontColor('#666666')
        Text('本应用基于 OpenHarmony API 12 构建。')
          .fontSize(12)
          .fontColor('#666666')
      }
      .padding(12)
      .width('100%')
      .alignItems(HorizontalAlign.Start)
    }
    .width('100%')
    .height('100%')
  }

  private driverOptions(): SelectOption[] {
    return DRIVERS.map((d: DriverInfo): SelectOption => {
      return { value: d.label };
    });
  }

  build() {
    Column() {
      Row() {
        Text('墨水屏控制台')
          .fontSize(20)
          .fontWeight(FontWeight.Bold)
          .layoutWeight(1)
        Text(this.connected ? '已连接' : '未连接')
          .fontSize(13)
          .fontColor(this.connected ? '#2E7D32' : '#999999')
      }
      .width('100%')
      .padding({ left: 16, right: 16, top: 10, bottom: 6 })

      Tabs({ barPosition: BarPosition.End }) {
        TabContent() {
          this.ConnectTab()
        }.tabBar('连接')

        TabContent() {
          this.ControlTab()
        }.tabBar('模式')

        TabContent() {
          this.ImageTab()
        }.tabBar('传图')

        TabContent() {
          this.SettingsTab()
        }.tabBar('设置')
      }
      .layoutWeight(1)
      .barHeight(52)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#FFFFFF')
  }
}
