const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SIZE = 2048;
const WORK = 1920;
const BLEND = 48;
const BAND_TOP = 3000;
const BAND_ROWS = (WORK + 2 * BLEND) / 2;
const STRIPS = [720, 2080];
const OUT = "public/walkthrough/tex/fired_clay";

const smooth = (t) => t * t * (3 - 2 * t);

async function stripRows(file, left, channel) {
  const image = sharp(file).extract({ left, top: BAND_TOP, width: WORK + BLEND, height: BAND_ROWS });
  const piped = channel === null ? image.removeAlpha().toColourspace("srgb") : image.extractChannel(channel);
  const { data, info } = await piped.raw().toBuffer({ resolveWithObject: true });
  return { data, channels: info.channels };
}

function wrappedAcross(strip) {
  const { data, channels } = strip;
  const out = Buffer.alloc(WORK * BAND_ROWS * channels);
  for (let y = 0; y < BAND_ROWS; y++) {
    for (let x = 0; x < WORK; x++) {
      const share = x < BLEND ? smooth(x / BLEND) : 1;
      for (let c = 0; c < channels; c++) {
        const near = data[(y * (WORK + BLEND) + x) * channels + c];
        const wrap = x < BLEND ? data[(y * (WORK + BLEND) + WORK + x) * channels + c] : near;
        out[(y * WORK + x) * channels + c] = near * share + wrap * (1 - share);
      }
    }
  }
  return out;
}

function stackedInto(first, second, channels) {
  const stride = WORK * channels;
  const out = Buffer.alloc(WORK * WORK * channels);
  const usable = BAND_ROWS - BLEND;
  const blendRows = (target, from, to, base, overlay) => {
    for (let y = 0; y < BLEND; y++) {
      const share = smooth(y / BLEND);
      for (let i = 0; i < stride; i++) target[(from + y) * stride + i] = base[(to + y) * stride + i] * (1 - share) + overlay[y * stride + i] * share;
    }
  };
  first.copy(out, 0, 0, usable * stride);
  second.copy(out, usable * stride, BLEND * stride, BAND_ROWS * stride);
  blendRows(out, usable - BLEND, usable - BLEND, first, second);
  for (let y = 0; y < BLEND; y++) {
    const share = smooth(y / BLEND);
    const row = WORK - BLEND + y;
    for (let i = 0; i < stride; i++) out[row * stride + i] = second[(usable + y) * stride + i] * (1 - share) + first[y * stride + i] * share;
  }
  return out;
}

async function tile(file, channel, name) {
  const [first, second] = await Promise.all(STRIPS.map((left) => stripRows(file, left, channel)));
  const channels = first.channels;
  const raw = stackedInto(wrappedAcross(first), wrappedAcross(second), channels);
  const target = path.join(OUT, name);
  await sharp(raw, { raw: { width: WORK, height: WORK, channels } }).resize(SIZE, SIZE, { kernel: "lanczos3" }).jpeg({ quality: 90, mozjpeg: true }).toFile(target);
  console.log(target, fs.statSync(target).size);
}

(async () => {
  const source = process.argv[2];
  if (!source) throw new Error("usage: node scripts/walkthrough/build-fired-clay-tile.cjs <folder holding diff.jpg nor_gl.jpg arm.jpg>");
  fs.mkdirSync(OUT, { recursive: true });
  await tile(path.join(source, "diff.jpg"), null, "diff.jpg");
  await tile(path.join(source, "nor_gl.jpg"), null, "nor.jpg");
  await tile(path.join(source, "arm.jpg"), 1, "rough.jpg");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
