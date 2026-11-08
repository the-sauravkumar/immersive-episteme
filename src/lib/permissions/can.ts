import { permissionsForRoles, roleGrants } from "./matrix";
import type { Permission } from "./permissions";
import type { Role } from "./roles";

export type Subject = { readonly roles: readonly Role[] };

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

export type ParticipantDataScope = "identified" | "pseudonymised" | "none";

export function participantDataScope(subject: Subject | null | undefined): ParticipantDataScope {
  if (can(subject, "participants.identify")) return "identified";
  if (canAny(subject, ["sessions.view", "analytics.view", "exports.create", "participants.manage"])) {
    return "pseudonymised";
  }
  return "none";
}
