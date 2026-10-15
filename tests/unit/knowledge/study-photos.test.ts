/**
 * Study photographs (DR-020 and its addendum): the three V&A textile photographs reach learners
 * only through the shared figure resolution, identically in both conditions.
 *
 *  - the anchor-claim gate: a photograph shows only once its concept's claims are verified;
 *  - the protocol switch `figures.photos` removes photographs from BOTH conditions together, in the
 *    read model's resolution and in the content parity engine's figure balance;
 *  - the ingest plan: one photograph per study tradition, each on a context concept, anchored after
 *    the claim that names the object, credited as the V&A requires (the cropped one says so), at
 *    most 768 px on the long edge, a 60-month term from first publication, never a public plate.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import { photoFiguresOf, photoGateOpen, resolveConceptFigures, type DiagramFigure, type IllustrationLink } from "@/features/knowledge/read/view";
import { STUDY_TRADITION_SLUGS } from "@/features/learning/labels";
import { studyConfigSchema } from "@/features/study/contracts";
import { learningSettingsOf } from "@/features/learning/settings";
import { figureBalance, type ParityFigureAsset } from "@/server/research/parity/engine";

import { anchorPosition, creditOf, jpegSize, planStudyPhotos, VA_CREDIT, VA_MAX_PIXELS, VA_TERM_MONTHS } from "../../../scripts/content/ingest-study-photos";
import { passingInput } from "../research/fixtures";

const ROOT = join(__dirname, "..", "..", "..");

const link = (over: Partial<IllustrationLink> = {}): IllustrationLink => ({
  assetId: "00000000-0000-4000-8000-000000000001",
  conceptId: "c1",
  role: "illustration",
  position: 1,
  src: "/figures/00000000-0000-4000-8000-000000000001",
  width: 768,
  height: 596,
  altText: "Long white cotton printed with rows of small animals",
  caption: "A caption",
  credit: VA_CREDIT,
  licence: "V&A non-commercial terms",
  licenceUrl: null,
  ...over,
});

describe("anchor-claim gate", () => {
  it("opens only for verified or published concepts", () => {
    expect(photoGateOpen("verified")).toBe(true);
    expect(photoGateOpen("published")).toBe(true);
    for (const s of ["draft", "under_review", "needs_evidence", "rejected", "archived"]) expect(photoGateOpen(s)).toBe(false);
  });

  it("shows no photograph while the anchor concept is under review", () => {
    expect(photoFiguresOf({ id: "c1", claimCount: 3, verificationState: "under_review" }, [link()])).toEqual([]);
    const shown = photoFiguresOf({ id: "c1", claimCount: 3, verificationState: "verified" }, [link()]);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ kind: "photo", anchorClaimIndex: 1, credit: VA_CREDIT });
  });

  it("never anchors a photograph after a claim the concept does not have", () => {
    expect(photoFiguresOf({ id: "c1", claimCount: 1, verificationState: "verified" }, [link({ position: 1 })])).toEqual([]);
  });
});

describe("protocol switch figures.photos", () => {
  const photos = photoFiguresOf({ id: "c1", claimCount: 3, verificationState: "verified" }, [link()]);

  it("defaults to on and reaches both conditions through the learning settings", () => {
    const cfg = studyConfigSchema.parse({});
    expect(cfg.figures).toEqual({ structureDiagrams: true, photos: true });
    expect(learningSettingsOf(studyConfigSchema.parse({ figures: { photos: false } })).figures).toEqual({ structureDiagrams: true, photos: false });
  });

  it("removes the photograph from the one resolution both conditions call", () => {
    expect(resolveConceptFigures({ diagrams: [], photos, structureDiagrams: true, photosOn: true })).toHaveLength(1);
    expect(resolveConceptFigures({ diagrams: [], photos, structureDiagrams: true, photosOn: false })).toEqual([]);
  });

  it("leaves the structure diagram's slot alone", () => {
    const diagram = { kind: "diagram", id: "d1", conceptId: "c1", anchorClaimIndex: 0, caption: "", alt: "", credit: "", diagram: {} } as unknown as DiagramFigure;
    expect(resolveConceptFigures({ diagrams: [diagram], photos, structureDiagrams: true, photosOn: false })).toEqual([diagram]);
  });

  it("is applied by the parity engine's figure balance, as is the gate", () => {
    const input = passingInput();
    const bundle = input.snapshot!.payload as KnowledgeBundle;
    const slugs = [...new Set(bundle.traditions.map((t) => t.slug))];
    const key = (slug: string) => `${slug}.tool.block`;
    const assets: ParityFigureAsset[] = slugs.map((slug, i) => ({
      assetId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      conceptId: bundle.concepts.find((c) => c.key === key(slug))!.id,
      role: "illustration",
      position: 0,
      verificationState: "verified",
      isDemo: true,
      width: 2000,
      height: 1500,
      maxPixels: 768,
      licenceExpiresOn: null,
      credit: VA_CREDIT,
      caption: "Block used for the first impression",
      altText: "A carved wooden printing block resting on a folded length of printed cotton cloth",
    }));
    const on = figureBalance(bundle, slugs, { structureDiagrams: false, photos: true, figureAssets: assets });
    expect(on.metrics.photos).toBe(slugs.length);
    expect(figureBalance(bundle, slugs, { structureDiagrams: false, photos: false, figureAssets: assets }).metrics.photos).toBe(0);
    const reviewing = structuredClone(bundle);
    for (const c of reviewing.concepts) c.verificationState = "under_review";
    expect(figureBalance(reviewing, slugs, { structureDiagrams: false, photos: true, figureAssets: assets }).metrics.photos).toBe(0);
  });
});

describe("ingest plan of the three V&A photographs", () => {
  const proposals = JSON.parse(readFileSync(join(ROOT, "content", "review", "media-proposals.json"), "utf8"));
  const plans = planStudyPhotos(proposals);

  it("plans one photograph per study tradition, each on a context concept", () => {
    expect(plans.map((p) => p.conceptKey.split(".")[0]).sort()).toEqual([...STUDY_TRADITION_SLUGS].sort());
    for (const p of plans) expect(p.conceptKey.split(".")[1]).toBe("historical_context");
  });

  it("anchors each after the claim the proposal names first", () => {
    expect(Object.fromEntries(plans.map((p) => [p.conceptKey.split(".")[0], p.position]))).toEqual({
      ajrakh: 4,
      "machilipatnam-kalamkari": 0,
      sanganeri: 1,
    });
    expect(() => anchorPosition("other.concept#1", "ajrakh.x")).toThrow();
  });

  it("credits the V&A exactly, and says so when the image was cropped", () => {
    for (const p of plans) {
      expect(p.metadata.credit.startsWith(VA_CREDIT)).toBe(true);
      expect(p.metadata.credit.endsWith("(cropped)")).toBe(p.conceptKey.startsWith("machilipatnam-kalamkari."));
    }
    expect(creditOf({ notes: ["Crop about 13% on the left"] })).toBe(`${VA_CREDIT} (cropped)`);
  });

  it("applies the V&A conditions: 768 px cap, 60-month term from first publication, never a public plate", () => {
    for (const p of plans) {
      expect(p.metadata).toMatchObject({ maxPixels: VA_MAX_PIXELS, licenceTermMonths: VA_TERM_MONTHS, publicPlate: false, provenanceKind: "historical_documentation" });
      expect(p.metadata.sourceUrl).toMatch(/^https:\/\/collections\.vam\.ac\.uk\/item\//);
    }
  });

  it("has every derivative in the repository, no larger than the cap", () => {
    for (const p of plans) {
      const file = join(ROOT, "scripts", "content", "study-photos", p.file);
      expect(existsSync(file)).toBe(true);
      const size = jpegSize(new Uint8Array(readFileSync(file)));
      expect(size).not.toBeNull();
      expect(Math.max(size!.width, size!.height)).toBeLessThanOrEqual(VA_MAX_PIXELS);
    }
  });
});
