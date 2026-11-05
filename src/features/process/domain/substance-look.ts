import { stillPath } from "./asset-catalogue";
import type { StageItem } from "./stage-template";
import { SUBSTANCE_LOOK_ROWS } from "./substance-look-rows";

export type SubstanceFill = "liquid" | "paste" | "powder" | "crystals" | "roots" | "flowers" | "cloth" | "dung" | "leaves" | "fruit";
export type Transparency = "clear" | "translucent" | "opaque";
export type RenderBasis = "evidence" | "photo" | "inferred" | "provisional";
export type LookStatus = "sourced" | "inferred" | "partial" | "needs-lead";

export interface SubstanceLookRow {
  readonly key: string;
  readonly stages: readonly string[];
  readonly label: string;
  readonly partOfTemplateLabel: string | null;
  readonly form: string;
  readonly renderHex: string;
  readonly renderBasis: string;
  readonly status: string;
  readonly transparency: string;
  readonly surface: string;
  readonly vesselSuggestion: string | null;
}

export interface SubstanceLook {
  readonly key: string;
  readonly label: string;
  readonly fill: SubstanceFill;
  readonly renderHex: string;
  readonly transparency: Transparency;
  readonly surface: string;
  readonly renderBasis: RenderBasis;
  readonly status: LookStatus;
  readonly vesselModelId: string;
}

const LEAF_SURFACE = "dry leaf";
const TRAY_MODEL = "printing-tray";
const WORK_LIQUID_MODELS: ReadonlySet<string> = new Set(["dye-vat", "wash-tank", "boiling-vessel"]);

const VESSEL_BY_FILL: Readonly<Record<SubstanceFill, string>> = {
  liquid: "liquid-pot",
  paste: "paste-bowl",
  powder: "powder-bowl",
  crystals: "crystal-bowl",
  roots: "lump-basket",
  flowers: "lump-basket",
  dung: "lump-basket",
  leaves: "lump-basket",
  fruit: "lump-basket",
  cloth: "cloth-bale",
};

function fillOf(row: SubstanceLookRow): SubstanceFill {
  if (row.form === "other") return row.surface === LEAF_SURFACE ? "leaves" : "dung";
  return row.form as SubstanceFill;
}

function lookOf(row: SubstanceLookRow): SubstanceLook {
  const fill = fillOf(row);
  return {
    key: row.key,
    label: row.label,
    fill,
    renderHex: row.renderHex,
    transparency: row.transparency as Transparency,
    surface: row.surface,
    renderBasis: row.renderBasis as RenderBasis,
    status: row.status as LookStatus,
    vesselModelId: VESSEL_BY_FILL[fill],
  };
}

const rowsOfStage = (stageKey: string): readonly SubstanceLookRow[] => SUBSTANCE_LOOK_ROWS.filter((row) => row.stages.includes(stageKey));

const namesItem = (row: SubstanceLookRow, label: string): boolean => row.label === label || row.partOfTemplateLabel === label;

export function looksOfItem(stageKey: string, item: Pick<StageItem, "label" | "role">): readonly SubstanceLook[] {
  if (item.role !== "material") return [];
  return rowsOfStage(stageKey)
    .filter((row) => namesItem(row, item.label))
    .map(lookOf);
}

export function workLiquidOf(stageKey: string, items: readonly Pick<StageItem, "label" | "role">[]): SubstanceLook | null {
  const liquids = rowsOfStage(stageKey).filter((row) => row.form === "liquid");
  const materialLabels = items.filter((item) => item.role === "material").map((item) => item.label);
  const row = liquids.find((candidate) => !materialLabels.some((label) => namesItem(candidate, label))) ?? liquids[0];
  return row ? lookOf(row) : null;
}

export function trayPadLookOf(stageKey: string): SubstanceLook | null {
  const row = rowsOfStage(stageKey).find((candidate) => candidate.vesselSuggestion === "colour tray");
  if (row) return lookOf(row);
  const paste = rowsOfStage(stageKey).find((candidate) => candidate.form === "paste");
  return paste ? lookOf(paste) : null;
}

const toolStillPath = (modelId: string, liquidHex: string): string => stillPath(`${modelId}-${liquidHex.replace("#", "").toLowerCase()}`);

export function stageItemStillPath(stageKey: string, items: readonly StageItem[], item: StageItem): string {
  if (item.role === "material") {
    const looks = looksOfItem(stageKey, item);
    return stillPath(looks.length > 0 ? looks.map((look) => look.key).join("+") : item.modelId);
  }
  if (item.modelId === TRAY_MODEL) {
    const pad = trayPadLookOf(stageKey);
    return pad ? toolStillPath(item.modelId, pad.renderHex) : stillPath(item.modelId);
  }
  if (WORK_LIQUID_MODELS.has(item.modelId)) {
    const liquid = workLiquidOf(stageKey, items);
    return liquid ? toolStillPath(item.modelId, liquid.renderHex) : stillPath(item.modelId);
  }
  return stillPath(item.modelId);
}

const LATHER_SHARE = 0.5;
const SOAP_SHARE = 0.2;
const BUBBLES_WITH_SCUM_SHARE = 0.16;
const SCUM_SHARE = 0.34;

export function liquidMarks(look: Pick<SubstanceLook, "surface">): { readonly scum: number; readonly foam: number } {
  const scum = /scum/.test(look.surface) ? SCUM_SHARE : 0;
  const foam = /lather/.test(look.surface) ? LATHER_SHARE : /soapy/.test(look.surface) ? SOAP_SHARE : /bubbles/.test(look.surface) ? BUBBLES_WITH_SCUM_SHARE : 0;
  return { scum, foam };
}

export function itemColourIsUnsettled(stageKey: string, item: Pick<StageItem, "label" | "role">): boolean {
  return looksOfItem(stageKey, item).some((look) => look.renderBasis !== "evidence");
}

export function itemVesselModel(stageKey: string, item: Pick<StageItem, "label" | "role">): string | null {
  return looksOfItem(stageKey, item)[0]?.vesselModelId ?? null;
}
