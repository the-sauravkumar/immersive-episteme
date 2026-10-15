/**
 * Wall-plate, plaque and sign lettering: per room, all panel and sign faces are drawn into
 * single-channel (R8) coverage atlases at 600 texels per metre, with a full mip chain. The text is
 * set in the study's one typeface, read from the page's `--font-sans` token (Atkinson Hyperlegible
 * Next under the Atlas direction, DR-022; whatever the token names, the 2D page and the 3D
 * lettering use the same face). The atlas is built only after `document.fonts.ready` and an
 * explicit load of every weight drawn (`ensureLabelFonts`), so a plaque is never drawn in a
 * fallback font in 3D only (DESIGN.md 11.6, residual risk 7).
 *
 * Exhibit plates (DR-023 F2): one size for every exhibit, black ink on white paper inside a thin ink
 * frame, the concept title in 700. A sequence station also carries "Step n of N" above the title
 * and "Start" or "Last step" under it (`plaque-text.ts`, the same words as the 2D rail), and a
 * visited plate the word "Visited" at its foot (the in-world form of the 2D visited marking). Room
 * plaques over doorways name the room they lead to (two lines when there is no zone line), under
 * the zone they lead into when the doorway changes zone. Category signs are one line in Title Case:
 * no capitals or letter-spacing (no uppercase eyebrows).
 *
 * All lettering is drawn at FULL ink coverage: small type loses contrast to filtering, so no line is
 * lightened on purpose. The plate material is unlit and display-referred (resources.ts), so the
 * rendered paper is #FFFFFF and the ink #000000 wherever the plate hangs.
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
  /**
   * panel: exhibit card; sign: category sign (one line); door: doorway sign (where it leads);
   * directory: one row of the entrance directory (the destination, and the doorway to it).
   */
  kind: "panel" | "sign" | "door" | "directory";
  /** Type sizes in metres (em), from the legibility rule (src/features/immersive/placement.ts). */
  em: { kicker: number; title: number; footer: number };
  widthM: number;
  heightM: number;
  kicker: string | null;
  title: string;
  footer: string | null;
  /** A quiet mark at the plate's foot, right-aligned ("Visited"); plates only. */
  mark?: string | null;
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

/**
 * The study typeface: the theme's `--font-sans` token (a full font stack), falling back to the
 * next/font variable when the token is absent. The 2D page sets its text in the same token.
 */
const sansFamily = () => cssFamily("--font-sans", "") || cssFamily("--font-inter", "sans-serif");

/** Weights the lettering draws: secondary lines 600, titles 700. */
export const LETTERING_WEIGHT = { line: 600, title: 700 } as const;

let fontsReady: Promise<void> | null = null;

/**
 * Wait until the lettering faces are loaded (deterministic glyphs in the atlas): every pending
 * font load (`document.fonts.ready`), then an explicit load of each weight the atlas draws.
 */
export function ensureLabelFonts(): Promise<void> {
  if (!fontsReady) {
    const sans = sansFamily();
    fontsReady = document.fonts.ready
      .then(() => Promise.all([document.fonts.load(`${LETTERING_WEIGHT.title} 64px ${sans}`), document.fonts.load(`${LETTERING_WEIGHT.line} 28px ${sans}`)]))
      .then(() => undefined);
  }
  return fontsReady;
}

/**
 * Nominal font sizes (canvas px) the lettering is set at (kept from the serif lettering, where it
 * chose the optical size; for a face without an opsz axis it only sets the hinting size). Source Serif 4 took its optical size
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
  const sans = sansFamily();
  const W = LETTERING_WEIGHT;
  const px = (m: number) => Math.round(m * LABEL_TEXELS_PER_METRE);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  if (item.kind === "sign") {
    const size = px(item.em.title);
    const s = setFace(ctx, W.title, size, sans, LETTERING_OPSZ_PX.plaque);
    const line = wrapLines(ctx, s, titleCase(item.title), w * 0.9, 1)[0] ?? "";
    fillAt(ctx, line, (w - measure(ctx, line, s)) / 2, (h + size * 0.7) / 2, s);
    ctx.restore();
    return;
  }
  if (item.kind === "directory") {
    // Left-aligned on a fixed pad: the destination in 700 on the first line, the doorway that
    // leads there in 600 on the second, at the same place in every row so the rows align. A name
    // wider than the row is set smaller to fit on its line (never cut): measured in the browser.
    const pad = px(0.05);
    const t = px(item.em.title);
    const f = px(item.em.footer);
    const name = titleCase(item.title);
    let ts = setFace(ctx, W.title, t, sans, LETTERING_OPSZ_PX.plaque);
    const room = w - 2 * pad;
    const wide = measure(ctx, name, ts);
    if (wide > room) ts *= room / wide;
    fillAt(ctx, name, pad, pad + t * 0.85, ts);
    if (item.footer) {
      const fs = setFace(ctx, W.line, f, sans, LETTERING_OPSZ_PX.plaque);
      fillAt(ctx, wrapLines(ctx, fs, item.footer, room, 1)[0] ?? "", pad, h - pad - Math.round(f * 0.2), fs);
    }
    ctx.restore();
    return;
  }
  if (item.kind === "door") {
    // Centred: the zone it leads to (when the doorway changes zone, up to two lines) above the room
    // name. The name wraps to a second line when there is no zone line and room for it (11.6).
    const k = px(item.em.kicker);
    const t = px(item.em.title);
    const ks = setFace(ctx, W.line, k, sans, LETTERING_OPSZ_PX.plaque);
    const kick = item.kicker ? wrapLines(ctx, ks, titleCase(item.kicker), w * 0.94, 2) : [];
    const titleLineH = Math.round(t * 1.08);
    const titleRoom = h - (kick.length * k * 1.2 + (kick.length ? k * 0.25 : 0));
    const maxTitleLines = kick.length === 0 && titleRoom >= t + titleLineH + 2 * Math.round(t * 0.2) ? 2 : 1;
    const ts = setFace(ctx, W.title, t, sans, LETTERING_OPSZ_PX.plaque);
    const title = wrapLines(ctx, ts, titleCase(item.title), w * 0.94, maxTitleLines);
    const total = kick.length * k * 1.2 + (kick.length ? k * 0.25 : 0) + t + (title.length - 1) * titleLineH;
    let cy = (h - total) / 2;
    setFace(ctx, W.line, k, sans, LETTERING_OPSZ_PX.plaque);
    for (const line of kick) {
      cy += k * 1.2;
      fillAt(ctx, line, (w - measure(ctx, line, ks)) / 2, cy - k * 0.2, ks);
    }
    if (kick.length) cy += k * 0.25;
    setFace(ctx, W.title, t, sans, LETTERING_OPSZ_PX.plaque);
    cy += t * 0.85;
    for (const line of title) {
      fillAt(ctx, line, (w - measure(ctx, line, ts)) / 2, cy, ts);
      cy += titleLineH;
    }
    ctx.restore();
    return;
  }
  // Exhibit plate: the thin ink frame; the step line (sequence stations), the title, and the foot
  // line ("Start" / "Last step" left, "Visited" right), left-aligned on a fixed pad.
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
    const ks = setFace(ctx, W.line, k, sans, LETTERING_OPSZ_PX.plate);
    cy += k;
    fillAt(ctx, wrapLines(ctx, ks, item.kicker, w - 2 * pad, 1)[0] ?? "", pad, cy, ks);
    cy += Math.round(k * 0.6);
  }
  const foot = Boolean(item.footer || item.mark);
  const footerBlock = foot ? f * 1.4 : 0;
  const lineH = Math.round(t * 1.08);
  const maxLines = Math.max(1, Math.floor((h - cy - pad - footerBlock) / lineH));
  const ts = setFace(ctx, W.title, t, sans, LETTERING_OPSZ_PX.plate);
  for (const l of wrapLines(ctx, ts, titleCase(item.title), w - 2 * pad, maxLines)) {
    cy += lineH;
    fillAt(ctx, l, pad, cy, ts);
  }
  if (foot) {
    const fs = setFace(ctx, W.line, f, sans, LETTERING_OPSZ_PX.plate);
    const half = (w - 2 * pad) / 2 - f;
    if (item.footer) fillAt(ctx, wrapLines(ctx, fs, item.footer, half, 1)[0] ?? "", pad, h - pad, fs);
    if (item.mark) {
      const m = wrapLines(ctx, fs, item.mark, half, 1)[0] ?? "";
      fillAt(ctx, m, w - pad - measure(ctx, m, fs), h - pad, fs);
    }
  }
  ctx.restore();
}

/** One item's cell on an atlas page (canvas coordinates: y down from the page top). */
export interface AtlasPlacement {
  item: LabelItem;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A room's atlas in the making: the shelf packing is fixed up front, the items are drawn one by
 * one into the pages' R8 data (`drawNextItems`, time-sliced across frames so a room entering the
 * resident set never costs one long frame: C4), and the pages are uploaded once every item is in.
 */
export interface AtlasJob {
  name: string;
  placed: AtlasPlacement[];
  pages: { data: Uint8Array; width: number; height: number }[];
  rects: Map<string, AtlasRect>;
  /** Index of the next item to draw. */
  next: number;
}

/** Packs the items on shelves (the pages' size and every item's cell); nothing is drawn yet. */
export function planLabelAtlas(items: readonly LabelItem[], name: string): AtlasJob {
  const placed: AtlasPlacement[] = [];
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
  const pages: AtlasJob["pages"] = [];
  const rects = new Map<string, AtlasRect>();
  for (let p = 0; p <= page && placed.length > 0; p++) {
    const height = Math.max(4, Math.ceil((pageHeights[p] ?? 4) / 4) * 4);
    pages.push({ data: new Uint8Array(PAGE * height), width: PAGE, height });
  }
  for (const pl of placed) {
    const height = pages[pl.page]!.height;
    // Texel centres of the cell, flipped to texture space (row 0 = v 0 = canvas bottom).
    rects.set(pl.item.id, { page: pl.page, u0: pl.x / PAGE, u1: (pl.x + pl.w) / PAGE, v0: 1 - (pl.y + pl.h) / height, v1: 1 - pl.y / height });
  }
  return { name, placed, pages, rects, next: 0 };
}

let scratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

/** A reusable drawing canvas at least w x h (one per page lifetime; grown, never shrunk). */
function scratchCanvas(w: number, h: number) {
  if (!scratch) {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    scratch = { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true })! };
  }
  if (scratch.canvas.width < w || scratch.canvas.height < h) {
    scratch.canvas.width = Math.max(scratch.canvas.width, w);
    scratch.canvas.height = Math.max(scratch.canvas.height, h);
    scratch.ctx = scratch.canvas.getContext("2d", { willReadFrequently: true })!;
  }
  return scratch.ctx;
}

/** Draws one placed item and copies its coverage (red channel) into its page, flipped to texture rows. */
function drawPlacement(job: AtlasJob, pl: AtlasPlacement) {
  const ctx = scratchCanvas(pl.w, pl.h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, pl.w, pl.h);
  drawItem(ctx, pl.item, 0, 0, pl.w, pl.h);
  const rgba = ctx.getImageData(0, 0, pl.w, pl.h).data;
  const page = job.pages[pl.page]!;
  for (let row = 0; row < pl.h; row++) {
    const dst = (page.height - 1 - (pl.y + row)) * page.width + pl.x;
    const src = row * pl.w * 4;
    for (let i = 0; i < pl.w; i++) page.data[dst + i] = rgba[src + i * 4]!;
  }
}

/** Draws items until `budgetMs` has passed (at least one). Returns true when every item is drawn. */
export function drawNextItems(job: AtlasJob, budgetMs: number): boolean {
  const t0 = performance.now();
  while (job.next < job.placed.length) {
    drawPlacement(job, job.placed[job.next]!);
    job.next++;
    if (performance.now() - t0 >= budgetMs) break;
  }
  return job.next >= job.placed.length;
}

/** The R8 textures of a finished job. */
export function atlasTextures(job: AtlasJob, anisotropy: number): LabelAtlas {
  let texels = 0;
  const pages = job.pages.map((pg, p) => {
    const tex = new THREE.DataTexture(pg.data, pg.width, pg.height, THREE.RedFormat, THREE.UnsignedByteType);
    tex.internalFormat = "R8";
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = anisotropy;
    tex.unpackAlignment = 1;
    tex.name = `${job.name}:labels:${p}`;
    tex.needsUpdate = true;
    texels += pg.width * pg.height;
    return tex;
  });
  return { pages, rects: job.rects, texels };
}

/** Packs, draws and uploads a whole atlas at once (the start room, before entry). */
export function buildLabelAtlas(items: readonly LabelItem[], anisotropy: number, name: string): LabelAtlas {
  const job = planLabelAtlas(items, name);
  drawNextItems(job, Infinity);
  return atlasTextures(job, anisotropy);
}
