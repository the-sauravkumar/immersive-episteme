/**
 * The Equivalence Monitor on /research and /research/parity (DESIGN.md 10, 11.8; 18 WP5
 * acceptance): with no stored interface parity report it says "No parity run recorded yet." and
 * nothing else; with a report file present it shows that report's real values; there is no
 * sample-data path. The report is read from `analysis/parity/interface-parity.json` under a
 * repository root, here a temporary directory holding a fixture.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { afterAll, describe, expect, it } from "vitest";

import { EquivalenceMonitor, NO_PARITY_RUN } from "@/components/parity/equivalence-monitor";
import { INTERFACE_PARITY_REPORT_PATH, PARITY_CHECKS } from "@/features/research/interface-parity";
import { readInterfaceParity } from "@/server/research/parity/summary";

const roots: string[] = [];
function repo(report?: unknown | string): string {
  const root = mkdtempSync(path.join(tmpdir(), "ie-parity-"));
  roots.push(root);
  if (report !== undefined) {
    const file = path.join(root, ...INTERFACE_PARITY_REPORT_PATH.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof report === "string" ? report : JSON.stringify(report));
  }
  return root;
}
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** A fixture run: two checks measured at 1280 x 800 light, P2 failing by 1.5 px at 390 x 844. */
const FIXTURE = {
  runId: "fixture-run-7",
  commit: "abcdef1234567890",
  generatedAt: "2026-10-01T12:30:00Z",
  runs: [
    {
      viewport: { width: 1280, height: 800 },
      theme: "light",
      traditionKey: "ajrakh",
      checks: [
        { id: "P1", value2d: "match", value3d: "match", delta: 0, tolerance: 0, passed: true },
        { id: "P2", value2d: 544, value3d: 544, delta: 0, tolerance: 1, passed: true },
      ],
    },
    {
      viewport: "390 x 844",
      theme: "light",
      traditionKey: "ajrakh",
      checks: [{ id: "P2", value2d: 322, value3d: 320.5, delta: 1.5, tolerance: 1, passed: false }],
    },
  ],
};

describe("interface parity is read only from the stored report", () => {
  it("is null when no report exists, or when the file is malformed", async () => {
    expect(await readInterfaceParity(repo())).toBeNull();
    expect(await readInterfaceParity(repo("{ not json"))).toBeNull();
    expect(await readInterfaceParity(repo({ runId: "x", commit: "y", runs: [] }))).toBeNull();
  });

  it("summarises a stored report: a check passes only if it passes in every run", async () => {
    const s = await readInterfaceParity(repo(FIXTURE));
    expect(s).not.toBeNull();
    expect(s!.runId).toBe("fixture-run-7");
    expect(s!.headline).toEqual({ viewport: "1280 x 800", theme: "light" });
    expect(s!.measured).toBe(2);
    expect(s!.passing).toBe(1);
    const p2 = s!.checks.find((c) => c.id === "P2")!;
    expect([p2.runs, p2.passedRuns, p2.passed]).toEqual([2, 1, false]);
    // The failing run is the one shown.
    expect(p2.shown?.check.value3d).toBe(320.5);
  });
});

describe("EquivalenceMonitor", () => {
  it("with no run: the sentence and nothing else (no table, no values)", () => {
    const { container } = render(<EquivalenceMonitor interfaceParity={null} full numbers={{ interface: 1 }} />);
    expect(screen.getByText(NO_PARITY_RUN)).toBeTruthy();
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toBe(NO_PARITY_RUN);
  });

  it("with a stored run: the run line and the real per-check values", async () => {
    const s = await readInterfaceParity(repo(FIXTURE));
    render(<EquivalenceMonitor interfaceParity={s} full numbers={{ interface: 1 }} />);
    // The denominator is every expected check, not only the measured ones (final review scoring-08).
    expect(screen.getByText(new RegExp(`Interface parity run: commit abcdef1, 1280 x 800 light; 1 of ${PARITY_CHECKS.length} checks pass; 1 fails, ${PARITY_CHECKS.length - 2} not measured \\(P3, P4,`))).toBeTruthy();
    const table = screen.getByRole("table");
    const p2 = within(table).getByRole("row", { name: /^P2\b/ });
    expect(within(p2).getAllByRole("cell").map((c) => c.textContent)).toEqual(["P2", expect.any(String), "322", "320.5", "1.5", "1", "1 of 2", "Fail"]);
    const p3 = within(table).getByRole("row", { name: /^P3\b/ });
    expect(within(p3).getByText("Not measured")).toBeTruthy();
    expect(screen.queryByText(NO_PARITY_RUN)).toBeNull();
  });
});

describe("a check with an unmeasured part is partial, never a pass", () => {
  const PARTIAL = {
    runId: "fixture-run-8",
    commit: "1234567abcdef",
    runs: [
      {
        viewport: { width: 1280, height: 800 },
        theme: "light",
        traditionKey: "ajrakh",
        checks: [
          { id: "P1", value2d: "match", value3d: "match", delta: 0, tolerance: 0, passed: true },
          { id: "P23", value2d: "hint a", value3d: "hint a", delta: "none", tolerance: 0, passed: true, notMeasured: ["onboarding screens: shown in neither condition"] },
        ],
      },
    ],
  };

  it("summarises the partial check apart from the passing ones", async () => {
    const s = await readInterfaceParity(repo(PARTIAL));
    const p23 = s!.checks.find((c) => c.id === "P23")!;
    expect([p23.status, p23.passed, p23.notMeasured]).toEqual(["partial", false, ["onboarding screens: shown in neither condition"]]);
    expect([s!.measured, s!.passing, s!.partial, s!.failing]).toEqual([2, 1, 1, 0]);
  });

  it("names it in the run line and the table, with what was not measured", async () => {
    const s = await readInterfaceParity(repo(PARTIAL));
    render(<EquivalenceMonitor interfaceParity={s} full numbers={{ interface: 1 }} />);
    expect(screen.getByText(new RegExp(`1 of ${PARITY_CHECKS.length} checks pass; 1 partly measured, ${PARITY_CHECKS.length - 2} not measured`))).toBeTruthy();
    const row = within(screen.getByRole("table")).getByRole("row", { name: /^P23\b/ });
    expect(within(row).getByText("Partial")).toBeTruthy();
    expect(within(row).getByText(/Not measured: onboarding screens/)).toBeTruthy();
  });
});

describe("a stored report older than the suite never reads as full parity (final review scoring-08)", () => {
  // A report measuring P1-P27 only, every one passing, from a working tree with uncommitted changes.
  const OLD = {
    runId: "fixture-run-9",
    commit: "92d2033faf0c+uncommitted",
    runs: [
      {
        viewport: { width: 1280, height: 800 },
        theme: "light",
        traditionKey: "ajrakh",
        checks: Array.from({ length: 27 }, (_, i) => ({ id: `P${i + 1}`, value2d: 1, value3d: 1, delta: 0, tolerance: 0, passed: true })),
      },
    ],
  };

  it("counts every expected check and names the ones no run measured", async () => {
    const s = await readInterfaceParity(repo(OLD));
    expect([s!.total, s!.measured, s!.passing]).toEqual([PARITY_CHECKS.length, 27, 27]);
    expect(s!.notMeasuredIds).toEqual(PARITY_CHECKS.map((c) => c.id).filter((id) => Number(id.slice(1)) > 27));
    render(<EquivalenceMonitor interfaceParity={s} />);
    expect(
      screen.getByText(
        `Interface parity run: commit 92d2033 with uncommitted changes, 1280 x 800 light; 27 of 33 checks pass; 6 not measured (P28, P29, P30, P31, P32, P33).`,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/27 of 27/)).toBeNull();
  });
});

describe("research pages feed the monitor only from the stored report", () => {
  const src = (rel: string) => readFileSync(path.join(process.cwd(), "src", "app", "(research)", "research", ...rel.split("/")), "utf8");
  for (const page of ["page.tsx", "parity/page.tsx"]) {
    it(`${page} passes readInterfaceParity() to EquivalenceMonitor, with no sample path`, () => {
      const s = src(page);
      expect(s).toMatch(/readInterfaceParity\(\)/);
      expect(s).toMatch(/<EquivalenceMonitor interfaceParity=\{iface\}/);
      // No sample, placeholder or fixture data source anywhere in the page code.
      expect(s).not.toMatch(/\b(?:SAMPLE|sample\w*Parity|placeholder\w*|fixture\w*|mock\w*)\s*[=(:]/);
      expect(s).not.toMatch(/import [^;]*(?:sample|fixture|mock)/i);
    });
  }
});
