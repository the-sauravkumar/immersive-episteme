export const PERMISSIONS = [
  "content.read",
  "content.draft",
  "content.edit",
  "content.review",
  "content.verify",
  "content.publish",
  "graph.edit",
  "media.upload",
  "media.review",
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
  "admin.users",
  "admin.roles",
  "admin.settings",
  "admin.audit",
  "learn.2d",
  "learn.immersive",
  "study.participate",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}
