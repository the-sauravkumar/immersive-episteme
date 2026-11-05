import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SIZE = 2048;
const CANDIDATES = 70;

const pixelRects = (factor, rects) => rects.map((rect) => rect.map((value) => Math.round(value * factor)));

const SKINS = {
  camel_dung_skin: {
    relief: 3.2,
    roughLow: 0.82,
    step: 64,
    overlap: 24,
    sources: [{ file: "dung/downloads/camel_asergeev_10b.jpg", scale: 0.62, rects: pixelRects(6.69, [[385, 280, 85, 60], [650, 130, 60, 70], [680, 240, 60, 70], [450, 400, 60, 90], [545, 400, 40, 100], [610, 430, 60, 70], [750, 400, 80, 80], [200, 380, 60, 50], [270, 340, 50, 70], [190, 530, 60, 70], [470, 520, 60, 60], [890, 600, 70, 50], [120, 590, 60, 90], [860, 270, 70, 50], [710, 60, 90, 40]]) }],
  },
  madder_root_bark: {
    relief: 3.4,
    roughLow: 0.8,
    step: 32,
    overlap: 12,
    turn: true,
    sources: [
      { file: "roots/downloads/kew/53847-2.jpg", scale: 1, centre: [1164, 378], angle: 10.5, size: [430, 110] },
      { file: "roots/downloads/kew/53847-2.jpg", scale: 1, centre: [1338, 444], angle: 40, size: [360, 50] },
      { file: "roots/downloads/kew/53847-2.jpg", scale: 1, centre: [1185, 204], angle: -10.5, size: [320, 46] },
    ],
  },
  dry_leaf_blade: {
    relief: 1.6,
    roughLow: 0.68,
    step: 64,
    overlap: 24,
    sources: [{ file: "roots/downloads/herb/kew-k004414905.jpg", scale: 0.42, rects: pixelRects(10.59, [[125, 400, 50, 90], [320, 290, 40, 90], [170, 600, 70, 80], [300, 800, 70, 90], [240, 700, 60, 70], [640, 800, 30, 60], [280, 130, 40, 60], [590, 310, 40, 70], [350, 570, 50, 30], [430, 640, 40, 30]]) }],
  },
};

const random = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

async function greyOf(image) {
  const { data, info } = await image.toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  const single = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < single.length; i++) single[i] = data[i * info.channels];
  return { pixels: single, width: info.width, height: info.height };
}

async function flattenedRegion(file, source, rect) {
  let crop;
  if (source.centre) {
    const [cx, cy] = source.centre;
    const reach = Math.ceil(Math.hypot(...source.size) * 0.6);
    const square = await sharp(file).rotate().extract({ left: cx - reach, top: cy - reach, width: reach * 2, height: reach * 2 }).rotate(source.angle, { background: "#ffffff" }).toBuffer();
    const metadata = await sharp(square).metadata();
    crop = sharp(square).extract({ left: Math.round(metadata.width / 2 - source.size[0] / 2), top: Math.round(metadata.height / 2 - source.size[1] / 2), width: source.size[0], height: source.size[1] });
    rect = [0, 0, source.size[0], source.size[1]];
  } else {
    crop = sharp(file).rotate().extract({ left: rect[0], top: rect[1], width: rect[2], height: rect[3] });
  }
  const width = Math.round(rect[2] * source.scale);
  const height = Math.round(rect[3] * source.scale);
  const sized = (await greyOf(crop.resize(width, height, { kernel: "lanczos3" }))).pixels;
  const blurred = (await greyOf(sharp(sized, { raw: { width, height, channels: 1 } }).blur(Math.max(10, Math.min(width, height) * 0.25)))).pixels;
  const pixels = new Float32Array(width * height);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.min(1, Math.max(0, (sized[i] / 255) * (0.5 / Math.max(blurred[i] / 255, 0.08))));
  return { width, height, pixels };
}

function patchesFrom(regions, count, seed, block) {
  const pick = random(seed);
  const patches = [];
  let tries = 0;
  while (patches.length < count && tries < count * 40) {
    tries++;
    const region = regions[Math.floor(pick() * regions.length)];
    if (region.width <= block || region.height <= block) continue;
    const x = Math.floor(pick() * (region.width - block));
    const y = Math.floor(pick() * (region.height - block));
    const data = new Float32Array(block * block);
    let dark = 0;
    let bright = 0;
    for (let row = 0; row < block; row++) {
      for (let column = 0; column < block; column++) {
        const value = region.pixels[(y + row) * region.width + x + column];
        data[row * block + column] = value;
        if (value < 0.1) dark++;
        if (value > 0.97) bright++;
      }
    }
    if (dark > block * block * 0.06 || bright > block * block * 0.08) continue;
    patches.push(data);
  }
  if (patches.length === 0) throw new Error("No usable patches");
  return patches;
}

function seamCut(cost, along, across) {
  const totals = new Float32Array(along * across);
  const from = new Int8Array(along * across);
  for (let a = 0; a < along; a++) {
    for (let b = 0; b < across; b++) {
      let best = 0;
      let step = 0;
      if (a > 0) {
        best = Infinity;
        for (const delta of [-1, 0, 1]) {
          const next = b + delta;
          if (next < 0 || next >= across) continue;
          const value = totals[(a - 1) * across + next];
          if (value < best) {
            best = value;
            step = delta;
          }
        }
      }
      totals[a * across + b] = cost[a * across + b] + best;
      from[a * across + b] = step;
    }
  }
  let end = 0;
  for (let b = 1; b < across; b++) if (totals[(along - 1) * across + b] < totals[(along - 1) * across + end]) end = b;
  const path = new Int32Array(along);
  for (let a = along - 1; a >= 0; a--) {
    path[a] = end;
    end += from[a * across + end];
  }
  return path;
}

function quilted(patches, seed, step, overlap) {
  const BLOCK = step + overlap;
  const OVERLAP = overlap;
  const STEP = step;
  const pick = random(seed);
  const cells = Math.floor(SIZE / STEP);
  const out = new Float32Array(SIZE * SIZE);
  const at = (x, y) => (((y % SIZE) + SIZE) % SIZE) * SIZE + (((x % SIZE) + SIZE) % SIZE);
  const filled = new Uint8Array(cells * cells);
  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < cells; column++) {
      const x0 = column * STEP;
      const y0 = row * STEP;
      const left = filled[row * cells + ((column + cells - 1) % cells)] === 1;
      const top = filled[((row + cells - 1) % cells) * cells + column] === 1;
      const right = filled[row * cells + ((column + 1) % cells)] === 1;
      const bottom = filled[((row + 1) % cells) * cells + column] === 1;
      let chosen = null;
      let lowest = Infinity;
      for (let c = 0; c < CANDIDATES; c++) {
        const patch = patches[Math.floor(pick() * patches.length)];
        let error = 0;
        for (let v = 0; v < BLOCK; v += 2) {
          for (let u = 0; u < BLOCK; u += 2) {
            const inLeft = left && u < OVERLAP;
            const inTop = top && v < OVERLAP;
            const inRight = right && u >= BLOCK - OVERLAP;
            const inBottom = bottom && v >= BLOCK - OVERLAP;
            if (!inLeft && !inTop && !inRight && !inBottom) continue;
            const difference = patch[v * BLOCK + u] - out[at(x0 + u, y0 + v)];
            error += difference * difference;
          }
        }
        if (error < lowest) {
          lowest = error;
          chosen = patch;
        }
      }
      const keep = new Uint8Array(BLOCK * BLOCK).fill(1);
      const costOf = (u, v) => {
        const difference = chosen[v * BLOCK + u] - out[at(x0 + u, y0 + v)];
        return difference * difference;
      };
      const vertical = (startU, keepBefore) => {
        const cost = new Float32Array(BLOCK * OVERLAP);
        for (let v = 0; v < BLOCK; v++) for (let w = 0; w < OVERLAP; w++) cost[v * OVERLAP + w] = costOf(startU + w, v);
        const cut = seamCut(cost, BLOCK, OVERLAP);
        for (let v = 0; v < BLOCK; v++) for (let w = 0; w < OVERLAP; w++) if (keepBefore ? w < cut[v] : w > cut[v]) keep[v * BLOCK + startU + w] = 0;
      };
      const horizontal = (startV, keepBefore) => {
        const cost = new Float32Array(BLOCK * OVERLAP);
        for (let u = 0; u < BLOCK; u++) for (let w = 0; w < OVERLAP; w++) cost[u * OVERLAP + w] = costOf(u, startV + w);
        const cut = seamCut(cost, BLOCK, OVERLAP);
        for (let u = 0; u < BLOCK; u++) for (let w = 0; w < OVERLAP; w++) if (keepBefore ? w < cut[u] : w > cut[u]) keep[(startV + w) * BLOCK + u] = 0;
      };
      if (left) vertical(0, true);
      if (right) vertical(BLOCK - OVERLAP, false);
      if (top) horizontal(0, true);
      if (bottom) horizontal(BLOCK - OVERLAP, false);
      for (let v = 0; v < BLOCK; v++) for (let u = 0; u < BLOCK; u++) if (keep[v * BLOCK + u]) out[at(x0 + u, y0 + v)] = chosen[v * BLOCK + u];
      filled[row * cells + column] = 1;
    }
  }
  return out;
}

function softened(values, passes) {
  let current = values;
  for (let pass = 0; pass < passes; pass++) {
    const next = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const xl = (x + SIZE - 1) % SIZE;
        const xr = (x + 1) % SIZE;
        const yu = (y + SIZE - 1) % SIZE;
        const yd = (y + 1) % SIZE;
        next[y * SIZE + x] = (current[y * SIZE + x] * 4 + (current[y * SIZE + xl] + current[y * SIZE + xr] + current[yu * SIZE + x] + current[yd * SIZE + x]) * 2 + current[yu * SIZE + xl] + current[yu * SIZE + xr] + current[yd * SIZE + xl] + current[yd * SIZE + xr]) / 16;
      }
    }
    current = next;
  }
  return current;
}

async function writeSkin(folder, values, skin) {
  fs.mkdirSync(folder, { recursive: true });
  const raw = { raw: { width: SIZE, height: SIZE, channels: 1 } };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const grey = Buffer.alloc(SIZE * SIZE);
  for (let i = 0; i < grey.length; i++) grey[i] = Math.round(Math.min(1, Math.max(0, values[i] * (0.5 / mean))) * 255);
  await sharp(grey, raw).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(folder, "diff.jpg"));
  const height = softened(values, 1);
  const normal = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = height[y * SIZE + ((x + 1) % SIZE)] - height[y * SIZE + ((x + SIZE - 1) % SIZE)];
      const dy = height[((y + 1) % SIZE) * SIZE + x] - height[((y + SIZE - 1) % SIZE) * SIZE + x];
      const nx = -dx * skin.relief;
      const ny = dy * skin.relief;
      const length = Math.hypot(nx, ny, 1);
      const o = (y * SIZE + x) * 3;
      normal[o] = Math.round((nx / length) * 127.5 + 127.5);
      normal[o + 1] = Math.round((ny / length) * 127.5 + 127.5);
      normal[o + 2] = Math.round((1 / length) * 127.5 + 127.5);
    }
  }
  await sharp(normal, { raw: { width: SIZE, height: SIZE, channels: 3 } }).jpeg({ quality: 86, chromaSubsampling: "4:4:4" }).toFile(path.join(folder, "nor.jpg"));
  const rough = Buffer.alloc(SIZE * SIZE);
  for (let i = 0; i < rough.length; i++) rough[i] = Math.round(Math.min(1, skin.roughLow + (1 - skin.roughLow) * (1 - Math.min(1, values[i]))) * 255);
  await sharp(rough, raw).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(folder, "rough.jpg"));
}

async function main() {
  const [references, outRoot] = process.argv.slice(2);
  if (!references || !outRoot) throw new Error("usage: node build-pile-skins.cjs <references folder> <public tex folder> [names]");
  const only = process.argv[4]?.split(",");
  let seed = 41;
  for (const [name, skin] of Object.entries(SKINS)) {
    seed += 7;
    if (only && !only.includes(name)) continue;
    const regions = [];
    for (const source of skin.sources) {
      for (const rect of source.rects ?? [null]) regions.push(await flattenedRegion(path.join(references, source.file), source, rect));
    }
    const patches = patchesFrom(regions, 900, seed, skin.step + skin.overlap);
    let values = quilted(patches, seed + 1, skin.step, skin.overlap);
    if (skin.turn) {
      const turned = new Float32Array(values.length);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) turned[x * SIZE + (SIZE - 1 - y)] = values[y * SIZE + x];
      values = turned;
    }
    await writeSkin(path.join(outRoot, name), values, skin);
    console.log(name, patches.length, "patches");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
