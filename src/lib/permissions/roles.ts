/**
 * Role catalogue. Dependency-free so it can be imported by the Drizzle schema (db/schema/auth.ts),
 * tsx scripts, server code and client components alike.
 *
 * Staff roles are stored per user in `user_roles` (a user may hold several). `participant` and
 * `public` are never stored: they are synthesised from a signed study-session cookie and from
 * the absence of any credential respectively.
 */
export const STAFF_ROLES = [
  "platform_admin",
  "principal_investigator",
  "researcher",
  "curator",
  "content_editor",
  "study_facilitator",
  "research_analyst",
] as const;

export const NON_STAFF_ROLES = ["participant", "public"] as const;

export const ROLES = [...STAFF_ROLES, ...NON_STAFF_ROLES] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type NonStaffRole = (typeof NON_STAFF_ROLES)[number];
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  platform_admin: "Platform administrator",
  principal_investigator: "Principal investigator",
  researcher: "Researcher",
  curator: "Curator",
  content_editor: "Content editor",
  study_facilitator: "Study facilitator",
  research_analyst: "Research analyst",
  participant: "Participant",
  public: "Public visitor",
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
