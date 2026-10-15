/**
 * Server CSV of the dashboard's rows 3 and 4 (DESIGN.md 11.9; src/server/research/dashboard-extra-tables.ts):
 * gain by tradition, dwell time per layer and per-item statistics. A fake query function returns
 * stored rows; the CSV must carry the dashboard's `#` header with the metric versions, the
 * dictionary's columns in order, and the values the dashboard draws.
 */
import { describe, expect, it } from "vitest";

import { parseCsv } from "@/server/research/exports/csv";
import type { DashboardData } from "@/server/research/dashboard";
import type { Q } from "@/server/research/db";
import { dashboardExtraTableCsv } from "@/server/research/dashboard-extra-tables";
import { DASHBOARD_EXTRA_TABLE_BY_NAME, DASHBOARD_EXTRA_TABLE_NAMES } from "@/server/research/exports/dictionary";

const C2 = "c-2d";
const C3 = "c-3d";
const data = {
  generatedAt: "2026-10-15T00:00:00.000Z",
  study: { id: "s", slug: "fixture-study", nonExperimental: true },
  conditions: [
    { id: C2, code: "A", label: "2D", interface: "conventional_2d" },
    { id: C3, code: "B", label: "3D", interface: "immersive_3d" },
  ],
} as unknown as DashboardData;

/** Answers the three loaders by the metric they ask for. */
const q = {
  async query(sql: string) {
    if (sql.includes("JOIN traditions t")) {
      return {
        rows: [
          { condition_id: C2, session_id: "s1", kind: "pretest", slug: "sanganeri", name: "Sanganeri", value: 0 },
          { condition_id: C2, session_id: "s1", kind: "posttest", slug: "sanganeri", name: "Sanganeri", value: 1 },
          { condition_id: C2, session_id: "s1", kind: "pretest", slug: "ajrakh", name: "Ajrakh", value: 1 },
          { condition_id: C2, session_id: "s1", kind: "posttest", slug: "ajrakh", name: "Ajrakh", value: 1 },
        ],
      };
    }
    if (sql.includes("metric_version")) {
      return { rows: [{ condition_id: C3, session_id: "s2", metric_version: "1", by_layer: { overview: 120_000, artisan: 60_000 } }] };
    }
    return { rows: [{ condition_id: C2, code: "pre", version: 1, kind: "pretest", item_key: "q1", position: 0, value: 1 }] };
  },
} as unknown as Q;

describe("dashboard extra tables (server CSV)", () => {
  it("every extra table has a dictionary entry", () => {
    expect([...DASHBOARD_EXTRA_TABLE_BY_NAME.keys()].sort()).toEqual([...DASHBOARD_EXTRA_TABLE_NAMES].sort());
  });

  it("gain by tradition: canonical order, per condition, with the item.key_match version", async () => {
    const csv = await dashboardExtraTableCsv(q, data, "dashboard_tradition_gain");
    const [header, ...rest] = csv.split("\r\n");
    expect(header).toContain("# immersive-episteme dashboard table dashboard_tradition_gain");
    expect(header).toContain("metric versions: item.key_match@");
    const { columns, rows } = parseCsv(rest.join("\r\n"));
    expect(columns).toEqual(DASHBOARD_EXTRA_TABLE_BY_NAME.get("dashboard_tradition_gain")!.columns.map((c) => c.name));
    expect(rows.map((r) => `${r.tradition_slug} ${r.condition_code} ${r.n} ${r.mean}`)).toEqual(["ajrakh A 1 0", "ajrakh B 0 ", "sanganeri A 1 1", "sanganeri B 0 "]);
  });

  it("dwell time: mean minutes per layer and condition, with the stored metric version", async () => {
    const csv = await dashboardExtraTableCsv(q, data, "dashboard_dwell");
    expect(csv.split("\r\n")[0]).toContain("metric versions: time.exposure_by_layer_ms@1");
    const { rows } = parseCsv(csv.split("\r\n").slice(1).join("\r\n"));
    const overview3d = rows.find((r) => r.condition_code === "B" && r.layer === "overview");
    expect(overview3d?.mean_minutes).toBe("2");
    expect(rows.find((r) => r.condition_code === "B" && r.layer === "artisan")?.mean_minutes).toBe("1");
  });

  it("per-item statistics: proportion correct per item and condition", async () => {
    const csv = await dashboardExtraTableCsv(q, data, "dashboard_items");
    const { rows } = parseCsv(csv.split("\r\n").slice(1).join("\r\n"));
    expect(rows.map((r) => `${r.assessment} ${r.item_key} ${r.condition_code} ${r.n} ${r.correct}`)).toEqual(["pre v1 q1 A 1 1", "pre v1 q1 B 0 "]);
  });
});
