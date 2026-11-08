import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { describe, expect, it } from "vitest";
import { decodedSkyOf } from "@/features/walkthrough/infrastructure/rgbe-sky";

const KNEE = 3.5;

describe("sky decoding off the main thread", () => {
  const file = gunzipSync(readFileSync(join(process.cwd(), "public/walkthrough/sky/env.hdr.gz")));
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  const sky = decodedSkyOf(buffer, KNEE);

  it("decodes the sky bit for bit as three's HDR loader does", () => {
    const parsed = new HDRLoader().parse(buffer) as unknown as { width: number; height: number; data: Uint16Array };
    expect([sky.width, sky.height]).toEqual([parsed.width, parsed.height]);
    expect(Buffer.from(sky.plain.buffer).equals(Buffer.from(parsed.data.buffer))).toBe(true);
  });

  it("softens the sun bit for bit as three's half-float conversion does", () => {
    const { fromHalfFloat, toHalfFloat } = THREE.DataUtils;
    const expected = sky.plain.slice();
    for (let i = 0; i < expected.length; i += 4) {
      const red = fromHalfFloat(expected[i]!);
      const green = fromHalfFloat(expected[i + 1]!);
      const blue = fromHalfFloat(expected[i + 2]!);
      const brightest = Math.max(red, green, blue);
      if (brightest <= KNEE * 0.5) continue;
      const scale = KNEE / (KNEE + brightest - KNEE * 0.5);
      expected[i] = toHalfFloat(red * scale);
      expected[i + 1] = toHalfFloat(green * scale);
      expected[i + 2] = toHalfFloat(blue * scale);
    }
    expect(Buffer.from(sky.softened.buffer).equals(Buffer.from(expected.buffer))).toBe(true);
  });
});
