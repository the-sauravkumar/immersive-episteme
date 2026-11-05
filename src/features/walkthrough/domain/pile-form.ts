import type { SubstanceFill, SubstanceLook } from "@/features/process/domain/substance-look";

export type PileForm = "camel-pellets" | "moist-dung" | "madder-roots" | "chay-sheaves" | "dried-calyces" | "dry-leaves";

type PileFormLook = Pick<SubstanceLook, "key" | "surface"> & { readonly fill: SubstanceFill };

const CAMEL_WORDS = /pellet|crazed|crease|seam/;

export function pileFormOf(look: PileFormLook): PileForm | null {
  switch (look.fill) {
    case "dung":
      return CAMEL_WORDS.test(look.surface) ? "camel-pellets" : "moist-dung";
    case "roots":
      return /chay/.test(look.key) ? "chay-sheaves" : "madder-roots";
    case "flowers":
      return "dried-calyces";
    case "leaves":
      return "dry-leaves";
    default:
      return null;
  }
}
