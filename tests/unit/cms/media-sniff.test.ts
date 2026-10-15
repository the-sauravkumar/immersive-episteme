import { describe, expect, it } from "vitest";

import { CmsError } from "../../../src/server/cms/core";
import { ALLOWED_MEDIA, checkUpload, imageDimensions, sniffMime } from "../../../src/server/cms/media/sniff";
import { storageKeyFor } from "../../../src/server/cms/media/storage";

const MiB = 1024 * 1024;
const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];

const png = (w: number, h: number) => bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), "IHDR", be32(w), be32(h), [8, 2, 0, 0, 0]);
/** SOI, an APP0 segment, then a baseline SOF0 frame header. */
const jpeg = (w: number, h: number) =>
  bytes([0xff, 0xd8], [0xff, 0xe0, 0x00, 0x10], "JFIF", [0, 1, 1, 0, 0, 1, 0, 1, 0, 0], [0xff, 0xc0, 0x00, 0x11, 0x08], [h >> 8, h & 255, w >> 8, w & 255], [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const riff = (chunk: string, payload: number[]) => bytes("RIFF", [0, 0, 0, 0], "WEBP", chunk, [payload.length, 0, 0, 0], payload);
const webpLossy = (w: number, h: number) => riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h)]);
const webpLossless = (w: number, h: number) => {
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  return riff("VP8L", [0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255]);
};
const webpExtended = (w: number, h: number) => riff("VP8X", [0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);

describe("media sniffing", () => {
  it("reads PNG, JPEG and WebP (lossy, lossless, extended) dimensions from their headers", () => {
    expect(imageDimensions(png(4000, 3000), "image/png")).toEqual({ width: 4000, height: 3000 });
    expect(imageDimensions(jpeg(1920, 1080), "image/jpeg")).toEqual({ width: 1920, height: 1080 });
    expect(imageDimensions(webpLossy(800, 600), "image/webp")).toEqual({ width: 800, height: 600 });
    expect(imageDimensions(webpLossless(1234, 567), "image/webp")).toEqual({ width: 1234, height: 567 });
    expect(imageDimensions(webpExtended(5000, 7000), "image/webp")).toEqual({ width: 5000, height: 7000 });
  });

  it("identifies the allowed types by magic bytes and nothing else", () => {
    expect(sniffMime(png(1, 1))).toBe("image/png");
    expect(sniffMime(jpeg(1, 1))).toBe("image/jpeg");
    expect(sniffMime(webpLossy(1, 1))).toBe("image/webp");
    expect(sniffMime(bytes("glTF", [2, 0, 0, 0]))).toBe("model/gltf-binary");
    expect(sniffMime(bytes("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffMime(bytes("<!doctype html><script>alert(1)</script>"))).toBeNull();
  });

  it("accepts a well-formed image and returns its kind and dimensions", () => {
    const head = png(640, 480);
    expect(checkUpload({ declaredMime: "image/png", byteSize: head.length, head })).toEqual({ mime: "image/png", kind: "image", extension: "png", width: 640, height: 480 });
    const pdf = bytes("%PDF-1.4");
    expect(checkUpload({ declaredMime: "application/pdf", byteSize: 10, head: pdf })).toMatchObject({ kind: "document", width: null, height: null });
  });

  const refused = (input: Parameters<typeof checkUpload>[0]) => {
    try {
      checkUpload(input);
    } catch (err) {
      expect(err).toBeInstanceOf(CmsError);
      return (err as CmsError).code;
    }
    return "accepted";
  };

  it("refuses a declared type that does not match the bytes", () => {
    expect(refused({ declaredMime: "image/jpeg", byteSize: 100, head: png(10, 10) })).toBe("mime_mismatch");
    expect(refused({ declaredMime: "image/png", byteSize: 100, head: bytes("<!doctype html>") })).toBe("mime_mismatch");
  });

  it("refuses SVG, HTML and unknown types outright", () => {
    expect(refused({ declaredMime: "image/svg+xml", byteSize: 100, head: bytes("<svg/>") })).toBe("mime_not_allowed");
    expect(refused({ declaredMime: "text/html", byteSize: 100, head: bytes("<html>") })).toBe("mime_not_allowed");
    expect(refused({ declaredMime: "", byteSize: 100, head: png(1, 1) })).toBe("mime_not_allowed");
  });

  it("enforces per-type size limits and refuses empty files", () => {
    expect(ALLOWED_MEDIA["image/png"].maxBytes).toBe(25 * MiB);
    expect(ALLOWED_MEDIA["application/pdf"].maxBytes).toBe(50 * MiB);
    expect(ALLOWED_MEDIA["model/gltf-binary"].maxBytes).toBe(200 * MiB);
    expect(refused({ declaredMime: "image/png", byteSize: 25 * MiB + 1, head: png(1, 1) })).toBe("too_large");
    expect(refused({ declaredMime: "image/png", byteSize: 25 * MiB, head: png(1, 1) })).toBe("accepted");
    expect(refused({ declaredMime: "image/png", byteSize: 0, head: png(1, 1) })).toBe("empty_file");
  });

  it("refuses an image whose dimensions cannot be read", () => {
    const truncated = png(10, 10).subarray(0, 16);
    expect(refused({ declaredMime: "image/png", byteSize: 100, head: truncated })).toBe("unreadable_image");
  });

  it("derives content-addressed storage keys only from a real sha256", () => {
    const sha = "ab".repeat(32);
    expect(storageKeyFor(sha, "image/webp")).toBe(`sha256/ab/${sha}.webp`);
    expect(() => storageKeyFor("../../etc/passwd", "image/png")).toThrow(CmsError);
  });
});
