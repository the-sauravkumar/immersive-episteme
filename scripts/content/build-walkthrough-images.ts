import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const OUT_CLOTH = "public/walkthrough/cloth";
const OUT_PRODUCTS = "public/walkthrough/products";
const OUT_COURSE = "public/walkthrough/course";
const WIDTH = 2048;
const HEIGHT = 886;
const STRIP_HEIGHT = 222;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

const REFS = requiredEnv("WALKTHROUGH_REFS_DIR");
const TEXTURES = requiredEnv("WALKTHROUGH_TEXTURES_DIR");

type Rgb = readonly [number, number, number];
type Layer = "ground" | "halo" | "red" | "blue" | "black" | "other";
type LayerColours = Readonly<Partial<Record<Layer, string | null>>>;

interface StateSpec {
  readonly colours: LayerColours;
  readonly sourceMix?: number;
  readonly weave?: number;
  readonly mottle?: number;
  readonly sameAsRaw?: boolean;
}

interface Classifier {
  readonly groundValue: number;
  readonly groundSaturation: number;
  readonly blackValue: number;
  readonly haloRadius: number;
}

interface TraditionCloth {
  readonly tradition: string;
  readonly sourceFile: string;
  readonly crop: { readonly left: number; readonly top: number; readonly width: number };
  readonly classifier: Classifier;
  readonly states: readonly StateSpec[];
}

const UNIFORM = (colour: string): LayerColours => ({ ground: colour, halo: colour, red: colour, blue: colour, black: colour, other: colour });

const CLOTHS: readonly TraditionCloth[] = [
  {
    tradition: "ajrakh",
    sourceFile: "ajrakh-14-finished-textile-mykutch-1.webp",
    crop: { left: 0, top: 460, width: 3872 },
    classifier: { groundValue: 0.62, groundSaturation: 0.34, blackValue: 0.2, haloRadius: 0 },
    states: [
      { colours: UNIFORM("#EFEBDE"), weave: 2.2, mottle: 0.03 },
      { colours: UNIFORM("#D8B24A"), weave: 1.8, mottle: 0.09 },
      { colours: { ground: "#EFE8D4", red: "#D2AA45", blue: "#D2AA45", other: "#D2AA45", black: "#2B211B" }, weave: 1.4, mottle: 0.07 },
      { colours: { ground: "#8F7C64", red: "#7E5C45", blue: "#D0A843", other: "#D0A843", black: "#6E5C4A" }, weave: 1.2, mottle: 0.16 },
      { colours: { ground: "#3F4259", red: "#3B3D55", blue: "#142C68", other: "#142C68", black: "#30324A" }, weave: 1, mottle: 0.15 },
      { colours: { ground: "#E9E4D6", red: "#CFBD86", blue: "#1C3C84", other: "#1C3C84", black: "#221C22" }, weave: 1, mottle: 0.07 },
      { colours: { ground: "#E8B4A4", red: "#A5201A", blue: "#1A2D66", other: "#1A2D66", black: "#1C1418" }, weave: 1, mottle: 0.06 },
      { colours: { ground: "#EEE8DA", red: "#A8231C", blue: "#1B3069", other: "#1B3069", black: "#1C1418" }, weave: 1, mottle: 0.05 },
      { colours: {}, sourceMix: 0.92, weave: 0.6 },
    ],
  },
  {
    tradition: "sanganeri",
    sourceFile: "sanganeri-13-finished-textile-vam-sanganeri-O481213.jpg",
    crop: { left: 110, top: 150, width: 2280 },
    classifier: { groundValue: 0.6, groundSaturation: 0.3, blackValue: 0.26, haloRadius: 6 },
    states: [
      { colours: {}, sameAsRaw: true },
      { colours: UNIFORM("#E2CE7C"), weave: 1.8, mottle: 0.07 },
      { colours: { ground: "#E0CB78", halo: "#E0CB78", red: "#A08A63", blue: "#A08A63", other: "#A08A63", black: "#4C3F34" }, weave: 1.5, mottle: 0.06 },
      { colours: { ground: "#E7DAA9", halo: "#E7DAA9", red: "#A9392A", blue: "#A9392A", other: "#A9392A", black: "#2C1B17" }, weave: 1.3, mottle: 0.06 },
      { colours: { ground: "#F1ECDF", halo: "#F1ECDF", red: "#AD3A2B", blue: "#AD3A2B", other: "#AD3A2B", black: "#2C1B17" }, weave: 1.5, mottle: 0.03 },
      { colours: { ground: "#F1ECDF", halo: "#80705C", red: "#6C5C4B", blue: "#6C5C4B", other: "#6C5C4B", black: "#56483C" }, weave: 1.2, mottle: 0.14 },
      { colours: { ground: "#1F3D78", halo: "#4D4B57", red: "#454350", blue: "#454350", other: "#454350", black: "#3A3946" }, weave: 1, mottle: 0.14 },
      { colours: { ground: "#2C6B56", halo: "#6A6B4B", red: "#5E5F45", blue: "#5E5F45", other: "#5E5F45", black: "#4C4D3A" }, weave: 1, mottle: 0.12 },
      { colours: { ground: "#2E6F5A", halo: "#EFE7D2", red: "#AD3A2B", blue: "#AD3A2B", other: "#AD3A2B", black: "#2C1B17" }, weave: 0.9, mottle: 0.06 },
    ],
  },
  {
    tradition: "machilipatnam-kalamkari",
    sourceFile: "kalamkari-06-finished-textile-rooftop-2.webp",
    crop: { left: 0, top: 660, width: 3840 },
    classifier: { groundValue: 0.56, groundSaturation: 0.34, blackValue: 0.2, haloRadius: 0 },
    states: [
      { colours: {}, sameAsRaw: true },
      { colours: UNIFORM("#EEE9DC"), weave: 2.2, mottle: 0.03 },
      { colours: UNIFORM("#DFC26C"), weave: 1.8, mottle: 0.08 },
      { colours: { ground: "#DDC06A", red: "#C49A78", blue: "#DDC06A", other: "#DDC06A", black: "#2B2420" }, weave: 1.4, mottle: 0.06 },
      { colours: { ground: "#E6D8A2", red: "#BD9C7C", blue: "#E6D8A2", other: "#E6D8A2", black: "#322A27" }, weave: 1.4, mottle: 0.05 },
      { colours: { ground: "#E8C9B6", red: "#8E291E", blue: "#E8C9B6", other: "#E8C9B6", black: "#1E1614" }, weave: 1.1, mottle: 0.07 },
      { colours: { ground: "#E8C9B6", red: "#8E291E", blue: null, other: null, black: "#1E1614" }, weave: 1.1, mottle: 0.05 },
      { colours: { ground: "#ECDCCA", red: "#93301F", blue: null, other: null, black: "#1E1614" }, weave: 1, mottle: 0.04 },
      { colours: {}, sourceMix: 0.92, weave: 0.6 },
    ],
  },
];

const hex = (value: string): Rgb => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];

function valueNoise(seed: number): Float32Array {
  const cell = 96;
  const columns = Math.ceil(WIDTH / cell) + 2;
  const rows = Math.ceil(HEIGHT / cell) + 2;
  const grid = new Float32Array(columns * rows);
  let state = seed;
  for (let index = 0; index < grid.length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    grid[index] = state / 4294967296;
  }
  const out = new Float32Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const fx = x / cell;
      const fy = y / cell;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
      const ty = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
      const top = grid[iy * columns + ix]! * (1 - tx) + grid[iy * columns + ix + 1]! * tx;
      const bottom = grid[(iy + 1) * columns + ix]! * (1 - tx) + grid[(iy + 1) * columns + ix + 1]! * tx;
      out[y * WIDTH + x] = top * (1 - ty) + bottom * ty - 0.5;
    }
  }
  return out;
}

function blurChannel(channel: Uint8Array, sigma: number): Promise<Buffer> {
  return sharp(Buffer.from(channel), { raw: { width: WIDTH, height: HEIGHT, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();
}

async function weaveMap(offset: number): Promise<Float32Array> {
  const path = join(TEXTURES, "rough_linen/diff.jpg");
  const { data } = await sharp(path)
    .extract({ left: offset, top: offset, width: WIDTH - offset, height: HEIGHT })
    .resize(WIDTH, HEIGHT)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurred = await blurChannel(data, 24);
  const out = new Float32Array(WIDTH * HEIGHT);
  for (let index = 0; index < out.length; index += 1) out[index] = (data[index]! - blurred[index]!) / 255;
  return out;
}

async function blurMask(mask: Uint8Array, sigma: number): Promise<Float32Array> {
  const data = await blurChannel(mask, sigma);
  return Float32Array.from(data, (value) => value / 255);
}

async function dilateMask(mask: Uint8Array, radius: number): Promise<Uint8Array> {
  const data = await blurChannel(mask, radius);
  return Uint8Array.from(data, (value) => (value > 26 ? 255 : 0));
}

interface SourceLayers {
  readonly rgb: Uint8Array;
  readonly detail: Float32Array;
  readonly masks: Readonly<Record<Layer, Float32Array>>;
}

async function sourceLayers(cloth: TraditionCloth): Promise<SourceLayers> {
  const height = Math.round((cloth.crop.width * HEIGHT) / WIDTH);
  const { data } = await sharp(join(REFS, cloth.sourceFile))
    .extract({ left: cloth.crop.left, top: cloth.crop.top, width: cloth.crop.width, height })
    .resize(WIDTH, HEIGHT)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = new Uint8Array(data);
  const layers: Record<Exclude<Layer, "halo">, Uint8Array> = {
    ground: new Uint8Array(WIDTH * HEIGHT),
    red: new Uint8Array(WIDTH * HEIGHT),
    blue: new Uint8Array(WIDTH * HEIGHT),
    black: new Uint8Array(WIDTH * HEIGHT),
    other: new Uint8Array(WIDTH * HEIGHT),
  };
  const values = new Float32Array(WIDTH * HEIGHT);
  const { groundValue, groundSaturation, blackValue, haloRadius } = cloth.classifier;
  for (let index = 0; index < values.length; index += 1) {
    const r = rgb[index * 3]! / 255;
    const g = rgb[index * 3 + 1]! / 255;
    const b = rgb[index * 3 + 2]! / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const delta = max - min || 1;
    const sector = max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    const hue = sector * 60;
    values[index] = max;
    if (max < blackValue) layers.black[index] = 255;
    else if (max > groundValue && saturation < groundSaturation) layers.ground[index] = 255;
    else if (hue < 28 || hue > 325) layers.red[index] = 255;
    else if (hue > 170 && hue < 275) layers.blue[index] = 255;
    else layers.other[index] = 255;
  }
  const motif = Uint8Array.from(layers.ground, (value) => (value ? 0 : 255));
  const haloHard = haloRadius > 0 ? await dilateMask(motif, haloRadius) : new Uint8Array(WIDTH * HEIGHT);
  const groundOnly = layers.ground.map((value, index) => (value && !haloHard[index] ? 255 : 0));
  const haloOnly = layers.ground.map((value, index) => (value && haloHard[index] ? 255 : 0));
  const masks: Record<Layer, Float32Array> = {
    ground: await blurMask(groundOnly, 0.8),
    halo: await blurMask(haloOnly, 0.8),
    red: await blurMask(layers.red, 0.8),
    blue: await blurMask(layers.blue, 0.8),
    black: await blurMask(layers.black, 0.8),
    other: await blurMask(layers.other, 0.8),
  };
  const smooth = await blurChannel(Uint8Array.from(values, (value) => Math.round(value * 255)), 10);
  const detail = new Float32Array(WIDTH * HEIGHT);
  for (let index = 0; index < detail.length; index += 1) {
    const ratio = values[index]! / Math.max(smooth[index]! / 255, 0.08);
    detail[index] = Math.min(1.14, Math.max(0.86, ratio));
  }
  return { rgb, detail, masks };
}

const LAYERS: readonly Layer[] = ["ground", "halo", "red", "blue", "black", "other"];

function renderState(spec: StateSpec, source: SourceLayers, weave: Float32Array, noise: Float32Array): Buffer {
  const out = Buffer.alloc(WIDTH * HEIGHT * 3);
  const colours = LAYERS.map((layer) => {
    const value = spec.colours[layer];
    return typeof value === "string" ? hex(value) : null;
  });
  const weaveAmount = spec.weave ?? 1;
  const mottleAmount = spec.mottle ?? 0;
  const sourceMix = spec.sourceMix ?? 0;
  const uniform = new Set(colours.map((colour) => colour?.join())).size === 1;
  for (let index = 0; index < WIDTH * HEIGHT; index += 1) {
    const sr = source.rgb[index * 3]!;
    const sg = source.rgb[index * 3 + 1]!;
    const sb = source.rgb[index * 3 + 2]!;
    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;
    LAYERS.forEach((layer, layerIndex) => {
      const weight = source.masks[layer][index]!;
      if (weight === 0) return;
      const colour = colours[layerIndex];
      r += weight * (colour ? colour[0] : sr);
      g += weight * (colour ? colour[1] : sg);
      b += weight * (colour ? colour[2] : sb);
      total += weight;
    });
    const scale = total > 0 ? 1 / total : 1;
    const relief = 1 + weaveAmount * weave[index]! * 2.4;
    const shade = (uniform ? 1 : source.detail[index]!) * (1 + mottleAmount * noise[index]! * 2) * relief;
    const mix = (value: number, original: number) =>
      Math.max(0, Math.min(255, sourceMix > 0 ? (value * scale * (1 - sourceMix) + original * sourceMix) * relief : value * scale * shade));
    out[index * 3] = mix(r, sr);
    out[index * 3 + 1] = mix(g, sg);
    out[index * 3 + 2] = mix(b, sb);
  }
  return out;
}

function renderRaw(weave: Float32Array, noise: Float32Array): Buffer {
  const out = Buffer.alloc(WIDTH * HEIGHT * 3);
  const [red, green, blue] = hex("#DCD2BB");
  for (let index = 0; index < WIDTH * HEIGHT; index += 1) {
    const shade = (1 + weave[index]! * 7) * (1 + noise[index]! * 0.05);
    out[index * 3] = Math.max(0, Math.min(255, red * shade));
    out[index * 3 + 1] = Math.max(0, Math.min(255, green * shade));
    out[index * 3 + 2] = Math.max(0, Math.min(255, blue * shade));
  }
  return out;
}

async function writeState(id: string, pixels: Buffer): Promise<void> {
  const image = sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } });
  await image.clone().jpeg({ quality: 86, mozjpeg: true }).toFile(join(OUT_CLOTH, `${id}.jpg`));
  await image.clone().extract({ left: 0, top: Math.round((HEIGHT - STRIP_HEIGHT) / 2), width: WIDTH, height: STRIP_HEIGHT }).jpeg({ quality: 78, mozjpeg: true }).toFile(join(OUT_CLOTH, `${id}-strip.jpg`));
}

async function buildCloth(): Promise<void> {
  mkdirSync(OUT_CLOTH, { recursive: true });
  for (const [clothIndex, cloth] of CLOTHS.entries()) {
    const source = await sourceLayers(cloth);
    const weave = await weaveMap(0 + clothIndex * 40);
    const noise = valueNoise(11 + clothIndex * 97);
    const raw = renderRaw(weave, noise);
    await writeState(`${cloth.tradition}-raw`, raw);
    for (const [stateIndex, state] of cloth.states.entries()) {
      const id = `${cloth.tradition}-${String(stateIndex + 1).padStart(2, "0")}`;
      await writeState(id, state.sameAsRaw ? raw : renderState(state, source, weave, valueNoise(31 + stateIndex * 13 + clothIndex * 97)));
    }
    console.log(`cloth ${cloth.tradition}: raw plus ${cloth.states.length} states`);
  }
}

interface ProductChoice {
  readonly tradition: string;
  readonly traditionName: string;
  readonly ref: string;
  readonly holder: string;
  readonly trimThreshold: number | null;
  readonly extraInset?: Readonly<Partial<Record<"left" | "right" | "top" | "bottom", number>>>;
}

const VAM = "Victoria and Albert Museum, London";
const MINGEI = "Mingei International Museum";

const PRODUCTS: readonly ProductChoice[] = [
  { tradition: "ajrakh", traditionName: "Ajrakh", ref: "ajrakh-07-finished-textile-mingei-fra-fig-9-JF1-1-rev.jpg", holder: MINGEI, trimThreshold: 40 },
  { tradition: "ajrakh", traditionName: "Ajrakh", ref: "ajrakh-06-finished-textile-mingei-fra-fig-3.jpg", holder: MINGEI, trimThreshold: 40 },
  { tradition: "ajrakh", traditionName: "Ajrakh", ref: "ajrakh-10-finished-textile-commons-Ajrak.jpg", holder: "Ahub1988, Wikimedia Commons", trimThreshold: null },
  { tradition: "ajrakh", traditionName: "Ajrakh", ref: "ajrakh-12-finished-textile-vam-ajrakh-O469296.jpg", holder: VAM, trimThreshold: 40 },
  { tradition: "ajrakh", traditionName: "Ajrakh", ref: "ajrakh-13-finished-textile-vam-ajrakh-O470770.jpg", holder: VAM, trimThreshold: 40 },
  { tradition: "ajrakh", traditionName: "Ajrakh", ref: "ajrakh-14-finished-textile-mykutch-1.webp", holder: "MyKutch", trimThreshold: null },
  { tradition: "sanganeri", traditionName: "Sanganeri", ref: "sanganeri-13-finished-textile-vam-sanganeri-O481213.jpg", holder: VAM, trimThreshold: 30, extraInset: { bottom: 0.035 } },
  { tradition: "sanganeri", traditionName: "Sanganeri", ref: "sanganeri-14-finished-textile-vam-sanganeri-O472209.jpg", holder: VAM, trimThreshold: 40, extraInset: { bottom: 0.03 } },
  { tradition: "sanganeri", traditionName: "Sanganeri", ref: "sanganeri-15-finished-textile-vam-sanganeri-O147901.jpg", holder: VAM, trimThreshold: 30 },
  { tradition: "machilipatnam-kalamkari", traditionName: "Machilipatnam Kalamkari", ref: "kalamkari-09-finished-textile-vam-kalamkari-O481864.jpg", holder: VAM, trimThreshold: 30 },
  { tradition: "machilipatnam-kalamkari", traditionName: "Machilipatnam Kalamkari", ref: "kalamkari-10-finished-textile-vam-kalamkari-O481948.jpg", holder: VAM, trimThreshold: 30, extraInset: { left: 0.04 } },
  { tradition: "machilipatnam-kalamkari", traditionName: "Machilipatnam Kalamkari", ref: "kalamkari-11-finished-textile-vam-kalamkari-O481958.jpg", holder: VAM, trimThreshold: 30 },
  { tradition: "machilipatnam-kalamkari", traditionName: "Machilipatnam Kalamkari", ref: "kalamkari-07-finished-textile-rooftop-5.webp", holder: "Rooftop", trimThreshold: null },
  { tradition: "machilipatnam-kalamkari", traditionName: "Machilipatnam Kalamkari", ref: "kalamkari-06-finished-textile-rooftop-2.webp", holder: "Rooftop", trimThreshold: null },
  { tradition: "machilipatnam-kalamkari", traditionName: "Machilipatnam Kalamkari", ref: "kalamkari-08-finished-textile-imp-mach-2.jpg", holder: "MAP Academy", trimThreshold: null, extraInset: { left: 0.012, right: 0.012, top: 0.012, bottom: 0.012 } },
];

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

async function innerBox(path: string, threshold: number): Promise<Box> {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const at = (x: number, y: number, channel: number) => data[(y * width + x) * 3 + channel]!;
  const corners = [
    [4, 4],
    [width - 5, 4],
    [4, height - 5],
    [width - 5, height - 5],
  ] as const;
  const background = [0, 1, 2].map((channel) => corners.reduce((sum, [x, y]) => sum + at(x, y, channel), 0) / 4);
  const isCloth = (x: number, y: number) => Math.abs(at(x, y, 0) - background[0]!) + Math.abs(at(x, y, 1) - background[1]!) + Math.abs(at(x, y, 2) - background[2]!) > threshold;
  const coverage = (positions: Iterable<readonly [number, number]>) => {
    let hits = 0;
    let samples = 0;
    for (const [x, y] of positions) {
      samples += 1;
      if (isCloth(x, y)) hits += 1;
    }
    return hits / samples;
  };
  function* row(y: number) {
    for (let x = Math.round(width * 0.1); x < width * 0.9; x += 4) yield [x, y] as const;
  }
  function* column(x: number) {
    for (let y = Math.round(height * 0.1); y < height * 0.9; y += 4) yield [x, y] as const;
  }
  const edge = (start: number, step: number, reach: number, line: (position: number) => Iterable<readonly [number, number]>) => {
    for (const required of [0.97, 0.92, 0.85, 0.75, 0.6]) {
      for (let moved = 0; moved < reach; moved += 2) {
        if (coverage(line(start + step * moved)) >= required) return start + step * moved;
      }
    }
    return start;
  };
  const top = edge(0, 1, Math.round(height * 0.2), row);
  const bottom = edge(height - 1, -1, Math.round(height * 0.2), row);
  const left = edge(0, 1, Math.round(width * 0.2), column);
  const right = edge(width - 1, -1, Math.round(width * 0.2), column);
  const insetX = Math.round((right - left) * 0.006);
  const insetY = Math.round((bottom - top) * 0.006);
  return { left: left + insetX, top: top + insetY, width: right - left - 2 * insetX, height: bottom - top - 2 * insetY };
}

function insetBox(box: Box, inset: NonNullable<ProductChoice["extraInset"]>): Box {
  const left = Math.round(box.width * (inset.left ?? 0));
  const right = Math.round(box.width * (inset.right ?? 0));
  const top = Math.round(box.height * (inset.top ?? 0));
  const bottom = Math.round(box.height * (inset.bottom ?? 0));
  return { left: box.left + left, top: box.top + top, width: box.width - left - right, height: box.height - top - bottom };
}

interface ManifestSource {
  readonly file: string;
  readonly sourcePageUrl: string;
  readonly imageUrl: string;
  readonly width: number;
  readonly height: number;
  readonly creatorOrHolder: string;
  readonly subject: string;
}

const CONTACT_ROUTES: ReadonlyArray<readonly [RegExp, string]> = [
  [/collections\.vam\.ac\.uk/, "vaimages@vam.ac.uk (shown on the object page; also the address of the existing reply)"],
  [/rooftopapp\.com/, "connect@rooftopapp.com (shown on the source page)"],
  [/mykutch\.pages\.dev/, "info@mykutch.org (shown on the source page)"],
  [/mapacademy\.io/, "https://imp-art.org/contact-us/ (linked from the source page)"],
  [/commons\.wikimedia\.org/, "Uploader's Wikimedia Commons talk page; the file page shows no address"],
];

const PERMITTED_AT_768 = new Set(["O469296", "O481213", "O164855"]);
const VAM_LIMIT_PX = 768;

function permissionFor(source: ManifestSource, longestPx: number): { readonly status: "to-be-licensed"; readonly note: string } {
  const vamObject = /collections\.vam\.ac\.uk\/item\/(O\d+)/.exec(source.sourcePageUrl)?.[1];
  if (vamObject && PERMITTED_AT_768.has(vamObject)) {
    return { status: "to-be-licensed", note: `Existing V&A reply (docs/research/va-image-licence-reply.md) covers this object up to ${VAM_LIMIT_PX} px on the longest side; this file is ${longestPx} px, so it exceeds that limit` };
  }
  if (vamObject) return { status: "to-be-licensed", note: "No V&A permission for this object yet; the existing reply names three other objects" };
  if (source.sourcePageUrl.includes("commons.wikimedia.org")) return { status: "to-be-licensed", note: "File page states a CC BY-SA licence; attribution and share-alike terms to be confirmed for this use" };
  return { status: "to-be-licensed", note: "No permission held" };
}

const contactFor = (page: string): string => CONTACT_ROUTES.find(([pattern]) => pattern.test(page))?.[1] ?? "not found";

async function buildProducts(sources: readonly ManifestSource[]) {
  mkdirSync(OUT_PRODUCTS, { recursive: true });
  const rows = [];
  const counts = new Map<string, number>();
  for (const choice of PRODUCTS) {
    const source = sources.find((entry) => entry.file === choice.ref);
    if (!source) throw new Error(`No manifest row for ${choice.ref}`);
    const number = (counts.get(choice.tradition) ?? 0) + 1;
    counts.set(choice.tradition, number);
    const id = `${choice.tradition}-p${number}`;
    const path = join(REFS, choice.ref);
    const meta = await sharp(path).metadata();
    const inner = choice.trimThreshold === null ? { left: 0, top: 0, width: meta.width, height: meta.height } : await innerBox(path, choice.trimThreshold);
    const box = insetBox(inner, choice.extraInset ?? {});
    const fileName = `${id}.jpg`;
    await sharp(path).extract(box).jpeg({ quality: 90, mozjpeg: true }).toFile(join(OUT_PRODUCTS, fileName));
    const permission = permissionFor(source, Math.max(box.width, box.height));
    rows.push({
      file: `/walkthrough/products/${fileName}`,
      usedFor: `Finished textile in the ${choice.traditionName} product panel and hall`,
      holder: choice.holder,
      creditLine: source.creatorOrHolder,
      sourcePage: source.sourcePageUrl,
      directUrl: source.imageUrl,
      widthPx: box.width,
      heightPx: box.height,
      status: permission.status,
      permission: permission.note,
      contactRoute: contactFor(source.sourcePageUrl),
      product: { tradition: choice.tradition, id, name: `${choice.traditionName} Textile`, holder: choice.holder, widthPx: box.width, heightPx: box.height },
    });
    console.log(`product ${id}: ${meta.width}x${meta.height} -> ${box.width}x${box.height}`);
  }
  return rows;
}

function clothRows(sources: readonly ManifestSource[]) {
  return CLOTHS.map((cloth) => {
    const source = sources.find((entry) => entry.file === cloth.sourceFile);
    if (!source) throw new Error(`No manifest row for ${cloth.sourceFile}`);
    const derived = cloth.states.flatMap((state, index) => (state.sameAsRaw ? [] : [`${cloth.tradition}-${String(index + 1).padStart(2, "0")}`]));
    return {
      file: `/walkthrough/cloth/${derived[0]}.jpg to ${derived.at(-1)}.jpg, with each -strip.jpg crop`,
      usedFor: `Motif source for the proxy cloth states of ${cloth.tradition}, derived by image processing: ${derived.join(", ")}. Proxy only, no craft claim.`,
      holder: source.creatorOrHolder,
      creditLine: source.creatorOrHolder,
      sourcePage: source.sourcePageUrl,
      directUrl: source.imageUrl,
      widthPx: WIDTH,
      heightPx: HEIGHT,
      status: "to-be-licensed",
      permission: permissionFor(source, WIDTH).note,
      contactRoute: contactFor(source.sourcePageUrl),
    };
  });
}

const CC0_ROWS = [
  {
    file: "/walkthrough/cloth/*-raw.jpg, /walkthrough/cloth/sanganeri-01.jpg, /walkthrough/cloth/machilipatnam-kalamkari-01.jpg, with each -strip.jpg crop",
    usedFor: "Weave of the raw cloth files and the weave relief of every cloth state",
    holder: "Poly Haven: Rough Linen, photography colormass, processing Rico Cilliers",
    creditLine: "Rough Linen, Poly Haven",
    sourcePage: "https://polyhaven.com/a/rough_linen",
    directUrl: "https://polyhaven.com/a/rough_linen",
    widthPx: WIDTH,
    heightPx: HEIGHT,
    status: "cc0",
    permission: "CC0 1.0, no licence needed",
    contactRoute: "none needed",
  },
  {
    file: "/walkthrough/course/plaster.jpg",
    usedFor: "Door 1 object cells and the plaster numeral",
    holder: "Poly Haven: White Plaster Rough 02, author Rob Tuytel",
    creditLine: "White Plaster Rough 02, Poly Haven",
    sourcePage: "https://polyhaven.com/a/white_plaster_rough_02",
    directUrl: "https://polyhaven.com/a/white_plaster_rough_02",
    widthPx: WIDTH,
    heightPx: WIDTH,
    status: "cc0",
    permission: "CC0 1.0, no licence needed",
    contactRoute: "none needed",
  },
];

const PLASTER_CONTRAST = 0.55;

async function buildPlaster(): Promise<void> {
  mkdirSync(OUT_COURSE, { recursive: true });
  const path = join(TEXTURES, "white_plaster_rough_02/diff.jpg");
  const { data } = await sharp(path).resize(WIDTH, WIDTH, { fit: "cover" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
  const target = hex("#C8BFAE");
  const pixels = Buffer.alloc(WIDTH * WIDTH * 3);
  for (let index = 0; index < data.length; index += 1) {
    const shade = 1 + ((data[index]! - mean) / mean) * PLASTER_CONTRAST;
    for (const channel of [0, 1, 2]) pixels[index * 3 + channel] = Math.max(0, Math.min(255, Math.round(target[channel]! * shade)));
  }
  await sharp(pixels, { raw: { width: WIDTH, height: WIDTH, channels: 3 } }).jpeg({ quality: 84, mozjpeg: true }).toFile(join(OUT_COURSE, "plaster.jpg"));
}

async function main(): Promise<void> {
  const sources = JSON.parse(readFileSync(join(REFS, "manifest.json"), "utf8")) as readonly ManifestSource[];
  await buildPlaster();
  await buildCloth();
  const products = await buildProducts(sources);
  const manifest = { note: "One row per third-party file used by Door 1 and Door 2 images. Generated by scripts/content/build-walkthrough-images.ts.", rows: [...products, ...clothRows(sources), ...CC0_ROWS] };
  writeFileSync("public/walkthrough/manifest.images.json", `${JSON.stringify(manifest, null, 2)}\n`);
}

await main();
