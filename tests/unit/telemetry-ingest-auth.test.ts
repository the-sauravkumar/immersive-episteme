/**
 * Telemetry upload principal (who is writing) and the per-principal rate limiter.
 */
import { describe, expect, it } from "vitest";

import { signDemoSession } from "@/server/auth/demo-session";
import { signParticipantSession } from "@/server/auth/participant-session-token";
import { principalKey, resolveTelemetryPrincipal } from "@/server/telemetry/principal";
import { TokenBucketLimiter } from "@/server/telemetry/rate-limit";

const SECRET = "unit-test-secret-0123456789-abcdefghijklmnop";
const sid = "0190c1d2-0000-7000-8000-000000000001";
const pid = "0190c1d2-0000-7000-8000-000000000002";
const staff = (roles: string[]) => async () => ({ userId: "u1", roles });
const none = async () => null;

describe("telemetry principal", () => {
  it("a valid participant cookie decides, even with demo and staff credentials present", async () => {
    const participantCookie = await signParticipantSession({ participantId: pid, sessionId: sid, condition: "2d" }, SECRET);
    const demoCookie = await signDemoSession(SECRET);
    const r = await resolveTelemetryPrincipal({ participantCookie, demoCookie, staff: staff(["curator"]) }, { secret: SECRET });
    expect(r).toEqual({ ok: true, principal: { kind: "participant", participantId: pid, sessionId: sid } });
  });

  it("an invalid participant cookie is refused, never downgraded to demo or preview", async () => {
    const demoCookie = await signDemoSession(SECRET);
    const r = await resolveTelemetryPrincipal({ participantCookie: "forged.token", demoCookie, staff: staff(["curator"]) }, { secret: SECRET });
    expect(r).toEqual({ ok: false, reason: "invalid_participant_session" });
  });

  it("staff preview, then public demo, else no credential", async () => {
    const demoCookie = await signDemoSession(SECRET, { demoId: "a".repeat(32) });
    expect(await resolveTelemetryPrincipal({ participantCookie: undefined, demoCookie, staff: staff(["researcher"]) }, { secret: SECRET })).toEqual({
      ok: true,
      principal: { kind: "preview", userId: "u1" },
    });
    expect(await resolveTelemetryPrincipal({ participantCookie: undefined, demoCookie, staff: staff([]) }, { secret: SECRET })).toEqual({
      ok: true,
      principal: { kind: "demo", demoId: "a".repeat(32) },
    });
    expect(await resolveTelemetryPrincipal({ participantCookie: undefined, demoCookie: "bad", staff: none }, { secret: SECRET })).toEqual({ ok: false, reason: "no_credential" });
  });

  it("keys rate limits by principal", () => {
    expect(principalKey({ kind: "participant", participantId: pid, sessionId: sid })).toBe(`s:${sid}`);
    expect(principalKey({ kind: "demo", demoId: "x" })).toBe("d:x");
    expect(principalKey({ kind: "preview", userId: "u" })).toBe("u:u");
  });
});

describe("token bucket limiter", () => {
  it("allows a burst, refuses with Retry-After, then refills", () => {
    let now = 0;
    const l = new TokenBucketLimiter({ capacity: 3, refillPerSecond: 0.5 }, () => now);
    expect([l.take("k"), l.take("k"), l.take("k")].every((d) => d.allowed)).toBe(true);
    const refused = l.take("k");
    expect(refused).toEqual({ allowed: false, retryAfterSeconds: 2 });
    expect(l.take("other").allowed).toBe(true);
    now += 2000;
    expect(l.take("k").allowed).toBe(true);
    expect(l.take("k").allowed).toBe(false);
  });
});
