import { describe, expect, it } from "vitest";
import { SUBSTANCE_LOOK_ROWS } from "@/features/process/domain/substance-look-rows";
import { pileFormOf } from "@/features/walkthrough/domain/pile-form";
import { piecesNearTop } from "@/features/walkthrough/domain/pile-packing";

const surfaceOf = (key: string): string => SUBSTANCE_LOOK_ROWS.find((row) => row.key === key)!.surface;

describe("pile form follows the look row", () => {
  it("reads the dung state from the real rows' surface words", () => {
    expect(pileFormOf({ key: "ajrakh-camel-dung", fill: "dung", surface: surfaceOf("ajrakh-camel-dung") })).toBe("camel-pellets");
    expect(pileFormOf({ key: "sanganeri-cow-dung", fill: "dung", surface: surfaceOf("sanganeri-cow-dung") })).toBe("moist-dung");
    expect(pileFormOf({ key: "machilipatnam-kalamkari-cow-dung", fill: "dung", surface: surfaceOf("machilipatnam-kalamkari-cow-dung") })).toBe("moist-dung");
  });

  it("tells chay from madder and draws Woodfordia flowers as calyces", () => {
    expect(pileFormOf({ key: "machilipatnam-kalamkari-chay-root", fill: "roots", surface: surfaceOf("machilipatnam-kalamkari-chay-root") })).toBe("chay-sheaves");
    expect(pileFormOf({ key: "ajrakh-madder", fill: "roots", surface: surfaceOf("ajrakh-madder") })).toBe("madder-roots");
    expect(pileFormOf({ key: "sanganeri-dhawai-phool", fill: "flowers", surface: surfaceOf("sanganeri-dhawai-phool") })).toBe("dried-calyces");
    expect(pileFormOf({ key: "ajrakh-dhawri-tamarisk", fill: "flowers", surface: surfaceOf("ajrakh-dhawri-tamarisk") })).toBe("dried-calyces");
    expect(pileFormOf({ key: "x", fill: "liquid", surface: "wet" })).toBeNull();
  });
});

describe("only pieces near the top of a heap count as seen", () => {
  it("marks a piece covered by another as buried", () => {
    const low = [{ x: 0, y: 0, z: 0, r: 0.01 }];
    const high = [{ x: 0, y: 0.02, z: 0, r: 0.01 }];
    const aside = [{ x: 0.05, y: 0, z: 0, r: 0.01 }];
    expect(piecesNearTop([low, high, aside], 0.005)).toEqual([false, true, true]);
  });
});
