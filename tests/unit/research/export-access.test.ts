/**
 * Export scope by role (permission matrix) and the CSV dialect used by exports.
 */
import { describe, expect, it } from "vitest";

import { ExportForbiddenError, resolveExportScope } from "@/server/research/exports/access";
import { parseCsv, toCsv } from "@/server/research/exports/csv";
import { EXPORT_TABLES } from "@/server/research/exports/dictionary";

describe("export scope", () => {
  it("gives analysts and researchers pseudonymised data only", () => {
    for (const role of ["research_analyst", "researcher"] as const) {
      expect(resolveExportScope({ roles: [role] }, "pseudonymised")).toBe("pseudonymised");
      expect(() => resolveExportScope({ roles: [role] }, "identified")).toThrow(ExportForbiddenError);
    }
  });

  it("lets only the principal investigator receive identified exports", () => {
    expect(resolveExportScope({ roles: ["principal_investigator"] }, "identified")).toBe("identified");
    expect(() => resolveExportScope({ roles: ["study_facilitator"] }, "pseudonymised")).toThrow(ExportForbiddenError);
    expect(() => resolveExportScope({ roles: ["curator"] }, "pseudonymised")).toThrow(ExportForbiddenError);
    expect(() => resolveExportScope(null, "pseudonymised")).toThrow(ExportForbiddenError);
  });

  it("keeps consent records and annotations out of the pseudonymised dictionary", () => {
    const identifiedOnly = EXPORT_TABLES.filter((t) => t.identifiedOnly).map((t) => t.name);
    expect(identifiedOnly.sort()).toEqual(["annotations", "consent_records"]);
    const columns = EXPORT_TABLES.flatMap((t) => t.columns.map((c) => c.name));
    for (const banned of ["email", "name", "access_token_hash", "ip", "ip_hash"]) expect(columns).not.toContain(banned);
  });
});

describe("CSV", () => {
  it("round-trips quotes, commas, newlines, JSON cells and nulls", () => {
    const rows = [
      { a: 'say "hi", then\r\nleave', b: { x: [1, 2] }, c: null, d: 3.5, e: true },
      { a: " padded ", b: [], c: "", d: 0, e: false },
    ];
    const text = toCsv(rows, ["a", "b", "c", "d", "e"]);
    const back = parseCsv(text);
    expect(back.columns).toEqual(["a", "b", "c", "d", "e"]);
    expect(back.rows).toEqual([
      { a: 'say "hi", then\r\nleave', b: '{"x":[1,2]}', c: "", d: "3.5", e: "true" },
      { a: " padded ", b: "[]", c: "", d: "0", e: "false" },
    ]);
  });
});
