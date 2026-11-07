export type TraditionKey = "ajrakh" | "sanganeri" | "machilipatnam-kalamkari";

export type StationKind = "table" | "vat" | "boil" | "wash" | "soak" | "dry" | "carve" | "finish";

export type ItemRole = "tool" | "material";

export interface SourceRef {
  readonly sourceId: string;
  readonly title: string;
  readonly locator: string;
  readonly quote: string;
}

export interface StageItem {
  readonly key: string;
  readonly role: ItemRole;
  readonly label: string;
  readonly localName: string | null;
  readonly modelId: string;
}

export interface StageCaption {
  readonly text: string;
  readonly sources: readonly SourceRef[];
  readonly underReview?: boolean;
}

export interface TemplateStage {
  readonly number: number;
  readonly key: string;
  readonly sourceStageKeys: readonly string[];
  readonly name: string;
  readonly localName: string | null;
  readonly kind: StationKind;
  readonly caption: StageCaption;
  readonly items: readonly StageItem[];
  readonly clothStateId: string;
}

export interface ProductImage {
  readonly id: string;
  readonly file: string;
  readonly name: string;
  readonly holder: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface StageTemplate {
  readonly tradition: TraditionKey;
  readonly traditionName: string;
  readonly rawClothStateId: string;
  readonly stages: readonly TemplateStage[];
  readonly products: readonly ProductImage[];
}

export const CLOTH_AFTER_LABEL = "Cloth After This Stage";
export const FOLLOWED_CLOTH_LABEL = "The Cloth You Followed";
export const PRODUCT_TITLE = "Finished Textiles";
export const PRODUCT_SENTENCE = "The cloth you followed from Stage 1, and others from the same tradition.";

export function withCaptionReview(templates: readonly StageTemplate[], verifiedStageConcepts: ReadonlySet<string>): StageTemplate[] {
  return templates.map((template) => ({
    ...template,
    stages: template.stages.map((stage) => ({
      ...stage,
      caption: { ...stage.caption, underReview: stage.sourceStageKeys.length === 0 || stage.sourceStageKeys.some((key) => !verifiedStageConcepts.has(key)) },
    })),
  }));
}

export function anyCaptionUnderReview(templates: readonly StageTemplate[]): boolean {
  return templates.some((template) => template.stages.some((stage) => stage.caption.underReview === true));
}

export function itemsByRole(stage: TemplateStage, role: ItemRole): readonly StageItem[] {
  return stage.items.filter((item) => item.role === role);
}

export function nextStage(template: StageTemplate, number: number): TemplateStage | null {
  return template.stages.find((stage) => stage.number === number + 1) ?? null;
}
