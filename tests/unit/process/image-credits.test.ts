import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CXA_APPROVAL, manifestNames, manifestRows as readManifestRows, renderImageCredits, rowsFrom, studyPhotoCredits, uncleared, type CreditRow } from "../../../scripts/content/build-image-credits";

describe("image credits", () => {
  const rows: readonly CreditRow[] = [
    { file: "/a.jpg", holder: "Museum", creditLine: "Photo Museum", usedFor: "x", sourcePage: "https://m", directUrl: "https://m/a", widthPx: 2000, status: "cxa-approved", permission: CXA_APPROVAL },
    { file: "/c.jpg", holder: "Poly Haven", usedFor: "z", page: "https://p", licence: "CC0 1.0" },
  ];
  const photo = { file: "scripts/content/study-photos/a-textile.jpg", credit: "Museum", licence: "Terms", sourcePage: "https://m/o", widthPx: 2500, heightPx: 1900 };
  const text = renderImageCredits(rows, ["manifest.json"], [photo]);

  it("groups third-party files by holder with their credit and licence basis", () => {
    expect(text).toContain("## Museum");
    expect(text).toContain("| /a.jpg | x | Photo Museum | https://m | https://m/a | 2000 | Licensed for public use by CXA's approval (DR-118) |");
  });

  it("lists the study photographs at their full size", () => {
    expect(text.split("## Study Photographs")[1]?.split("## CC0")[0]).toContain("| scripts/content/study-photos/a-textile.jpg | Museum | Terms | https://m/o | 2500 x 1900 |");
  });

  it("lists CC0 apart", () => {
    const [thirdParty, cc0] = text.split("## CC0, No Licence Needed");
    expect(thirdParty).not.toContain("/c.jpg");
    expect(cc0).toContain("/c.jpg");
  });

  it("finds a third-party row with no licence basis", () => {
    expect(uncleared([...rows, { file: "/b.jpg", holder: "Blog", status: "to-be-licensed" }]).map((row) => row.file)).toEqual(["/b.jpg"]);
  });

  it("reads every manifest shape it may meet", () => {
    expect(rowsFrom([{ file: "x" }])).toHaveLength(1);
    expect(rowsFrom({ rows: [{ file: "x" }] })).toHaveLength(1);
    expect(rowsFrom({ nothing: true })).toHaveLength(0);
  });
});

const MANIFESTS = manifestNames();
const manifestRows = readManifestRows(MANIFESTS);

function shippedFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = `${dir}/${name}`;
    return statSync(full).isDirectory() ? shippedFiles(full) : [full.replace(/^public/, "")];
  });
}

function rowCovers(rowFile: string, shipped: string): boolean {
  const strips = rowFile.includes("with each -strip.jpg crop");
  const target = strips ? shipped.replace(/-strip\.jpg$/, ".jpg") : shipped;
  return rowFile
    .replace(", with each -strip.jpg crop", "")
    .replace(/^public/, "")
    .split(", ")
    .some((part) => {
      const range = /^(.+\/.+-)(\d+)\.jpg to .+-(\d+)\.jpg$/.exec(part);
      if (range) {
        const name = new RegExp(`^${range[1]}(\\d+)\\.jpg$`).exec(target);
        return !!name && Number(name[1]) >= Number(range[2]) && Number(name[1]) <= Number(range[3]);
      }
      if (part.includes("*")) return target.startsWith(part.split("*")[0]!) && target.endsWith(part.split("*")[1]!);
      return target === part || target.startsWith(`${part}/`);
    });
}

describe("committed image record", () => {
  it("gives every shipped walkthrough file a manifest row", () => {
    const uncovered = shippedFiles("public/walkthrough").filter((file) => !/^\/walkthrough\/manifest.*\.json$/.test(file) && !manifestRows.some((row) => rowCovers(row.file, file)));
    expect(uncovered).toEqual([]);
  });

  it("finds a file with no row", () => {
    expect(manifestRows.some((row) => rowCovers(row.file, "/walkthrough/stills/planted-unlisted.jpg"))).toBe(false);
  });

  it("matches what the generator writes", () => {
    expect(readFileSync("docs/image-credits.md", "utf8").replace(/\r\n/g, "\n")).toBe(renderImageCredits(manifestRows, MANIFESTS, studyPhotoCredits()));
  });

  it("leaves no image waiting for a licence", () => {
    expect(uncleared(manifestRows)).toEqual([]);
    expect(manifestRows.filter((row) => row.status === "to-be-licensed")).toEqual([]);
  });

  it("lists open font files apart from the third-party images", () => {
    const text = renderImageCredits(manifestRows, MANIFESTS, studyPhotoCredits());
    const [thirdParty] = text.split("## CC0, No Licence Needed");
    expect(thirdParty).not.toContain("woff2");
    expect(text.split("## Open Font License, No Licence Needed")[1]).toContain("Mukta-400.woff2");
  });
});

describe("images manifest", () => {
  const manifest = JSON.parse(readFileSync("public/walkthrough/manifest.images.json", "utf8")) as { rows: readonly (CreditRow & { product?: unknown })[] };

  it("has a row for each product file that exists on disk", () => {
    const products = manifest.rows.filter((row) => row.product);
    expect(products.length).toBeGreaterThan(0);
    for (const row of products) expect(existsSync(`public${row.file}`), row.file).toBe(true);
  });

  it("gives every row a source page, a direct URL and its licence basis", () => {
    for (const row of manifest.rows) {
      expect(row.sourcePage, row.file).toBeTruthy();
      expect(row.directUrl, row.file).toBeTruthy();
      expect(row.status === "cc0" || row.permission === CXA_APPROVAL, row.file).toBe(true);
    }
  });
});

describe("study photographs", () => {
  it("are kept at the full size of each source original", () => {
    const sizes = Object.fromEntries(studyPhotoCredits().map((credit) => [credit.file.split("/").pop(), `${credit.widthPx} x ${credit.heightPx}`]));
    expect(sizes).toEqual({
      "ajrakh-textile.jpg": "2013 x 2500",
      "machilipatnam-kalamkari-textile.jpg": "2175 x 1688",
      "sanganeri-textile.jpg": "2500 x 1910",
      "ajrakh-blocks.jpg": "2448 x 3264",
      "machilipatnam-kalamkari-blocks.jpg": "3456 x 2304",
      "sanganeri-blocks.jpg": "4033 x 2778",
    });
    expect(readdirSync("scripts/content/study-photos").sort()).toEqual(Object.keys(sizes).sort());
  });
});
