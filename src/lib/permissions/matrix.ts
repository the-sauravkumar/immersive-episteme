import { PERMISSIONS, type Permission } from "./permissions";
import type { Role } from "./roles";

const LEARN = ["learn.2d", "learn.immersive"] as const satisfies readonly Permission[];

export const ROLE_PERMISSIONS = {
  super_admin: PERMISSIONS.filter((p) => p !== "study.participate"),
  platform_admin: ["admin.users", ...LEARN],
  principal_investigator: [
    "content.read",
    "content.review",
    "content.verify",
    "content.publish",
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
    "metrics.recompute",
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
    "metrics.recompute",
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
    "parity.run",
    ...LEARN,
  ],
  participant: ["study.participate", ...LEARN],
  public: [...LEARN],
} as const satisfies Record<Role, readonly Permission[]>;

const GRANTS: ReadonlyMap<Role, ReadonlySet<Permission>> = new Map(
  (Object.entries(ROLE_PERMISSIONS) as [Role, readonly Permission[]][]).map(([role, perms]) => [
    role,
    new Set(perms),
  ]),
);

export function roleGrants(role: Role, permission: Permission): boolean {
  return GRANTS.get(role)?.has(permission) ?? false;
}

export function permissionsForRoles(roles: readonly Role[]): Permission[] {
  const out = new Set<Permission>();
  for (const role of roles) for (const p of GRANTS.get(role) ?? []) out.add(p);
  return [...out];
}
