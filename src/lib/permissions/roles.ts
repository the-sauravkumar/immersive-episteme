export const STAFF_ROLES = ["super_admin", "platform_admin", "researcher", "curator"] as const;

export const ADMIN_GRANTABLE_ROLES = ["researcher", "curator"] as const;

export const PRINCIPAL_INVESTIGATOR = "principal_investigator";

export const NON_STAFF_ROLES = ["participant", "public"] as const;

export const ROLES = [...STAFF_ROLES, PRINCIPAL_INVESTIGATOR, ...NON_STAFF_ROLES] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type StaffGrant = StaffRole | typeof PRINCIPAL_INVESTIGATOR;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  platform_admin: "Admin",
  researcher: "Researcher",
  curator: "Curator",
  principal_investigator: "Principal investigator",
  participant: "Participant",
  public: "Public visitor",
};

export const ROLE_DUTIES: Record<StaffRole, string> = {
  super_admin: "Runs the whole platform: every page and action, including settings, the audit log, roles, and making people Admin or Super Admin.",
  platform_admin: "Lets people in: gives waiting accounts the Researcher or Curator role, locks accounts, resets passwords and makes invite codes.",
  researcher: "Runs studies: sets them up, invites participants, watches sessions, scores and exports.",
  curator: "Looks after the content: writes, reviews and publishes it in releases.",
};

export interface StaffAssignment {
  readonly role: StaffRole;
  readonly principalInvestigator: boolean;
}

const ROLE_NAMES: Readonly<Record<string, StaffAssignment>> = {
  super_admin: { role: "super_admin", principalInvestigator: false },
  admin: { role: "platform_admin", principalInvestigator: false },
  platform_admin: { role: "platform_admin", principalInvestigator: false },
  researcher: { role: "researcher", principalInvestigator: false },
  principal_investigator: { role: "researcher", principalInvestigator: true },
  study_facilitator: { role: "researcher", principalInvestigator: false },
  research_analyst: { role: "researcher", principalInvestigator: false },
  curator: { role: "curator", principalInvestigator: false },
  content_editor: { role: "curator", principalInvestigator: false },
};

export const ROLE_NAME_HELP = "super_admin, admin, researcher, curator, principal_investigator (a researcher who is the principal investigator); the retired names platform_admin, study_facilitator, research_analyst and content_editor still work";

export function parseStaffRole(name: string): StaffAssignment | null {
  return Object.hasOwn(ROLE_NAMES, name) ? ROLE_NAMES[name]! : null;
}

export function grantsOf(assignment: StaffAssignment | null): StaffGrant[] {
  if (!assignment) return [];
  return assignment.principalInvestigator && assignment.role === "researcher" ? [assignment.role, PRINCIPAL_INVESTIGATOR] : [assignment.role];
}

export function staffRoleOf(roles: readonly Role[]): StaffRole | null {
  return roles.find(isStaffRole) ?? null;
}

export function staffTitle(roles: readonly Role[]): string | null {
  const role = staffRoleOf(roles);
  if (!role) return null;
  return roles.includes(PRINCIPAL_INVESTIGATOR) ? `${ROLE_LABELS[role]} (principal investigator)` : ROLE_LABELS[role];
}

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

export function adminMayChange(assignment: StaffAssignment | null): boolean {
  return !assignment || ((ADMIN_GRANTABLE_ROLES as readonly StaffRole[]).includes(assignment.role) && !assignment.principalInvestigator);
}

export function adminMayLock(role: StaffRole | null): boolean {
  return !role || (ADMIN_GRANTABLE_ROLES as readonly StaffRole[]).includes(role);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
