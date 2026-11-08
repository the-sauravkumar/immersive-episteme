import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";
import { readContentDirectory } from "@/features/knowledge/graph/load-content-dir";
import { validateContentFiles } from "@/features/knowledge/graph/report";
import { buildSnapshot } from "@/features/knowledge/graph/snapshot";
import { parseSourceManifest } from "@/features/knowledge/graph/source-manifest";
import { EPISTEMIC_SECTIONS } from "@/features/learning/epistemic-sections";
import { STUDY_TRADITION_SLUGS } from "@/features/learning/labels";
import { altTextProblem, captionProblem } from "@/features/media/contracts";
import { figureBalance, type ParityFigureAsset } from "@/server/research/parity/engine";

import { demoBundle } from "./fixtures";

interface FigureInput {
  bundle: KnowledgeBundle;
  structureDiagrams: boolean;
  figureAssets?: ParityFigureAsset[];
}

const passingInput = (): FigureInput => ({ bundle: demoBundle(), structureDiagrams: true });

function balanceOf(i: FigureInput) {
  const fb = figureBalance(i.bundle, ["demo-alpha", "demo-beta"], { structureDiagrams: i.structureDiagrams, figureAssets: i.figureAssets });
  return { passed: fb.issues.length === 0, issues: fb.issues, metrics: fb.metrics };
}

const bundleOf = (i: FigureInput) => i.bundle;
const conceptId = (i: FigureInput, key: string) => {
  const c = bundleOf(i).concepts.find((x) => x.key === key);
  if (!c) throw new Error(`no concept ${key}`);
  return c.id;
};

let n = 0;
function photo(i: FigureInput, key: string, over: Partial<ParityFigureAsset> = {}): ParityFigureAsset {
  n += 1;
  return {
    assetId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    conceptId: conceptId(i, key),
    role: "illustration",
    position: 0,
    verificationState: "verified",
    isDemo: true,
    width: 2000,
    height: 1500,
    credit: "Example Museum",
    caption: "Block used for the first impression",
    altText: "A carved wooden printing block resting on a folded length of printed cotton cloth",
    ...over,
  };
}

describe("figure balance", () => {
  it("passes the matched fixture: its graph-derived diagrams are balanced by construction", () => {
    const c = balanceOf(passingInput());
    expect(c.passed).toBe(true);
    expect(c.metrics.diagrams).toBeGreaterThan(0);
    expect(c.metrics.photos).toBe(0);
  });

  it("fails activation when one tradition has a photograph the others lack, naming the section and counts", () => {
    const input = passingInput();
    input.figureAssets = [photo(input, "demo-alpha.tool.block")];
    const c = balanceOf(input);
    expect(c.passed).toBe(false);
    const issue = c.issues.find((x) => x.code === "figures_unbalanced");
    expect(issue?.ref).toBe("materials-tools");
    expect(issue?.message).toContain('Section "Materials and tools" is unbalanced');
    expect(issue?.message).toMatch(/1, .* 0/);
  });

  it("passes when every tradition has one photograph in the same section", () => {
    const input = passingInput();
    input.figureAssets = [photo(input, "demo-alpha.tool.block"), photo(input, "demo-beta.tool.block")];
    const c = balanceOf(input);
    expect(c.issues).toEqual([]);
    expect(c.metrics.photos).toBe(2);
  });

  it("allows at most one figure per concept", () => {
    const input = passingInput();
    input.figureAssets = [photo(input, "demo-alpha.tool.block"), photo(input, "demo-alpha.tool.block"), photo(input, "demo-beta.tool.block")];
    const c = balanceOf(input);
    expect(c.issues.map((x) => x.code)).toEqual(["figure_per_concept"]);
    expect(c.metrics.photos).toBe(2);
    expect(c.metrics.photosHeldBack).toBe(1);
  });

  it("lets the structure diagram take the slot while the protocol shows diagrams", () => {
    const input = passingInput();
    const base = figureBalance(bundleOf(input), ["demo-alpha", "demo-beta"], { structureDiagrams: true });
    const anchor = base.shown.find((s) => s.kind === "diagram" && s.traditionSlug === "demo-alpha")!;
    input.figureAssets = [{ ...photo(input, "demo-alpha.tool.block"), conceptId: anchor.conceptId }];
    const c = balanceOf(input);
    expect(c.passed).toBe(true);
    expect(c.metrics.photosHeldBack).toBe(1);

    const off = passingInput();
    off.structureDiagrams = false;
    off.figureAssets = input.figureAssets;
    const cOff = balanceOf(off);
    expect(cOff.metrics.diagrams).toBe(0);
    expect(cOff.issues.map((x) => x.code)).toEqual(["figures_unbalanced"]);
  });

  it("refuses photographs that anchor to no claim, and holds no photograph to a licence cap or expiry (DR-118)", () => {
    const input = passingInput();
    input.figureAssets = [
      photo(input, "demo-alpha.tool.block", { width: 700, height: 500 }),
      photo(input, "demo-beta.tool.block", { width: 4033, height: 2778 }),
      photo(input, "demo-beta.material.dye", { position: 4 }),
    ];
    const result = balanceOf(input);
    expect(result.issues.map((x) => x.code)).toEqual(["figure_anchor"]);
    expect(result.metrics.photos).toBe(2);
  });

  it("refuses approved photographs without a credit, caption or alt text, and does not count them", () => {
    const input = passingInput();
    input.figureAssets = [
      photo(input, "demo-alpha.tool.block", { credit: null }),
      photo(input, "demo-beta.tool.block", { caption: "  " }),
      photo(input, "demo-alpha.material.dye", { altText: "" }),
    ];
    const c = balanceOf(input);
    expect(c.passed).toBe(false);
    expect(c.issues.map((x) => x.code)).toEqual(["figure_metadata", "figure_metadata", "figure_metadata"]);
    expect(c.issues[0]!.message).toMatch(/no credit/);
    expect(c.metrics.photos).toBe(0);
  });

  it("ignores unapproved and demo-into-real photographs", () => {
    const input = passingInput();
    input.figureAssets = [photo(input, "demo-alpha.tool.block", { verificationState: "under_review" }), photo(input, "demo-beta.tool.block", { role: "hero" })];
    const c = balanceOf(input);
    expect(c.passed).toBe(true);
    expect(c.metrics.photos).toBe(0);

    const real = { ...bundleOf(input), isDemo: false };
    const fb = figureBalance(real, ["demo-alpha", "demo-beta"], { structureDiagrams: false, figureAssets: [photo(input, "demo-alpha.tool.block", { isDemo: true })] });
    expect(fb.metrics.photos).toBe(0);
  });

  it("returns one row per tradition-page section, in the template order, grouped by layer", () => {
    const fb = figureBalance(bundleOf(passingInput()), ["demo-beta", "demo-alpha"], { structureDiagrams: true });
    expect(fb.traditionSlugs).toEqual(["demo-alpha", "demo-beta"]);
    expect(fb.rows.map((r) => r.sectionId)).toEqual(EPISTEMIC_SECTIONS.map((s) => s.id));
    expect(fb.rows.find((r) => r.sectionId === "science")?.layer).toBe("science");
    expect(fb.rows.find((r) => r.sectionId === "process")?.layer).toBe("process");
    expect(fb.rows.every((r) => r.balanced)).toBe(true);
  });
});

describe("figure balance per knowledge layer (DR-024: a section can span two layers)", () => {
  it("fails when the sections balance but one tradition's figure sits in another layer of the same section", () => {
    const input = passingInput();
    const bundle = structuredClone(bundleOf(input));
    const beta = bundle.concepts.find((c) => c.key === "demo-beta.scientific_mechanism.bond")!;
    beta.type = "environmental_condition";
    const assets = [photo(input, "demo-alpha.scientific_mechanism.bond"), photo(input, "demo-beta.scientific_mechanism.bond")];
    const fb = figureBalance(bundle, ["demo-alpha", "demo-beta"], { structureDiagrams: false, figureAssets: assets });
    expect(fb.rows.find((r) => r.sectionId === "science")).toMatchObject({ balanced: true, counts: { "demo-alpha": 1, "demo-beta": 1 } });
    expect(fb.layers.find((l) => l.layer === "science")).toMatchObject({ balanced: false, counts: { "demo-alpha": 1, "demo-beta": 0 } });
    expect(fb.layers.find((l) => l.layer === "overview")).toMatchObject({ balanced: false, counts: { "demo-alpha": 0, "demo-beta": 1 } });
    expect(fb.issues.map((x) => x.code)).toEqual(["figures_unbalanced_layer", "figures_unbalanced_layer"]);
    expect(fb.issues[0]!.message).toContain("Overview layer is unbalanced");
  });

  it("does not report a layer twice when an unbalanced section already explains it", () => {
    const input = passingInput();
    const fb = figureBalance(bundleOf(input), ["demo-alpha", "demo-beta"], { structureDiagrams: false, figureAssets: [photo(input, "demo-alpha.tool.block")] });
    expect(fb.issues.map((x) => x.code)).toEqual(["figures_unbalanced"]);
    expect(fb.layers.find((l) => l.layer === "overview")?.balanced).toBe(false);
  });
});

describe("figure governance rules", () => {
  it("asks for about 15 words of alt text that never repeats the caption, and short captions", () => {
    expect(altTextProblem("A cloth", null)).toMatch(/at least 8/);
    expect(altTextProblem(Array(31).fill("word").join(" "), null)).toMatch(/at most 30/);
    const alt = "Whole block-printed cotton cloth laid flat, with a dense repeat of small motifs";
    expect(altTextProblem(alt, "Something else entirely")).toBeNull();
    expect(altTextProblem(alt, `${alt.toUpperCase()}.`)).toMatch(/must not repeat the caption/);
    expect(captionProblem("x".repeat(180))).toBeNull();
    expect(captionProblem("x".repeat(181))).toMatch(/at most 180/);
  });
});

const CONTENT = join(process.cwd(), "content");
const present = existsSync(join(CONTENT, "traditions"));

function realBundle(): KnowledgeBundle {
  const dir = readContentDirectory(CONTENT, process.cwd());
  const manifest = dir.sourceManifest ? parseSourceManifest(dir.sourceManifest.text) : null;
  const { model, report } = validateContentFiles(dir.files, { sourceManifest: manifest });
  const built = buildSnapshot(model, { hasher: nodeSha256, generatedAt: "2026-10-14T00:00:00.000Z", issues: report.issues, kind: "review" });
  if (!built.ok) throw new Error("the review snapshot did not build");
  return built.snapshot.payload;
}

describe.skipIf(!present)("figure balance over the real content", () => {
  const bundle = present ? realBundle() : (null as unknown as KnowledgeBundle);

  it("gives the three study traditions the same figures in every section", () => {
    const fb = figureBalance(bundle, [...STUDY_TRADITION_SLUGS], { structureDiagrams: true });
    expect(fb.traditionSlugs).toEqual([...STUDY_TRADITION_SLUGS]);
    expect(fb.issues).toEqual([]);
    expect(fb.rows.every((r) => r.balanced)).toBe(true);
    const total = (slug: string) => fb.rows.reduce((s, r) => s + (r.counts[slug] ?? 0), 0);
    expect(new Set(STUDY_TRADITION_SLUGS.map(total)).size).toBe(1);
    expect(fb.metrics.diagrams).toBe(total("ajrakh") * 3);
  });

  it("shows no figures at all with the structure-diagram switch off and no photographs", () => {
    const fb = figureBalance(bundle, [...STUDY_TRADITION_SLUGS], { structureDiagrams: false });
    expect(fb.shown).toEqual([]);
    expect(fb.rows.every((r) => r.balanced)).toBe(true);
  });
});
