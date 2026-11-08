type ModelForm = "scan" | "turned" | "integral";

export type ThrownShape = "clay-bowl" | "clay-pot";

export interface CatalogueModel {
  readonly id: string;
  readonly form: ModelForm;
  readonly scan: string | null;
  readonly thrown: ThrownShape | null;
  readonly heightMetres: number;
  readonly standIn: true;
}

const scan = (id: string, file: string, heightMetres: number): CatalogueModel => ({
  id,
  form: "scan",
  scan: file,
  thrown: null,
  heightMetres,
  standIn: true,
});

const thrown = (id: string, shape: ThrownShape, heightMetres: number): CatalogueModel => ({ id, form: "turned", scan: null, thrown: shape, heightMetres, standIn: true });

const integral = (id: string): CatalogueModel => ({ id, form: "integral", scan: null, thrown: null, heightMetres: 0, standIn: true });

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
  scan("basket", "wicker_basket_01", 0.117),
  scan("crate", "wooden_crate_01", 0.35),
  thrown("powder-bowl", "clay-bowl", 0.105),
  thrown("paste-bowl", "clay-bowl", 0.105),
  thrown("crystal-bowl", "clay-bowl", 0.105),
  thrown("liquid-pot", "clay-pot", 0.199),
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
