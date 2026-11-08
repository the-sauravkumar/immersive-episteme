import { permissionsForRoles, roleGrants } from "./matrix";
import type { Permission } from "./permissions";
import { PRINCIPAL_INVESTIGATOR, STAFF_ROLES, type Role, type StaffGrant } from "./roles";

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

const HOLDER: Record<StaffGrant, string> = {
  platform_admin: "an Admin",
  researcher: "a Researcher",
  curator: "a Curator",
  principal_investigator: "the principal investigator",
};

export function refusalMessage(anyOf: readonly Permission[]): string {
  const holders = ([...STAFF_ROLES, PRINCIPAL_INVESTIGATOR] as StaffGrant[]).filter((r) => anyOf.some((p) => roleGrants(r, p)));
  const named = holders.includes("researcher") ? holders.filter((h) => h !== PRINCIPAL_INVESTIGATOR) : holders;
  if (named.length === 0) return "No staff role can do this.";
  const list = named.map((h) => HOLDER[h]);
  const who = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} or ${list.at(-1)}`;
  return `Only ${who} can do this. Ask them to do it for you, or ask an Admin to change your role.`;
}
