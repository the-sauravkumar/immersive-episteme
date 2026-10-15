/**
 * Figure balance (DESIGN.md 9.9, 11.10, 12.3 rules 8-10; DR-018, DR-020): the content parity
 * engine's `a.figures` check and the `figureBalance` matrix the CMS Figure Balance table shows.
 *
 *  - a balanced study (graph-derived diagrams only, or one photograph per tradition in the same
 *    section) passes;
 *  - an unbalanced photograph set fails the CRITICAL check, so the study cannot be activated, with
 *    an issue that names the section and the counts;
 *  - at most one figure per concept; the structure diagram takes the slot while the protocol shows
 *    diagrams; unapproved, expired, mis-anchored or below-cap photographs never count silently;
 *  - over the real curated content, the three study traditions show the same figures per section.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";
import { readContentDirectory } from "@/features/knowledge/graph/load-content-dir";
import { validateContentFiles } from "@/features/knowledge/graph/report";
import { buildSnapshot } from "@/features/knowledge/graph/snapshot";
import { parseSourceManifest } from "@/features/knowledge/graph/source-manifest";
import { EPISTEMIC_SECTIONS } from "@/features/learning-2d/template";
import { STUDY_TRADITION_SLUGS } from "@/features/learning/labels";
import { altTextProblem, captionProblem, displayLongEdge, licenceValidOn, STUDY_FIGURE_CAP } from "@/features/media/contracts";
import { LIGHTBOX_MAX_EDGE } from "@/components/knowledge/figure-lightbox";
import { figureBalance, runParityChecks, type ParityFigureAsset, type ParityInput, type ParityReport } from "@/server/research/parity/engine";

import { passingInput } from "./fixtures";

const checkOf = (r: ParityReport, id: string) => {
  const c = r.checks.find((x) => x.id === id);
  if (!c) throw new Error(`no check ${id}`);
  return c;
};

const bundleOf = (i: ParityInput) => i.snapshot!.payload as KnowledgeBundle;
const conceptId = (i: ParityInput, key: string) => {
  const c = bundleOf(i).concepts.find((x) => x.key === key);
  if (!c) throw new Error(`no concept ${key}`);
  return c.id;
};

let n = 0;
function photo(i: ParityInput, key: string, over: Partial<ParityFigureAsset> = {}): ParityFigureAsset {
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
    maxPixels: 768,
    licenceExpiresOn: "2031-01-01",
    credit: "Example Museum",
    caption: "Block used for the first impression",
    altText: "A carved wooden printing block resting on a folded length of printed cotton cloth",
    ...over,
  };
}

describe("figure balance check (a.figures)", () => {
  it("passes the matched fixture: its graph-derived diagrams are balanced by construction", () => {
    const r = runParityChecks(passingInput());
    const c = checkOf(r, "a.figures");
    expect(c.severity).toBe("critical");
    expect(c.passed).toBe(true);
    expect(c.metrics.diagrams).toBeGreaterThan(0);
    expect(c.metrics.photos).toBe(0);
  });

  it("fails activation when one tradition has a photograph the others lack, naming the section and counts", () => {
    const input = passingInput();
    input.figureAssets = [photo(input, "demo-alpha.tool.block")];
    const r = runParityChecks(input);
    const c = checkOf(r, "a.figures");
    expect(c.passed).toBe(false);
    expect(r.passed).toBe(false);
    const issue = c.issues.find((x) => x.code === "figures_unbalanced");
    expect(issue?.ref).toBe("materials-tools");
    expect(issue?.message).toContain('Section "Materials and tools" is unbalanced');
    expect(issue?.message).toMatch(/1, .* 0/);
  });

  it("passes when every tradition has one photograph in the same section", () => {
    const input = passingInput();
    input.figureAssets = [photo(input, "demo-alpha.tool.block"), photo(input, "demo-beta.tool.block")];
    const c = checkOf(runParityChecks(input), "a.figures");
    expect(c.issues).toEqual([]);
    expect(c.metrics.photos).toBe(2);
  });

  it("allows at most one figure per concept", () => {
    const input = passingInput();
    input.figureAssets = [photo(input, "demo-alpha.tool.block"), photo(input, "demo-alpha.tool.block"), photo(input, "demo-beta.tool.block")];
    const c = checkOf(runParityChecks(input), "a.figures");
    expect(c.issues.map((x) => x.code)).toEqual(["figure_per_concept"]);
    // Only one of the two is shown, so the section itself stays balanced.
    expect(c.metrics.photos).toBe(2);
    expect(c.metrics.photosHeldBack).toBe(1);
  });

  it("lets the structure diagram take the slot while the protocol shows diagrams", () => {
    const input = passingInput();
    const base = figureBalance(bundleOf(input), ["demo-alpha", "demo-beta"], { structureDiagrams: true });
    const anchor = base.shown.find((s) => s.kind === "diagram" && s.traditionSlug === "demo-alpha")!;
    input.figureAssets = [{ ...photo(input, "demo-alpha.tool.block"), conceptId: anchor.conceptId }];
    const c = checkOf(runParityChecks(input), "a.figures");
    expect(c.passed).toBe(true);
    expect(c.metrics.photosHeldBack).toBe(1);

    // Switched off (both conditions together), the same photograph is shown and unbalances its section.
    const off = passingInput();
    (off.study.config as Record<string, unknown>).figures = { structureDiagrams: false };
    off.figureAssets = input.figureAssets;
    const cOff = checkOf(runParityChecks(off), "a.figures");
    expect(cOff.metrics.diagrams).toBe(0);
    expect(cOff.issues.map((x) => x.code)).toEqual(["figures_unbalanced"]);
  });

  it("refuses photographs that cannot fill the lightbox cap, are expired or anchor to no claim", () => {
    const input = passingInput();
    input.asOf = "2027-06-01";
    input.figureAssets = [
      photo(input, "demo-alpha.tool.block", { maxPixels: 600 }),
      photo(input, "demo-beta.tool.block", { width: 700, height: 500, maxPixels: null }),
      photo(input, "demo-alpha.material.dye", { licenceExpiresOn: "2027-05-31" }),
      photo(input, "demo-beta.material.dye", { position: 4 }),
    ];
    const codes = checkOf(runParityChecks(input), "a.figures").issues.map((x) => x.code).sort();
    expect(codes).toEqual(["figure_anchor", "figure_below_cap", "figure_below_cap", "figure_licence_expired"]);
  });

  it("refuses approved photographs without a credit, caption or alt text, and does not count them", () => {
    const input = passingInput();
    input.figureAssets = [
      photo(input, "demo-alpha.tool.block", { credit: null }),
      photo(input, "demo-beta.tool.block", { caption: "  " }),
      photo(input, "demo-alpha.material.dye", { altText: "" }),
    ];
    const c = checkOf(runParityChecks(input), "a.figures");
    expect(c.severity).toBe("critical");
    expect(c.passed).toBe(false);
    expect(c.issues.map((x) => x.code)).toEqual(["figure_metadata", "figure_metadata", "figure_metadata"]);
    expect(c.issues[0]!.message).toMatch(/no credit/);
    expect(c.metrics.photos).toBe(0);
  });

  it("ignores unapproved and demo-into-real photographs", () => {
    const input = passingInput();
    input.figureAssets = [photo(input, "demo-alpha.tool.block", { verificationState: "under_review" }), photo(input, "demo-beta.tool.block", { role: "hero" })];
    const c = checkOf(runParityChecks(input), "a.figures");
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

describe("figure governance rules", () => {
  it("keeps one study cap, equal to the lightbox cap", () => {
    expect(STUDY_FIGURE_CAP).toBe(LIGHTBOX_MAX_EDGE);
    expect(displayLongEdge({ width: 2400, height: 1600, maxPixels: 768 })).toBe(768);
    expect(displayLongEdge({ width: 600, height: 900, maxPixels: null })).toBe(900);
    expect(displayLongEdge({ width: null, height: 900, maxPixels: 768 })).toBeNull();
    expect(licenceValidOn(null, "2030-01-01")).toBe(true);
    expect(licenceValidOn("2030-01-01", "2030-01-01")).toBe(true);
    expect(licenceValidOn("2030-01-01", "2030-01-02")).toBe(false);
  });

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
