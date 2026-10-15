/**
 * Wall-panel and sign lettering: per room, all panel and sign faces are drawn into single-channel
 * (R8) coverage atlases at 600 texels per metre, with a full mip chain. The text is set in the
 * page's own typefaces (the next/font Source Serif 4 and Inter files, DESIGN.md 5.1), so the
 * lettering matches the 2D condition and the HTML panel. The atlas is built only after
 * `document.fonts.ready` and an explicit load of both faces (`ensureLabelFonts`), so a plaque is
 * never drawn in a fallback font in 3D only (DESIGN.md 11.6, residual risk 7).
 *
 * Wall exhibit planes are typographic plates (DESIGN.md 11.6, 12.3 rule 11): the same size for
 * every exhibit, the concept title in Source Serif 4 600, ink on the `--ground` paper, inside a
 * thin ink frame, and nothing else (the museum passes no kicker or footer). Room plaques (doorway
 * signs naming the room they lead to) are one fixed size for every room, the name in Source Serif 4
 * 600 at a fixed size (two lines when there is no zone line), under the zone it leads into when the
 * doorway changes zone. Lettering is set at a reading optical size (`LETTERING_OPSZ_PX`).
 *
 * All lettering is drawn at FULL ink coverage. Secondary lines at reduced coverage (0.88) measured
 * 3.1:1 against the lit paper in the legibility check, under the 4.5:1 of WCAG 1.4.3: small type
 * loses contrast to filtering, so no lettering is lightened on purpose.
 *
 * Adapted from virtual-walkthrough src/museum/materials/wallGraphics.ts `createLabelTexture`
 * (canvas lettering for wall graphics). Differences: one coverage atlas per room instead of one
 * RGBA texture per label (4 bytes -> 1 byte per texel), and the same text is always available
 * in the DOM (exhibit list and information panel), never only in the 3D scene.
 */
import { titleCase } from "@/lib/text/title-case";
import * as THREE from "three";

export const LABEL_TEXELS_PER_METRE = 600;
const PAGE = 2048;
/**
 * The plate's ink frame (DESIGN.md 11.6 "1 px ink frame", scaled to the wall): 3 texels (5 mm)
 * wide, inset 12 texels (2 cm) from the card edge, outside the lettering pad (6% of the width) and
 * outside the bands the legibility probe samples (kicker from 5% of the height, title from 20%,
 * 4% side inset), so it never changes a measured contrast. Drawn as coverage like the text, so it
 * mip-maps with the same filtering and does not shimmer.
 */
export const PLATE_FRAME = { insetTexels: 12, widthTexels: 3 } as const;

export interface LabelItem {
  id: string;
  /** panel: exhibit card; sign: category sign (one line); door: doorway sign (where it leads). */
  kind: "panel" | "sign" | "door";
  /** Type sizes in metres (em), from the legibility rule (src/features/immersive/placement.ts). */
  em: { kicker: number; title: number; footer: number };
  widthM: number;
  heightM: number;
  kicker: string | null;
  title: string;
  footer: string | null;
}

export interface AtlasRect {
  page: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface LabelAtlas {
  pages: THREE.DataTexture[];
  rects: Map<string, AtlasRect>;
  texels: number;
}

function cssFamily(variable: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v || fallback;
}

/** The next/font family variables set on <html> by src/app/layout.tsx. */
const SERIF_VAR = "--font-source-serif";
const SANS_VAR = "--font-inter";
const serifFamily = () => cssFamily(SERIF_VAR, "serif");
const sansFamily = () => cssFamily(SANS_VAR, "sans-serif");

let fontsReady: Promise<void> | null = null;

/**
 * Wait until the lettering faces are loaded (deterministic glyphs in the atlas): every pending
 * font load (`document.fonts.ready`), then an explicit load of each weight the atlas draws.
 */
export function ensureLabelFonts(): Promise<void> {
  if (!fontsReady) {
    const display = serifFamily();
    const sans = sansFamily();
    fontsReady = document.fonts.ready
      .then(() => Promise.all([document.fonts.load(`600 64px ${display}`), document.fonts.load(`500 28px ${sans}`), document.fonts.load(`400 26px ${sans}`)]))
      .then(() => undefined);
  }
  return fontsReady;
}

/**
 * Nominal font sizes (canvas px) the lettering is set at. Source Serif 4 takes its optical size
 * from the font size (`font-optical-sizing: auto`, opsz 8-60), and a canvas has no
 * `font-variation-settings`. Set at its true size (60-72 texels), every title came out in the
 * Display cut, whose hairlines wash out when the texture is minified. So each line is set at the
 * optical size it is read at on screen and scaled up by the canvas transform; the glyphs are vector
 * outlines, so the scaled text is as sharp as text set at full size, with the sturdier strokes of
 * the smaller cut. Inter's served file has no opsz axis, so the sans lines are unchanged.
 *
 * - Plaques are read at about 10-16 px on screen (a 0.1 m name seen from across a room), so 12.
 *   Measured (SwiftShader, 1280 x 800, the lobby spawn's "Comparison Hall", paper 90th against ink
 *   1st percentile): 1.80:1 at opsz 60, 2.49 at 18, 3.03 at 12, 3.19 at 8.
 * - Plates are read at about 16-40 px from the room, so the Text cut, 18.
 */
export const LETTERING_OPSZ_PX = { plaque: 12, plate: 18 } as const;

/** Sets the face at the nominal size `opsz`; returns the scale from nominal px to atlas texels. */
function setFace(ctx: CanvasRenderingContext2D, weight: number, sizeTexels: number, family: string, opsz: number, trackingEm = 0): number {
  ctx.font = `${weight} ${opsz}px ${family}`;
  ctx.letterSpacing = `${(trackingEm * opsz).toFixed(3)}px`;
  return sizeTexels / opsz;
}

/** Width in texels of `text` in the current face at scale `s`. */
const measure = (ctx: CanvasRenderingContext2D, text: string, s: number) => ctx.measureText(text).width * s;

/** Draws `text` with its alphabetic baseline origin at (x, y) texels, in the current face at scale `s`. */
function fillAt(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function wrapLines(ctx: CanvasRenderingContext2D, s: number, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (measure(ctx, next, s) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1]!;
    while (last.length > 1 && measure(ctx, `${last}…`, s) > maxWidth) last = last.slice(0, -1).trimEnd();
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

function drawItem(ctx: CanvasRenderingContext2D, item: LabelItem, x: number, y: number, w: number, h: number) {
  const display = serifFamily();
  const sans = sansFamily();
  const px = (m: number) => Math.round(m * LABEL_TEXELS_PER_METRE);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  if (item.kind === "sign") {
    const size = px(item.em.title);
    const s = setFace(ctx, 500, size, sans, LETTERING_OPSZ_PX.plaque, 0.1);
    const line = wrapLines(ctx, s, item.title.toUpperCase(), w * 0.9, 1)[0] ?? "";
    fillAt(ctx, line, (w - measure(ctx, line, s)) / 2, (h + size * 0.7) / 2, s);
    ctx.restore();
    return;
  }
  if (item.kind === "door") {
    // Centred: the zone it leads to (when the doorway changes zone, up to two lines) above the room
    // name. The name wraps to a second line when there is no zone line and room for it (11.6).
    const k = px(item.em.kicker);
    const t = px(item.em.title);
    const ks = setFace(ctx, 500, k, sans, LETTERING_OPSZ_PX.plaque);
    const kick = item.kicker ? wrapLines(ctx, ks, titleCase(item.kicker), w * 0.94, 2) : [];
    const titleLineH = Math.round(t * 1.08);
    const titleRoom = h - (kick.length * k * 1.2 + (kick.length ? k * 0.25 : 0));
    const maxTitleLines = kick.length === 0 && titleRoom >= t + titleLineH + 2 * Math.round(t * 0.2) ? 2 : 1;
    const ts = setFace(ctx, 600, t, display, LETTERING_OPSZ_PX.plaque);
    const title = wrapLines(ctx, ts, titleCase(item.title), w * 0.94, maxTitleLines);
    const total = kick.length * k * 1.2 + (kick.length ? k * 0.25 : 0) + t + (title.length - 1) * titleLineH;
    let cy = (h - total) / 2;
    setFace(ctx, 500, k, sans, LETTERING_OPSZ_PX.plaque);
    for (const line of kick) {
      cy += k * 1.2;
      fillAt(ctx, line, (w - measure(ctx, line, ks)) / 2, cy - k * 0.2, ks);
    }
    if (kick.length) cy += k * 0.25;
    setFace(ctx, 600, t, display, LETTERING_OPSZ_PX.plaque);
    cy += t * 0.85;
    for (const line of title) {
      fillAt(ctx, line, (w - measure(ctx, line, ts)) / 2, cy, ts);
      cy += titleLineH;
    }
    ctx.restore();
    return;
  }
  // Exhibit plate: the thin ink frame, then the title (and a kicker or footer only if one is
  // passed; the museum passes none) left-aligned on a fixed pad.
  const fi = PLATE_FRAME.insetTexels;
  const fw = PLATE_FRAME.widthTexels;
  ctx.fillRect(fi, fi, w - 2 * fi, fw);
  ctx.fillRect(fi, h - fi - fw, w - 2 * fi, fw);
  ctx.fillRect(fi, fi, fw, h - 2 * fi);
  ctx.fillRect(w - fi - fw, fi, fw, h - 2 * fi);
  const pad = Math.round(w * 0.06);
  const k = px(item.em.kicker);
  const t = px(item.em.title);
  const f = px(item.em.footer);
  let cy = pad;
  if (item.kicker) {
    const ks = setFace(ctx, 500, k, sans, LETTERING_OPSZ_PX.plate, 0.1);
    cy += k;
    fillAt(ctx, wrapLines(ctx, ks, item.kicker.toUpperCase(), w - 2 * pad, 1)[0] ?? "", pad, cy, ks);
    cy += Math.round(k * 0.6);
  }
  const footerBlock = item.footer ? f * 1.4 : 0;
  const lineH = Math.round(t * 1.08);
  const maxLines = Math.max(1, Math.floor((h - cy - pad - footerBlock) / lineH));
  const ts = setFace(ctx, 600, t, display, LETTERING_OPSZ_PX.plate);
  for (const l of wrapLines(ctx, ts, titleCase(item.title), w - 2 * pad, maxLines)) {
    cy += lineH;
    fillAt(ctx, l, pad, cy, ts);
  }
  if (item.footer) {
    const fs = setFace(ctx, 400, f, sans, LETTERING_OPSZ_PX.plate);
    fillAt(ctx, wrapLines(ctx, fs, item.footer, w - 2 * pad, 1)[0] ?? "", pad, h - pad, fs);
  }
  ctx.restore();
}

/** Packs the items on shelves, draws them and uploads one R8 texture per page. */
export function buildLabelAtlas(items: readonly LabelItem[], anisotropy: number, name: string): LabelAtlas {
  const rects = new Map<string, AtlasRect>();
  const placed: { item: LabelItem; page: number; x: number; y: number; w: number; h: number }[] = [];
  let page = 0;
  let x = 0;
  let y = 0;
  let shelf = 0;
  const pageHeights: number[] = [];
  for (const item of items) {
    const w = Math.min(PAGE, Math.ceil(item.widthM * LABEL_TEXELS_PER_METRE));
    const h = Math.min(PAGE, Math.ceil(item.heightM * LABEL_TEXELS_PER_METRE));
    if (x + w > PAGE) {
      x = 0;
      y += shelf + 2;
      shelf = 0;
    }
    if (y + h > PAGE) {
      pageHeights[page] = y;
      page++;
      x = 0;
      y = 0;
      shelf = 0;
    }
    placed.push({ item, page, x, y, w, h });
    x += w + 2;
    shelf = Math.max(shelf, h);
  }
  pageHeights[page] = y + shelf;

  const pages: THREE.DataTexture[] = [];
  let texels = 0;
  for (let p = 0; p <= page && placed.length > 0; p++) {
    const height = Math.max(4, Math.ceil((pageHeights[p] ?? 4) / 4) * 4);
    const canvas = document.createElement("canvas");
    canvas.width = PAGE;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, PAGE, height);
    for (const pl of placed.filter((q) => q.page === p)) {
      drawItem(ctx, pl.item, pl.x, pl.y, pl.w, pl.h);
      // Texel centres of the cell, flipped to texture space (row 0 = v 0 = canvas bottom).
      rects.set(pl.item.id, { page: p, u0: pl.x / PAGE, u1: (pl.x + pl.w) / PAGE, v0: 1 - (pl.y + pl.h) / height, v1: 1 - pl.y / height });
    }
    const rgba = ctx.getImageData(0, 0, PAGE, height).data;
    const r8 = new Uint8Array(PAGE * height);
    for (let row = 0; row < height; row++) {
      const src = (height - 1 - row) * PAGE * 4;
      const dst = row * PAGE;
      for (let i = 0; i < PAGE; i++) r8[dst + i] = rgba[src + i * 4]!;
    }
    const tex = new THREE.DataTexture(r8, PAGE, height, THREE.RedFormat, THREE.UnsignedByteType);
    tex.internalFormat = "R8";
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = anisotropy;
    tex.unpackAlignment = 1;
    tex.name = `${name}:labels:${p}`;
    tex.needsUpdate = true;
    pages.push(tex);
    texels += PAGE * height;
  }
  return { pages, rects, texels };
}
