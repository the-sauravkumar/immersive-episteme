export type ModelForm = "scan" | "turned" | "integral";

export interface CatalogueModel {
  readonly id: string;
  readonly form: ModelForm;
  readonly scan: string | null;
  readonly heightMetres: number;
  readonly fill: string | null;
  readonly standIn: true;
}

const scan = (id: string, file: string, heightMetres: number, fill: string | null = null): CatalogueModel => ({
  id,
  form: "scan",
  scan: file,
  heightMetres,
  fill,
  standIn: true,
});

const integral = (id: string): CatalogueModel => ({ id, form: "integral", scan: null, heightMetres: 0, fill: null, standIn: true });

export const ASSET_CATALOGUE: readonly CatalogueModel[] = [
  integral("printing-table"),
  integral("dye-vat"),
  integral("wash-tank"),
  integral("boiling-vessel"),
  integral("carved-block"),
  integral("printing-tray"),
  scan("bowl-wood", "wooden_bowl_01", 0.14),
  scan("bowl-clay", "planter_pot_clay", 0.24),
  scan("pot-ceramic", "ceramic_pot", 0.42),
  scan("pot-brass", "brass_pot_01", 0.34),
  scan("pan-brass", "brass_pan_01", 0.07),
  scan("jug-metal", "metal_jug", 0.3),
  scan("bucket", "wooden_bucket_01", 0.38),
  scan("tub", "wooden_bucket_02", 0.42),
  scan("basket", "wicker_basket_01", 0.16),
  scan("crate", "wooden_crate_01", 0.36),
  scan("mallet", "wooden_hammer_01", 0.3),
  scan("board", "wooden_cutting_board", 0.05),
  scan("spoon", "wooden_spoon", 0.04),
  scan("barrel", "Barrel_01", 0.88),
  scan("powder-bowl", "wooden_bowl_01", 0.14, "powder"),
  scan("paste-bowl", "wooden_bowl_01", 0.14, "paste"),
  scan("liquid-pot", "planter_pot_clay", 0.24, "liquid"),
  scan("lump-basket", "wicker_basket_01", 0.16, "lumps"),
  scan("cloth-bale", "wooden_crate_01", 0.36, "cloth"),
];

export function catalogueModel(id: string): CatalogueModel {
  const model = ASSET_CATALOGUE.find((entry) => entry.id === id);
  if (!model) throw new Error(`Unknown model id: ${id}`);
  return model;
}

export const stillPath = (modelId: string): string => `/walkthrough/stills/${modelId}.jpg`;
export const clothStatePath = (stateId: string): string => `/walkthrough/cloth/${stateId}.jpg`;
export const clothStripPath = (stateId: string): string => `/walkthrough/cloth/${stateId}-strip.jpg`;
