import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { scriptRuns } from "@/lib/text/script-runs";

describe("scriptRuns (DESIGN.md 5.1, section 15: Sindhi/Persian quote right-to-left with lang and dir)", () => {
  it("returns Latin text as one run", () => {
    expect(scriptRuns("Indigo resist printing.")).toEqual([{ text: "Indigo resist printing.", rtl: false }]);
  });

  it("splits Arabic-script runs and takes the language the text declares", () => {
    const runs = scriptRuns("The word Ajrak ( Sindhi : اجرڪ ) derives from the Persian word ajar ( Persian : اجر ), meaning brick");
    expect(runs.filter((r) => r.rtl)).toEqual([
      { text: "اجرڪ", rtl: true, lang: "sd" },
      { text: "اجر", rtl: true, lang: "fa" },
    ]);
    expect(runs.map((r) => r.text).join("")).toBe("The word Ajrak ( Sindhi : اجرڪ ) derives from the Persian word ajar ( Persian : اجر ), meaning brick");
  });

  it("keeps a multi-word run together and defaults an undeclared run to sd", () => {
    expect(scriptRuns("x اجرڪ اجر y")).toEqual([
      { text: "x ", rtl: false },
      { text: "اجرڪ اجر", rtl: true, lang: "sd" },
      { text: " y", rtl: false },
    ]);
  });

  it("finds every Arabic-script run in the curated content and changes no text", () => {
    const file = readFileSync(path.resolve(__dirname, "../../content/traditions/ajrakh/tradition.json"), "utf8");
    const quotes: string[] = [];
    JSON.parse(file, (k, v) => (k === "quote" && typeof v === "string" && /[؀-ۿ]/.test(v) ? (quotes.push(v), v) : v));
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) {
      const runs = scriptRuns(q);
      expect(runs.map((r) => r.text).join("")).toBe(q);
      expect(runs.filter((r) => r.rtl).every((r) => r.rtl && ["sd", "fa"].includes(r.lang))).toBe(true);
    }
  });
});
