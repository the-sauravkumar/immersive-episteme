export type ModelForm = "scan" | "turned" | "integral";

export interface CatalogueModel {
  readonly id: string;
  readonly form: ModelForm;
  readonly scan: string | null;
  readonly heightMetres: number;
  readonly standIn: true;
}

const scan = (id: string, file: string, heightMetres: number): CatalogueModel => ({
  id,
  form: "scan",
  scan: file,
  heightMetres,
  standIn: true,
});

const integral = (id: string): CatalogueModel => ({ id, form: "integral", scan: null, heightMetres: 0, standIn: true });

export const ASSET_CATALOGUE: readonly CatalogueModel[] = [
  integral("printing-table"),
  integral("dye-vat"),
  integral("wash-tank"),
  integral("boiling-vessel"),
  integral("carved-block"),
  integral("printing-tray"),
  integral("washing-paddle"),
  integral("carving-chisels"),
  integral("brush-and-kalam"),
  scan("bowl-wood", "wooden_bowl_01", 0.094),
  scan("bowl-clay", "planter_pot_clay", 0.222),
  scan("pot-ceramic", "ceramic_pot", 0.372),
  scan("pot-brass", "brass_pot_01", 0.291),
  scan("pan-brass", "brass_pan_01", 0.0525),
  scan("jug-metal", "metal_jug", 0.288),
  scan("bucket", "wooden_bucket_01", 0.55),
  scan("tub", "wooden_bucket_02", 0.35),
  scan("basket", "wicker_basket_01", 0.117),
  scan("crate", "wooden_crate_01", 0.35),
  scan("board", "wooden_cutting_board", 0.041),
  scan("powder-bowl", "wooden_bowl_01", 0.094),
  scan("paste-bowl", "wooden_bowl_01", 0.094),
  scan("crystal-bowl", "wooden_bowl_01", 0.094),
  scan("liquid-pot", "planter_pot_clay", 0.222),
  scan("lump-basket", "wicker_basket_01", 0.117),
  scan("cloth-bale", "wooden_crate_01", 0.35),
];

export function catalogueModel(id: string): CatalogueModel {
  const model = ASSET_CATALOGUE.find((entry) => entry.id === id);
  if (!model) throw new Error(`Unknown model id: ${id}`);
  return model;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function nameThatSaysNothing(subjectId: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < subjectId.length; i++) hash = Math.imul(hash ^ subjectId.charCodeAt(i), FNV_PRIME) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

export const stillPath = (subjectId: string): string => `/walkthrough/stills/objects/${nameThatSaysNothing(subjectId)}.jpg`;
export const clothStatePath = (stateId: string): string => `/walkthrough/cloth/${stateId}.jpg`;
export const clothStripPath = (stateId: string): string => `/walkthrough/cloth/${stateId}-strip.jpg`;
