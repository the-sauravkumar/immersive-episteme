/**
 * Invite gate (deployment source change S11): codes, the signed cookie, the gate paths and the
 * service's SQL contract (with a fake query function; the database rules themselves are in
 * migration 0020 and need an integration run).
 */
import { describe, expect, it } from "vitest";

import { INVITE_PATH, inviteNextPath, invitePath, isInviteExemptPath, withoutInviteParam } from "@/lib/access/invite-paths";
import { generateInviteCode, hashInviteCode, inviteCodeHint, normaliseInviteCode } from "@/server/access/invite-code";
import { INVITE_ACCESS_TTL_SECONDS, signInviteAccess, verifyInviteAccess } from "@/server/access/invite-cookie";
import { createInviteInput, endOfUtcDay, inviteNotRevoked, inviteStatus, redeemInvite } from "@/server/access/invites";
import { signDemoSession } from "@/server/auth/demo-session";

const SECRET = "s".repeat(20) + "abcdefghijklmnopqrstuvwxyz0123456789";
const ID = "0190f3a4-1b2c-7d3e-8f40-123456789abc";

describe("invite codes", () => {
  it("generates 20 Crockford symbols in groups of four, all different", () => {
    const codes = new Set(Array.from({ length: 200 }, generateInviteCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
  });

  it("normalises case, dashes, spaces and the folded letters, and rejects anything else", () => {
    const code = generateInviteCode();
    const canonical = code.replaceAll("-", "");
    expect(normaliseInviteCode(code)).toBe(canonical);
    expect(normaliseInviteCode(` ${code.toLowerCase().replaceAll("-", " ")} `)).toBe(canonical);
    expect(normaliseInviteCode("O1IL".repeat(5))).toBe("0111".repeat(5));
    expect(normaliseInviteCode("ABCD-EFGH")).toBeNull();
    expect(normaliseInviteCode("U".repeat(20))).toBeNull(); // U is not in the alphabet
    expect(normaliseInviteCode(42)).toBeNull();
    expect(normaliseInviteCode("A".repeat(65))).toBeNull();
  });

  it("stores a SHA-256 hex hash and a four-character hint, never the code", () => {
    const n = normaliseInviteCode(generateInviteCode())!;
    expect(hashInviteCode(n)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteCode(n)).not.toContain(n.toLowerCase());
    expect(inviteCodeHint(n)).toBe(n.slice(-4));
    expect(inviteCodeHint(n)).toMatch(/^[0-9A-Z]{4}$/);
  });
});

describe("invite cookie", () => {
  it("round-trips the invite id and expires after its TTL", async () => {
    const now = 1_800_000_000;
    const token = await signInviteAccess(ID, SECRET, { now });
    const ok = await verifyInviteAccess(token, SECRET, { now: now + 10 });
    expect(ok).toEqual({ ok: true, claims: { inviteId: ID, issuedAt: now, expiresAt: now + INVITE_ACCESS_TTL_SECONDS } });
    expect(await verifyInviteAccess(token, SECRET, { now: now + INVITE_ACCESS_TTL_SECONDS })).toMatchObject({ ok: false, reason: "expired" });
  });

  it("refuses a tampered token, another secret, no secret, and a token minted for another purpose", async () => {
    const token = await signInviteAccess(ID, SECRET);
    const [v, body, sig] = token.split(".") as [string, string, string];
    const forged = Buffer.from(JSON.stringify({ t: "invite", iid: "0190f3a4-1b2c-7d3e-8f40-ffffffffffff", iat: 1, exp: 9_999_999_999 })).toString("base64url");
    expect((await verifyInviteAccess(`${v}.${forged}.${sig}`, SECRET)).ok).toBe(false);
    expect((await verifyInviteAccess(`${v}.${body}.${sig.slice(0, -2)}AA`, SECRET)).ok).toBe(false);
    expect((await verifyInviteAccess(token, `${SECRET}x`)).ok).toBe(false);
    expect(await verifyInviteAccess(token, "")).toMatchObject({ ok: false, reason: "no_secret" });
    expect((await verifyInviteAccess(await signDemoSession(SECRET), SECRET)).ok).toBe(false);
  });
});

describe("invite gate paths", () => {
  it("exempts sign-in, the invite page, staff home, APIs and static assets only", () => {
    for (const p of ["/invite", "/invite/redeem", "/sign-in", "/sign-out", "/forbidden", "/console", "/api/auth/ok", "/api/telemetry/batch", "/_next/static/x.js", "/museum/textures/a.ktx2", "/favicon.ico"]) {
      expect(isInviteExemptPath(p), p).toBe(true);
    }
    for (const p of ["/", "/explore", "/study", "/study/consent", "/learn/2d", "/learn/immersive", "/about", "/figures/x", "/invitex", "/museumx", "/apix"]) {
      expect(isInviteExemptPath(p), p).toBe(false);
    }
  });

  it("builds the invite page URL with a safe next path and never loops back to /invite", () => {
    expect(invitePath("/")).toBe(INVITE_PATH);
    expect(invitePath("/study?code=demo-x")).toBe("/invite?next=%2Fstudy%3Fcode%3Ddemo-x");
    expect(invitePath("/learn/2d", "invalid")).toBe("/invite?next=%2Flearn%2F2d&error=invalid");
    expect(invitePath("//evil.example/x")).toBe(INVITE_PATH);
    expect(inviteNextPath("/invite?next=/x")).toBe("/");
    expect(inviteNextPath("https://evil.example/")).toBe("/");
    expect(inviteNextPath("/study?code=a")).toBe("/study?code=a");
  });

  it("removes only the invite parameter from the address", () => {
    expect(withoutInviteParam(new URL("http://h/study?code=demo-x&invite=ABCD"))).toBe("/study?code=demo-x");
    expect(withoutInviteParam(new URL("http://h/?invite=ABCD"))).toBe("/");
  });
});

/** A fake query function that records SQL and answers from a script. */
function fakeQ(answer: (sql: string, params: unknown[]) => { rows: unknown[]; rowCount?: number }) {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const r = answer(sql, params);
      return { rows: r.rows, rowCount: r.rowCount ?? r.rows.length };
    },
  };
}

describe("invite service", () => {
  it("redeems with one conditional UPDATE keyed on the hash (revoked, expired and used-up codes refused in SQL)", async () => {
    const code = generateInviteCode();
    const q = fakeQ(() => ({ rows: [{ id: ID }] }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural fake of pg's query
    expect(await redeemInvite(q as any, code.toLowerCase())).toEqual({ ok: true, inviteId: ID });
    expect(q.calls).toHaveLength(1);
    const { sql, params } = q.calls[0]!;
    expect(sql).toMatch(/UPDATE invite_codes\s+SET use_count = use_count \+ 1/);
    expect(sql).toContain("revoked_at IS NULL");
    expect(sql).toContain("expires_at IS NULL OR expires_at > now()");
    expect(sql).toContain("max_uses IS NULL OR use_count < max_uses");
    expect(params).toEqual([hashInviteCode(normaliseInviteCode(code)!)]);
  });

  it("refuses an unknown code and never queries for a malformed one", async () => {
    const none = fakeQ(() => ({ rows: [] }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await redeemInvite(none as any, generateInviteCode())).toEqual({ ok: false, reason: "refused" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await redeemInvite(none as any, "SMOKE-INVALID-x")).toEqual({ ok: false, reason: "malformed" });
    expect(none.calls).toHaveLength(1);
  });

  it("checks revocation by id (server-side half of the gate)", async () => {
    const live = fakeQ(() => ({ rows: [{}] }));
    const gone = fakeQ(() => ({ rows: [] }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await inviteNotRevoked(live as any, ID)).toBe(true);
    expect(live.calls[0]!.sql).toContain("revoked_at IS NULL");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await inviteNotRevoked(gone as any, ID)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await inviteNotRevoked(live as any, "not-a-uuid")).toBe(false);
  });

  it("validates the create form: label required, optional limit, day and study", () => {
    expect(createInviteInput.parse({ label: " Pilot cohort A ", maxUses: "", expiresOn: "", studyId: "" })).toEqual({ label: "Pilot cohort A" });
    expect(createInviteInput.parse({ label: "Reviewers", maxUses: "5", expiresOn: "2026-12-31", studyId: ID })).toEqual({
      label: "Reviewers",
      maxUses: 5,
      expiresOn: "2026-12-31",
      studyId: ID,
    });
    expect(createInviteInput.safeParse({ label: "" }).success).toBe(false);
    expect(createInviteInput.safeParse({ label: "x", maxUses: "0" }).success).toBe(false);
    expect(createInviteInput.safeParse({ label: "x", maxUses: "1.5" }).success).toBe(false);
    expect(createInviteInput.safeParse({ label: "x", expiresOn: "31/12/2026" }).success).toBe(false);
    expect(endOfUtcDay("2026-12-31").toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  it("derives the status shown in Admin -> Access", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    const base = { revokedAt: null, expiresAt: null, maxUses: null, useCount: 3 };
    expect(inviteStatus(base, now)).toBe("active");
    expect(inviteStatus({ ...base, maxUses: 3 }, now)).toBe("used_up");
    expect(inviteStatus({ ...base, expiresAt: "2026-10-16T11:59:59Z" }, now)).toBe("expired");
    expect(inviteStatus({ ...base, revokedAt: "2026-10-01T00:00:00Z", maxUses: 3 }, now)).toBe("revoked");
  });
});
