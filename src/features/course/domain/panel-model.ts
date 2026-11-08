import { CLOTH_AFTER_LABEL, type ItemRole, type SourceRef, type StageTemplate, type TemplateStage } from "@/features/process/domain/stage-template";
import { clothStatePath, clothStripPath, stillPath } from "@/features/process/domain/asset-catalogue";
import { PRACTICE_OBJECT_LABEL } from "@/features/process/domain/guidance";
import { itemColourIsUnsettled, stageItemStillPath } from "@/features/process/domain/substance-look";

export interface PanelObject {
  readonly key: string;
  readonly role: ItemRole;
  readonly label: string;
  readonly localName: string | null;
  readonly modelId: string;
  readonly stillSrc: string;
  readonly colourUnsettled: boolean;
}

export interface StagePanelModel {
  readonly key: string;
  readonly kicker: string;
  readonly numeral: string;
  readonly name: string;
  readonly localName: string | null;
  readonly caption: string;
  readonly captionUnderReview: boolean;
  readonly sources: readonly SourceRef[];
  readonly objects: readonly PanelObject[];
  readonly clothStateId: string;
  readonly clothBeforeSrc: string;
  readonly clothAfterSrc: string;
  readonly clothLabel: string;
}

export interface BarSegment {
  readonly number: string;
  readonly stripSrc: string;
  readonly label: string;
}

const stageSegment = (stage: TemplateStage): BarSegment => ({
  number: String(stage.number),
  stripSrc: clothStripPath(stage.clothStateId),
  label: stage.name,
});

export function barSegments(template: StageTemplate): readonly BarSegment[] {
  return template.stages.map(stageSegment);
}

export function stagePanelModel(template: StageTemplate, stageIndex: number): StagePanelModel {
  const stage = template.stages[stageIndex];
  if (!stage) throw new Error(`No stage ${stageIndex} in ${template.tradition}`);
  const previous = template.stages[stageIndex - 1];
  return {
    key: stage.key,
    kicker: `${template.traditionName}, Stage ${stage.number} Of ${template.stages.length}`,
    numeral: String(stage.number),
    name: stage.name,
    localName: stage.localName,
    caption: stage.caption.text,
    captionUnderReview: stage.caption.underReview === true,
    sources: stage.caption.sources,
    objects: stage.items.map((item) => ({
      key: item.key,
      role: item.role,
      label: item.label,
      localName: item.localName,
      modelId: item.modelId,
      stillSrc: stageItemStillPath(stage.key, stage.items, item),
      colourUnsettled: itemColourIsUnsettled(stage.key, item),
    })),
    clothStateId: stage.clothStateId,
    clothBeforeSrc: clothStatePath(previous ? previous.clothStateId : template.rawClothStateId),
    clothAfterSrc: clothStatePath(stage.clothStateId),
    clothLabel: CLOTH_AFTER_LABEL,
  };
}

const PRACTICE_CLOTH_STATE = "ajrakh-raw";
export const PRACTICE_MODEL = "crate";
const PRACTICE_NAMES = ["First Practice Step", "Second Practice Step", "Third Practice Step"] as const;
const PRACTICE_CAPTIONS = [
  "This panel is practice, and it teaches no craft. Press Next to move on.",
  "Press Back to return, or use a woven part of the strip below to go to a step you have reached.",
  "That is all the course asks of you. Press the forward button to begin.",
] as const;

export const PRACTICE_STEP_COUNT = PRACTICE_NAMES.length;

export function practicePanelModel(stepIndex: number): StagePanelModel {
  const name = PRACTICE_NAMES[stepIndex];
  const caption = PRACTICE_CAPTIONS[stepIndex];
  if (!name || !caption) throw new Error(`No practice step ${stepIndex}`);
  return {
    key: `practice-${stepIndex + 1}`,
    kicker: `Practice, Step ${stepIndex + 1} Of ${PRACTICE_STEP_COUNT}`,
    numeral: "P",
    name,
    localName: null,
    caption,
    captionUnderReview: false,
    sources: [],
    objects: [{ key: "practice-object", role: "tool", label: PRACTICE_OBJECT_LABEL, localName: null, modelId: PRACTICE_MODEL, stillSrc: stillPath(PRACTICE_MODEL), colourUnsettled: false }],
    clothStateId: PRACTICE_CLOTH_STATE,
    clothBeforeSrc: clothStatePath(PRACTICE_CLOTH_STATE),
    clothAfterSrc: clothStatePath(PRACTICE_CLOTH_STATE),
    clothLabel: CLOTH_AFTER_LABEL,
  };
}

export function practiceSegments(): readonly BarSegment[] {
  return PRACTICE_NAMES.map((label, index) => ({ number: String(index + 1), stripSrc: clothStripPath(PRACTICE_CLOTH_STATE), label }));
}

export type TextSize = "large" | "medium" | "small";

export function nameSize(name: string): TextSize {
  const longestWord = Math.max(...name.split(/[\s]+/).map((word) => word.length));
  if (name.length > 30 || longestWord > 13) return "small";
  if (name.length > 16 || longestWord > 10) return "medium";
  return "large";
}

export function captionSize(caption: string): TextSize {
  if (caption.length > 230) return "small";
  if (caption.length > 170) return "medium";
  return "large";
}

export interface ProductRail {
  readonly start: number;
  readonly end: number;
}

export function productRails(count: number): readonly ProductRail[] {
  if (count <= 3) return [{ start: 0, end: count }];
  const firstRail = Math.ceil(count / 2);
  return [
    { start: 0, end: firstRail },
    { start: firstRail, end: count },
  ];
}

export function objectColumns(count: number): number {
  return count > 3 ? 2 : 1;
}
