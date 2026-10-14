/**
 * Who is uploading telemetry? Same precedence as the learning guard
 * (src/server/auth/learning-decision.ts): a participant study-session cookie, when present,
 * always decides (an invalid one is refused, never downgraded to demo or preview); otherwise a
 * signed-in staff member is a preview; otherwise a valid public-demo cookie is a demo.
 *
 * The participant cookie is only verified cryptographically here; ingestion then checks the
 * `study_sessions` row (exists, same participant, not withdrawn). Pure: no request APIs.
 */
import { isStaffRole } from "@/lib/permissions/roles";
import { verifyDemoSession } from "@/server/auth/demo-session";
import { verifyParticipantSession } from "@/server/auth/participant-session-token";

import type { TelemetryPrincipal } from "./ingest";

export type PrincipalResolution = { ok: true; principal: TelemetryPrincipal } | { ok: false; reason: "no_credential" | "invalid_participant_session" };

export async function resolveTelemetryPrincipal(
  input: {
    participantCookie: string | undefined;
    demoCookie: string | undefined;
    /** Lazily resolved; only consulted without a participant cookie. */
    staff: () => Promise<{ userId: string; roles: readonly string[] } | null>;
  },
  deps: { secret: string; now?: number },
): Promise<PrincipalResolution> {
  if (input.participantCookie !== undefined) {
    const v = await verifyParticipantSession(input.participantCookie, deps.secret, { now: deps.now });
    if (!v.ok) return { ok: false, reason: "invalid_participant_session" };
    return { ok: true, principal: { kind: "participant", participantId: v.claims.participantId, sessionId: v.claims.sessionId } };
  }
  const staff = await input.staff();
  if (staff && staff.roles.some(isStaffRole)) {
    return { ok: true, principal: { kind: "preview", userId: staff.userId } };
  }
  if (input.demoCookie !== undefined) {
    const v = await verifyDemoSession(input.demoCookie, deps.secret, { now: deps.now });
    if (v.ok) return { ok: true, principal: { kind: "demo", demoId: v.claims.demoId } };
  }
  return { ok: false, reason: "no_credential" };
}

/** Rate-limit bucket key for a principal. */
export function principalKey(p: TelemetryPrincipal): string {
  switch (p.kind) {
    case "participant":
      return `s:${p.sessionId}`;
    case "demo":
      return `d:${p.demoId}`;
    case "preview":
      return `u:${p.userId}`;
  }
}
