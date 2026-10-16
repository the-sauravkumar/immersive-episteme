/**
 * THE role x permission matrix: the single source of truth for authorisation.
 *
 * Design rules (asserted cell by cell in tests/unit/permissions.test.ts):
 *  - Separation of duties on content: content editors draft/edit but never review, verify or
 *    publish. Verification and publication sit with curators and the principal investigator.
 *  - platform_admin is an operator, not a domain authority: it manages users, roles, settings
 *    and the audit log and can read, but cannot verify/publish content, run studies or see
 *    identifying participant data. A person who is both holds two roles.
 *  - research_analyst is read-only and pseudonymised: no participants.identify, no
 *    exports.identified, no write permission of any kind.
 *  - Only the principal investigator activates studies, excludes sessions, creates identified
 *    exports and removes a participant's data (participants.purge, DR-030).
 *  - Every staff role may preview both learning conditions (always flagged non-experimental by
 *    the learning guard). participant/public reach them only through the condition guard.
 */
import type { Permission } from "./permissions";
import type { Role } from "./roles";

const LEARN = ["learn.2d", "learn.immersive"] as const satisfies readonly Permission[];

export const ROLE_PERMISSIONS = {
  platform_admin: [
    "admin.users",
    "admin.roles",
    "admin.settings",
    "admin.audit",
    "content.read",
    "study.view",
    "sessions.view",
    "analytics.view",
    ...LEARN,
  ],
  principal_investigator: [
    "content.read",
    "content.review",
    "content.verify",
    "content.publish",
    "spatial.publish",
    "study.view",
    "study.configure",
    "study.activate",
    "participants.manage",
    "participants.identify",
    "participants.purge",
    "sessions.view",
    "sessions.annotate",
    "sessions.exclude",
    "assessments.author",
    "assessments.score",
    "analytics.view",
    "exports.create",
    "exports.identified",
    "parity.run",
    "admin.audit",
    ...LEARN,
  ],
  researcher: [
    "content.read",
    "content.review",
    "study.view",
    "study.configure",
    "participants.manage",
    "sessions.view",
    "sessions.annotate",
    "assessments.author",
    "assessments.score",
    "analytics.view",
    "exports.create",
    "parity.run",
    ...LEARN,
  ],
  curator: [
    "content.read",
    "content.draft",
    "content.edit",
    "content.review",
    "content.verify",
    "content.publish",
    "graph.edit",
    "media.upload",
    "media.review",
    "spatial.compile",
    "spatial.publish",
    "spatial.override",
    "parity.run",
    ...LEARN,
  ],
  content_editor: [
    "content.read",
    "content.draft",
    "content.edit",
    "graph.edit",
    "media.upload",
    "spatial.compile",
    ...LEARN,
  ],
  study_facilitator: [
    "study.view",
    "participants.manage",
    "participants.identify",
    "sessions.view",
    "sessions.annotate",
    ...LEARN,
  ],
  research_analyst: ["study.view", "sessions.view", "analytics.view", "exports.create", "parity.run", ...LEARN],
  participant: ["study.participate", ...LEARN],
  public: [...LEARN],
} as const satisfies Record<Role, readonly Permission[]>;

const GRANTS: ReadonlyMap<Role, ReadonlySet<Permission>> = new Map(
  (Object.entries(ROLE_PERMISSIONS) as [Role, readonly Permission[]][]).map(([role, perms]) => [
    role,
    new Set(perms),
  ]),
);

/** Does this single role grant `permission`? */
export function roleGrants(role: Role, permission: Permission): boolean {
  return GRANTS.get(role)?.has(permission) ?? false;
}

/** Union of permissions across roles. */
export function permissionsForRoles(roles: readonly Role[]): Permission[] {
  const out = new Set<Permission>();
  for (const role of roles) for (const p of GRANTS.get(role) ?? []) out.add(p);
  return [...out];
}
