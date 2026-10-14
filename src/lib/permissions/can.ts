/**
 * Pure authorisation checks over the matrix. Usable on server and client. Client-side use is
 * cosmetic only (e.g. hiding nav items); every real decision is re-made on the server by
 * src/server/auth/staff.ts.
 */
import { permissionsForRoles, roleGrants } from "./matrix";
import type { Permission } from "./permissions";
import type { Role } from "./roles";

/** Anything that carries roles: a staff principal, a participant, the anonymous public. */
export type Subject = { readonly roles: readonly Role[] };

/** `null`/`undefined` subjects (nobody signed in) and role-less subjects act as `public`. */
function rolesOf(subject: Subject | null | undefined): readonly Role[] {
  return subject && subject.roles.length > 0 ? subject.roles : ["public"];
}

export function can(subject: Subject | null | undefined, permission: Permission): boolean {
  return rolesOf(subject).some((role) => roleGrants(role, permission));
}

export function canAny(subject: Subject | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(subject, p));
}

export function canAll(subject: Subject | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => can(subject, p));
}

export function permissionsOf(subject: Subject | null | undefined): Permission[] {
  return permissionsForRoles(rolesOf(subject));
}

/**
 * What kind of participant data a subject may see.
 *  - "identified":    may resolve pseudonyms to consent/enrolment records.
 *  - "pseudonymised": may read study data keyed only by pseudonymous ids.
 *  - "none":          no participant data at all.
 * Repositories serving participant data must call this and strip linkage fields unless the
 * scope is "identified".
 */
export type ParticipantDataScope = "identified" | "pseudonymised" | "none";

export function participantDataScope(subject: Subject | null | undefined): ParticipantDataScope {
  if (can(subject, "participants.identify")) return "identified";
  if (canAny(subject, ["sessions.view", "analytics.view", "exports.create", "participants.manage"])) {
    return "pseudonymised";
  }
  return "none";
}
