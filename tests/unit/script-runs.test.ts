import { readdirSync, readFileSync } from "node:fs";
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

  it("sets the fixture's Arabic-script runs right-to-left with their declared language and changes no text", () => {
    // A fixture, not content/: content round 2 dropped the only Arabic-script quote (an
    // unverified-kind source), so the RTL path stays covered whatever the curated content holds.
    const fixture = JSON.parse(readFileSync(path.resolve(__dirname, "../fixtures/arabic-script-quotes.json"), "utf8")) as {
      quotes: { quote: string; rtl: [string, string][] }[];
    };
    expect(fixture.quotes.length).toBeGreaterThan(0);
    for (const { quote, rtl } of fixture.quotes) {
      const runs = scriptRuns(quote);
      expect(runs.map((r) => r.text).join("")).toBe(quote);
      expect(runs.filter((r) => r.rtl).map((r) => [r.rtl ? r.lang : null, r.text])).toEqual(rtl);
    }
  });

  it("keeps every Arabic-script quote in the curated content intact, if there is any", () => {
    const files = [
      ...readdirSync(path.resolve(__dirname, "../../content/traditions")).map((t) => `traditions/${t}/tradition.json`),
      "shared/craft-science.json",
      "comparisons.json",
    ];
    for (const f of files) {
      const quotes: string[] = [];
      JSON.parse(readFileSync(path.resolve(__dirname, "../../content", f), "utf8"), (k, v) => (k === "quote" && typeof v === "string" && /[؀-ۿ]/.test(v) ? (quotes.push(v), v) : v));
      for (const q of quotes) {
        const runs = scriptRuns(q);
        expect(runs.map((r) => r.text).join(""), f).toBe(q);
        expect(runs.filter((r) => r.rtl).every((r) => r.rtl && ["sd", "fa"].includes(r.lang)), f).toBe(true);
      }
    }
  });
});
