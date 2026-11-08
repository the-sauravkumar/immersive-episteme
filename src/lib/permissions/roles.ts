export const STAFF_ROLES = ["platform_admin", "researcher", "curator"] as const;

export const PRINCIPAL_INVESTIGATOR = "principal_investigator";

export const NON_STAFF_ROLES = ["participant", "public"] as const;

export const ROLES = [...STAFF_ROLES, PRINCIPAL_INVESTIGATOR, ...NON_STAFF_ROLES] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type StaffGrant = StaffRole | typeof PRINCIPAL_INVESTIGATOR;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  platform_admin: "Admin",
  researcher: "Researcher",
  curator: "Curator",
  principal_investigator: "Principal investigator",
  participant: "Participant",
  public: "Public visitor",
};

export const ROLE_DUTIES: Record<StaffRole, string> = {
  platform_admin: "Lets people in: staff accounts, roles, invite codes and settings.",
  researcher: "Runs studies: sets them up, invites participants, watches sessions, scores and exports.",
  curator: "Looks after the content: writes, reviews and publishes it in releases.",
};

export interface StaffAssignment {
  readonly role: StaffRole;
  readonly principalInvestigator: boolean;
}

const ROLE_NAMES: Readonly<Record<string, StaffAssignment>> = {
  admin: { role: "platform_admin", principalInvestigator: false },
  platform_admin: { role: "platform_admin", principalInvestigator: false },
  researcher: { role: "researcher", principalInvestigator: false },
  principal_investigator: { role: "researcher", principalInvestigator: true },
  study_facilitator: { role: "researcher", principalInvestigator: false },
  research_analyst: { role: "researcher", principalInvestigator: false },
  curator: { role: "curator", principalInvestigator: false },
  content_editor: { role: "curator", principalInvestigator: false },
};

export const ROLE_NAME_HELP = "admin, researcher, curator, principal_investigator (a researcher who is the principal investigator); the retired names platform_admin, study_facilitator, research_analyst and content_editor still work";

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

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
