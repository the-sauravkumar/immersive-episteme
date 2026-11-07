import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { conceptPhotosOf, createKnowledgeView, type IllustrationLink } from "@/features/knowledge/read/view";
import { creditHolder, exhibitCreditLines, exhibitImages, withStudyPhotos, type StageTemplate, type StudyPhotoSource } from "@/features/process/domain/stage-template";
import { buildRoute, layoutTextiles } from "@/features/walkthrough/domain/route-plan";
import { CLOTH_LINE_X, YARD_HALF_WIDTH } from "@/features/walkthrough/domain/yard-plan";
import { clothStatePath } from "@/features/process/domain/asset-catalogue";
import { buildDoorViews } from "@/server/research/parity/door-views";
import { runParityChecks, type ParityInput } from "@/server/research/parity/engine";

import { demoBundle, passingInput } from "../research/fixtures";

const dir = join(process.cwd(), "content", "study");
const templates = readdirSync(dir)
  .filter((name) => name.endsWith(".template.json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as StageTemplate);

const SIZES: Record<string, Record<string, [number, number]>> = {
  ajrakh: { historical_context: [2013, 2500], tool: [2448, 3264] },
  "machilipatnam-kalamkari": { historical_context: [2175, 1688], tool: [3456, 2304] },
  sanganeri: { historical_context: [2500, 1910], tool: [4033, 2778] },
};
const CREDITS: Record<string, string> = {
  historical_context: "© Victoria and Albert Museum, London",
  tool: "Courtesy J. Niranjan, Srikalahasti / Sahapedia, CC BY-NC-SA 4.0",
};

let next = 0;
function source(tradition: string, conceptType: string, over: Partial<StudyPhotoSource> = {}): StudyPhotoSource {
  next += 1;
  const assetId = `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`;
  const [width, height] = SIZES[tradition]![conceptType]!;
  return {
    tradition,
    conceptKey: `${tradition}.${conceptType}.photo`,
    conceptType,
    assetId,
    record: `https://example.org/${assetId}`,
    src: `/figures/${assetId}`,
    width,
    height,
    alt: "A long cotton cloth printed with rows of small red and black figures on white",
    caption: `A caption for ${tradition}`,
    credit: CREDITS[conceptType]!,
    licence: "Licence",
    sha256: String(next).padStart(64, "0"),
    ...over,
  };
}

vi.setConfig({ testTimeout: 30000 });

const sixPhotos = () => templates.flatMap((template) => [source(template.tradition, "tool"), source(template.tradition, "historical_context")]);

describe("study photographs in both doors (DR-118)", () => {
  it("gives every tradition its textile and its printing blocks, named the same way, with a short holder", () => {
    const shown = withStudyPhotos(templates, sixPhotos());
    for (const template of shown) {
      expect(template.photos?.map((photo) => photo.name)).toEqual([`${template.traditionName} Textile`, `${template.traditionName} Printing Blocks`]);
      expect(template.photos?.map((photo) => photo.holder)).toEqual(["Victoria and Albert Museum", "Sahapedia"]);
      expect(exhibitImages(template).slice(-2).map((image) => image.file)).toEqual(template.photos?.map((photo) => photo.file));
    }
    expect(creditHolder("Rick Bradley, \"printing blocks, ajrakpur, kaach\", Flickr, CC BY 2.0")).toBe("Rick Bradley");
    expect(creditHolder("Eric Parker, Flickr, CC BY-NC 2.0")).toBe("Eric Parker");
  });

  it("shows a study photograph in place of a finished textile of the same record, never both", () => {
    const ajrakh = templates.find((template) => template.tradition === "ajrakh")!;
    const product = ajrakh.products[3]!;
    const [shown] = withStudyPhotos([ajrakh], [source("ajrakh", "historical_context", { record: product.record.replace(/\/$/, "") }), source("ajrakh", "tool")]);
    const images = exhibitImages(shown!);
    expect(images).toHaveLength(ajrakh.products.length + 1);
    expect(images[3]!.file).toBe(shown!.photos![0]!.file);
    expect(images.map((image) => image.file)).not.toContain(product.file);
    expect(images.at(-1)!.file).toBe(shown!.photos![1]!.file);
  });

  it("prints the caption and the full credit line in the sources of both doors", () => {
    const [template] = withStudyPhotos(templates, sixPhotos());
    const photo = template!.photos![0]!;
    expect(exhibitCreditLines(photo)).toEqual(["Victoria and Albert Museum", photo.caption, "Photo: © Victoria and Albert Museum, London. Licence: Licence."]);
  });

  it("drops a kind that one tradition lacks from every tradition, so no tradition shows more", () => {
    const photos = sixPhotos().filter((photo) => !(photo.tradition === "sanganeri" && photo.conceptType === "tool"));
    const shown = withStudyPhotos(templates, photos);
    for (const template of shown) expect(template.photos?.map((photo) => photo.name)).toEqual([`${template.traditionName} Textile`]);
    expect(withStudyPhotos(templates, []).every((template) => template.photos?.length === 0)).toBe(true);
  });

  it("puts the same photograph files in both doors and passes the parity checks", () => {
    const shown = withStudyPhotos(templates, sixPhotos());
    const doors = buildDoorViews(shown);
    const photoFiles = shown.flatMap((template) => template.photos!.map((photo) => photo.file));
    for (const door of doors) expect(door.traditions.flatMap((tradition) => tradition.products.map((product) => product.file))).toEqual(expect.arrayContaining(photoFiles));
    const base = passingInput();
    const files = doors.flatMap((door) => door.traditions.flatMap((tradition) => [...tradition.stages.map((stage) => stage.clothFile), ...tradition.products.map((product) => product.file)]));
    const input: ParityInput = {
      ...base,
      study: { ...base.study, config: { ...(base.study.config as object), traditionSlugs: shown.map((template) => template.tradition) } },
      templates: shown,
      doors,
      fileHashes: Object.fromEntries(files.map((file) => [file, `hash-${file}`])),
    };
    expect(runParityChecks(input).checks.filter((check) => !check.passed).flatMap((check) => check.issues.map((issue) => issue.code))).toEqual([]);
  });

  it("hangs every photograph inside the hall in Door 2, in no more rows than the products already use", () => {
    const rightLimit = CLOTH_LINE_X + YARD_HALF_WIDTH - 1.5;
    for (const template of withStudyPhotos(templates, sixPhotos())) {
      const placed = layoutTextiles(exhibitImages(template));
      expect(placed).toHaveLength(exhibitImages(template).length);
      for (const textile of placed) expect(textile.x + textile.width / 2).toBeLessThanOrEqual(rightLimit);
      const rows = new Set(placed.map((textile) => textile.z));
      expect(rows.size).toBeLessThanOrEqual(Math.max(2, new Set(layoutTextiles(template.products).map((textile) => textile.z)).size));
      const hall = buildRoute(template, clothStatePath).at(-1)!;
      expect(hall.textiles.map((textile) => textile.product.file)).toEqual(exhibitImages(template).map((image) => image.file));
    }
  });
});

describe("the read model's study photographs", () => {
  const bundle = demoBundle();
  const view = createKnowledgeView(bundle);
  const concept = bundle.concepts.find((candidate) => candidate.key === "demo-alpha.tool.block")!;
  const link = (over: Partial<IllustrationLink> = {}): IllustrationLink => ({
    assetId: "00000000-0000-4000-8000-000000000101",
    conceptId: concept.id,
    role: "illustration",
    position: 0,
    src: "/figures/00000000-0000-4000-8000-000000000101",
    width: 3456,
    height: 2304,
    altText: "A carved wooden printing block resting on a folded length of printed cotton cloth",
    caption: "A block",
    credit: "A Museum",
    licence: "Licence",
    licenceUrl: null,
    sha256: "b".repeat(64),
    sourceUrl: "https://example.org/record",
    ...over,
  });

  it("names each photograph's tradition and concept type, at the full size of its file, only once its concept is verified", () => {
    const shown = conceptPhotosOf(view, [link()]);
    expect(shown).toEqual(concept.verificationState === "verified" || concept.verificationState === "published" ? [expect.objectContaining({ tradition: "demo-alpha", conceptType: "tool", width: 3456, height: 2304, sha256: "b".repeat(64) })] : []);
    const reviewing = structuredClone(bundle);
    for (const candidate of reviewing.concepts) candidate.verificationState = "under_review";
    expect(conceptPhotosOf(createKnowledgeView(reviewing), [link()])).toEqual([]);
    const verified = structuredClone(bundle);
    for (const candidate of verified.concepts) candidate.verificationState = "verified";
    expect(conceptPhotosOf(createKnowledgeView(verified), [link()])).toEqual([expect.objectContaining({ tradition: "demo-alpha", conceptKey: "demo-alpha.tool.block", conceptType: "tool", width: 3456 })]);
    expect(conceptPhotosOf(createKnowledgeView(verified), [link({ position: 99 })])).toEqual([]);
  });
});
