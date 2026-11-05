import type { SubstanceFill, SubstanceLook } from "@/features/process/domain/substance-look";

export type PileForm = "camel-pellets" | "dung-lumps" | "dung-cakes" | "wet-dung" | "madder-roots" | "chay-sheaves" | "dried-flakes" | "dried-calyces" | "dry-leaves" | "dried-fruit" | "crystals";

type PileFormLook = Pick<SubstanceLook, "key" | "surface"> & { readonly fill: SubstanceFill };

const CAMEL_WORDS = /pellet|crazed|crease|seam/;
const WET_WORDS = /\bwet\b|\bfresh\b|\bmoist\b/;
const CAKE_WORDS = /\bcakes?\b|\bdiscs?\b|\bpressed flat\b/;
const CALYX_WORDS = /calyx|calyces|tubular|floret/;

export function pileFormOf(look: PileFormLook): PileForm | null {
  switch (look.fill) {
    case "dung":
      if (WET_WORDS.test(look.surface)) return "wet-dung";
      if (CAKE_WORDS.test(look.surface)) return "dung-cakes";
      return CAMEL_WORDS.test(look.surface) ? "camel-pellets" : "dung-lumps";
    case "roots":
      return /chay/.test(look.key) ? "chay-sheaves" : "madder-roots";
    case "flowers":
      return CALYX_WORDS.test(look.surface) ? "dried-calyces" : "dried-flakes";
    case "leaves":
      return "dry-leaves";
    case "fruit":
      return "dried-fruit";
    case "crystals":
      return "crystals";
    default:
      return null;
  }
}
