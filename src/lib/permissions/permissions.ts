/**
 * Permission catalogue: `<domain>.<action>`. The grant matrix lives in ./matrix.ts.
 * A permission that no role holds is caught by tests/unit/permissions.test.ts.
 */
export const PERMISSIONS = [
  // Knowledge content (CMS)
  "content.read",
  "content.draft",
  "content.edit",
  "content.review",
  "content.verify",
  "content.publish",
  "graph.edit",
  "media.upload",
  "media.review",
  // Spatial compiler
  "spatial.compile",
  "spatial.publish",
  "spatial.override",
  // Study engine
  "study.view",
  "study.configure",
  "study.activate",
  "participants.manage",
  /** Resolve a pseudonymous participant id to identifying/consent records. */
  "participants.identify",
  "sessions.view",
  "sessions.annotate",
  "sessions.exclude",
  "assessments.author",
  "assessments.score",
  // Analysis
  "analytics.view",
  /** Pseudonymised exports only (participant ids are study pseudonyms). */
  "exports.create",
  /** Exports that include identifying linkage (consent records, enrolment contact). */
  "exports.identified",
  "parity.run",
  // Platform administration
  "admin.users",
  "admin.roles",
  "admin.settings",
  "admin.audit",
  // Learning conditions
  "learn.2d",
  "learn.immersive",
  /** Take part in a study session (participants only). */
  "study.participate",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}
