import { PRODUCT_SENTENCE, PRODUCT_TITLE, FOLLOWED_CLOTH_LABEL, type ProductImage, type StageTemplate } from "@/features/process/domain/stage-template";
import { settleCloth } from "./cloth-surface";
import type { Vec3 } from "./geometry";
import { buildYardPlan, CLOTH_LINE_X, CLOTH_WIDTH, EYE_HEIGHT, foldAmount, heightFieldFor, RAIL_HEIGHT, YARD_FRONT_Z, YARD_HALF_WIDTH, type PaintedWords, type YardPlan, type YardStage } from "./yard-plan";

export interface PlacedTextile {
  readonly product: ProductImage;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly label: PaintedWords;
}

export interface RouteStation {
  readonly id: string;
  readonly stageNumber: number | null;
  readonly stopKey: string;
  readonly stopNumber: number;
  readonly name: string;
  readonly plan: YardPlan;
  readonly clothBefore: string;
  readonly clothAfter: string;
  readonly wetAfter: boolean;
  readonly textiles: readonly PlacedTextile[];
}

export const RAW_COTTON = "raw-cotton";
export const PRODUCTS_STOP = "products";

export function stagesFromTemplate(template: StageTemplate): YardStage[] {
  return template.stages.map((stage, index) => {
    const following = template.stages[index + 1];
    return {
      stageKey: stage.key,
      number: stage.number,
      name: stage.name,
      localName: stage.localName,
      caption: stage.caption.text,
      kind: stage.kind,
      items: stage.items,
      next: following ? { number: following.number, name: following.name } : { number: "", name: PRODUCT_TITLE },
      index,
    };
  });
}

const TEXTILE_HEIGHT = 3.5;
const TEXTILE_MIN_WIDTH = 2.1;
const TEXTILE_MAX_WIDTH = 3.3;
const TEXTILE_SPACING = 1.1;
const ROW_DEPTH = 9;
const FIRST_ROW_Z = 1;
const FIRST_COLUMN_X = CLOTH_LINE_X + 3.2;

export function layoutTextiles(products: readonly ProductImage[]): PlacedTextile[] {
  const rightLimit = CLOTH_LINE_X + YARD_HALF_WIDTH - 1.5;
  const placed: PlacedTextile[] = [];
  let x = FIRST_COLUMN_X;
  let z = FIRST_ROW_Z;
  for (const product of products) {
    const width = Math.min(TEXTILE_MAX_WIDTH, Math.max(TEXTILE_MIN_WIDTH, TEXTILE_HEIGHT * (product.widthPx / product.heightPx)));
    if (x + width > rightLimit) {
      x = FIRST_COLUMN_X + 1.6;
      z -= ROW_DEPTH;
    }
    placed.push({
      product,
      x: x + width / 2,
      z,
      width,
      height: TEXTILE_HEIGHT,
      label: {
        lines: [`${product.name} · ${product.holder}`],
        at: [x + width / 2, 0.56, z + 0.0965],
        facing: 0,
        height: 0.105,
        align: "center",
        colour: "lime",
        weight: 700,
        family: "Eczar",
        pixelsPerMetre: 1500,
        wear: 0.6,
        lineHeight: 1.14,
      },
    });
    x += width + TEXTILE_SPACING;
  }
  return placed;
}

export function buildHallPlan(followedClothRailZ: number): YardPlan {
  const base = buildYardPlan({ number: "", name: PRODUCT_TITLE, localName: null, caption: PRODUCT_SENTENCE, kind: "dry", items: [], next: null, index: 0 });
  const rails = [followedClothRailZ];
  const field = heightFieldFor({ type: "open" }, rails);
  const points: Vec3[] = [
    [CLOTH_LINE_X, 0.012, YARD_FRONT_Z],
    [CLOTH_LINE_X, 0.012, 12],
    [CLOTH_LINE_X, 0.012, followedClothRailZ + 2.2],
    [CLOTH_LINE_X, 0.03, followedClothRailZ + 1.6],
    [CLOTH_LINE_X, 1.2, followedClothRailZ + 0.95],
    [CLOTH_LINE_X, 3.4, followedClothRailZ + 0.33],
    [CLOTH_LINE_X, RAIL_HEIGHT - 0.2, followedClothRailZ + 0.17],
    [CLOTH_LINE_X, RAIL_HEIGHT + 0.07, followedClothRailZ],
    [CLOTH_LINE_X, RAIL_HEIGHT - 0.2, followedClothRailZ - 0.15],
    [CLOTH_LINE_X, 2.4, followedClothRailZ - 0.25],
    [CLOTH_LINE_X, 0.55, followedClothRailZ - 0.3],
  ];
  const surface = settleCloth({ points, width: CLOTH_WIDTH, metresPerRepeat: 3.46, fold: 0.03, foldFrequency: 2.6, step: 0.05, columns: 44, foldAmount, field });
  const label: PaintedWords = { lines: [FOLLOWED_CLOTH_LABEL], at: [CLOTH_LINE_X - 1.2465, 1.3, followedClothRailZ + 0.05], facing: -Math.PI / 2, height: 0.1, align: "center", colour: "lime", weight: 700, family: "Eczar", pixelsPerMetre: 1500, wear: 0.6, lineHeight: 1.14 };
  const words = base.words.filter((word) => word.lines[0] !== "Cloth After This Stage" && word.lines[0] !== "");
  const pins: (readonly [number, number])[] = [];
  for (let z = followedClothRailZ + 3; z < YARD_FRONT_Z - 0.6; z += 2.2) {
    pins.push([CLOTH_LINE_X - CLOTH_WIDTH / 2 + 0.02, z], [CLOTH_LINE_X + CLOTH_WIDTH / 2 - 0.02, z + 0.3]);
  }
  return {
    ...base,
    rails,
    words: [...words, label],
    cloth: [{ name: "cloth-followed", state: "after", surface }],
    pins,
    tie: { x: CLOTH_LINE_X - 1.22, z0: followedClothRailZ - 0.15, z1: followedClothRailZ + 2, y: 1.3 },
    standpoint: { from: [CLOTH_LINE_X - 5.4, EYE_HEIGHT, 10.5], to: [CLOTH_LINE_X + 3.4, 1.85, -1.5] },
    heightField: field,
  };
}

export function buildRoute(template: StageTemplate, stateFile: (stateId: string) => string): RouteStation[] {
  const clothFile = (stateId: string) => (stateId === template.rawClothStateId ? RAW_COTTON : stateFile(stateId));
  const yardStages = stagesFromTemplate(template);
  const stations: RouteStation[] = yardStages.map((yardStage, index) => {
    const stage = template.stages[index]!;
    const previous = index === 0 ? template.rawClothStateId : template.stages[index - 1]!.clothStateId;
    return {
      id: `${template.tradition}-${stage.number}`,
      stageNumber: stage.number,
      stopKey: stage.key,
      stopNumber: stage.number,
      name: stage.name,
      plan: buildYardPlan(yardStage),
      clothBefore: clothFile(previous),
      clothAfter: clothFile(stage.clothStateId),
      wetAfter: stage.kind === "vat" || stage.kind === "boil" || stage.kind === "wash" || stage.kind === "soak",
      textiles: [],
    };
  });
  const textiles = layoutTextiles(template.products);
  const lastState = template.stages[template.stages.length - 1]!.clothStateId;
  stations.push({
    id: `${template.tradition}-hall`,
    stageNumber: null,
    stopKey: PRODUCTS_STOP,
    stopNumber: template.stages.length + 1,
    name: PRODUCT_TITLE,
    plan: buildHallPlan(3.75),
    clothBefore: clothFile(lastState),
    clothAfter: clothFile(lastState),
    wetAfter: false,
    textiles,
  });
  return stations;
}

export function practiceStation(): RouteStation {
  const plan = buildYardPlan({
    number: "P",
    name: "Practice",
    localName: null,
    caption: "Walk to the cloth, look around it, then go on through the gap. Nothing here is part of the test.",
    kind: "dry",
    items: [{ key: "practice-object", role: "tool", label: "Practice Object", localName: null, modelId: "crate" }],
    next: null,
    index: 0,
  });
  return { id: "practice", stageNumber: null, stopKey: "practice", stopNumber: 1, name: "Practice", plan, clothBefore: RAW_COTTON, clothAfter: RAW_COTTON, wetAfter: false, textiles: [] };
}
