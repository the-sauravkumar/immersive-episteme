/**
 * Museum texture pipeline: CC0 source maps -> graded 8-bit PNG (the authored source) -> KTX2
 * (UASTC + mipmaps + Zstandard) at the same resolution, with a provenance record.
 *
 *   npx tsx scripts/museum/build-textures.ts --ktx <path to KTX-Software v4.4.2 ktx.exe>
 *
 * Outputs
 *   public/museum/textures/<name>-<role>.<sha8>.ktx2   content-hashed (immutable HTTP caching)
 *   public/museum/textures/index.json                  what the renderer loads (urls, sizes, colour space)
 *   public/museum/ASSETS.md                            licence, source URL, author, checksums per asset
 *   analysis/out/museum/sources/<name>-<role>.png      the authored 8-bit sources (gitignored), used by C12
 *   analysis/out/museum/encode-report.json             ktx --compare-ssim output per map
 *
 * The downloads are verified against the md5 the Poly Haven API publishes for each file, and
 * every file written is recorded with its sha256. Nothing is downscaled: the KTX2 level 0 has
 * the source's pixel size (asserted below).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { KTX_ENCODE_ARGS, RESOLUTION, TEXTURE_ASSETS, type TextureAssetSpec, type TextureMapSpec } from "./textures.config";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_TEX = path.join(ROOT, "public/museum/textures");
const OUT_BASIS = path.join(ROOT, "public/museum/basis");
const SOURCES = path.join(ROOT, "analysis/out/museum/sources");
const DOWNLOADS = path.join(ROOT, "analysis/out/museum/downloads");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");
const md5 = (buf: Buffer) => createHash("md5").update(buf).digest("hex");

interface PhFile {
  url: string;
  md5: string;
  size: number;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": "immersive-episteme-asset-pipeline" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function download(file: PhFile, dest: string): Promise<Buffer> {
  if (existsSync(dest)) {
    const buf = readFileSync(dest);
    if (md5(buf) === file.md5) return buf;
  }
  let buf: Buffer | null = null;
  for (let attempt = 1; attempt <= 4 && !buf; attempt++) {
    try {
      const res = await fetch(file.url);
      if (!res.ok) throw new Error(`${file.url}: HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (attempt === 4) throw e;
      console.warn(`download failed (attempt ${attempt}), retrying: ${file.url}`);
    }
  }
  if (!buf) throw new Error(`${file.url}: no data`);
  if (md5(buf) !== file.md5) throw new Error(`${file.url}: md5 ${md5(buf)} != published ${file.md5}`);
  writeFileSync(dest, buf);
  return buf;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 8-bit RGB PNG of the source; colour maps optionally graded to a target mean. */
async function authorSource(input: Buffer, spec: TextureAssetSpec, m: TextureMapSpec): Promise<{ png: Buffer; width: number; height: number; grade: number[] | null }> {
  // 16-bit PNG -> 8-bit is a plain scale (no transfer-function change) for every map.
  const base = sharp(input).removeAlpha().toColourspace("srgb");
  const { data, info } = await base.raw({ depth: "uchar" }).toBuffer({ resolveWithObject: true });
  let grade: number[] | null = null;
  if (m.role === "color" && spec.gradeMeanSrgb) {
    const target = hexToRgb(spec.gradeMeanSrgb);
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 3) for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
    const px = data.length / 3;
    grade = sum.map((s, c) => target[c]! / (s / px));
    for (let i = 0; i < data.length; i += 3) for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.round(data[i + c]! * grade[c]!));
  }
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
  return { png, width: info.width, height: info.height, grade };
}

/** Level-0 size from a KTX2 header (pixelWidth at byte 20, pixelHeight at 24, levelCount at 40). */
function ktx2Header(buf: Buffer) {
  const id = buf.subarray(0, 12).toString("latin1");
  if (!id.startsWith("«KTX 20»")) throw new Error("not a KTX2 file");
  return { width: buf.readUInt32LE(20), height: buf.readUInt32LE(24), levels: buf.readUInt32LE(40), supercompression: buf.readUInt32LE(44) };
}

async function main() {
  const ktx = arg("ktx") ?? process.env.KTX_BIN;
  if (!ktx || !existsSync(ktx)) throw new Error("Pass --ktx <path to ktx.exe> (KTX-Software v4.4.2) or set KTX_BIN");
  const ktxVersion = execFileSync(ktx, ["--version"], { encoding: "utf8" }).trim();
  for (const d of [OUT_TEX, OUT_BASIS, SOURCES, DOWNLOADS]) mkdirSync(d, { recursive: true });
  for (const f of readdirSync(OUT_TEX)) if (f.endsWith(".ktx2")) rmSync(path.join(OUT_TEX, f));

  const index: Record<string, unknown> = {};
  const rows: string[] = [];
  const encodeReport: unknown[] = [];

  for (const spec of TEXTURE_ASSETS) {
    const info = await getJson<{ name: string; authors: Record<string, string>; dimensions: number[]; date_published: number }>(
      `https://api.polyhaven.com/info/${spec.polyHavenId}`,
    );
    const files = await getJson<Record<string, Record<string, Record<string, PhFile>>>>(`https://api.polyhaven.com/files/${spec.polyHavenId}`);
    const entry: Record<string, unknown> = { tileMetres: spec.tileMetres, maps: {} };
    for (const m of spec.maps) {
      const file = files[m.map]?.[RESOLUTION]?.png;
      if (!file) throw new Error(`${spec.polyHavenId}: no ${m.map} ${RESOLUTION} png`);
      const raw = await download(file, path.join(DOWNLOADS, path.basename(new URL(file.url).pathname)));
      const src = await authorSource(raw, spec, m);
      const srcPath = path.join(SOURCES, `${spec.name}-${m.role}.png`);
      writeFileSync(srcPath, src.png);
      const tmpOut = path.join(DOWNLOADS, `${spec.name}-${m.role}.ktx2`);
      const out = execFileSync(ktx, ["create", ...KTX_ENCODE_ARGS(m.colorSpace), srcPath, tmpOut], { encoding: "utf8" });
      const ktxBuf = readFileSync(tmpOut);
      const head = ktx2Header(ktxBuf);
      if (head.width !== src.width || head.height !== src.height) throw new Error(`${tmpOut}: level 0 ${head.width}x${head.height} != source ${src.width}x${src.height}`);
      const hash = sha256(ktxBuf);
      const fileName = `${spec.name}-${m.role}.${hash.slice(0, 8)}.ktx2`;
      copyFileSync(tmpOut, path.join(OUT_TEX, fileName));
      (entry.maps as Record<string, unknown>)[m.role] = {
        url: `/museum/textures/${fileName}`,
        width: head.width,
        height: head.height,
        levels: head.levels,
        colorSpace: m.colorSpace,
        bytes: ktxBuf.length,
        sha256: hash,
        sourceSha256: sha256(src.png),
      };
      encodeReport.push({ asset: spec.name, role: m.role, ktxOutput: out.trim(), grade: src.grade });
      rows.push(
        `| \`textures/${fileName}\` | ${info.name} (${m.map}, ${RESOLUTION}) | CC0 1.0 | ${Object.keys(info.authors).join(", ")} | https://polyhaven.com/a/${spec.polyHavenId} | ${file.url} | md5 \`${file.md5}\` (as published) | \`${hash}\` | ${head.width}x${head.height}, ${head.levels} mip levels, UASTC + zstd${src.grade ? `; colour graded to mean ${spec.gradeMeanSrgb} (per-channel gain ${src.grade.map((g) => g.toFixed(3)).join("/")})` : ""} |`,
      );
    }
    index[spec.name] = entry;
  }

  // Basis transcoder (KTX2Loader): self-hosted, never a CDN (CSP connect-src 'self').
  const basisSrc = path.join(ROOT, "node_modules/three/examples/jsm/libs/basis");
  const basisRows: string[] = [];
  for (const f of ["basis_transcoder.js", "basis_transcoder.wasm"]) {
    copyFileSync(path.join(basisSrc, f), path.join(OUT_BASIS, f));
    basisRows.push(`| \`basis/${f}\` | Basis Universal transcoder shipped with three 0.186.1 (\`examples/jsm/libs/basis/${f}\`) | Apache-2.0 | Binomial LLC | https://github.com/BinomialLLC/basis_universal | node_modules/three | — | \`${sha256(readFileSync(path.join(OUT_BASIS, f)))}\` | code, not a texture |`);
  }

  writeFileSync(path.join(OUT_TEX, "index.json"), `${JSON.stringify({ resolution: RESOLUTION, encoder: ktxVersion, textures: index }, null, 2)}\n`);
  writeFileSync(path.join(ROOT, "analysis/out/museum/encode-report.json"), `${JSON.stringify(encodeReport, null, 2)}\n`);

  const md = `# Museum assets: licences and checksums

Every file under \`public/museum/\` is listed here. Generated by \`scripts/museum/build-textures.ts\`
(do not edit by hand). A reviewer can verify each licence on the asset page; Poly Haven publishes
every asset under CC0 1.0 (https://polyhaven.com/license).

- Encoder: ${ktxVersion} (KTX-Software, \`ktx create\`), arguments in \`scripts/museum/textures.config.ts\`.
- Source maps are Poly Haven ${RESOLUTION} PNGs, verified against the md5 the Poly Haven files API publishes.
- The authored source for each map is the 8-bit PNG the encoder reads (\`analysis/out/museum/sources/\`,
  regenerated by the script); KTX2 level 0 has exactly the source's pixel size.
- No exhibit or content image is shipped here. Geometry is generated from the spatial manifest at
  run time, so no mesh files are downloaded.

| File | Asset (map, resolution) | Licence | Author(s) | Asset page | Source file | Source checksum | sha256 of shipped file | Notes |
|---|---|---|---|---|---|---|---|---|
${[...rows, ...basisRows].join("\n")}
`;
  writeFileSync(path.join(ROOT, "public/museum/ASSETS.md"), md);
  console.log(md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
