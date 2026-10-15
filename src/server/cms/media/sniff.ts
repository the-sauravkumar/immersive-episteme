/**
 * Upload validation for the media library: MIME allow-list, per-kind size limits, magic-byte
 * sniffing (the declared MIME must match the bytes) and pixel dimensions for images.
 *
 * Pure and dependency-free (no image library): only the container headers are read, so the
 * first 64 KiB of a file is always enough (`SNIFF_BYTES`). Width/height are recorded so the 3D
 * condition can size exhibit planes to the true aspect ratio (assets.width / assets.height).
 *
 * SVG and HTML are never accepted: both can carry script and would be served from our origin.
 */
import { MAX_ASSET_BYTES } from "@/features/media/contracts";
import type { AssetKind } from "@/lib/validation/enums";

import { CmsError } from "../core";

const MiB = 1024 * 1024;

export interface AllowedMedia {
  kind: AssetKind;
  maxBytes: number;
  extension: string;
  label: string;
}

/** The only MIME types the library stores. */
export const ALLOWED_MEDIA = {
  "image/jpeg": { kind: "image", maxBytes: 25 * MiB, extension: "jpg", label: "JPEG image" },
  "image/png": { kind: "image", maxBytes: 25 * MiB, extension: "png", label: "PNG image" },
  "image/webp": { kind: "image", maxBytes: 25 * MiB, extension: "webp", label: "WebP image" },
  "model/gltf-binary": { kind: "model_3d", maxBytes: 200 * MiB, extension: "glb", label: "glTF binary model" },
  "application/pdf": { kind: "document", maxBytes: 50 * MiB, extension: "pdf", label: "PDF document" },
} as const satisfies Record<string, AllowedMedia>;

export type AllowedMime = keyof typeof ALLOWED_MEDIA;
export const ALLOWED_MIMES = Object.keys(ALLOWED_MEDIA) as AllowedMime[];

/** Largest upload of any allowed type (never above the contract's MAX_ASSET_BYTES). */
export const MAX_UPLOAD_BYTES = Math.min(MAX_ASSET_BYTES, Math.max(...Object.values(ALLOWED_MEDIA).map((m) => m.maxBytes)));

/** Bytes from the start of a file that sniffing and dimension parsing need. */
export const SNIFF_BYTES = 64 * 1024;

export function isAllowedMime(mime: string): mime is AllowedMime {
  return Object.hasOwn(ALLOWED_MEDIA, mime);
}

const startsWith = (b: Uint8Array, sig: readonly number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, offset: number, len: number) =>
  b.length >= offset + len ? String.fromCharCode(...b.subarray(offset, offset + len)) : "";

/** The allowed MIME type the bytes actually are, or null (unknown, SVG, HTML, ...). */
export function sniffMime(b: Uint8Array): AllowedMime | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  if (ascii(b, 0, 4) === "glTF") return "model/gltf-binary";
  if (ascii(b, 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export interface Dimensions {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;

function pngDimensions(b: Uint8Array): Dimensions | null {
  // Signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4).
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

/** Start-of-frame markers that carry the frame size (all SOFn except DHT C4, JPG C8, DAC CC). */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegDimensions(b: Uint8Array): Dimensions | null {
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1]!;
    if (marker === 0xff) {
      o += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2; // markers without a length
      continue;
    }
    const len = u16be(b, o + 2);
    if (len < 2) return null;
    if (SOF.has(marker)) {
      if (o + 9 > b.length) return null;
      return { height: u16be(b, o + 5), width: u16be(b, o + 7) };
    }
    if (marker === 0xda || marker === 0xd9) return null; // start of scan / end: no frame header seen
    o += 2 + len;
  }
  return null;
}

function webpDimensions(b: Uint8Array): Dimensions | null {
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    // Frame tag (3) + start code 9d 01 2a + 14-bit width/height.
    if (b.length < 30 || !startsWith(b, [0x9d, 0x01, 0x2a], 23)) return null;
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    if (b.length < 30) return null;
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  return null;
}

/** Pixel size of an image from its header, or null when it cannot be read. */
export function imageDimensions(b: Uint8Array, mime: AllowedMime): Dimensions | null {
  const d = mime === "image/png" ? pngDimensions(b) : mime === "image/jpeg" ? jpegDimensions(b) : mime === "image/webp" ? webpDimensions(b) : null;
  return d && d.width > 0 && d.height > 0 ? d : null;
}

export interface CheckedUpload {
  mime: AllowedMime;
  kind: AssetKind;
  extension: string;
  width: number | null;
  height: number | null;
}

/**
 * Validates an upload: allowed declared type, size within the type's limit, bytes that are
 * really that type, and (images) readable dimensions. `head` = at least the first SNIFF_BYTES.
 */
export function checkUpload(input: { declaredMime: string; byteSize: number; head: Uint8Array }): CheckedUpload {
  const declared = input.declaredMime.split(";")[0]!.trim().toLowerCase();
  if (!isAllowedMime(declared)) {
    throw new CmsError("mime_not_allowed", `Files of type "${declared || "unknown"}" are not accepted. Allowed: ${ALLOWED_MIMES.join(", ")}.`, 422);
  }
  const spec = ALLOWED_MEDIA[declared];
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) throw new CmsError("empty_file", "The file is empty.", 422);
  if (input.byteSize > spec.maxBytes) {
    throw new CmsError("too_large", `${spec.label}s are limited to ${Math.round(spec.maxBytes / MiB)} MiB.`, 422);
  }
  const actual = sniffMime(input.head);
  if (actual !== declared) {
    throw new CmsError("mime_mismatch", `The file's content is ${actual ? `a ${ALLOWED_MEDIA[actual].label}` : "not an accepted type"}, not ${declared}.`, 422);
  }
  let width: number | null = null;
  let height: number | null = null;
  if (spec.kind === "image") {
    const d = imageDimensions(input.head, declared);
    if (!d) throw new CmsError("unreadable_image", "The image dimensions could not be read from the file header.", 422);
    width = d.width;
    height = d.height;
  }
  return { mime: declared, kind: spec.kind, extension: spec.extension, width, height };
}
