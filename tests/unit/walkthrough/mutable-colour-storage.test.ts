import { describe, expect, it } from "vitest";
import { storeColourTexturesMutably, type StorageContext } from "@/features/walkthrough/infrastructure/mutable-colour-storage";

const TEXTURE_2D = 3553;
const RGBA16F = 34842;

function fakeContext() {
  const calls: unknown[][] = [];
  const unpack = { skipPixels: 0, skipRows: 0 };
  const texture = {};
  const gl = {
    TEXTURE_2D,
    TEXTURE_BINDING_2D: 32873,
    RGBA8: 32856,
    SRGB8_ALPHA8: 35907,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    UNPACK_SKIP_PIXELS: 3316,
    UNPACK_SKIP_ROWS: 3315,
    getParameter(name: number) {
      if (name === 32873) return texture;
      return name === 3316 ? unpack.skipPixels : unpack.skipRows;
    },
    texStorage2D: (...args: unknown[]) => void calls.push(["texStorage2D", ...args]),
    texSubImage2D: (...args: unknown[]) => void calls.push(["texSubImage2D", ...args]),
    texImage2D: (...args: unknown[]) => void calls.push(["texImage2D", ...args]),
    generateMipmap: (...args: unknown[]) => void calls.push(["generateMipmap", ...args]),
  };
  storeColourTexturesMutably(gl as unknown as StorageContext);
  return { gl: gl as unknown as WebGL2RenderingContext, calls, unpack };
}

const image = { width: 2048, height: 1024 };

describe("mutable colour storage", () => {
  it("defines a mip-mapped colour texture from its first whole upload instead of immutable storage", () => {
    const { gl, calls } = fakeContext();
    gl.texStorage2D(TEXTURE_2D, 12, gl.SRGB8_ALPHA8, 2048, 1024);
    gl.texSubImage2D(TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image as unknown as ImageBitmap);
    gl.generateMipmap(TEXTURE_2D);
    expect(calls).toEqual([
      ["texImage2D", TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, image],
      ["generateMipmap", TEXTURE_2D],
    ]);
  });

  it("skips mip generation before any pixels and defines an empty level for the first strip", () => {
    const { gl, calls } = fakeContext();
    gl.texStorage2D(TEXTURE_2D, 12, gl.RGBA8, 2048, 1024);
    gl.generateMipmap(TEXTURE_2D);
    gl.texSubImage2D(TEXTURE_2D, 0, 0, 0, 2048, 128, gl.RGBA, gl.UNSIGNED_BYTE, image as unknown as ImageBitmap);
    gl.texSubImage2D(TEXTURE_2D, 0, 0, 128, 2048, 128, gl.RGBA, gl.UNSIGNED_BYTE, image as unknown as ImageBitmap);
    gl.generateMipmap(TEXTURE_2D);
    expect(calls).toEqual([
      ["texImage2D", TEXTURE_2D, 0, gl.RGBA8, 2048, 1024, 0, gl.RGBA, gl.UNSIGNED_BYTE, null],
      ["texSubImage2D", TEXTURE_2D, 0, 0, 0, 2048, 128, gl.RGBA, gl.UNSIGNED_BYTE, image],
      ["texSubImage2D", TEXTURE_2D, 0, 0, 128, 2048, 128, gl.RGBA, gl.UNSIGNED_BYTE, image],
      ["generateMipmap", TEXTURE_2D],
    ]);
  });

  it("treats a whole rectangle read past skipped rows as a strip", () => {
    const { gl, calls, unpack } = fakeContext();
    gl.texStorage2D(TEXTURE_2D, 12, gl.RGBA8, 2048, 1024);
    unpack.skipRows = 64;
    gl.texSubImage2D(TEXTURE_2D, 0, 0, 0, 2048, 1024, gl.RGBA, gl.UNSIGNED_BYTE, image as unknown as ImageBitmap);
    expect(calls[0]).toEqual(["texImage2D", TEXTURE_2D, 0, gl.RGBA8, 2048, 1024, 0, gl.RGBA, gl.UNSIGNED_BYTE, null]);
    expect(calls[1]![0]).toBe("texSubImage2D");
  });

  it("leaves single-level, half-float and later uploads on the ordinary path", () => {
    const { gl, calls } = fakeContext();
    gl.texStorage2D(TEXTURE_2D, 1, gl.RGBA8, 64, 64);
    gl.texStorage2D(TEXTURE_2D, 7, RGBA16F, 64, 64);
    expect(calls.map((call) => call[0])).toEqual(["texStorage2D", "texStorage2D"]);
    gl.texStorage2D(TEXTURE_2D, 12, gl.SRGB8_ALPHA8, 2048, 1024);
    gl.texSubImage2D(TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image as unknown as ImageBitmap);
    gl.generateMipmap(TEXTURE_2D);
    gl.texSubImage2D(TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image as unknown as ImageBitmap);
    expect(calls.at(-1)).toEqual(["texSubImage2D", TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image]);
  });
});
