import { isStaffRole } from "@/lib/permissions/roles";
import { verifyDemoSession } from "@/server/auth/demo-session";
import { verifyParticipantSession } from "@/server/auth/participant-session-token";

import type { TelemetryPrincipal } from "./ingest";

export type PrincipalResolution = { ok: true; principal: TelemetryPrincipal } | { ok: false; reason: "no_credential" | "invalid_participant_session" };

export async function resolveTelemetryPrincipal(
  input: {
    participantCookie: string | undefined;
    demoCookie: string | undefined;
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
