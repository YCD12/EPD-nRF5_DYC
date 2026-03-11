let bleDevice, gattServer;
let epdService, epdCharacteristic;
let startTime, msgIndex, appVersion;
let canvas, ctx, textDecoder;
let paintManager, cropManager;

// APP版本号 (便于调试)
const APP_VERSION = '2.0.3';
const APP_BUILD_DATE = '2026-03-10';
const EPD_DEVICE_NAME_PREFIX = 'NRF_EPD';
const SCAN_DURATION_MS = 5000;
const LOG_CONSOLE_STORAGE_KEY = 'epd_log_to_console';
let enableDeviceFilter = true;
let logToConsole = true;
let toastTimer = null;
let rotationQuarterTurns = 0; // 0,1,2,3 => 0°,90°,180°,270°(顺时针)
let isConnecting = false;
let clearLogOnNextSuccessfulConnect = false;
let lastWeekStartSent = null;
let internalDisconnectInProgress = false;
let internalDisconnectSuppressUntil = 0;

const EpdCmd = {
  SET_PINS: 0x00,
  INIT: 0x01,
  CLEAR: 0x02,
  SEND_CMD: 0x03,
  SEND_DATA: 0x04,
  REFRESH: 0x05,
  SLEEP: 0x06,

  SET_TIME: 0x20,
  SET_WEEK_START: 0x21,

  WRITE_IMG: 0x30, // v1.6

  // CRC Transfer commands (v1.9+)
  WRITE_BLOCK: 0x31,
  QUERY_STATUS: 0x32,
  RESET_TRANSFER: 0x33,

  SET_CONFIG: 0x90,
  SYS_RESET: 0x91,
  SYS_SLEEP: 0x92,
  CFG_ERASE: 0x99,
};

const canvasSizes = [
  { name: '1.54_152_152', width: 152, height: 152 },
  { name: '1.54_200_200', width: 200, height: 200 },
  { name: '2.13_212_104', width: 212, height: 104 },
  { name: '2.13_250_122', width: 250, height: 122 },
  { name: '2.66_296_152', width: 296, height: 152 },
  { name: '2.9_296_128', width: 296, height: 128 },
  { name: '2.9_384_168', width: 384, height: 168 },
  { name: '3.5_384_184', width: 384, height: 184 },
  { name: '3.7_416_240', width: 416, height: 240 },
  { name: '3.97_800_480', width: 800, height: 480 },
  { name: '4.2_400_300', width: 400, height: 300 },
  { name: '5.79_792_272', width: 792, height: 272 },
  { name: '5.83_600_448', width: 600, height: 448 },
  { name: '5.83_648_480', width: 648, height: 480 },
  { name: '7.5_640_384', width: 640, height: 384 },
  { name: '7.5_800_480', width: 800, height: 480 },
  { name: '7.5_880_528', width: 880, height: 528 },
  { name: '10.2_960_640', width: 960, height: 640 },
  { name: '10.85_1360_480', width: 1360, height: 480 },
  { name: '11.6_960_640', width: 960, height: 640 },
  { name: '4E_600_400', width: 600, height: 400 },
  { name: '7.3E6', width: 480, height: 800 }
];

function hex2bytes(hex) {
  for (var bytes = [], c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
  return new Uint8Array(bytes);
}

function bytes2hex(data) {
  return new Uint8Array(data).reduce(
    function (memo, i) {
      return memo + ("0" + i.toString(16)).slice(-2);
    }, "");
}

function intToHex(intIn) {
  let stringOut = ("0000" + intIn.toString(16)).substr(-4)
  return stringOut.substring(2, 4) + stringOut.substring(0, 2);
}

async function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resetVariables() {
  gattServer = null;
  epdService = null;
  epdCharacteristic = null;
  msgIndex = 0;
}

async function write(cmd, data, withResponse = true) {
  if (!epdCharacteristic) {
    addLog("服务不可用，请检查蓝牙连接");
    return false;
  }
  let payload = [cmd];
  if (data) {
    if (typeof data == 'string') data = hex2bytes(data);
    if (data instanceof Uint8Array) data = Array.from(data);
    payload.push(...data)
  }
  addLog(bytes2hex(payload), '⇑');
  try {
    if (withResponse)
      await epdCharacteristic.writeValueWithResponse(Uint8Array.from(payload));
    else
      await epdCharacteristic.writeValueWithoutResponse(Uint8Array.from(payload));
  } catch (e) {
    console.error(e);
    if (e.message) addLog("write: " + e.message);
    return false;
  }
  return true;
}

async function writeImage(data, step = 'bw') {
  const chunkSize = document.getElementById('mtusize').value - 2;
  const interleavedCount = document.getElementById('interleavedcount').value;
  const count = Math.round(data.length / chunkSize);
  let chunkIdx = 0;
  let noReplyCount = interleavedCount;

  for (let i = 0; i < data.length; i += chunkSize) {
    let currentTime = (new Date().getTime() - startTime) / 1000.0;
    setStatus(`${step == 'bw' ? '黑白' : '颜色'}块: ${chunkIdx + 1}/${count + 1}, 总用时: ${currentTime}s`);
    const payload = [
      (step == 'bw' ? 0x0F : 0x00) | (i == 0 ? 0x00 : 0xF0),
      ...data.slice(i, i + chunkSize),
    ];
    if (noReplyCount > 0) {
      await write(EpdCmd.WRITE_IMG, payload, false);
      noReplyCount--;
    } else {
      await write(EpdCmd.WRITE_IMG, payload, true);
      noReplyCount = interleavedCount;
    }
    chunkIdx++;
  }
}

// New CRC-verified image transfer with resume capability
async function writeImageCRC(data, step = 'bw') {
  const stepName = step === 'bw' ? '黑白' : '颜色';

  try {
    await BleTransfer.sendImageWithResume(data, step, (sent, total, speedInfo) => {
      if (speedInfo) {
        setStatus(`${stepName}块(CRC): ${sent}/${total}, ${BleTransfer.getSpeedString()}, ${speedInfo.elapsed}s`);
      } else {
        setStatus(`${stepName}块(CRC): ${sent}/${total}`);
      }
    });
    return true;
  } catch (e) {
    console.error('CRC transfer failed:', e);
    addLog(`CRC传输失败: ${e.message}，回退到普通传输`);
    // Fallback to legacy transfer
    await writeImage(data, step);
    return true;
  }
}

async function setDriver() {
  if (!confirm('确认设置驱动配置？此操作将重新初始化屏幕。')) return;
  await write(EpdCmd.SET_PINS, document.getElementById("epdpins").value);
  await write(EpdCmd.INIT, document.getElementById("epddriver").value);
  addLog("驱动配置已设置");
}

// 辅助函数：获取星期第一天设置
function getWeekStart() {
  const weekStartValue = document.getElementById('weekStart').value;
  return weekStartValue !== null && weekStartValue !== '' ? parseInt(weekStartValue) : 1;
}

// 辅助函数：构建时间数据包
function buildTimeData(mode) {
  const timestamp = new Date().getTime() / 1000;
  return new Uint8Array([
    (timestamp >> 24) & 0xFF,
    (timestamp >> 16) & 0xFF,
    (timestamp >> 8) & 0xFF,
    timestamp & 0xFF,
    -(new Date().getTimezoneOffset() / 60),
    mode
  ]);
}

// 辅助函数：发送时间同步命令
async function sendTimeCommand(mode, modeName) {
  const weekStart = getWeekStart();
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  let weekStartChanged = false;

  // 仅在星期第一天变更时才发送，避免不必要的二次刷新。
  if (lastWeekStartSent !== weekStart) {
    const weekStartOk = await write(EpdCmd.SET_WEEK_START, new Uint8Array([weekStart]));
    if (weekStartOk) {
      lastWeekStartSent = weekStart;
      weekStartChanged = true;
    } else {
      addLog("SET_WEEK_START发送失败，将在下次重试");
    }
  } else {
    addLog(`星期第一天未变化(${weekDays[weekStart]})，跳过设置命令`);
  }

  // 发送时间数据
  if (await write(EpdCmd.SET_TIME, buildTimeData(mode))) {
    addLog(`${modeName}已启用！`);
    addLog(weekStartChanged ? `星期第一天已设置为：${weekDays[weekStart]}` : `星期第一天保持为：${weekDays[weekStart]}`);
    addLog("屏幕刷新完成前请不要操作。");
    return true;
  }
  return false;
}

async function syncTime(mode) {
  const modeName = mode === 1 ? '日历模式' : '时钟模式';
  let confirmMsg = `确认切换到${modeName}？`;
  if (mode === 2) {
    confirmMsg += '\n\n⚠️ 警告：时钟模式会加速屏幕老化导致损坏！\n• 请勿长时间使用\n• 费电';
  }
  if (!confirm(confirmMsg)) return;

  await sendTimeCommand(mode, modeName);
}

// 老款时钟模式 (仅适用于UC8179 7.5寸)
async function syncTimeLegacy() {
  if (!confirm('确认切换到老款时钟模式？\n\n⚠️ 警告：时钟模式会加速屏幕老化导致损坏！\n• 请勿长时间使用\n• 此模式仅适用于UC8179 7.5寸屏幕\n• 费电')) return;

  await sendTimeCommand(3, '老款时钟模式');
}

async function clearScreen() {
  if (confirm('确认清除屏幕内容?')) {
    await write(EpdCmd.CLEAR);
    addLog("清屏指令已发送！");
    addLog("屏幕刷新完成前请不要操作。");
  }
}

async function sendcmd() {
  const cmdTXT = document.getElementById('cmdTXT').value;
  if (cmdTXT == '') return;
  if (!confirm('确认发送命令？此操作可能影响设备状态。')) return;
  const bytes = hex2bytes(cmdTXT);
  await write(bytes[0], bytes.length > 1 ? bytes.slice(1) : null);
  addLog("命令已发送");
}

function convertUC8159(blackWhiteData, redWhiteData) {
  const halfLength = blackWhiteData.length;
  let payloadData = new Uint8Array(halfLength * 4);
  let payloadIdx = 0;
  let black_data, color_data, data;
  for (let i = 0; i < halfLength; i++) {
    black_data = blackWhiteData[i];
    color_data = redWhiteData[i];
    for (let j = 0; j < 8; j++) {
      if ((color_data & 0x80) == 0x00) data = 0x04;  // red
      else if ((black_data & 0x80) == 0x00) data = 0x00;  // black
      else data = 0x03;  // white
      data = (data << 4) & 0xFF;
      black_data = (black_data << 1) & 0xFF;
      color_data = (color_data << 1) & 0xFF;
      j++;
      if ((color_data & 0x80) == 0x00) data |= 0x04;  // red
      else if ((black_data & 0x80) == 0x00) data |= 0x00;  // black
      else data |= 0x03;  // white
      black_data = (black_data << 1) & 0xFF;
      color_data = (color_data << 1) & 0xFF;
      payloadData[payloadIdx++] = data;
    }
  }
  return payloadData;
}

async function sendimg() {
  if (cropManager.isCropMode()) {
    alert("请先完成图片裁剪！发送已取消。");
    return;
  }

  // Clear schedule selection indicator before sending
  if (paintManager && paintManager.selectedScheduleCell) {
    paintManager.cancelScheduleInput();
  }

  // Clear text selection indicator before sending
  if (paintManager && paintManager.selectedEditingText) {
    paintManager.deselectEditingText();
  }

  const canvasSize = document.getElementById('canvasSize').value;
  const ditherMode = document.getElementById('ditherMode').value;
  const epdDriverSelect = document.getElementById('epddriver');
  const selectedOption = epdDriverSelect.options[epdDriverSelect.selectedIndex];
  const driverSize = selectedOption.getAttribute('data-size');

  let expectedWidth = canvas.width;
  let expectedHeight = canvas.height;
  if (driverSize) {
    const parts = driverSize.split('_');
    if (parts.length >= 3) {
      expectedWidth = parseInt(parts[1], 10);
      expectedHeight = parseInt(parts[2], 10);
    }
  }

  const isExactMatch = (canvas.width === expectedWidth && canvas.height === expectedHeight);
  const isRotatedMatch = (canvas.width === expectedHeight && canvas.height === expectedWidth);

  if (!isExactMatch && !isRotatedMatch && selectedOption.getAttribute('data-size') !== canvasSize) {
    if (!confirm("警告：画布尺寸和驱动不匹配，是否继续？")) return;
  }
  if (selectedOption.getAttribute('data-color') !== ditherMode) {
    if (!confirm("警告：颜色模式和驱动不匹配，是否继续？")) return;
  }

  startTime = new Date().getTime();
  const status = document.getElementById("status");
  status.parentElement.style.display = "block";
  const hideStatusBar = () => {
    status.parentElement.style.display = "none";
  };

  let imageData;
  if (isRotatedMatch) {
    // 固件按驱动分辨率顺序解析像素，若画布是90°互换尺寸则先旋回驱动方向再发送，避免花屏。
    const sendCanvas = document.createElement('canvas');
    sendCanvas.width = expectedWidth;
    sendCanvas.height = expectedHeight;
    const sendCtx = sendCanvas.getContext("2d", { willReadFrequently: true });
    // 根据累计旋转方向进行还原：90°->逆时针90°，270°->顺时针90°。
    if (rotationQuarterTurns === 1) {
      sendCtx.translate(0, sendCanvas.height);
      sendCtx.rotate(-Math.PI / 2);
    } else if (rotationQuarterTurns === 3) {
      sendCtx.translate(sendCanvas.width, 0);
      sendCtx.rotate(Math.PI / 2);
    } else {
      const uncertainTip = `检测到画布尺寸互换，但旋转状态异常(${rotationQuarterTurns * 90}°)。将按默认方向(-90°)适配。`;
      addLog(uncertainTip);
      showToast(uncertainTip);
      if (!confirm(`${uncertainTip}\n\n是否继续发送？`)) {
        hideStatusBar();
        return;
      }
      sendCtx.translate(0, sendCanvas.height);
      sendCtx.rotate(-Math.PI / 2);
    }
    sendCtx.drawImage(canvas, 0, 0);
    imageData = sendCtx.getImageData(0, 0, sendCanvas.width, sendCanvas.height);
    const orientationTip = `检测到画布方向与驱动不一致，发送前自动旋转适配为 ${expectedWidth}x${expectedHeight}`;
    addLog(orientationTip);
    showToast(orientationTip);
  } else {
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  const processedData = processImageData(imageData, ditherMode);

  updateButtonStatus(true);

  // Use CRC transfer for firmware version >= 0x20
  const useCRC = (appVersion >= 0x20) && (typeof BleTransfer !== 'undefined');
  const transferFn = useCRC ? writeImageCRC : writeImage;

  if (useCRC) {
    addLog("使用CRC校验传输模式");
  }

  if (ditherMode === 'fourColor') {
    await transferFn(processedData, 'color');
  } else if (ditherMode === 'threeColor') {
    const halfLength = Math.floor(processedData.length / 2);
    const blackWhiteData = processedData.slice(0, halfLength);
    const redWhiteData = processedData.slice(halfLength);
    if (epdDriverSelect.value === '08' || epdDriverSelect.value === '09') {
      await transferFn(convertUC8159(blackWhiteData, redWhiteData), 'bw');
    } else {
      await transferFn(blackWhiteData, 'bw');
      await transferFn(redWhiteData, 'red');
    }
  } else if (ditherMode === 'blackWhiteColor') {
    if (epdDriverSelect.value === '08' || epdDriverSelect.value === '09') {
      const emptyData = new Uint8Array(processedData.length).fill(0xFF);
      await transferFn(convertUC8159(processedData, emptyData), 'bw');
    } else {
      await transferFn(processedData, 'bw');
    }
  } else {
    addLog("当前固件不支持此颜色模式。");
    updateButtonStatus();
    hideStatusBar();
    return;
  }

  const refreshOk = await write(EpdCmd.REFRESH);
  updateButtonStatus();
  const isConnectedNow = !!(gattServer && gattServer.connected && bleDevice && bleDevice.gatt && bleDevice.gatt.connected);
  if (!refreshOk) {
    if (!isConnectedNow) {
      const disconnectedTip = '发送完成后设备连接已断开，请点击“重连”继续操作。';
      addLog(disconnectedTip);
      showToast(disconnectedTip);
    } else {
      addLog('刷新指令发送失败，请重试。');
    }
    hideStatusBar();
    return;
  }

  const sendTime = (new Date().getTime() - startTime) / 1000.0;
  addLog(`发送完成！耗时: ${sendTime}s`);
  setStatus(`发送完成！耗时: ${sendTime}s`);
  addLog("屏幕刷新完成前请不要操作。");
  if (!isConnectedNow) {
    const disconnectedTip = '图片已发送，设备连接已断开，请点击“重连”继续操作。';
    addLog(disconnectedTip);
    showToast(disconnectedTip);
  }
  setTimeout(() => {
    hideStatusBar();
  }, 5000);
}

function downloadDataArray() {
  if (cropManager.isCropMode()) {
    alert("请先完成图片裁剪！下载已取消。");
    return;
  }

  const mode = document.getElementById('ditherMode').value;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const processedData = processImageData(imageData, mode);

  if (mode === 'sixColor' && processedData.length !== canvas.width * canvas.height) {
    console.log(`错误：预期${canvas.width * canvas.height}字节，但得到${processedData.length}字节`);
    addLog('数组大小不匹配。请检查图像尺寸和模式。');
    return;
  }

  const dataLines = [];
  for (let i = 0; i < processedData.length; i++) {
    const hexValue = (processedData[i] & 0xff).toString(16).padStart(2, '0');
    dataLines.push(`0x${hexValue}`);
  }

  const formattedData = [];
  for (let i = 0; i < dataLines.length; i += 16) {
    formattedData.push(dataLines.slice(i, i + 16).join(', '));
  }

  const colorModeValue = mode === 'sixColor' ? 0 : mode === 'fourColor' ? 1 : mode === 'blackWhiteColor' ? 2 : 3;
  const arrayContent = [
    'const uint8_t imageData[] PROGMEM = {',
    formattedData.join(',\n'),
    '};',
    `const uint16_t imageWidth = ${canvas.width};`,
    `const uint16_t imageHeight = ${canvas.height};`,
    `const uint8_t colorMode = ${colorModeValue};`
  ].join('\n');

  const blob = new Blob([arrayContent], { type: 'text/plain' });
  const link = document.createElement('a');
  link.download = 'imagedata.h';
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function updateButtonStatus(forceDisabled = false) {
  const connected = gattServer != null && gattServer.connected;
  const status = forceDisabled ? 'disabled' : (connected ? null : 'disabled');
  document.getElementById("reconnectbutton").disabled = (gattServer == null || gattServer.connected) ? 'disabled' : null;
  document.getElementById("sendcmdbutton").disabled = status;
  document.getElementById("calendarmodebutton").disabled = status;
  document.getElementById("clockmodebutton").disabled = status;
  document.getElementById("clearscreenbutton").disabled = status;
  document.getElementById("sendimgbutton").disabled = status;
  document.getElementById("setDriverbutton").disabled = status;
}

function disconnect() {
  const isInternalRetryDisconnect = internalDisconnectInProgress || Date.now() < internalDisconnectSuppressUntil;
  updateButtonStatus();
  resetVariables();
  if (!isInternalRetryDisconnect) {
    clearLogOnNextSuccessfulConnect = true;
    lastWeekStartSent = null;
    addLog('已断开连接.');
  }
  document.getElementById("connectbutton").innerHTML = '连接';

  // 隐藏老款时钟按钮
  const legacyBtn = document.getElementById('legacyclockbutton');
  if (legacyBtn) legacyBtn.style.display = 'none';
}

function updateDeviceFilterButton() {
  const button = document.getElementById('deviceFilterToggle');
  if (!button) return;
  button.innerText = enableDeviceFilter ? '不过滤设备' : '启用NRF_EPD过滤';
  button.title = enableDeviceFilter ? '当前仅显示NRF_EPD设备，点击后显示全部蓝牙设备' : '当前显示全部蓝牙设备，点击后仅显示NRF_EPD设备';
}

function toggleDeviceFilter() {
  enableDeviceFilter = !enableDeviceFilter;
  updateDeviceFilterButton();
  if (enableDeviceFilter) {
    addLog(`设备过滤已启用，仅显示 ${EPD_DEVICE_NAME_PREFIX} 开头设备`);
  } else {
    addLog('设备过滤已关闭，将显示全部蓝牙设备');
  }
}

function showDeviceSelectModal(candidates, refreshCandidatesFn = null) {
  const modal = document.getElementById('deviceSelectModal');
  const list = document.getElementById('deviceModalList');
  const hint = document.getElementById('deviceModalHint');
  const cancelBtn = document.getElementById('deviceModalCancel');
  const refreshBtn = document.getElementById('deviceModalRefresh');

  if (!modal || !list || !hint || !cancelBtn || !refreshBtn) {
    addLog('设备选择弹窗不可用，请刷新页面后重试');
    return Promise.resolve({
      selected: null,
      refreshAttempted: false,
      latestCount: candidates.length,
      lastScanStatus: 'ok'
    });
  }

  let currentCandidates = candidates.slice();
  modal.style.display = 'flex';

  return new Promise((resolve) => {
    let settled = false;
    let refreshAttempted = false;
    let lastScanStatus = 'ok';

    const updateHint = () => {
      hint.innerText = `检测到 ${currentCandidates.length} 个 ${EPD_DEVICE_NAME_PREFIX} 设备（已按信号强度排序，越靠前越强）`;
    };

    const close = (selected) => {
      if (settled) return;
      settled = true;
      modal.style.display = 'none';
      modal.removeEventListener('click', onOverlayClick);
      cancelBtn.removeEventListener('click', onCancel);
      refreshBtn.removeEventListener('click', onRefresh);
      document.removeEventListener('keydown', onKeydown);
      refreshBtn.disabled = false;
      refreshBtn.innerText = '刷新扫描';
      resolve({
        selected,
        refreshAttempted,
        latestCount: currentCandidates.length,
        lastScanStatus
      });
    };
    const renderCandidateList = () => {
      list.innerHTML = '';
      if (currentCandidates.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'device-modal-empty';
        empty.innerText = `未扫描到 ${EPD_DEVICE_NAME_PREFIX} 设备，请点击“刷新扫描”重试`;
        list.appendChild(empty);
        return;
      }
      currentCandidates.forEach((candidate, index) => {
        const rssiText = Number.isFinite(candidate.rssi) ? `${candidate.rssi} dBm` : 'RSSI未知';
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'device-modal-item';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = `${index + 1}. ${candidate.name}`;
        item.appendChild(nameSpan);

        if (index === 0) {
          const recommendedSpan = document.createElement('span');
          recommendedSpan.className = 'recommended';
          recommendedSpan.textContent = '推荐';
          item.appendChild(recommendedSpan);
        }

        const rssiSpan = document.createElement('span');
        rssiSpan.className = 'rssi';
        rssiSpan.textContent = rssiText;
        item.appendChild(rssiSpan);

        item.addEventListener('click', () => close(candidate));
        list.appendChild(item);
      });
    };

    const onCancel = () => close(null);
    const onOverlayClick = (event) => {
      if (event.target === modal) close(null);
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') close(null);
    };
    const onRefresh = async () => {
      if (!refreshCandidatesFn) return;
      refreshAttempted = true;
      refreshBtn.disabled = true;
      refreshBtn.innerText = '扫描中...';
      hint.innerText = `正在扫描 ${EPD_DEVICE_NAME_PREFIX} 设备，请稍候...`;
      try {
        const refreshed = await refreshCandidatesFn();
        if (refreshed && refreshed.status === 'ok') {
          lastScanStatus = 'ok';
          currentCandidates = refreshed.candidates || [];
          updateHint();
          renderCandidateList();
        } else if (refreshed && refreshed.status === 'unsupported') {
          lastScanStatus = 'unsupported';
          hint.innerText = `当前浏览器不支持信号扫描排序，请改用“不过滤设备”或系统筛选`;
        }
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.innerText = '刷新扫描';
      }
    };

    cancelBtn.addEventListener('click', onCancel);
    refreshBtn.addEventListener('click', onRefresh);
    modal.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);

    updateHint();
    renderCandidateList();
  });
}

async function scanFilteredDevices() {
  if (!navigator.bluetooth.requestLEScan) {
    return { status: 'unsupported', candidates: [] };
  }

  const discovered = new Map();
  const onAdvertisement = (event) => {
    const name = event.device?.name || '';
    if (!name.startsWith(EPD_DEVICE_NAME_PREFIX)) return;
    discovered.set(event.device.id, {
      device: event.device,
      name: name,
      rssi: event.rssi
    });
  };

  let scan;
  try {
    scan = await navigator.bluetooth.requestLEScan({
      acceptAllAdvertisements: true,
      keepRepeatedDevices: true
    });
    navigator.bluetooth.addEventListener('advertisementreceived', onAdvertisement);
    addLog(`正在扫描 ${EPD_DEVICE_NAME_PREFIX} 设备(${SCAN_DURATION_MS / 1000}s)...`);
    await new Promise(resolve => setTimeout(resolve, SCAN_DURATION_MS));
  } catch (e) {
    console.error(e);
    addLog(`蓝牙扫描不可用，将退回系统设备选择: ${e.message}`);
    return { status: 'unsupported', candidates: [] };
  } finally {
    navigator.bluetooth.removeEventListener('advertisementreceived', onAdvertisement);
    if (scan) scan.stop();
  }

  const candidates = Array.from(discovered.values())
    .sort((a, b) => (Number.isFinite(b.rssi) ? b.rssi : -999) - (Number.isFinite(a.rssi) ? a.rssi : -999));

  if (candidates.length === 0) {
    addLog(`扫描完成，未发现 ${EPD_DEVICE_NAME_PREFIX} 设备`);
  } else {
    const best = candidates[0];
    const bestRssiText = Number.isFinite(best.rssi) ? `${best.rssi} dBm` : 'RSSI未知';
    addLog(`扫描完成，发现 ${candidates.length} 个目标设备，最强信号: ${best.name}(${bestRssiText})`);
  }
  return { status: 'ok', candidates };
}

async function requestBleDevice() {
  if (!enableDeviceFilter) {
    addLog('设备过滤已关闭，打开系统蓝牙选择窗口(全部设备)');
    return await navigator.bluetooth.requestDevice({
      optionalServices: ['62750001-d828-918d-fb46-b6c11c675aec'],
      acceptAllDevices: true
    });
  }

  const scanResult = await scanFilteredDevices();
  if (scanResult.status === 'unsupported') {
    addLog(`当前浏览器不支持信号扫描排序，退回系统窗口并仅筛选 ${EPD_DEVICE_NAME_PREFIX} 设备`);
    return await navigator.bluetooth.requestDevice({
      optionalServices: ['62750001-d828-918d-fb46-b6c11c675aec'],
      filters: [{ namePrefix: EPD_DEVICE_NAME_PREFIX }]
    });
  }
  const modalResult = await showDeviceSelectModal(scanResult.candidates, scanFilteredDevices);
  const selected = modalResult ? modalResult.selected : null;
  if (!selected) {
    const shouldShowNotFoundAlert = modalResult &&
      modalResult.latestCount === 0 &&
      modalResult.refreshAttempted &&
      modalResult.lastScanStatus === 'ok';
    if (shouldShowNotFoundAlert) {
      addLog(`未扫描到 ${EPD_DEVICE_NAME_PREFIX} 设备，请先让设备进入配对模式后重试`);
      alert(
        `未发现 ${EPD_DEVICE_NAME_PREFIX} 开头设备。\n\n请先让设备进入配对模式并重新搜索。\n如果再次搜索仍没有目标设备，请点击“不过滤设备”按钮，显示所有蓝牙设备后再连接。`
      );
    }
    return null;
  }
  const rssiText = Number.isFinite(selected.rssi) ? `${selected.rssi} dBm` : 'RSSI未知';
  addLog(`已选择目标设备: ${selected.name} (${rssiText})`);
  return selected.device;
}

async function preConnect() {
  if (gattServer != null && gattServer.connected) {
    if (bleDevice != null && bleDevice.gatt.connected) {
      bleDevice.gatt.disconnect();
    }
  }
  else {
    resetVariables();
    try {
      bleDevice = await requestBleDevice();
      if (!bleDevice) return;
    } catch (e) {
      if (e && (e.name === 'NotFoundError' || (e.message && e.message.toLowerCase().includes('cancel')))) {
        addLog('已取消蓝牙设备选择');
        return;
      }
      console.error(e);
      if (e.message) addLog("requestDevice: " + e.message);
      addLog("请检查蓝牙是否已开启，且使用的浏览器支持蓝牙！建议使用以下浏览器：");
      addLog("• 电脑: Chrome/Edge");
      addLog("• Android: Chrome/Edge");
      addLog("• iOS: Bluefy 浏览器");
      return;
    }

    await bleDevice.addEventListener('gattserverdisconnected', disconnect);
    setTimeout(async function () { await connect(); }, 300);
  }
}

async function reConnect() {
  if (bleDevice != null && bleDevice.gatt.connected)
    bleDevice.gatt.disconnect();
  resetVariables();
  addLog("正在重连");
  setTimeout(async function () { await connect(); }, 300);
}

function handleNotify(value, idx) {
  const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);

  // Route CRC transfer responses to BleTransfer module
  if (data.length >= 1 && (data[0] === 0xA0 || data[0] === 0xA1)) {
    if (typeof BleTransfer !== 'undefined') {
      BleTransfer.handleNotification(value);
    }
    return;
  }

  if (idx == 0) {
    addLog(`收到配置：${bytes2hex(data)}`);
    const epdpins = document.getElementById("epdpins");
    const epddriver = document.getElementById("epddriver");
    epdpins.value = bytes2hex(data.slice(0, 7));
    if (data.length > 10) epdpins.value += bytes2hex(data.slice(10, 11));
    epddriver.value = bytes2hex(data.slice(7, 8));
    updateDitcherOptions();

    // 解析并显示设备型号和尺寸
    const driverCode = bytes2hex(data.slice(7, 8));
    const selectedOption = epddriver.querySelector(`option[value="${driverCode}"]`);
    if (selectedOption) {
      const screenInfo = selectedOption.textContent.trim();
      const sizeData = selectedOption.getAttribute('data-size');
      const colorMode = selectedOption.getAttribute('data-color');

      // 解析尺寸信息 (格式: "7.5_800_480")
      let sizeInfo = '';
      if (sizeData) {
        const [size, width, height] = sizeData.split('_');
        sizeInfo = `${size}英寸 ${width}x${height}`;
      }

      // 解析颜色模式
      const colorModeText = {
        'blackWhiteColor': '黑白',
        'threeColor': '三色(黑白红)',
        'fourColor': '四色'
      }[colorMode] || colorMode;

      addLog(`📱 屏幕型号: ${screenInfo}`);
      addLog(`📐 屏幕尺寸: ${sizeInfo}`);
      addLog(`🎨 颜色模式: ${colorModeText}`);

      // 检测是否为UC8179 7.5寸屏幕 (驱动码06或07)，显示老款时钟按钮
      const legacyClockBtn = document.getElementById('legacyclockbutton');
      if (legacyClockBtn) {
        if (driverCode === '06' || driverCode === '07') {
          legacyClockBtn.style.display = 'inline-block';
          addLog('🕐 检测到UC8179，已启用老款时钟模式按钮');
        } else {
          legacyClockBtn.style.display = 'none';
        }
      }
    }
  } else {
    if (textDecoder == null) textDecoder = new TextDecoder();
    const msg = textDecoder.decode(data);
    addLog(msg, '⇓');
    if (msg.startsWith('mtu=') && msg.length > 4) {
      const mtuSize = parseInt(msg.substring(4));
      document.getElementById('mtusize').value = mtuSize;
      addLog(`MTU 已更新为: ${mtuSize}`);
    } else if (msg.startsWith('t=') && msg.length > 2) {
      const t = parseInt(msg.substring(2)) + new Date().getTimezoneOffset() * 60;
      addLog(`远端时间: ${new Date(t * 1000).toLocaleString()}`);
      addLog(`本地时间: ${new Date().toLocaleString()}`);
    }
  }
}

async function connect() {
  if (isConnecting) {
    addLog('连接流程进行中，请稍候...');
    return;
  }
  if (bleDevice == null || epdCharacteristic != null) return;
  isConnecting = true;
  const targetDevice = bleDevice;
  if (!targetDevice.gatt) {
    addLog('连接失败: 设备GATT不可用');
    isConnecting = false;
    return;
  }

  const MAX_CONNECT_RETRIES = 4;
  const RETRY_DELAY_MS = 1200;
  const CONNECT_TIMEOUT_MS = 9000;
  const SERVICE_TIMEOUT_MS = 12000;
  const CHARACTERISTIC_TIMEOUT_MS = 7000;
  let reconnectKeepFromIndex = null;
  if (clearLogOnNextSuccessfulConnect) {
    const log = document.getElementById('log');
    reconnectKeepFromIndex = log ? log.childNodes.length : 0;
  }

  try {
    for (let retry = 0; retry < MAX_CONNECT_RETRIES; retry++) {
      try {
        if (retry > 0) {
          addLog(`重试连接 (${retry}/${MAX_CONNECT_RETRIES - 1})...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          if (targetDevice !== bleDevice || !targetDevice.gatt) {
            addLog('连接已取消或设备状态已变化');
            return;
          }
        }

        addLog("正在连接: " + targetDevice.name);
        if (targetDevice.gatt.connected) {
          // 设备端已连接时优先复用连接，避免重复connect导致状态冲突。
          gattServer = targetDevice.gatt;
          addLog('  复用已有 GATT 连接');
        } else {
          gattServer = await withTimeout(
            targetDevice.gatt.connect(),
            CONNECT_TIMEOUT_MS,
            `连接超时(${CONNECT_TIMEOUT_MS}ms)`
          );
        }
        addLog('  找到 GATT Server');

        // 等待连接稳定（部分平台刚连上会短暂抖动）
        await new Promise(r => setTimeout(r, 220));

        // 检查连接是否仍然有效
        if (!gattServer || !gattServer.connected) {
          throw new Error('Connection lost after connect');
        }

        try {
          epdService = await withTimeout(
            gattServer.getPrimaryService('62750001-d828-918d-fb46-b6c11c675aec'),
            SERVICE_TIMEOUT_MS,
            `获取服务超时(${SERVICE_TIMEOUT_MS}ms)`
          );
        } catch (serviceErr) {
          // 某些平台首次服务发现偶发超时，短暂等待后再尝试一次。
          await new Promise(r => setTimeout(r, 300));
          epdService = await withTimeout(
            gattServer.getPrimaryService('62750001-d828-918d-fb46-b6c11c675aec'),
            SERVICE_TIMEOUT_MS,
            `获取服务超时(${SERVICE_TIMEOUT_MS}ms)`
          );
        }
        addLog('  找到 EPD Service');
        epdCharacteristic = await withTimeout(
          epdService.getCharacteristic('62750002-d828-918d-fb46-b6c11c675aec'),
          CHARACTERISTIC_TIMEOUT_MS,
          `获取特征超时(${CHARACTERISTIC_TIMEOUT_MS}ms)`
        );
        addLog('  找到 Characteristic');

        // 连接成功，跳出重试循环
        break;
      } catch (e) {
        const errMsg = e && e.message ? e.message : String(e);
        const isTransientConnectError =
          errMsg.includes('Connection lost after connect') ||
          errMsg.includes('GATT Server is disconnected') ||
          errMsg.includes('超时');
        if (retry < MAX_CONNECT_RETRIES - 1) {
          if (!isTransientConnectError) {
            console.error(e);
          }
          addLog(`连接失败: ${errMsg}，准备重试...`);
          // 清理状态准备重试
          gattServer = null;
          epdService = null;
          epdCharacteristic = null;
          if (targetDevice.gatt && targetDevice.gatt.connected) {
            try {
              const shouldForceReset =
                errMsg.includes('GATT Server is disconnected') ||
                errMsg.includes('Connection lost after connect');
              if (shouldForceReset) {
                internalDisconnectInProgress = true;
                internalDisconnectSuppressUntil = Date.now() + 1500;
                targetDevice.gatt.disconnect();
                await new Promise(r => setTimeout(r, 260));
              }
            } catch (_) { }
            finally {
              internalDisconnectInProgress = false;
            }
          }
        } else {
          // 最后一次重试也失败
          console.error(e);
          if (errMsg) addLog("connect: " + errMsg);
          internalDisconnectInProgress = false;
          internalDisconnectSuppressUntil = 0;
          disconnect();
          return;
        }
      }
    }

    try {
      const versionCharacteristic = await epdService.getCharacteristic('62750003-d828-918d-fb46-b6c11c675aec');
      const versionData = await versionCharacteristic.readValue();
      appVersion = versionData.getUint8(0);
      addLog(`固件版本: 0x${appVersion.toString(16)}`);
      addLog(`APP版本: v${APP_VERSION} (${APP_BUILD_DATE})`);
    } catch (e) {
      console.error(e);
      appVersion = 0x15;
    }

    if (appVersion < 0x16) {
      const oldURL = "https://tsl0922.github.io/EPD-nRF5/v1.5";
      alert("!!!注意!!!\n当前固件版本过低，可能无法正常使用部分功能，建议升级到最新版本。");
      if (confirm('是否访问旧版本上位机？')) location.href = oldURL;
      setTimeout(() => {
        addLog(`如遇到问题，请联系购买商家，可访问旧版本上位机: ${oldURL}`);
      }, 500);
    }

    try {
      await epdCharacteristic.startNotifications();
      epdCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
        handleNotify(event.target.value, msgIndex++);
      });
      // 给系统一点时间完成监听器挂载
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error(e);
      if (e.message) addLog("startNotifications: " + e.message);
    }

    await write(EpdCmd.INIT);

    // Initialize CRC transfer module if available
    if (typeof BleTransfer !== 'undefined') {
      BleTransfer.init();
    }

    if (clearLogOnNextSuccessfulConnect) {
      if (reconnectKeepFromIndex != null) {
        clearLogBeforeIndex(reconnectKeepFromIndex);
      } else {
        clearLog();
      }
      clearLogOnNextSuccessfulConnect = false;
      addLog('已重新连接，历史日志已清空。');
    }

    document.getElementById("connectbutton").innerHTML = '断开';
    updateButtonStatus();
  } finally {
    isConnecting = false;
  }
}

function setStatus(statusText) {
  document.getElementById("status").innerHTML = statusText;
}

function showToast(message, duration = 2600) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = message;
  toast.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.display = 'none';
    toastTimer = null;
  }, duration);
}

function initConsoleLogPreference() {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlFlag = params.get('consoleLog');
    if (urlFlag === 'true' || urlFlag === '1') {
      logToConsole = true;
      localStorage.setItem(LOG_CONSOLE_STORAGE_KEY, '1');
      return;
    }
    if (urlFlag === 'false' || urlFlag === '0') {
      logToConsole = false;
      localStorage.setItem(LOG_CONSOLE_STORAGE_KEY, '0');
      return;
    }
    const stored = localStorage.getItem(LOG_CONSOLE_STORAGE_KEY);
    if (stored === '0') {
      logToConsole = false;
      return;
    }
  } catch (_) {
    // 忽略本地存储不可用等异常，默认开启console日志
    logToConsole = true;
  }
}

function setConsoleLogEnabled(enabled) {
  logToConsole = !!enabled;
  try {
    localStorage.setItem(LOG_CONSOLE_STORAGE_KEY, logToConsole ? '1' : '0');
  } catch (_) { }
  addLog(`Console日志输出已${logToConsole ? '开启' : '关闭'}`);
}

function addLog(logTXT, action = '') {
  const log = document.getElementById("log");
  // 只有用户当前停留在底部附近时才自动滚动，避免查看历史日志被强制拉回底部。
  const autoFollow = (log.scrollHeight - (log.scrollTop + log.clientHeight)) < 24;
  const now = new Date();
  const time = String(now.getHours()).padStart(2, '0') + ":" +
    String(now.getMinutes()).padStart(2, '0') + ":" +
    String(now.getSeconds()).padStart(2, '0') + " ";

  const logEntry = document.createElement('div');
  const timeSpan = document.createElement('span');
  logEntry.className = 'log-line';
  timeSpan.className = 'time';
  timeSpan.textContent = time;
  logEntry.appendChild(timeSpan);

  if (action !== '') {
    const actionSpan = document.createElement('span');
    actionSpan.className = 'action';
    actionSpan.innerHTML = action;
    logEntry.appendChild(actionSpan);
  }
  logEntry.appendChild(document.createTextNode(logTXT));

  log.appendChild(logEntry);

  if (logToConsole) {
    const line = `${time}${action}${logTXT}`;
    const isErr = /失败|超时|Error|异常|disconnected|断开|warn|warning/i.test(logTXT);
    if (isErr) {
      console.warn('[EPD]', line);
    } else {
      console.log('[EPD]', line);
    }
  }

  // 增加日志条数限制，方便手机端排查问题（例如查看CRC传输过程）
  while (log.childNodes.length > 200) {
    log.removeChild(log.firstChild);
  }

  if (autoFollow) {
    log.scrollTop = log.scrollHeight;
  }
}

function clearLog() {
  document.getElementById("log").innerHTML = '';
}

function clearLogBeforeIndex(index) {
  const log = document.getElementById("log");
  if (!log || index <= 0) return;
  const removeCount = Math.min(index, log.childNodes.length);
  for (let i = 0; i < removeCount; i++) {
    if (!log.firstChild) break;
    log.removeChild(log.firstChild);
  }
}

function fillCanvas(style) {
  ctx.fillStyle = style;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function setCanvasTitle(title) {
  const canvasTitle = document.querySelector('.canvas-title');
  if (canvasTitle) {
    canvasTitle.innerText = title;
    canvasTitle.style.display = title && title !== '' ? 'block' : 'none';
  }
}

function updateImage() {
  const imageFile = document.getElementById('imageFile');
  if (imageFile.files.length == 0) {
    fillCanvas('white');
    return;
  }

  const image = new Image();
  image.onload = function () {
    URL.revokeObjectURL(this.src);
    if (image.width / image.height == canvas.width / canvas.height) {
      if (cropManager.isCropMode()) cropManager.exitCropMode();
      ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);
      convertDithering();
    } else {
      alert(`图片宽高比例与画布不匹配，将进入裁剪模式。\n请放大图片后移动图片使其充满画布, 再点击"完成"按钮。`);
      paintManager.setActiveTool(null, '');
      cropManager.initializeCrop();
    }
  };
  image.src = URL.createObjectURL(imageFile.files[0]);
}

function updateOrientationBadge() {
  const badge = document.getElementById('orientationBadge');
  const epdDriverSelect = document.getElementById('epddriver');
  if (!badge || !epdDriverSelect || !canvas) return;

  const selectedOption = epdDriverSelect.options[epdDriverSelect.selectedIndex];
  const sizeData = selectedOption ? selectedOption.getAttribute('data-size') : null;
  if (!sizeData) {
    badge.innerText = `${canvas.width}x${canvas.height}`;
    return;
  }

  const parts = sizeData.split('_');
  if (parts.length < 3) {
    badge.innerText = `${canvas.width}x${canvas.height}`;
    return;
  }
  const driverW = parseInt(parts[1], 10);
  const driverH = parseInt(parts[2], 10);

  if (canvas.width === driverW && canvas.height === driverH) {
    badge.innerText = `横屏(与设备一致) ${canvas.width}x${canvas.height}`;
  } else if (canvas.width === driverH && canvas.height === driverW) {
    badge.innerText = `竖屏编辑(发送自动适配) ${canvas.width}x${canvas.height}`;
  } else {
    badge.innerText = `自定义方向 ${canvas.width}x${canvas.height}`;
  }
}

function updateCanvasSize() {
  const selectedSizeName = document.getElementById('canvasSize').value;
  const selectedSize = canvasSizes.find(size => size.name === selectedSizeName);

  canvas.width = selectedSize.width;
  canvas.height = selectedSize.height;

  updateImage();
  // 尺寸变化后，重绘所有矢量元素（文字、线条等）
  if (paintManager) {
    paintManager.redrawAll();
  }
  rotationQuarterTurns = 0;
  updateOrientationBadge();
}

function updateDitcherOptions() {
  const epdDriverSelect = document.getElementById('epddriver');
  const selectedOption = epdDriverSelect.options[epdDriverSelect.selectedIndex];
  const colorMode = selectedOption.getAttribute('data-color');
  const canvasSize = selectedOption.getAttribute('data-size');

  if (colorMode) document.getElementById('ditherMode').value = colorMode;
  if (canvasSize) document.getElementById('canvasSize').value = canvasSize;

  updateCanvasSize(); // always update image
}

function applyCanvasTransform(transformType) {
  if (cropManager.isCropMode()) {
    alert("请先完成图片裁剪！");
    return;
  }

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = canvas.width;
  sourceCanvas.height = canvas.height;
  sourceCanvas.getContext('2d').drawImage(canvas, 0, 0);

  const oldWidth = canvas.width;
  const oldHeight = canvas.height;

  if (transformType === 'rotate90') {
    canvas.width = oldHeight;
    canvas.height = oldWidth;
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();
    rotationQuarterTurns = (rotationQuarterTurns + 1) % 4;
    addLog(`画布已旋转90°: ${oldWidth}x${oldHeight} -> ${canvas.width}x${canvas.height}`);
  } else if (transformType === 'mirror') {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();
    addLog('画布已镜像(左右)');
  } else if (transformType === 'flip') {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(0, canvas.height);
    ctx.scale(1, -1);
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();
    addLog('画布已翻转(上下)');
  }

  if (paintManager) {
    paintManager.transformElements(transformType, oldWidth, oldHeight, canvas.width, canvas.height);
    paintManager.saveToHistory();
  }

  if (transformType === 'rotate90') {
    const canvasSizeSelect = document.getElementById('canvasSize');
    if (canvasSizeSelect) {
      const matched = canvasSizes.find(size => size.width === canvas.width && size.height === canvas.height);
      if (matched) {
        canvasSizeSelect.value = matched.name;
        addLog(`画布尺寸已同步为: ${matched.name}`);
      } else {
        addLog(`当前画布尺寸 ${canvas.width}x${canvas.height} 无对应预设，请手动确认尺寸`);
      }
    }
  }
  updateOrientationBadge();
}

function rotateCanvas() {
  applyCanvasTransform('rotate90');
}

function mirrorCanvas() {
  applyCanvasTransform('mirror');
}

function flipCanvas() {
  applyCanvasTransform('flip');
}

function clearCanvas() {
  if (confirm('清除画布内容?')) {
    fillCanvas('white');
    paintManager.clearElements(); // Clear stored text positions and line segments
    paintManager.clearCanvasCache(); // Clear cached data from localStorage
    paintManager.clearScheduleCache(); // Clear schedule cache
    if (cropManager.isCropMode()) cropManager.exitCropMode();
    paintManager.saveToHistory(); // Save cleared canvas to history
    return true;
  }
  return false;
}

function convertDithering() {
  paintManager.redrawTextElements();
  paintManager.redrawLineSegments();
  paintManager.redrawTodoItems();

  const contrast = parseFloat(document.getElementById('ditherContrast').value);
  const currentImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const imageData = new ImageData(
    new Uint8ClampedArray(currentImageData.data),
    currentImageData.width,
    currentImageData.height
  );

  adjustContrast(imageData, contrast);

  const alg = document.getElementById('ditherAlg').value;
  const strength = parseFloat(document.getElementById('ditherStrength').value);
  const mode = document.getElementById('ditherMode').value;
  const processedData = processImageData(ditherImage(imageData, alg, strength, mode), mode);
  const finalImageData = decodeProcessedData(processedData, canvas.width, canvas.height, mode);
  ctx.putImageData(finalImageData, 0, 0);

  paintManager.saveToHistory(); // Save dithered image to history
}

function applyDither() {
  cropManager.finishCrop(() => convertDithering());
}

function initEventHandlers() {
  document.getElementById("ditherStrength").addEventListener("input", (e) => {
    document.getElementById("ditherStrengthValue").innerText = parseFloat(e.target.value).toFixed(1);
    applyDither();
  });
  document.getElementById("ditherContrast").addEventListener("input", (e) => {
    document.getElementById("ditherContrastValue").innerText = parseFloat(e.target.value).toFixed(1);
    applyDither();
  });
}

function checkDebugMode() {
  const link = document.getElementById('debug-toggle');
  const urlParams = new URLSearchParams(window.location.search);
  const debugMode = urlParams.get('debug');

  if (debugMode === 'true') {
    document.body.classList.add('dark-mode');
    link.innerHTML = '正常模式';
    link.setAttribute('href', window.location.pathname);
    addLog("注意：开发模式功能已开启！不懂请不要随意修改，否则后果自负！");
  } else {
    document.body.classList.remove('dark-mode');
    link.innerHTML = '开发模式';
    link.setAttribute('href', window.location.pathname + '?debug=true');
  }
}

function updateFooterInfo() {
  const footerCopy = document.getElementById('footerCopy');
  const footerVersion = document.getElementById('footerVersion');

  if (footerVersion) {
    footerVersion.innerText = `总版本: v${APP_VERSION} | 更新时间: ${APP_BUILD_DATE}`;
  }

  if (footerCopy) {
    const yearFromBuildDate = APP_BUILD_DATE && APP_BUILD_DATE.length >= 4
      ? APP_BUILD_DATE.substring(0, 4)
      : `${new Date().getFullYear()}`;
    footerCopy.innerHTML = `&copy;Source from tsl0922, modify by DYC ${yearFromBuildDate}.`;
  }
}

document.body.onload = () => {
  textDecoder = null;
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  paintManager = new PaintManager(canvas, ctx);
  cropManager = new CropManager(canvas, ctx, paintManager);

  paintManager.initPaintTools();
  cropManager.initCropTools();
  initEventHandlers();
  initConsoleLogPreference();
  window.setConsoleLogEnabled = setConsoleLogEnabled;
  updateDeviceFilterButton();
  updateButtonStatus();
  updateFooterInfo();
  updateOrientationBadge();
  checkDebugMode();
}