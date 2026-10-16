/**
 * Study photographs from sources other than the V&A (DR-057): each
 * source's credit and licence, the one 768 px cap and five-year term, the refusal of a crop on the
 * no-alteration sources (Sahapedia, PARI) and of a missing photographer, and the held kind-A
 * entries in content/review/process-photo-proposals.json, which the ingest skips.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FIGURE_TEXT } from "../../../src/features/learning/strings";

import {
  missingPhotographer,
  PARI_CREDIT,
  parsePhotoProposal,
  PHOTO_MAX_PIXELS,
  PHOTO_SOURCES,
  PHOTO_TERM_MONTHS,
  planPhoto,
  planStudyPhotos,
  sourceOf,
  VA_CREDIT,
  type PhotoProposal,
} from "../../../scripts/content/ingest-study-photos";

const ROOT = join(__dirname, "..", "..", "..");
const read = (f: string) => JSON.parse(readFileSync(join(ROOT, "content", "review", f), "utf8")) as { images: Record<string, unknown>[] };

const base = {
  status: "proposed",
  kind: "blocks",
  title: "A test photograph",
  caption: "Printing blocks, [Ajrakhpur], [Kutch].",
  altText: "Several carved wooden printing blocks resting side by side on a ledge.",
  notes: [] as string[],
};

const rickBradley = (over: Partial<PhotoProposal> = {}): PhotoProposal =>
  parsePhotoProposal({
    ...base,
    id: "rb",
    source: "rick-bradley",
    photographer: "Rick Bradley",
    recordTitle: "printing blocks, ajrakpur, kaach",
    tradition: "ajrakh",
    conceptKey: "ajrakh.tool.wooden-blocks",
    claimIds: ["ajrakh.tool.wooden-blocks#1"],
    pageUrl: "https://www.flickr.com/photos/89139703@N00/4239431528",
    licence: "CC BY 2.0",
    ...over,
  });

const sahapedia = (over: Partial<PhotoProposal> = {}): PhotoProposal =>
  parsePhotoProposal({
    ...base,
    id: "sp",
    source: "sahapedia",
    photographer: "A. Photographer Name",
    tradition: "machilipatnam-kalamkari",
    conceptKey: "machilipatnam-kalamkari.tool.teak-printing-blocks",
    claimIds: ["machilipatnam-kalamkari.tool.teak-printing-blocks#3"],
    pageUrl: "https://www.sahapedia.org/kalamkari",
    licence: "CC BY-NC-SA 4.0, used with permission",
    caption: "Wooden blocks used for kalamkari printing in Machilipatnam.",
    ...over,
  });

const ericParker = (over: Partial<PhotoProposal> = {}): PhotoProposal =>
  parsePhotoProposal({
    ...base,
    id: "ep",
    source: "eric-parker",
    photographer: "Eric Parker",
    tradition: "sanganeri",
    conceptKey: "sanganeri.tool.bunta-wooden-block",
    claimIds: ["sanganeri.tool.bunta-wooden-block#0"],
    pageUrl: "https://www.flickr.com/photos/ericparker/6789652042/",
    licence: "CC BY-NC 2.0",
    caption: "Used printing blocks under the printing table in a small cottage-industry factory. Sanganer, Rajasthan, India.",
    ...over,
  });

const pari = (over: Partial<PhotoProposal> = {}): PhotoProposal =>
  parsePhotoProposal({
    ...base,
    id: "pari",
    source: "pari",
    photographer: "Rahul Maganti",
    tradition: "machilipatnam-kalamkari",
    conceptKey: "machilipatnam-kalamkari.tool.printing-table",
    claimIds: ["machilipatnam-kalamkari.tool.printing-table#0"],
    pageUrl: "https://ruralindiaonline.org/en/articles/a-muted-maggam-a-bleeding-block-print/",
    licence: "CC BY-NC-ND 4.0, used with permission",
    caption: "Kalamkari artisans creating block prints in a workshop in Pedana.",
    ...over,
  });

const CROP = ["Cropped at the left to remove a tag"];

describe("one cap and one term for every source", () => {
  it("serves every source at most 768 px for five years from first publication, never as a public plate", () => {
    for (const p of [rickBradley(), sahapedia(), ericParker(), pari()]) {
      expect(planPhoto(p).metadata).toMatchObject({ maxPixels: 768, licenceTermMonths: 60, publicPlate: false, provenanceKind: "historical_documentation" });
    }
    expect([PHOTO_MAX_PIXELS, PHOTO_TERM_MONTHS]).toEqual([768, 60]);
  });

  it("links every licence to its deed", () => {
    expect(Object.fromEntries(Object.values(PHOTO_SOURCES).map((s) => [s.id, s.licenceUrl]))).toEqual({
      vam: "https://www.vam.ac.uk/info/va-websites-terms-conditions",
      "rick-bradley": "https://creativecommons.org/licenses/by/2.0/",
      sahapedia: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
      "eric-parker": "https://creativecommons.org/licenses/by-nc/2.0/",
      pari: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
    });
  });
});

describe("the printed credit line (DR-063)", () => {
  it("never stores the 'Photo: ' prefix the shared figure prints, so it is printed once", () => {
    for (const p of [rickBradley(), sahapedia(), ericParker(), pari()]) {
      const { credit } = planPhoto(p).metadata;
      expect(credit).not.toMatch(/^Photo:/);
      expect(FIGURE_TEXT.photoCredit(credit)).toMatch(/^Photo: (?!Photo:)/);
    }
  });
});

describe("Rick Bradley (Flickr, CC BY 2.0)", () => {
  it("credits the photographer, the record title, Flickr and the licence", () => {
    const m = planPhoto(rickBradley()).metadata;
    expect(m.credit).toBe('Rick Bradley, "printing blocks, ajrakpur, kaach", Flickr, CC BY 2.0');
    expect(m.licence).toBe("CC BY 2.0");
  });

  it("credits a noted crop (derivatives allowed)", () => {
    expect(planPhoto(rickBradley({ notes: CROP })).metadata.credit).toMatch(/, Flickr, CC BY 2\.0 \(cropped\)$/);
  });

  it("refuses a missing or different photographer, a different licence and a foreign record page", () => {
    expect(() => planPhoto(rickBradley({ photographer: undefined }))).toThrow(/no photographer named/);
    expect(() => planPhoto(rickBradley({ photographer: "Someone Else" }))).toThrow(/only one/);
    expect(() => planPhoto(rickBradley({ licence: "CC BY-NC 2.0" }))).toThrow(/not the rick-bradley licence/);
    expect(() => planPhoto(rickBradley({ pageUrl: "https://www.flickr.com/photos/ericparker/1/" }))).toThrow(/record page/);
  });
});

describe("Sahapedia (CC BY-NC-SA 4.0, with permission)", () => {
  it("prints exactly 'Photo: <name> / Sahapedia, CC BY-NC-SA 4.0'", () => {
    expect(planPhoto(sahapedia()).metadata.credit).toBe("A. Photographer Name / Sahapedia, CC BY-NC-SA 4.0");
    expect(FIGURE_TEXT.photoCredit(planPhoto(sahapedia()).metadata.credit)).toBe("Photo: A. Photographer Name / Sahapedia, CC BY-NC-SA 4.0.");
  });

  it("refuses the placeholder and a missing name", () => {
    for (const photographer of [undefined, "", "  ", "[Photographer's Name]", "Photographer's Name", "unknown"]) {
      expect(() => planPhoto(sahapedia({ photographer }))).toThrow(/no photographer named/);
    }
  });

  it("refuses a crop or edit note: uncropped and unaltered only", () => {
    expect(() => planPhoto(sahapedia({ notes: CROP }))).toThrow(/uncropped and unaltered/);
    expect(() => planPhoto(sahapedia({ notes: ["Edited for contrast"] }))).toThrow(/uncropped and unaltered/);
    expect(planPhoto(sahapedia({ notes: ["Shown uncropped and unaltered."] })).metadata.credit).not.toMatch(/cropped\)/);
  });
});

describe("Eric Parker (Flickr, CC BY-NC 2.0)", () => {
  it("credits the photographer, Flickr and the licence", () => {
    expect(planPhoto(ericParker()).metadata.credit).toBe("Eric Parker, Flickr, CC BY-NC 2.0");
    expect(planPhoto(ericParker({ notes: CROP })).metadata.credit).toBe("Eric Parker, Flickr, CC BY-NC 2.0 (cropped)");
  });

  it("refuses a missing photographer and the reposting account's page", () => {
    expect(() => planPhoto(ericParker({ photographer: undefined }))).toThrow(/no photographer named/);
    expect(() => planPhoto(ericParker({ pageUrl: "https://www.flickr.com/photos/terryrai/6789652042/" }))).toThrow(/record page/);
  });
});

describe("PARI (CC BY-NC-ND 4.0, with permission)", () => {
  it("uses PARI's exact credit line from the third reply", () => {
    expect(planPhoto(pari()).metadata.credit).toBe("Rahul Maganti / People's Archive of Rural India (PARI). CC BY-NC-ND 4.0, used with permission.");
    expect(FIGURE_TEXT.photoCredit(planPhoto(pari()).metadata.credit)).toBe(PARI_CREDIT);
  });

  it("refuses a crop note (no derivatives), a missing photographer and anyone but Rahul Maganti", () => {
    expect(() => planPhoto(pari({ notes: CROP }))).toThrow(/uncropped and unaltered/);
    expect(() => planPhoto(pari({ photographer: undefined }))).toThrow(/no photographer named/);
    expect(() => planPhoto(pari({ photographer: "Another Photographer" }))).toThrow(/only one/);
  });
});

describe("V&A stays as it was", () => {
  it("is the source of an entry with no source field that names the museum, and nothing else is", () => {
    expect(sourceOf({ id: "x", licence: "V&A non-commercial terms; image © Victoria and Albert Museum, London" }).id).toBe("vam");
    expect(() => sourceOf({ id: "x", licence: "CC BY 2.0" })).toThrow(/no "source" given/);
  });

  it("plans the three DR-020 photographs exactly as before", () => {
    const plans = planStudyPhotos(read("media-proposals.json"));
    expect(plans).toHaveLength(3);
    for (const p of plans) {
      expect(p.metadata.credit.startsWith(VA_CREDIT)).toBe(true);
      expect(p.metadata).toMatchObject({ licence: "V&A non-commercial terms", licenceUrl: "https://www.vam.ac.uk/info/va-websites-terms-conditions", maxPixels: 768, licenceTermMonths: 60 });
      expect(p.file).toMatch(/-textile-768\.jpg$/);
    }
  });
});

describe("the kind-A proposals (proposed, DR-063)", () => {
  const file = read("process-photo-proposals.json");
  const plans = planStudyPhotos(file);
  const bySource = Object.fromEntries(plans.map((p) => [file.images.find((i) => i.id === p.proposalId)!.source, p]));

  it("proposes one carved-block photograph per study tradition, each on a tool concept, every held condition recorded as met", () => {
    expect(file.images.map((i) => i.tradition).sort()).toEqual(["ajrakh", "machilipatnam-kalamkari", "sanganeri"]);
    expect(file.images.map((i) => i.conceptKey).sort()).toEqual([
      "ajrakh.tool.wooden-blocks",
      "machilipatnam-kalamkari.tool.teak-printing-blocks",
      "sanganeri.tool.bunta-wooden-block",
    ]);
    for (const i of file.images) {
      expect(i).toMatchObject({ status: "proposed", kind: "blocks", section: "materials-tools" });
      expect(i.heldUntil).toBeUndefined();
      expect((i.conditionsMet as string[]).length).toBeGreaterThan(0);
    }
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => p.file).sort()).toEqual(["ajrakh-blocks-768.jpg", "machilipatnam-kalamkari-blocks-768.jpg", "sanganeri-blocks-768.jpg"]);
  });

  it("is planned together with the V&A file, which stays as it was", () => {
    const both = planStudyPhotos(read("media-proposals.json"), file);
    expect(both.slice(0, 3)).toEqual(planStudyPhotos(read("media-proposals.json")));
    expect(both).toHaveLength(6);
  });

  it("captions with the record's own wording only", () => {
    const byTradition = Object.fromEntries(file.images.map((i) => [i.tradition, i]));
    expect(byTradition.ajrakh!.caption).toBe("Printing blocks, [Ajrakhpur], [Kutch].");
    expect(byTradition["machilipatnam-kalamkari"]!.caption).toBe(`${byTradition["machilipatnam-kalamkari"]!.namingQuote}.`);
    expect(byTradition.sanganeri!.caption).toBe(`${byTradition.sanganeri!.namingQuote}.`);
  });

  it("credits each source as it asks, anchored after the named claim", () => {
    expect(bySource["rick-bradley"]!.metadata.credit).toBe('Rick Bradley, "printing blocks, ajrakpur, kaach", Flickr, CC BY 2.0');
    expect(bySource["eric-parker"]!.metadata.credit).toBe("Eric Parker, Flickr, CC BY-NC 2.0");
    expect(missingPhotographer(file.images.find((i) => i.source === "sahapedia")!.photographer as string)).toBe(false);
    expect(bySource.sahapedia!.metadata.credit).toBe("Courtesy J. Niranjan, Srikalahasti / Sahapedia, CC BY-NC-SA 4.0");
    expect(FIGURE_TEXT.photoCredit(bySource.sahapedia!.metadata.credit)).toBe("Photo: Courtesy J. Niranjan, Srikalahasti / Sahapedia, CC BY-NC-SA 4.0.");
    expect([bySource["rick-bradley"]!.position, bySource.sahapedia!.position, bySource["eric-parker"]!.position]).toEqual([1, 3, 0]);
  });
});
