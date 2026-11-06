export interface MipFilter {
  readonly radius: number;
  readonly beta: number;
  readonly sharpen: number;
  readonly coverage?: boolean;
}

export interface MipLevel {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
}

export function filteredMips(pixels: Uint8ClampedArray, width: number, height: number, filter: MipFilter): MipLevel[] {
  const besselI0 = (x: number) => {
    let sum = 1;
    let term = 1;
    for (let k = 1; k < 40 && term > 1e-12 * sum; k++) {
      term *= (x / (2 * k)) ** 2;
      sum += term;
    }
    return sum;
  };
  const windowScale = besselI0(filter.beta);
  const kernel = (x: number) => {
    const t = Math.abs(x) / filter.radius;
    if (t >= 1) return 0;
    const phase = Math.PI * x;
    return (phase === 0 ? 1 : Math.sin(phase) / phase) * (besselI0(filter.beta * Math.sqrt(1 - t * t)) / windowScale);
  };
  const toLinear = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    toLinear[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }
  const encodeSteps = 4096;
  const toDisplay = new Uint8ClampedArray(encodeSteps + 1);
  for (let i = 0; i <= encodeSteps; i++) {
    const v = i / encodeSteps;
    toDisplay[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
  }
  const tapsFor = (from: number, to: number) => {
    const scale = from / to;
    const reach = Math.ceil(filter.radius * scale);
    const count = reach * 2 + 1;
    const first = new Int32Array(to);
    const weights = new Float32Array(to * count);
    for (let o = 0; o < to; o++) {
      const centre = (o + 0.5) * scale - 0.5;
      const start = Math.floor(centre) - reach + 1;
      first[o] = start;
      let total = 0;
      for (let k = 0; k < count; k++) {
        const weight = kernel((start + k - centre) / scale);
        weights[o * count + k] = weight;
        total += weight;
      }
      for (let k = 0; k < count; k++) weights[o * count + k]! /= total;
    }
    return { first, count, weights };
  };
  const levels: MipLevel[] = [];
  let source: Float32Array | null = null;
  let w = width;
  let h = height;
  const row = new Float32Array(width * 3);
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1);
    const nh = Math.max(1, h >> 1);
    const across = tapsFor(w, nw);
    const down = tapsFor(h, nh);
    const wide = new Float32Array(nw * h * 3);
    for (let y = 0; y < h; y++) {
      if (source) row.set(source.subarray(y * w * 3, (y + 1) * w * 3));
      else if (filter.coverage) for (let x = 0, q = y * w * 4; x < w; x++, q += 4) row[x * 3] = row[x * 3 + 1] = row[x * 3 + 2] = pixels[q + 3]! / 255;
      else for (let x = 0, q = y * w * 4; x < w; x++, q += 4) {
        row[x * 3] = toLinear[pixels[q]!]!;
        row[x * 3 + 1] = toLinear[pixels[q + 1]!]!;
        row[x * 3 + 2] = toLinear[pixels[q + 2]!]!;
      }
      for (let x = 0; x < nw; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        const start = across.first[x]!;
        const base = x * across.count;
        for (let k = 0; k < across.count; k++) {
          const weight = across.weights[base + k]!;
          const at = Math.min(w - 1, Math.max(0, start + k)) * 3;
          r += row[at]! * weight;
          g += row[at + 1]! * weight;
          b += row[at + 2]! * weight;
        }
        const out = (y * nw + x) * 3;
        wide[out] = r;
        wide[out + 1] = g;
        wide[out + 2] = b;
      }
    }
    const next = new Float32Array(nw * nh * 3);
    for (let y = 0; y < nh; y++) {
      const start = down.first[y]!;
      const base = y * down.count;
      for (let x = 0; x < nw; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let k = 0; k < down.count; k++) {
          const weight = down.weights[base + k]!;
          const at = (Math.min(h - 1, Math.max(0, start + k)) * nw + x) * 3;
          r += wide[at]! * weight;
          g += wide[at + 1]! * weight;
          b += wide[at + 2]! * weight;
        }
        const out = (y * nw + x) * 3;
        next[out] = Math.min(1, Math.max(0, r));
        next[out + 1] = Math.min(1, Math.max(0, g));
        next[out + 2] = Math.min(1, Math.max(0, b));
      }
    }
    const encoded = new Uint8ClampedArray(nw * nh * 4);
    const edge = filter.sharpen / 4;
    for (let y = 0; y < nh; y++) {
      const above = Math.max(0, y - 1) * nw;
      const below = Math.min(nh - 1, y + 1) * nw;
      for (let x = 0; x < nw; x++) {
        const out = y * nw + x;
        const left = y * nw + Math.max(0, x - 1);
        const right = y * nw + Math.min(nw - 1, x + 1);
        for (let c = 0; c < 3; c++) {
          const around = next[left * 3 + c]! + next[right * 3 + c]! + next[(above + x) * 3 + c]! + next[(below + x) * 3 + c]!;
          const value = Math.min(1, Math.max(0, next[out * 3 + c]! * (1 + filter.sharpen) - around * edge));
          encoded[out * 4 + c] = filter.coverage ? 255 : toDisplay[Math.round(value * encodeSteps)]!;
          if (filter.coverage && c === 0) encoded[out * 4 + 3] = Math.round(value * 255);
        }
        if (!filter.coverage) encoded[out * 4 + 3] = 255;
      }
    }
    levels.push({ width: nw, height: nh, pixels: encoded });
    source = next;
    w = nw;
    h = nh;
  }
  return levels;
}
