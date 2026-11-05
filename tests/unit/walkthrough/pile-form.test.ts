import { describe, expect, it } from "vitest";
import { pileFormOf } from "@/features/walkthrough/domain/pile-form";
import { piecesNearTop } from "@/features/walkthrough/domain/pile-packing";

describe("pile form follows the look row", () => {
  it("reads the dung state from the surface words", () => {
    expect(pileFormOf({ key: "ajrakh-camel-dung", fill: "dung", surface: "dry matt skin with fine crazed wrinkles, lengthwise creases and torn seams" })).toBe("camel-pellets");
    expect(pileFormOf({ key: "sanganeri-cow-dung", fill: "dung", surface: "rough pitted granular dry crust with deep branching cracks" })).toBe("dung-lumps");
    expect(pileFormOf({ key: "x", fill: "dung", surface: "dried hand pressed cakes" })).toBe("dung-cakes");
    expect(pileFormOf({ key: "x", fill: "dung", surface: "fresh wet dark mass" })).toBe("wet-dung");
  });

  it("tells chay from madder and calyces from flakes", () => {
    expect(pileFormOf({ key: "machilipatnam-kalamkari-chay-root", fill: "roots", surface: "dry root" })).toBe("chay-sheaves");
    expect(pileFormOf({ key: "ajrakh-madder", fill: "roots", surface: "dry wrinkled root" })).toBe("madder-roots");
    expect(pileFormOf({ key: "sanganeri-dhawai-phool", fill: "flowers", surface: "slim dry tubular calyces" })).toBe("dried-calyces");
    expect(pileFormOf({ key: "ajrakh-dhawri-tamarisk", fill: "flowers", surface: "small loose dry papery flakes" })).toBe("dried-flakes");
    expect(pileFormOf({ key: "x", fill: "fruit", surface: "wrinkled ridged dried fruit" })).toBe("dried-fruit");
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
