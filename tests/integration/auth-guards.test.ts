/**
 * Integration: the learning-condition guard and the participant-session guard, end to end
 * through real signed tokens (WebCrypto HMAC) and a StudySessionLookup.
 *
 * Part 1 uses an in-memory lookup so every branch is exercised without a database.
 * Part 2 runs the real Drizzle lookup against `study_sessions` in episteme_test (inside a
 * transaction that is rolled back; all rows are demo rows: slug `demo-*`, title `Demo:`).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@db/schema";
import type { Role } from "@/lib/permissions/roles";
import { publicDemoAllowed } from "@/server/auth/demo-policy";
import { signDemoSession } from "@/server/auth/demo-session";
import {
  resolveLearningAccess,
  resolveParticipantSession,
  type LearningAccessInput,
} from "@/server/auth/learning-decision";
import { signParticipantSession, verifyParticipantSession } from "@/server/auth/participant-session-token";
import { signToken } from "@/server/auth/signed-token";
import { drizzleStudySessionLookup } from "@/server/auth/study-session-lookup";
import type { StudySessionLookup, StudySessionRecord } from "@/server/auth/study-session-port-types";

const SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
const OTHER_SECRET = "another-secret-0123456789-abcdefghijklmnopqrstu";

const PID = "11111111-1111-4111-8111-111111111111";
const SID = "22222222-2222-4222-8222-222222222222";

function memoryLookup(records: StudySessionRecord[]): StudySessionLookup & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async findSession(id) {
      calls.push(id);
      return records.find((r) => r.sessionId === id) ?? null;
    },
  };
}

const running2d: StudySessionRecord = {
  sessionId: SID,
  participantId: PID,
  condition: "2d",
  status: "in_progress",
  participantStatus: "active",
  withdrawn: false,
};

const noStaff = async () => null;

function input(partial: Partial<LearningAccessInput> & Pick<LearningAccessInput, "condition">): LearningAccessInput {
  return { participantCookie: undefined, demoCookie: undefined, staff: noStaff, ...partial };
}

async function participantCookie(condition: "2d" | "immersive" = "2d", secret = SECRET, opts = {}) {
  return signParticipantSession({ participantId: PID, sessionId: SID, condition }, secret, opts);
}

/** Replace the payload of a signed token while keeping its original signature. */
function swapPayload(token: string, payload: unknown): string {
  const [v, , sig] = token.split(".");
  return `${v}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
}

describe("learning condition guard (in-memory study sessions)", () => {
  const deps = { secret: SECRET, lookup: memoryLookup([running2d]) };

  it("admits a participant to their assigned condition, flagged experimental", async () => {
    const d = await resolveLearningAccess(input({ condition: "2d", participantCookie: await participantCookie() }), deps);
    expect(d).toEqual({
      allowed: true,
      access: { kind: "participant", experimental: true, condition: "2d", participantId: PID, sessionId: SID },
    });
  });

  it("denies a participant with a 2d cookie on the immersive route and sends them to /study/session", async () => {
    const d = await resolveLearningAccess(
      input({ condition: "immersive", participantCookie: await participantCookie("2d") }),
      deps,
    );
    expect(d).toEqual({ allowed: false, reason: "condition_mismatch", redirectTo: "/study/session" });
  });

  it("a participant cookie decides even when a demo cookie and a staff session are also present", async () => {
    const staff = vi.fn(async () => ({ userId: "u1", roles: ["principal_investigator"] as Role[] }));
    const d = await resolveLearningAccess(
      {
        condition: "immersive",
        participantCookie: await participantCookie("2d"),
        demoCookie: await signDemoSession(SECRET),
        staff,
      },
      deps,
    );
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toBe("condition_mismatch");
    expect(staff).not.toHaveBeenCalled();
  });

  describe("tampered or foreign participant cookies are refused", () => {
    it.each([
      [
        "condition rewritten (2d -> immersive) with the original signature",
        async () => {
          const t = await participantCookie("2d");
          const payload = JSON.parse(Buffer.from(t.split(".")[1]!, "base64url").toString());
          return swapPayload(t, { ...payload, cond: "immersive" });
        },
      ],
      ["signed with another secret", () => participantCookie("immersive", OTHER_SECRET)],
      [
        "signature byte flipped",
        async () => {
          const t = await participantCookie("immersive");
          const last = t.at(-2) === "A" ? "B" : "A";
          return `${t.slice(0, -2)}${last}${t.at(-1)}`;
        },
      ],
      ["a demo token presented as a participant cookie", () => signDemoSession(SECRET)],
      [
        "same secret, different purpose",
        () =>
          signToken(
            { t: "participant", pid: PID, sid: SID, cond: "immersive", iat: 1, exp: 9_999_999_999 },
            SECRET,
            "public-demo/v1",
          ),
      ],
      ["garbage", async () => "not-a-token"],
      ["empty", async () => ""],
      ["wrong version", async () => (await participantCookie("immersive")).replace(/^v1\./, "v2.")],
    ])("%s", async (_label, make) => {
      const cookie = await make();
      const d = await resolveLearningAccess(input({ condition: "immersive", participantCookie: cookie }), deps);
      expect(d).toMatchObject({ allowed: false, reason: "invalid_participant_session" });
      expect(d.allowed === false && d.redirectTo).toBe("/study/exit?reason=invalid-session");
    });
  });

  it("refuses an expired participant cookie", async () => {
    const issued = Math.floor(Date.now() / 1000) - 10_000;
    const cookie = await participantCookie("2d", SECRET, { now: issued, ttlSeconds: 60 });
    const d = await resolveLearningAccess(input({ condition: "2d", participantCookie: cookie }), deps);
    expect(d).toMatchObject({ allowed: false, reason: "invalid_participant_session" });
    expect((await verifyParticipantSession(cookie, SECRET)).ok).toBe(false);
  });

  it.each<[string, Partial<StudySessionRecord> | null, string]>([
    ["session row missing", null, "invalid_participant_session"],
    ["session belongs to another participant", { participantId: "someone-else" }, "invalid_participant_session"],
    ["database reassigned the session to the other condition", { condition: "immersive" }, "invalid_participant_session"],
    ["session not started yet", { status: "scheduled" }, "session_not_started"],
    ["session completed", { status: "completed" }, "session_not_active"],
    ["session abandoned", { status: "abandoned" }, "session_not_active"],
    ["session withdrawn", { withdrawn: true }, "session_not_active"],
    ["participant withdrawn", { participantStatus: "withdrawn" }, "session_not_active"],
    ["participant excluded", { participantStatus: "excluded" }, "session_not_active"],
  ])("re-validates against study_sessions: %s", async (_label, patch, reason) => {
    const lookup = memoryLookup(patch === null ? [] : [{ ...running2d, ...patch }]);
    const d = await resolveLearningAccess(
      input({ condition: "2d", participantCookie: await participantCookie("2d") }),
      { secret: SECRET, lookup },
    );
    expect(d).toMatchObject({ allowed: false, reason });
    expect(lookup.calls).toEqual([SID]);
  });

  it("public demo is admitted to either condition and flagged non-experimental", async () => {
    const demo = await signDemoSession(SECRET);
    for (const condition of ["2d", "immersive"] as const) {
      const d = await resolveLearningAccess(input({ condition, demoCookie: demo }), deps);
      expect(d.allowed).toBe(true);
      if (d.allowed) {
        expect(d.access.kind).toBe("demo");
        expect(d.access.experimental).toBe(false);
        expect(d.access.condition).toBe(condition);
      }
    }
  });

  it.each([
    ["tampered demo cookie", async () => swapPayload(await signDemoSession(SECRET), { t: "demo", x: true })],
    ["demo cookie from another secret", () => signDemoSession(OTHER_SECRET)],
    ["participant token presented as a demo cookie", () => participantCookie("2d")],
    [
      "expired demo cookie",
      () => signDemoSession(SECRET, { now: Math.floor(Date.now() / 1000) - 10_000, ttlSeconds: 60 }),
    ],
  ])("refuses a %s", async (_label, make) => {
    const d = await resolveLearningAccess(input({ condition: "2d", demoCookie: await make() }), deps);
    expect(d).toEqual({ allowed: false, reason: "no_access", redirectTo: "/study" });
  });

  it("public demo stops working when the server-side demo policy is off, in any browser", async () => {
    const demo = await signDemoSession(SECRET);
    const off = { ...deps, demoEnabled: async () => false };
    for (const condition of ["2d", "immersive"] as const) {
      expect(await resolveLearningAccess(input({ condition, demoCookie: demo }), off)).toEqual({
        allowed: false,
        reason: "demo_unavailable",
        redirectTo: "/explore?demo=unavailable",
      });
    }
    // Staff preview is unaffected by the demo policy.
    const staffOnly = await resolveLearningAccess(
      input({ condition: "2d", demoCookie: demo, staff: async () => ({ userId: "u1", roles: ["researcher"] }) }),
      off,
    );
    expect(staffOnly).toMatchObject({ allowed: true, access: { kind: "staff_preview" } });
  });

  it("demo policy: auto is off while a real study runs; on/off force it", () => {
    expect(publicDemoAllowed("auto", false)).toBe(true);
    expect(publicDemoAllowed("auto", true)).toBe(false);
    expect(publicDemoAllowed("on", true)).toBe(true);
    expect(publicDemoAllowed("off", false)).toBe(false);
  });

  it("staff preview is admitted and flagged non-experimental", async () => {
    const d = await resolveLearningAccess(
      input({ condition: "immersive", staff: async () => ({ userId: "u1", roles: ["content_editor"] }) }),
      deps,
    );
    expect(d).toEqual({
      allowed: true,
      access: { kind: "staff_preview", experimental: false, condition: "immersive", userId: "u1" },
    });
  });

  it("a principal without a staff role never gets staff preview", async () => {
    for (const roles of [[], ["public"], ["participant"]] as Role[][]) {
      const d = await resolveLearningAccess(input({ condition: "2d", staff: async () => ({ userId: "u", roles }) }), deps);
      expect(d).toMatchObject({ allowed: false, reason: "no_access" });
    }
  });

  it("nobody: no access, redirect to /study", async () => {
    const d = await resolveLearningAccess(input({ condition: "immersive" }), deps);
    expect(d).toEqual({ allowed: false, reason: "no_access", redirectTo: "/study" });
  });
});

describe("participant session guard for /study steps (in-memory)", () => {
  it("admits a live session regardless of route condition, including a scheduled one", async () => {
    for (const status of ["scheduled", "in_progress"] as const) {
      const d = await resolveParticipantSession(await participantCookie("2d"), {
        secret: SECRET,
        lookup: memoryLookup([{ ...running2d, status }]),
      });
      expect(d).toEqual({ allowed: true, participant: { participantId: PID, sessionId: SID, condition: "2d" } });
    }
  });

  it.each<[string, string | undefined, StudySessionRecord[], string]>([
    ["no cookie", undefined, [running2d], "/study"],
    ["bad cookie", "v1.e30.AAAA", [running2d], "/study/exit?reason=invalid-session"],
    ["unknown session", "VALID", [], "/study/exit?reason=invalid-session"],
    ["completed session", "VALID", [{ ...running2d, status: "completed" }], "/study/exit?reason=session-ended"],
    ["withdrawn session", "VALID", [{ ...running2d, withdrawn: true }], "/study/exit?reason=session-ended"],
    ["excluded participant", "VALID", [{ ...running2d, participantStatus: "excluded" }], "/study/exit?reason=session-ended"],
  ])("denies: %s", async (_label, cookie, records, redirectTo) => {
    const value = cookie === "VALID" ? await participantCookie("2d") : cookie;
    const d = await resolveParticipantSession(value, { secret: SECRET, lookup: memoryLookup(records) });
    expect(d).toEqual({ allowed: false, redirectTo });
  });
});

// ---------------------------------------------------------------------------------------------
// Part 2: the Drizzle lookup against study_sessions
// ---------------------------------------------------------------------------------------------

const testUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testUrl)("learning guard with the Drizzle study-session lookup (episteme_test)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testUrl, max: 2 });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("reads condition, status and withdrawal from the database", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // This test is about the lookup query, not the study engine's lifecycle rules (an active
      // study needs a published snapshot, ...). Skip user triggers for this transaction only;
      // CHECK constraints, enums and NOT NULL still apply. Rolled back below.
      await client.query("SET LOCAL session_replication_role = replica");
      const db = drizzle(client, { schema, casing: "snake_case" });

      const [study] = await db
        .insert(schema.studies)
        .values({
          slug: "demo-auth-guard-test",
          title: "Demo: auth guard integration test",
          protocolVersion: "test-1",
          design: "between",
          isDemo: true,
        })
        .returning({ id: schema.studies.id });
      const [cond2d, condImm] = await db
        .insert(schema.studyConditions)
        .values([
          { studyId: study!.id, code: "conventional", label: "Demo: 2D", interface: "conventional_2d" },
          { studyId: study!.id, code: "immersive", label: "Demo: 3D", interface: "immersive_3d", position: 1 },
        ])
        .returning({ id: schema.studyConditions.id });
      const [participant] = await db
        .insert(schema.participants)
        .values({ studyId: study!.id, code: "P-auth-001", status: "active" })
        .returning({ id: schema.participants.id });
      const [allocation] = await db
        .insert(schema.allocations)
        .values({
          studyId: study!.id,
          participantId: participant!.id,
          conditionId: cond2d!.id,
          algorithm: "manual",
          overrideReason: "integration test",
          seed: "test",
          sequenceIndex: 0,
          studyProtocolVersion: "test-1",
        })
        .returning({ id: schema.allocations.id });
      const [session] = await db
        .insert(schema.studySessions)
        .values({
          studyId: study!.id,
          participantId: participant!.id,
          conditionId: cond2d!.id,
          allocationId: allocation!.id,
          appBuild: "test",
          status: "in_progress",
          startedAt: new Date(),
        })
        .returning({ id: schema.studySessions.id });
      expect(condImm).toBeDefined();

      const lookup = drizzleStudySessionLookup(db);
      expect(await lookup.findSession(session!.id)).toEqual({
        sessionId: session!.id,
        participantId: participant!.id,
        condition: "2d",
        status: "in_progress",
        participantStatus: "active",
        withdrawn: false,
      });
      expect(await lookup.findSession("not-a-uuid")).toBeNull();
      expect(await lookup.findSession("00000000-0000-4000-8000-000000000000")).toBeNull();

      const cookie = await signParticipantSession(
        { participantId: participant!.id, sessionId: session!.id, condition: "2d" },
        SECRET,
      );
      const deps = { secret: SECRET, lookup };

      expect(await resolveLearningAccess(input({ condition: "2d", participantCookie: cookie }), deps)).toMatchObject({
        allowed: true,
        access: { kind: "participant", experimental: true },
      });
      expect(
        await resolveLearningAccess(input({ condition: "immersive", participantCookie: cookie }), deps),
      ).toMatchObject({ allowed: false, reason: "condition_mismatch", redirectTo: "/study/session" });

      // Withdrawal in the database takes effect on the next request, cookie unchanged.
      await client.query("UPDATE study_sessions SET withdrawn = true, withdrawn_at = now() WHERE id = $1", [
        session!.id,
      ]);
      expect(await resolveLearningAccess(input({ condition: "2d", participantCookie: cookie }), deps)).toMatchObject({
        allowed: false,
        reason: "session_not_active",
      });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
