export interface SubstanceWords {
  readonly key: string;
  readonly fill: string;
  readonly surface: string;
  readonly transparency: string;
}

export type PowderGrain = "fine" | "dust" | "coarse" | "granular" | "fibrous" | "crystalline";

export interface PowderForm {
  readonly level: number;
  readonly heap: number;
  readonly crownOffset: number;
  readonly slumps: number;
  readonly slumpDepth: number;
  readonly lineDepth: number;
  readonly lumpDepth: number;
  readonly fineDepth: number;
  readonly climb: number;
  readonly filmHeight: number;
  readonly crumbs: number;
  readonly crumbSmallest: number;
  readonly crumbLargest: number;
  readonly clumps: number;
  readonly clumpSmallest: number;
  readonly clumpLargest: number;
}

export const POWDER_FORMS: Readonly<Record<PowderGrain, PowderForm>> = {
  fine: { level: 0.34, heap: 0.72, crownOffset: 0.16, slumps: 5, slumpDepth: 0.0034, lineDepth: 0.0012, lumpDepth: 0.0026, fineDepth: 0.00035, climb: 0.0045, filmHeight: 0.2, crumbs: 140, crumbSmallest: 0.3, crumbLargest: 0.9, clumps: 9, clumpSmallest: 0.5, clumpLargest: 1.25 },
  dust: { level: 0.3, heap: 0.56, crownOffset: 0.22, slumps: 4, slumpDepth: 0.0028, lineDepth: 0.001, lumpDepth: 0.0024, fineDepth: 0.0003, climb: 0.006, filmHeight: 0.3, crumbs: 120, crumbSmallest: 0.3, crumbLargest: 0.8, clumps: 6, clumpSmallest: 0.5, clumpLargest: 1.1 },
  coarse: { level: 0.32, heap: 0.8, crownOffset: 0.2, slumps: 6, slumpDepth: 0.0042, lineDepth: 0.0018, lumpDepth: 0.0042, fineDepth: 0.0007, climb: 0.004, filmHeight: 0.16, crumbs: 1100, crumbSmallest: 0.28, crumbLargest: 1.05, clumps: 4, clumpSmallest: 0.9, clumpLargest: 1.7 },
  granular: { level: 0.32, heap: 0.66, crownOffset: 0.14, slumps: 4, slumpDepth: 0.003, lineDepth: 0.001, lumpDepth: 0.0028, fineDepth: 0.0005, climb: 0.003, filmHeight: 0.1, crumbs: 900, crumbSmallest: 0.38, crumbLargest: 0.8, clumps: 0, clumpSmallest: 1, clumpLargest: 1 },
  fibrous: { level: 0.34, heap: 0.62, crownOffset: 0.2, slumps: 4, slumpDepth: 0.004, lineDepth: 0.0016, lumpDepth: 0.0048, fineDepth: 0.0006, climb: 0.0035, filmHeight: 0.14, crumbs: 220, crumbSmallest: 0.5, crumbLargest: 1.1, clumps: 0, clumpSmallest: 1, clumpLargest: 1 },
  crystalline: { level: 0.34, heap: 0.68, crownOffset: 0.15, slumps: 5, slumpDepth: 0.003, lineDepth: 0.0011, lumpDepth: 0.0024, fineDepth: 0.0004, climb: 0.004, filmHeight: 0.18, crumbs: 520, crumbSmallest: 0.32, crumbLargest: 0.85, clumps: 8, clumpSmallest: 0.7, clumpLargest: 1.3 },
};

export function isLumpCrystal(look: SubstanceWords): boolean {
  return look.fill === "crystals" && look.transparency !== "opaque";
}

export function powderGrainOf(look: SubstanceWords): PowderGrain {
  if (/sawdust|shaving/.test(look.key) || /shavings|chips/.test(look.surface)) return "fibrous";
  if (/myrobalan|harde|harda/.test(look.key) || /pounded|coarse/.test(look.surface)) return "coarse";
  if (/granul/.test(look.surface)) return "granular";
  if (/crystal/.test(look.surface) && !isLumpCrystal(look)) return "crystalline";
  if (/\bdust\b/.test(look.surface)) return "dust";
  return "fine";
}

export function hasCakePieces(look: SubstanceWords): boolean {
  return /\bcakes?\b|\bblocks?\b|rubbed/.test(look.surface);
}

export type PasteThickness = "stiff" | "thick" | "thin";

export function pasteThicknessOf(look: SubstanceWords): PasteThickness {
  if (/\bthick\b/.test(look.surface)) return "thick";
  if (/sticky|mud/.test(look.surface)) return "stiff";
  return "thin";
}

export interface PasteForm {
  readonly level: number;
  readonly dome: number;
  readonly meniscus: number;
  readonly creep: number;
  readonly strokes: number;
  readonly tracks: number;
  readonly furrowDepth: number;
  readonly furrowWidth: number;
  readonly folds: number;
  readonly swell: number;
  readonly smearHeight: number;
}

export const PASTE_FORMS: Readonly<Record<PasteThickness, PasteForm>> = {
  stiff: { level: 0.5, dome: 0.1, meniscus: 0.05, creep: 18, strokes: 5, tracks: 1, furrowDepth: 0.05, furrowWidth: 0.1, folds: 4, swell: 0.03, smearHeight: 0.14 },
  thick: { level: 0.5, dome: 0.08, meniscus: 0.06, creep: 16, strokes: 4, tracks: 2, furrowDepth: 0.032, furrowWidth: 0.06, folds: 0, swell: 0.016, smearHeight: 0.2 },
  thin: { level: 0.46, dome: 0.035, meniscus: 0.07, creep: 12, strokes: 3, tracks: 1, furrowDepth: 0.016, furrowWidth: 0.08, folds: 0, swell: 0.008, smearHeight: 0.3 },
};
