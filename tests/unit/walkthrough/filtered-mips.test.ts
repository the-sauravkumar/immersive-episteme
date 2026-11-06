import { describe, expect, it } from "vitest";
import { filteredMips, type MipFilter } from "@/features/walkthrough/domain/filtered-mips";

const KAISER: MipFilter = { radius: 3, beta: 4, sharpen: 0 };

function image(width: number, height: number, paint: (x: number, y: number) => number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = paint(x, y);
      pixels.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  return pixels;
}

describe("filtered mip chain", () => {
  it("halves every level down to one pixel, odd sizes included", () => {
    const levels = filteredMips(image(37, 12, () => 90), 37, 12, KAISER);
    expect(levels.map((level) => [level.width, level.height])).toEqual([
      [18, 6],
      [9, 3],
      [4, 1],
      [2, 1],
      [1, 1],
    ]);
  });

  it("keeps a flat image flat, sharpened or not", () => {
    for (const sharpen of [0, 0.6]) {
      for (const level of filteredMips(image(64, 64, () => 151), 64, 64, { ...KAISER, sharpen })) {
        for (let i = 0; i < level.pixels.length; i += 4) {
          expect(Math.abs(level.pixels[i]! - 151)).toBeLessThanOrEqual(1);
          expect(level.pixels[i + 3]).toBe(255);
        }
      }
    }
  });

  it("averages light, not display values, so a black and white checker becomes linear half grey", () => {
    const [first] = filteredMips(image(64, 64, (x, y) => ((x + y) % 2 === 0 ? 255 : 0)), 64, 64, KAISER);
    const centre = first!.pixels[(16 * first!.width + 16) * 4]!;
    expect(Math.abs(centre - 188)).toBeLessThanOrEqual(2);
  });

  it("removes stripes finer than the next level can hold instead of folding them into coarse bands", () => {
    const display = (light: number) => Math.round(255 * (light <= 0.0031308 ? light * 12.92 : 1.055 * light ** (1 / 2.4) - 0.055));
    const stripes = image(256, 8, (x) => display(0.5 + 0.45 * Math.cos(Math.PI * 0.9 * x)));
    const [first] = filteredMips(stripes, 256, 8, KAISER);
    const row = Array.from({ length: first!.width - 16 }, (_, i) => first!.pixels[(2 * first!.width + 8 + i) * 4]!);
    expect(Math.max(...row) - Math.min(...row)).toBeLessThanOrEqual(12);
  });

  it("lifts detail at the top of each level when sharpened", () => {
    const edge = image(64, 64, (x) => (x < 32 ? 40 : 200));
    const plain = filteredMips(edge, 64, 64, KAISER)[1]!;
    const sharp = filteredMips(edge, 64, 64, { ...KAISER, sharpen: 0.6 })[1]!;
    const step = (level: typeof plain) => level.pixels[(8 * level.width + 8) * 4]! - level.pixels[(8 * level.width + 7) * 4]!;
    expect(step(sharp)).toBeGreaterThan(step(plain));
  });

  it("filters painted coverage in straight alpha, leaving the colour white", () => {
    const pixels = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) pixels.set([255, 255, 255, i % 64 < 32 ? 255 : 0], i * 4);
    const [first, second] = filteredMips(pixels, 64, 64, { ...KAISER, coverage: true });
    for (const level of [first!, second!]) for (let i = 0; i < level.pixels.length; i += 4) expect([level.pixels[i], level.pixels[i + 1], level.pixels[i + 2]]).toEqual([255, 255, 255]);
    const alphaAt = (level: typeof first, x: number) => level!.pixels[(8 * level!.width + x) * 4 + 3]!;
    expect(alphaAt(first, 4)).toBe(255);
    expect(alphaAt(first, 28)).toBe(0);
    expect(Math.abs(alphaAt(first, 15) + alphaAt(first, 16) - 255)).toBeLessThanOrEqual(4);
  });

  it("runs as a stand-alone function, so a worker can carry its source text", () => {
    const rebuilt = new Function(`return (${filteredMips.toString()});`)() as typeof filteredMips;
    const pixels = image(20, 9, (x, y) => (x * 13 + y * 29) % 256);
    expect(rebuilt(pixels, 20, 9, KAISER)).toEqual(filteredMips(pixels, 20, 9, KAISER));
  });
});
