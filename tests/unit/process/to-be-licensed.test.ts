import { existsSync, readFileSync } from "node:fs";
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
