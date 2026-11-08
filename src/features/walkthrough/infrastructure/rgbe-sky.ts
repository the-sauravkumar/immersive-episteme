export interface DecodedSky {
  readonly width: number;
  readonly height: number;
  readonly plain: Uint16Array;
  readonly softened: Uint16Array;
}

export function decodedSkyOf(buffer: ArrayBuffer, sunSoftKnee: number): DecodedSky {
  const bytes = new Uint8Array(buffer);
  const floatView = new Float32Array(1);
  const bitsView = new Uint32Array(floatView.buffer);
  const baseTable = new Uint32Array(512);
  const shiftTable = new Uint32Array(512);
  for (let i = 0; i < 256; ++i) {
    const e = i - 127;
    if (e < -27) {
      baseTable[i] = 0x0000;
      baseTable[i | 0x100] = 0x8000;
      shiftTable[i] = shiftTable[i | 0x100] = 24;
    } else if (e < -14) {
      baseTable[i] = 0x0400 >> (-e - 14);
      baseTable[i | 0x100] = (0x0400 >> (-e - 14)) | 0x8000;
      shiftTable[i] = shiftTable[i | 0x100] = -e - 1;
    } else if (e <= 15) {
      baseTable[i] = (e + 15) << 10;
      baseTable[i | 0x100] = ((e + 15) << 10) | 0x8000;
      shiftTable[i] = shiftTable[i | 0x100] = 13;
    } else {
      baseTable[i] = 0x7c00;
      baseTable[i | 0x100] = 0xfc00;
      shiftTable[i] = shiftTable[i | 0x100] = e < 128 ? 24 : 13;
    }
  }
  const toHalf = (value: number): number => {
    floatView[0] = Math.min(65504, Math.max(-65504, value));
    const bits = bitsView[0]!;
    const e = (bits >> 23) & 0x1ff;
    return baseTable[e]! + ((bits & 0x007fffff) >> shiftTable[e]!);
  };
  let pos = 0;
  const line = (): string => {
    let text = "";
    while (pos < bytes.length && bytes[pos] !== 10) text += String.fromCharCode(bytes[pos++]!);
    pos++;
    return text;
  };
  if (!/^#\?\S+/.test(line())) throw new Error("not an RGBE file");
  let width = 0;
  let height = 0;
  let format = false;
  while (pos < bytes.length && !(format && width > 0)) {
    const text = line();
    if (text.startsWith("#")) continue;
    if (/^\s*FORMAT=\S+\s*$/.test(text)) format = true;
    const size = /^\s*-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/.exec(text);
    if (size) {
      height = parseInt(size[1]!, 10);
      width = parseInt(size[2]!, 10);
    }
  }
  if (!format || width === 0) throw new Error("RGBE header without format or size");
  const rgbe = new Uint8Array(4 * width * height);
  const flat = width < 8 || width > 0x7fff || bytes[pos] !== 2 || bytes[pos + 1] !== 2 || (bytes[pos + 2]! & 0x80) !== 0;
  if (flat) rgbe.set(bytes.subarray(pos, pos + rgbe.length));
  else {
    const scanline = new Uint8Array(4 * width);
    for (let row = 0; row < height; row++) {
      if (bytes[pos] !== 2 || bytes[pos + 1] !== 2 || ((bytes[pos + 2]! << 8) | bytes[pos + 3]!) !== width) throw new Error("bad RGBE scanline");
      pos += 4;
      let ptr = 0;
      while (ptr < scanline.length) {
        let count = bytes[pos++]!;
        const run = count > 128;
        if (run) count -= 128;
        if (count === 0 || ptr + count > scanline.length) throw new Error("bad RGBE scanline data");
        if (run) scanline.fill(bytes[pos++]!, ptr, ptr + count);
        else {
          scanline.set(bytes.subarray(pos, pos + count), ptr);
          pos += count;
        }
        ptr += count;
      }
      for (let i = 0; i < width; i++) {
        const at = (row * width + i) * 4;
        rgbe[at] = scanline[i]!;
        rgbe[at + 1] = scanline[i + width]!;
        rgbe[at + 2] = scanline[i + width * 2]!;
        rgbe[at + 3] = scanline[i + width * 3]!;
      }
    }
  }
  const halfToFloat = (half: number): number => {
    const exponent = (half >> 10) & 0x1f;
    const mantissa = half & 0x3ff;
    const magnitude = exponent === 0 ? mantissa * 2 ** -24 : exponent === 31 ? (mantissa ? NaN : Infinity) : (1 + mantissa / 1024) * 2 ** (exponent - 15);
    return half & 0x8000 ? -magnitude : magnitude;
  };
  const plain = new Uint16Array(4 * width * height);
  const softened = new Uint16Array(4 * width * height);
  const one = toHalf(1);
  for (let at = 0; at < plain.length; at += 4) {
    const scale = Math.pow(2.0, rgbe[at + 3]! - 128.0) / 255.0;
    for (let channel = 0; channel < 3; channel++) {
      plain[at + channel] = toHalf(Math.min(rgbe[at + channel]! * scale, 65504));
    }
    plain[at + 3] = one;
    softened[at + 3] = one;
    const red = halfToFloat(plain[at]!);
    const green = halfToFloat(plain[at + 1]!);
    const blue = halfToFloat(plain[at + 2]!);
    const brightest = Math.max(red, green, blue);
    if (brightest <= sunSoftKnee * 0.5) {
      softened[at] = plain[at]!;
      softened[at + 1] = plain[at + 1]!;
      softened[at + 2] = plain[at + 2]!;
      continue;
    }
    const soften = sunSoftKnee / (sunSoftKnee + brightest - sunSoftKnee * 0.5);
    softened[at] = toHalf(red * soften);
    softened[at + 1] = toHalf(green * soften);
    softened[at + 2] = toHalf(blue * soften);
  }
  return { width, height, plain, softened };
}
