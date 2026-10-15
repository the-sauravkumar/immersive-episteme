/**
 * Which export scope a staff member may receive. Identified exports need
 * `exports.identified` (principal investigator only); everyone else with `exports.create`
 * (researchers, analysts) receives the pseudonymised scope. Pure, so it is unit-tested against
 * the permission matrix.
 */
import { can, type Subject } from "@/lib/permissions/can";

import type { ExportScope } from "./build";

export class ExportForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportForbiddenError";
  }
}

export function resolveExportScope(subject: Subject | null | undefined, requested: ExportScope): ExportScope {
  if (requested === "identified") {
    if (!can(subject, "exports.identified")) throw new ExportForbiddenError("Identified exports need the exports.identified permission.");
    return "identified";
  }
  if (!can(subject, "exports.create") && !can(subject, "exports.identified")) throw new ExportForbiddenError("Exports need the exports.create permission.");
  return "pseudonymised";
}
