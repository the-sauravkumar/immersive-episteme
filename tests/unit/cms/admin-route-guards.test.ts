/**
 * Every /admin route requires an admin permission, and no role outside platform_admin can open
 * any of them except the audit log, which the principal investigator reads (matrix.ts).
 */
import { describe, expect, it } from "vitest";

import { canAny } from "@/lib/permissions/can";
import { CONSOLE_ROUTES, canEnterArea } from "@/lib/permissions/console-routes";
import { ROLES } from "@/lib/permissions/roles";

const ADMIN_PERMS = new Set(["admin.users", "admin.roles", "admin.settings", "admin.audit"]);

describe("admin console route guards", () => {
  it("every admin route requires only admin permissions", () => {
    for (const r of CONSOLE_ROUTES.admin) {
      expect(r.anyOf.length).toBeGreaterThan(0);
      for (const p of r.anyOf) expect(ADMIN_PERMS.has(p)).toBe(true);
    }
  });

  it("only platform_admin opens every admin route; others open none (PI: audit log and overview only)", () => {
    for (const role of ROLES) {
      const subject = { roles: [role] };
      const open = CONSOLE_ROUTES.admin.filter((r) => canAny(subject, r.anyOf)).map((r) => r.path);
      if (role === "platform_admin") expect(open).toEqual(CONSOLE_ROUTES.admin.map((r) => r.path));
      else if (role === "principal_investigator") expect(open.sort()).toEqual(["/admin", "/admin/audit"]);
      else {
        expect(open).toEqual([]);
        expect(canEnterArea(subject, "admin")).toBe(false);
      }
    }
  });

  it("participants and the public can never enter the admin area", () => {
    expect(canEnterArea({ roles: ["participant"] }, "admin")).toBe(false);
    expect(canEnterArea({ roles: ["public"] }, "admin")).toBe(false);
    expect(canEnterArea(null, "admin")).toBe(false);
  });
});
