export class PaletteColor {
  r: number = 0;
  g: number = 0;
  b: number = 0;
  value: number = 0;

  constructor(r: number, g: number, b: number, value: number) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.value = value;
  }
}

const RGB_PALETTE: PaletteColor[] = [
  new PaletteColor(255, 255, 0, 0xE2),
  new PaletteColor(41, 204, 20, 0x96),
  new PaletteColor(0, 0, 255, 0x1D),
  new PaletteColor(255, 0, 0, 0x4C),
  new PaletteColor(0, 0, 0, 0x00),
  new PaletteColor(255, 255, 255, 0xFF)
];

const FOUR_PALETTE: PaletteColor[] = [
  new PaletteColor(0, 0, 0, 0x00),
  new PaletteColor(255, 255, 255, 0x01),
  new PaletteColor(255, 0, 0, 0x03),
  new PaletteColor(255, 255, 0, 0x02)
];

const THREE_PALETTE: PaletteColor[] = [
  new PaletteColor(0, 0, 0, 0x00),
  new PaletteColor(255, 255, 255, 0x01),
  new PaletteColor(255, 0, 0, 0x02)
];

class Lab {
  l: number = 0;
  a: number = 0;
  b: number = 0;
}

function rgbToLab(r0: number, g0: number, b0: number): Lab {
  let r: number = r0 / 255;
  let g: number = g0 / 255;
  let b: number = b0 / 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  r *= 100;
  g *= 100;
  b *= 100;
  let x: number = r * 0.4124 + g * 0.3576 + b * 0.1805;
  let y: number = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z: number = r * 0.0193 + g * 0.1192 + b * 0.9505;
  x /= 95.047;
  y /= 100.0;
  z /= 108.883;
  x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + (16 / 116);
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + (16 / 116);
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + (16 / 116);
  const out = new Lab();
  out.l = (116 * y) - 16;
  out.a = 500 * (x - y);
  out.b = 200 * (y - z);
  return out;
}

function labDistance(a: Lab, b: Lab): number {
  const dl: number = a.l - b.l;
  const da: number = a.a - b.a;
  const db: number = a.b - b.b;
  return Math.sqrt(0.2 * dl * dl + 3 * da * da + 3 * db * db);
}

export function findClosestColor(r: number, g: number, b: number, mode: string): PaletteColor {
  let palette: PaletteColor[] = RGB_PALETTE;
  if (mode === 'fourColor') {
    palette = FOUR_PALETTE;
  } else if (mode === 'threeColor') {
    palette = THREE_PALETTE;
  }

  if (mode !== 'fourColor' && mode !== 'threeColor' && r < 50 && g < 150 && b > 100) {
    return RGB_PALETTE[2];
  }

  if (mode === 'threeColor') {
    if (r > 120 && r > g * 1.5 && r > b * 1.5) {
      return THREE_PALETTE[2];
    }
    const luminance: number = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance < 128 ? THREE_PALETTE[0] : THREE_PALETTE[1];
  }

  const input: Lab = rgbToLab(r, g, b);
  let minDistance: number = Number.MAX_VALUE;
  let closest: PaletteColor = palette[0];
  for (let i: number = 0; i < palette.length; i++) {
    const d: number = labDistance(input, rgbToLab(palette[i].r, palette[i].g, palette[i].b));
    if (d < minDistance) {
      minDistance = d;
      closest = palette[i];
    }
  }
  return closest;
}

class KernelTerm {
  dx: number = 0;
  dy: number = 0;
  w: number = 0;

  constructor(dx: number, dy: number, w: number) {
    this.dx = dx;
    this.dy = dy;
    this.w = w;
  }
}

const FLOYD_TERMS: KernelTerm[] = [
  new KernelTerm(1, 0, 7), new KernelTerm(-1, 1, 3), new KernelTerm(0, 1, 5), new KernelTerm(1, 1, 1)
];
const ATKINSON_TERMS: KernelTerm[] = [
  new KernelTerm(1, 0, 1), new KernelTerm(2, 0, 1), new KernelTerm(-1, 1, 1),
  new KernelTerm(0, 1, 1), new KernelTerm(1, 1, 1), new KernelTerm(0, 2, 1)
];
const STUCKI_TERMS: KernelTerm[] = [
  new KernelTerm(1, 0, 8), new KernelTerm(2, 0, 4),
  new KernelTerm(-2, 1, 2), new KernelTerm(-1, 1, 4), new KernelTerm(0, 1, 8),
  new KernelTerm(1, 1, 4), new KernelTerm(2, 1, 2),
  new KernelTerm(-2, 2, 1), new KernelTerm(-1, 2, 2), new KernelTerm(0, 2, 4),
  new KernelTerm(1, 2, 2), new KernelTerm(2, 2, 1)
];
const JARVIS_TERMS: KernelTerm[] = [
  new KernelTerm(1, 0, 7), new KernelTerm(2, 0, 5),
  new KernelTerm(-2, 1, 3), new KernelTerm(-1, 1, 5), new KernelTerm(0, 1, 7),
  new KernelTerm(1, 1, 5), new KernelTerm(2, 1, 3),
  new KernelTerm(-2, 2, 1), new KernelTerm(-1, 2, 3), new KernelTerm(0, 2, 5),
  new KernelTerm(1, 2, 3), new KernelTerm(2, 2, 1)
];

function clamp255(v: number): number {
  return Math.min(255, Math.max(0, v));
}

function diffuse(width: number, height: number, data: Uint8ClampedArray, temp: Uint8ClampedArray,
  strength: number, mode: string, terms: KernelTerm[], divisor: number, inPlace: boolean): void {
  for (let y: number = 0; y < height; y++) {
    for (let x: number = 0; x < width; x++) {
      const idx: number = (y * width + x) * 4;
      const r: number = temp[idx];
      const g: number = temp[idx + 1];
      const b: number = temp[idx + 2];
      const closest: PaletteColor = findClosestColor(r, g, b, mode);
      if (inPlace) {
        data[idx] = closest.r;
        data[idx + 1] = closest.g;
        data[idx + 2] = closest.b;
      }
      const errR: number = (r - closest.r) * strength;
      const errG: number = (g - closest.g) * strength;
      const errB: number = (b - closest.b) * strength;
      for (let i: number = 0; i < terms.length; i++) {
        const t: KernelTerm = terms[i];
        const nx: number = x + t.dx;
        const ny: number = y + t.dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          continue;
        }
        const nidx: number = (ny * width + nx) * 4;
        const f: number = t.w / divisor;
        temp[nidx] = clamp255(temp[nidx] + errR * f);
        temp[nidx + 1] = clamp255(temp[nidx + 1] + errG * f);
        temp[nidx + 2] = clamp255(temp[nidx + 2] + errB * f);
      }
    }
  }
  if (!inPlace) {
    for (let y: number = 0; y < height; y++) {
      for (let x: number = 0; x < width; x++) {
        const idx: number = (y * width + x) * 4;
        const c: PaletteColor = findClosestColor(temp[idx], temp[idx + 1], temp[idx + 2], mode);
        data[idx] = c.r;
        data[idx + 1] = c.g;
        data[idx + 2] = c.b;
      }
    }
  }
}

const BAYER: number[][] = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21]
];

function bayer(width: number, height: number, data: Uint8ClampedArray, strength: number, mode: string): void {
  for (let y: number = 0; y < height; y++) {
    for (let x: number = 0; x < width; x++) {
      const idx: number = (y * width + x) * 4;
      const threshold: number = (BAYER[y % 8][x % 8] / 64) * 255;
      const r: number = data[idx] + (threshold - 127.5) * strength;
      const g: number = data[idx + 1] + (threshold - 127.5) * strength;
      const b: number = data[idx + 2] + (threshold - 127.5) * strength;
      const c: PaletteColor = findClosestColor(clamp255(r), clamp255(g), clamp255(b), mode);
      data[idx] = c.r;
      data[idx + 1] = c.g;
      data[idx + 2] = c.b;
    }
  }
}

export function adjustContrast(data: Uint8ClampedArray, factor: number): void {
  for (let i: number = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, (data[i] - 128) * factor + 128));
    data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * factor + 128));
    data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * factor + 128));
  }
}

export function ditherImage(width: number, height: number, data: Uint8ClampedArray,
  alg: string, strength: number, mode: string): void {
  const temp = new Uint8ClampedArray(data);
  if (alg === 'floydSteinberg') {
    diffuse(width, height, data, temp, strength, mode, FLOYD_TERMS, 16, false);
  } else if (alg === 'atkinson') {
    diffuse(width, height, data, temp, strength, mode, ATKINSON_TERMS, 8, true);
  } else if (alg === 'stucki') {
    diffuse(width, height, data, temp, strength, mode, STUCKI_TERMS, 42, false);
  } else if (alg === 'jarvis') {
    diffuse(width, height, data, temp, strength, mode, JARVIS_TERMS, 48, true);
  } else if (alg === 'bayer') {
    bayer(width, height, data, strength, mode);
  }
}

export function packImage(data: Uint8ClampedArray, width: number, height: number, mode: string): Uint8Array | null {
  const byteWidth: number = Math.ceil(width / 8);
  if (mode === 'blackWhiteColor') {
    const out = new Uint8Array(byteWidth * height);
    for (let y: number = 0; y < height; y++) {
      for (let x: number = 0; x < width; x++) {
        const idx: number = (y * width + x) * 4;
        const gray: number = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
        const bit: number = gray >= 140 ? 1 : 0;
        const bi: number = y * byteWidth + Math.floor(x / 8);
        out[bi] |= (bit << (7 - (x % 8)));
      }
    }
    return out;
  }
  if (mode === 'threeColor') {
    const bw = new Uint8Array(byteWidth * height);
    const red = new Uint8Array(byteWidth * height);
    for (let y: number = 0; y < height; y++) {
      for (let x: number = 0; x < width; x++) {
        const idx: number = (y * width + x) * 4;
        const r: number = data[idx];
        const g: number = data[idx + 1];
        const b: number = data[idx + 2];
        const gray: number = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const bi: number = y * byteWidth + Math.floor(x / 8);
        const bit: number = 7 - (x % 8);
        if (gray >= 140) {
          bw[bi] |= (1 << bit);
        }
        const isRed: boolean = r > 160 && r > g && r > b;
        if (!isRed) {
          red[bi] |= (1 << bit);
        }
      }
    }
    const out = new Uint8Array(bw.length + red.length);
    out.set(bw, 0);
    out.set(red, bw.length);
    return out;
  }
  if (mode === 'fourColor') {
    const out = new Uint8Array(Math.ceil((width * height) / 4));
    for (let y: number = 0; y < height; y++) {
      for (let x: number = 0; x < width; x++) {
        const idx: number = (y * width + x) * 4;
        const c: PaletteColor = findClosestColor(data[idx], data[idx + 1], data[idx + 2], 'fourColor');
        const bi: number = (y * width + x) / 4 | 0;
        const shift: number = 6 - ((x % 4) * 2);
        out[bi] |= (c.value << shift);
      }
    }
    return out;
  }
  return null;
}

// Decode the actual two transmitted planes so preview and output share pixels.
export function previewThreeColor(packed: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const stride: number = Math.ceil(width / 8);
  const planeSize: number = stride * height;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y: number = 0; y < height; y++) {
    for (let x: number = 0; x < width; x++) {
      const byteIndex: number = y * stride + Math.floor(x / 8);
      const mask: number = 1 << (7 - x % 8);
      const red: boolean = (packed[planeSize + byteIndex] & mask) === 0;
      const white: boolean = (packed[byteIndex] & mask) !== 0;
      const i: number = (y * width + x) * 4;
      rgba[i] = red || white ? 255 : 0;
      rgba[i + 1] = !red && white ? 255 : 0;
      rgba[i + 2] = !red && white ? 255 : 0;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

export function convertUC8159(blackWhiteData: Uint8Array, redWhiteData: Uint8Array): Uint8Array {
  const halfLength: number = blackWhiteData.length;
  const out = new Uint8Array(halfLength * 4);
  let p: number = 0;
  for (let i: number = 0; i < halfLength; i++) {
    let black: number = blackWhiteData[i];
    let color: number = redWhiteData[i];
    for (let j: number = 0; j < 8; j++) {
      let d: number = 0;
      if ((color & 0x80) === 0x00) {
        d = 0x04;
      } else if ((black & 0x80) === 0x00) {
        d = 0x00;
      } else {
        d = 0x03;
      }
      d = (d << 4) & 0xFF;
      black = (black << 1) & 0xFF;
      color = (color << 1) & 0xFF;
      j++;
      if ((color & 0x80) === 0x00) {
        d |= 0x04;
      } else if ((black & 0x80) === 0x00) {
        d |= 0x00;
      } else {
        d |= 0x03;
      }
      black = (black << 1) & 0xFF;
      color = (color << 1) & 0xFF;
      out[p] = d;
      p++;
    }
  }
  return out;
}

export class ProcessOptions {
  mode: string = 'blackWhiteColor';
  alg: string = 'floydSteinberg';
  strength: number = 1.0;
  contrast: number = 1.2;
  brightness: number = 0.0;
  gamma: number = 1.0;
  saturation: number = 1.0;
  redSensitivity: number = 0.35;
  serpentine: boolean = true;
}

const SRGB_TO_LINEAR: number[] = (() => {
  const t: number[] = [];
  for (let i: number = 0; i < 256; i++) {
    const v: number = i / 255;
    t.push(v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  }
  return t;
})();

function applyTone(v: number, opt: ProcessOptions): number {
  let x: number = v;
  x = (x - 128) * opt.contrast + 128 + opt.brightness * 255;
  x = Math.min(255, Math.max(0, x));
  if (opt.gamma !== 1.0) {
    x = 255 * Math.pow(x / 255, 1 / opt.gamma);
  }
  const gray: number = 0.299 * x + 0.587 * x + 0.114 * x;
  x = gray + (x - gray) * opt.saturation;
  return Math.min(255, Math.max(0, x));
}

// Keep the Web contrast path byte-identical with neutral brightness/gamma/saturation.
export function applyImageTone(data: Uint8ClampedArray, opt: ProcessOptions): void {
  if (opt.brightness === 0 && opt.gamma === 1 && opt.saturation === 1) {
    adjustContrast(data, opt.contrast);
    return;
  }
  for (let i: number = 0; i < data.length; i += 4) {
    const r: number = applyTone(data[i], opt);
    const g: number = applyTone(data[i + 1], opt);
    const b: number = applyTone(data[i + 2], opt);
    const gray: number = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = gray + (r - gray) * opt.saturation;
    data[i + 1] = gray + (g - gray) * opt.saturation;
    data[i + 2] = gray + (b - gray) * opt.saturation;
  }
}

function luminanceLinear(r: number, g: number, b: number): number {
  const lr: number = SRGB_TO_LINEAR[Math.round(Math.min(255, Math.max(0, r)))];
  const lg: number = SRGB_TO_LINEAR[Math.round(Math.min(255, Math.max(0, g)))];
  const lb: number = SRGB_TO_LINEAR[Math.round(Math.min(255, Math.max(0, b)))];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function redScore(r: number, g: number, b: number): number {
  const max: number = Math.max(r, Math.max(g, b));
  const min: number = Math.min(r, Math.min(g, b));
  const d: number = max - min;
  if (max < 40 || d <= 6) {
    return 0;
  }
  const sat: number = d / max;
  let hue: number = 0;
  if (max === r) {
    hue = 60 * (((g - b) / d) % 6);
  } else if (max === g) {
    hue = 60 * ((b - r) / d + 2);
  } else {
    hue = 60 * ((r - g) / d + 4);
  }
  if (hue < 0) {
    hue += 360;
  }
  const hueDist: number = Math.min(hue, 360 - hue);
  const hueWeight: number = Math.max(0, 1 - hueDist / 45);
  // 红色应按色相/饱和度判定；乘 max/255 会把照片里中等偏暗的红色全部丢掉。
  return sat * hueWeight;
}

function diffuseLum(lum: Float32Array, w: number, h: number, terms: KernelTerm[], divisor: number,
  strength: number, serpentine: boolean): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y: number = 0; y < h; y++) {
    const reverse: boolean = serpentine && (y % 2 === 1);
    for (let k: number = 0; k < w; k++) {
      const x: number = reverse ? (w - 1 - k) : k;
      const idx: number = y * w + x;
      const old: number = lum[idx];
      const bit: number = old >= 0.5 ? 1 : 0;
      out[idx] = bit;
      const err: number = (old - bit) * strength;
      if (err === 0) {
        continue;
      }
      for (let t: number = 0; t < terms.length; t++) {
        const term: KernelTerm = terms[t];
        const nx: number = x + (reverse ? -term.dx : term.dx);
        const ny: number = y + term.dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
          continue;
        }
        lum[ny * w + nx] += err * (term.w / divisor);
      }
    }
  }
  return out;
}

function orderedLum(lum: Float32Array, w: number, h: number, strength: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y: number = 0; y < h; y++) {
    for (let x: number = 0; x < w; x++) {
      const threshold: number = BAYER[y % 8][x % 8] / 64;
      out[y * w + x] = (lum[y * w + x] + (threshold - 0.5) * strength) >= 0.5 ? 1 : 0;
    }
  }
  return out;
}

function kernelFor(alg: string): KernelTerm[] {
  if (alg === 'atkinson') {
    return ATKINSON_TERMS;
  }
  if (alg === 'stucki') {
    return STUCKI_TERMS;
  }
  if (alg === 'jarvis') {
    return JARVIS_TERMS;
  }
  return FLOYD_TERMS;
}

function divisorFor(alg: string): number {
  if (alg === 'atkinson') {
    return 8;
  }
  if (alg === 'stucki') {
    return 42;
  }
  if (alg === 'jarvis') {
    return 48;
  }
  return 16;
}

export function processImage(rgba: Uint8ClampedArray, w: number, h: number, opt: ProcessOptions): Uint8Array | null {
  const n: number = w * h;
  const tr = new Uint8Array(n);
  const tg = new Uint8Array(n);
  const tb = new Uint8Array(n);
  let redMask: Uint8Array | null = null;

  if (opt.mode === 'blackWhiteColor' || opt.mode === 'threeColor') {
    redMask = new Uint8Array(n);
  }

  for (let i: number = 0; i < n; i++) {
    const o: number = i * 4;
    const r: number = applyTone(rgba[o], opt);
    const g: number = applyTone(rgba[o + 1], opt);
    const b: number = applyTone(rgba[o + 2], opt);
    tr[i] = r;
    tg[i] = g;
    tb[i] = b;
    if (redMask !== null) {
      redMask[i] = redScore(r, g, b) >= opt.redSensitivity ? 1 : 0;
    }
  }

  if (opt.mode === 'blackWhiteColor' || opt.mode === 'threeColor') {
    const lum = new Float32Array(n);
    for (let i: number = 0; i < n; i++) {
      lum[i] = luminanceLinear(tr[i], tg[i], tb[i]);
    }
    let bits: Uint8Array;
    if (opt.alg === 'bayer') {
      bits = orderedLum(lum, w, h, opt.strength);
    } else if (opt.alg === 'none') {
      bits = new Uint8Array(n);
      for (let i: number = 0; i < n; i++) {
        bits[i] = lum[i] >= 0.5 ? 1 : 0;
      }
    } else {
      bits = diffuseLum(lum, w, h, kernelFor(opt.alg), divisorFor(opt.alg), opt.strength, opt.serpentine);
    }

    for (let i: number = 0; i < n; i++) {
      const o: number = i * 4;
      if (opt.mode === 'threeColor' && redMask !== null && redMask[i] === 1) {
        rgba[o] = 255;
        rgba[o + 1] = 0;
        rgba[o + 2] = 0;
      } else {
        const v: number = bits[i] === 1 ? 255 : 0;
        rgba[o] = v;
        rgba[o + 1] = v;
        rgba[o + 2] = v;
      }
      rgba[o + 3] = 255;
    }

    if (opt.mode === 'blackWhiteColor') {
      const byteWidth: number = Math.ceil(w / 8);
      const out = new Uint8Array(byteWidth * h);
      for (let y: number = 0; y < h; y++) {
        for (let x: number = 0; x < w; x++) {
          if (bits[y * w + x] === 1) {
            out[y * byteWidth + Math.floor(x / 8)] |= (1 << (7 - (x % 8)));
          }
        }
      }
      return out;
    }

    const byteWidth: number = Math.ceil(w / 8);
    const bw = new Uint8Array(byteWidth * h);
    const red = new Uint8Array(byteWidth * h);
    for (let y: number = 0; y < h; y++) {
      for (let x: number = 0; x < w; x++) {
        const i: number = y * w + x;
        const bi: number = y * byteWidth + Math.floor(x / 8);
        const bit: number = 7 - (x % 8);
        if (redMask !== null && redMask[i] === 1) {
          bw[bi] |= (1 << bit);
        } else if (bits[i] === 1) {
          bw[bi] |= (1 << bit);
          red[bi] |= (1 << bit);
        } else {
          red[bi] |= (1 << bit);
        }
      }
    }
    const out = new Uint8Array(bw.length + red.length);
    out.set(bw, 0);
    out.set(red, bw.length);
    return out;
  }

  for (let i: number = 0; i < n; i++) {
    const o: number = i * 4;
    rgba[o] = tr[i];
    rgba[o + 1] = tg[i];
    rgba[o + 2] = tb[i];
  }
  ditherImage(w, h, rgba, opt.alg, opt.strength, opt.mode);
  return packImage(rgba, w, h, opt.mode);
}
