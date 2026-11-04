import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { renderLicensingList, rowsFrom, type LicenceRow } from "../../../scripts/content/build-to-be-licensed";

describe("to be licensed list", () => {
  const rows: readonly LicenceRow[] = [
    { file: "/a.jpg", holder: "Museum", usedFor: "x", sourcePage: "https://m", directUrl: "https://m/a", widthPx: 2000, status: "to-be-licensed", permission: "Limit 768 px", contactRoute: "a@m" },
    { file: "/b.jpg", holder: "Blog", usedFor: "y", sourcePage: "https://b", directUrl: "https://b/b", widthPx: 1000, status: "to-be-licensed" },
    { file: "/c.jpg", holder: "Poly Haven", usedFor: "z", page: "https://p", licence: "CC0 1.0" },
  ];
  const text = renderLicensingList(rows, ["manifest.json"]);

  it("groups by holder and states the contact route", () => {
    expect(text).toContain("## Museum");
    expect(text).toContain("Who to write to: a@m");
    expect(text).toContain("Limit 768 px");
  });

  it("writes not found rather than guessing an address", () => {
    expect(text.split("## Blog")[1]?.split("##")[0]).toContain("Who to write to: not found");
  });

  it("lists CC0 apart", () => {
    const [licensed, cc0] = text.split("## CC0, No Licence Needed");
    expect(licensed).not.toContain("/c.jpg");
    expect(cc0).toContain("/c.jpg");
  });

  it("reads every manifest shape it may meet", () => {
    expect(rowsFrom([{ file: "x" }])).toHaveLength(1);
    expect(rowsFrom({ rows: [{ file: "x" }] })).toHaveLength(1);
    expect(rowsFrom({ nothing: true })).toHaveLength(0);
  });
});

const MANIFESTS = readdirSync("public/walkthrough").filter((name) => /^manifest.*\.json$/.test(name)).sort();
const manifestRows = MANIFESTS.flatMap((name) => rowsFrom(JSON.parse(readFileSync(`public/walkthrough/${name}`, "utf8"))));

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

describe("committed licensing record", () => {
  it("gives every shipped walkthrough file a manifest row", () => {
    const uncovered = shippedFiles("public/walkthrough").filter((file) => !/^\/walkthrough\/manifest.*\.json$/.test(file) && !manifestRows.some((row) => rowCovers(row.file, file)));
    expect(uncovered).toEqual([]);
  });

  it("finds a file with no row", () => {
    expect(manifestRows.some((row) => rowCovers(row.file, "/walkthrough/stills/planted-unlisted.jpg"))).toBe(false);
  });

  it("matches what the generator writes", () => {
    expect(readFileSync("docs/to_be_licensed.md", "utf8").replace(/\r\n/g, "\n")).toBe(renderLicensingList(manifestRows, MANIFESTS));
  });

  it("lists open font files apart from what needs clearing", () => {
    const text = renderLicensingList(manifestRows, MANIFESTS);
    const [needsClearing] = text.split("## CC0, No Licence Needed");
    expect(needsClearing).not.toContain("woff2");
    expect(text.split("## Open Font License, No Licence Needed")[1]).toContain("Mukta-400.woff2");
  });
});

describe("images manifest", () => {
  const manifest = JSON.parse(readFileSync("public/walkthrough/manifest.images.json", "utf8")) as { rows: readonly (LicenceRow & { product?: unknown })[] };

  it("has a row for each product file that exists on disk", () => {
    const products = manifest.rows.filter((row) => row.product);
    expect(products.length).toBeGreaterThan(0);
    for (const row of products) expect(existsSync(`public${row.file}`), row.file).toBe(true);
  });

  it("notes the 768 px limit on V&A objects already permitted", () => {
    const permitted = manifest.rows.filter((row) => /O469296|O481213/.test(row.sourcePage ?? ""));
    expect(permitted.length).toBeGreaterThan(0);
    for (const row of permitted) expect(row.permission).toContain("768 px");
  });

  it("gives every third-party row a source page, a direct URL and a contact route", () => {
    for (const row of manifest.rows) {
      expect(row.sourcePage, row.file).toBeTruthy();
      expect(row.directUrl, row.file).toBeTruthy();
      expect(row.contactRoute, row.file).toBeTruthy();
    }
  });
});
