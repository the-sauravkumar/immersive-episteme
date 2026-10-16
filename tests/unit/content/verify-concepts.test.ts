/**
 * scripts/content/verify-concepts.ts: verifies only the listed concepts, through the CMS
 * `transition()` service with all four evidence checks and a reason; refuses demo content,
 * unknown and duplicate keys; the dry run changes nothing and reports every refusal.
 * And scripts/content/create-curator.ts: the password file must be outside the repository.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { CmsError, type Actor } from "@/server/cms/core";
import { EVIDENCE_CHECK_KEYS } from "@/server/cms/schemas";

import { generatePassword, parseRole, passwordFileProblem } from "../../../scripts/content/create-curator";
import { evidenceProblem, parseKeysFile, recordedReason, runVerification, type ConceptRow, type Deps } from "../../../scripts/content/verify-concepts";

const ROOT = join(__dirname, "..", "..", "..");
const CURATOR: Actor = { userId: "u-curator", roles: ["curator"] };
const EDITOR: Actor = { userId: "u-editor", roles: ["content_editor"] };

const row = (key: string, over: Partial<ConceptRow> = {}): ConceptRow => ({
  id: `id-${key}`,
  key,
  verification_state: "under_review",
  is_demo: false,
  tradition_slug: key.split(".")[0]!,
  tradition_is_demo: false,
  ...over,
});

/** A fake pool: answers only the concept lookup, and records every query it is sent. */
function fakePool(rows: ConceptRow[]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (/FROM concepts c/.test(sql)) {
        const keys = params[0] as string[];
        return { rows: rows.filter((r) => keys.includes(r.key)), rowCount: 0 };
      }
      throw new Error(`unexpected query: ${sql}`);
    }),
  };
  return { pool: pool as unknown as Pool, queries };
}

function fakeDeps(over: Partial<Deps> = {}): Deps & { transition: ReturnType<typeof vi.fn> } {
  return {
    transition: vi.fn(async () => ({ from: "under_review", to: "verified", kind: "verify" })),
    authorsOf: vi.fn(async () => new Set<string>()),
    citationProblems: vi.fn(async () => []),
    ...over,
  } as Deps & { transition: ReturnType<typeof vi.fn> };
}

const req = (keys: string[]) => ({ keys, evidence: "https://example.org/verification-sheet", reason: "Checked against the source sheet" });

describe("verify-concepts", () => {
  it("applies transition() to every listed concept with all four checks and a reason carrying the evidence link", async () => {
    const { pool } = fakePool([row("ajrakh.tool.wooden-blocks"), row("sanganeri.tool.bunta-wooden-block")]);
    const deps = fakeDeps();
    const out = await runVerification(pool, CURATOR, req(["ajrakh.tool.wooden-blocks", "sanganeri.tool.bunta-wooden-block"]), { apply: true, deps });
    expect(out.map((o) => o.status)).toEqual(["verified", "verified"]);
    expect(deps.transition).toHaveBeenCalledTimes(2);
    for (const call of deps.transition.mock.calls) {
      const [p, actor, input] = call as [Pool, Actor, { entityKind: string; to: string; reason: string; evidenceChecked: string[] }];
      expect(p).toBe(pool);
      expect(actor).toBe(CURATOR);
      expect(input.entityKind).toBe("concept");
      expect(input.to).toBe("verified");
      expect(input.evidenceChecked).toEqual(EVIDENCE_CHECK_KEYS);
      expect(input.reason).toBe("Checked against the source sheet [evidence: https://example.org/verification-sheet]");
    }
  });

  it("never touches a concept whose key is not listed", async () => {
    const { pool, queries } = fakePool([row("ajrakh.tool.wooden-blocks"), row("ajrakh.tool.copper-dye-pot")]);
    const deps = fakeDeps();
    await runVerification(pool, CURATOR, req(["ajrakh.tool.wooden-blocks"]), { apply: true, deps });
    expect(queries).toHaveLength(1);
    expect(queries[0]!.params[0]).toEqual(["ajrakh.tool.wooden-blocks"]);
    expect(deps.transition).toHaveBeenCalledTimes(1);
    expect((deps.transition.mock.calls[0] as unknown[])[2]).toMatchObject({ entityId: "id-ajrakh.tool.wooden-blocks" });
  });

  it("refuses demo concepts, concepts of demo traditions, unknown and duplicate keys without calling the service", async () => {
    const { pool } = fakePool([
      row("demo-craft.tool.block", { is_demo: true, tradition_slug: "demo-craft", tradition_is_demo: true }),
      row("ajrakh.tool.wooden-blocks"),
    ]);
    const deps = fakeDeps();
    const out = await runVerification(pool, CURATOR, req(["demo-craft.tool.block", "ajrakh.tool.missing", "ajrakh.tool.wooden-blocks", "ajrakh.tool.wooden-blocks"]), { apply: true, deps });
    expect(out.map((o) => o.status)).toEqual(["refused", "refused", "verified", "refused"]);
    const reasons = out.flatMap((o) => (o.status === "refused" ? o.reasons : []));
    expect(reasons.join("\n")).toMatch(/demo concept/);
    expect(reasons.join("\n")).toMatch(/demo tradition \(demo-craft\)/);
    expect(reasons.join("\n")).toMatch(/no concept with this key/);
    expect(reasons.join("\n")).toMatch(/listed more than once/);
    expect(deps.transition).toHaveBeenCalledTimes(1);
  });

  it("reports the service's refusals (with their details) and carries on with the next concept", async () => {
    const { pool } = fakePool([row("ajrakh.tool.wooden-blocks"), row("sanganeri.tool.bunta-wooden-block")]);
    const deps = fakeDeps({
      transition: vi.fn(async (_p: Pool, _a: Actor, input: { entityId: string }) => {
        if (input.entityId === "id-ajrakh.tool.wooden-blocks") {
          throw new CmsError("citation_incomplete", "The citations are incomplete.", 422, [{ code: "claim_no_locator", message: "Claim 1: 1 citation(s) without a page or locator." }]);
        }
        return { from: "under_review", to: "verified", kind: "verify" };
      }) as unknown as Deps["transition"],
    });
    const out = await runVerification(pool, CURATOR, req(["ajrakh.tool.wooden-blocks", "sanganeri.tool.bunta-wooden-block"]), { apply: true, deps });
    expect(out[0]).toMatchObject({ status: "refused", reasons: ["citation_incomplete: The citations are incomplete.", "claim_no_locator: Claim 1: 1 citation(s) without a page or locator."] });
    expect(out[1]).toMatchObject({ status: "verified" });
  });

  it("rethrows anything that is not a CmsError (a broken database is not a refusal)", async () => {
    const { pool } = fakePool([row("ajrakh.tool.wooden-blocks")]);
    const deps = fakeDeps({ transition: vi.fn(async () => { throw new Error("connection lost"); }) as unknown as Deps["transition"] });
    await expect(runVerification(pool, CURATOR, req(["ajrakh.tool.wooden-blocks"]), { apply: true, deps })).rejects.toThrow("connection lost");
  });

  it("dry run changes nothing and reports every refusal: state, permission, separation of duties, citations", async () => {
    const { pool } = fakePool([row("ajrakh.tool.wooden-blocks"), row("ajrakh.tool.copper-dye-pot", { verification_state: "draft" })]);
    const deps = fakeDeps({
      authorsOf: vi.fn(async () => new Set([EDITOR.userId])) as unknown as Deps["authorsOf"],
      citationProblems: vi.fn(async () => [{ code: "claim_no_quote", message: "Claim 2: 1 citation(s) without a verbatim evidence passage of their own." }]) as unknown as Deps["citationProblems"],
    });
    const out = await runVerification(pool, EDITOR, req(["ajrakh.tool.wooden-blocks", "ajrakh.tool.copper-dye-pot"]), { apply: false, deps });
    expect(deps.transition).not.toHaveBeenCalled();
    expect(out[0]!.status).toBe("refused");
    const r0 = out[0]!.status === "refused" ? out[0]!.reasons.join("\n") : "";
    expect(r0).toMatch(/lacks content.verify/);
    expect(r0).toMatch(/separation of duties/);
    expect(r0).toMatch(/claim_no_quote/);
    const r1 = out[1]!.status === "refused" ? out[1]!.reasons.join("\n") : "";
    expect(r1).toMatch(/state is draft/);
  });

  it("dry run reports would_verify when nothing blocks", async () => {
    const { pool } = fakePool([row("ajrakh.tool.wooden-blocks")]);
    const deps = fakeDeps();
    const out = await runVerification(pool, CURATOR, req(["ajrakh.tool.wooden-blocks"]), { apply: false, deps });
    expect(out).toEqual([{ key: "ajrakh.tool.wooden-blocks", status: "would_verify", id: "id-ajrakh.tool.wooden-blocks" }]);
  });

  it("parses the keys file strictly", () => {
    expect(parseKeysFile('["ajrakh.tool.wooden-blocks"]')).toEqual(["ajrakh.tool.wooden-blocks"]);
    expect(parseKeysFile('{"keys":["machilipatnam-kalamkari.process_stage.dye-boiling"]}')).toEqual(["machilipatnam-kalamkari.process_stage.dye-boiling"]);
    expect(() => parseKeysFile("[]")).toThrow(/no concepts/);
    expect(() => parseKeysFile('["not a key"]')).toThrow(/not concept keys/);
    expect(() => parseKeysFile('{"other":1}')).toThrow(/JSON array/);
    expect(() => parseKeysFile("nope")).toThrow(/not valid JSON/);
  });

  it("requires an evidence link (https URL or an existing repository path) and a reason", () => {
    expect(evidenceProblem("https://example.org/x", ROOT)).toBeNull();
    expect(evidenceProblem("package.json", ROOT)).toBeNull();
    expect(evidenceProblem(undefined, ROOT)).toMatch(/give --evidence/);
    expect(evidenceProblem("http://example.org/x", ROOT)).toMatch(/https URL/);
    expect(evidenceProblem("../outside.md", ROOT)).toMatch(/inside the repository/);
    expect(evidenceProblem("docs/no-such-file.md", ROOT)).toMatch(/not found/);
    expect(() => recordedReason("", "https://example.org")).toThrow(/--reason/);
    expect(() => recordedReason("x".repeat(2000), "https://example.org")).toThrow(/exceeds/);
  });
});

describe("create-curator", () => {
  it("refuses a password file inside the repository and accepts one outside", () => {
    expect(passwordFileProblem(join(ROOT, "curator.txt"), ROOT)).toMatch(/outside the repository/);
    expect(passwordFileProblem(join(ROOT, "docs", "x.txt"), ROOT)).toMatch(/outside the repository/);
    expect(passwordFileProblem(ROOT, ROOT)).toMatch(/outside the repository/);
    expect(passwordFileProblem(undefined, ROOT)).toMatch(/--password-file/);
    const outside = mkdtempSync(join(tmpdir(), "curator-"));
    expect(passwordFileProblem(join(outside, "pw.txt"), ROOT)).toBeNull();
    rmSync(outside, { recursive: true, force: true });
  });

  it("generates long, distinct passwords and accepts only staff roles", () => {
    const a = generatePassword();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(generatePassword()).not.toBe(a);
    expect(parseRole("curator")).toBe("curator");
    expect(() => parseRole("participant")).toThrow(/unknown role/);
  });
});
