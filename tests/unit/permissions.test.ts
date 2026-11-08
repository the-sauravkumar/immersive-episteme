import { describe, expect, it } from "vitest";

import {
  CONSOLE_AREAS,
  CONSOLE_ROUTES,
  NON_STAFF_ROLES,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  ADMIN_GRANTABLE_ROLES,
  adminMayChange,
  adminMayLock,
  areaLanding,
  can,
  canAll,
  canAny,
  canEnterArea,
  consoleRoute,
  enterableAreas,
  grantsOf,
  isPermission,
  isRole,
  isStaffRole,
  mayChangeRole,
  mayLockAccount,
  parseStaffRole,
  participantDataScope,
  permissionsOf,
  refusalMessage,
  safeNextPath,
  staffLanding,
  staffTitle,
  visibleNav,
  type ConsoleRoute,
  type Permission,
  type Role,
} from "@/lib/permissions";

const LEARN: Permission[] = ["learn.2d", "learn.immersive"];

const EXPECTED: Record<Role, Permission[]> = {
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
};

const cells = ROLES.flatMap((role) =>
  PERMISSIONS.map((permission) => ({ role, permission, granted: EXPECTED[role].includes(permission) })),
);

describe("permission matrix: every cell", () => {
  it("covers every role and permission", () => {
    expect(cells).toHaveLength(ROLES.length * PERMISSIONS.length);
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
  });

  it.each(cells)("$role $permission -> $granted", ({ role, permission, granted }) => {
    expect(can({ roles: [role] }, permission)).toBe(granted);
  });

  it("EXPECTED only lists known permissions and no duplicates", () => {
    for (const role of ROLES) {
      for (const p of EXPECTED[role]) expect(isPermission(p), `${role}: ${p}`).toBe(true);
      expect(new Set(EXPECTED[role]).size, role).toBe(EXPECTED[role].length);
      expect(new Set(ROLE_PERMISSIONS[role]).size, role).toBe(ROLE_PERMISSIONS[role].length);
    }
  });

  it("every permission is held by at least one role (no dead permissions)", () => {
    for (const p of PERMISSIONS) {
      expect(ROLES.some((r) => can({ roles: [r] }, p)), p).toBe(true);
    }
  });
});

describe("policy invariants", () => {
  it("a researcher may send content back but never verify or publish it", () => {
    for (const p of ["content.verify", "content.publish", "media.review"] as const) {
      expect(can({ roles: ["researcher"] }, p), p).toBe(false);
    }
    expect(can({ roles: ["researcher"] }, "content.review")).toBe(true);
  });

  it("only curators, the PI and the Super Admin can verify or publish content", () => {
    for (const p of ["content.verify", "content.publish"] as const) {
      const holders = ROLES.filter((r) => can({ roles: [r] }, p)).sort();
      expect(holders, p).toEqual(["curator", "principal_investigator", "super_admin"]);
    }
  });

  it("the Super Admin holds every permission a staff member can hold", () => {
    expect(permissionsOf({ roles: ["super_admin"] }).sort()).toEqual(PERMISSIONS.filter((p) => p !== "study.participate").sort());
    for (const r of STAFF_ROLES) for (const p of permissionsOf({ roles: [r] })) expect(can({ roles: ["super_admin"] }, p), `${r} ${p}`).toBe(true);
  });

  it("a researcher without the PI mark sees pseudonymised data only", () => {
    const researcher = { roles: ["researcher"] as Role[] };
    expect(can(researcher, "participants.identify")).toBe(false);
    expect(can(researcher, "exports.identified")).toBe(false);
    expect(participantDataScope(researcher)).toBe("pseudonymised");
  });

  it("an Admin only lets people in: people and invite codes, nothing else", () => {
    const admin = { roles: ["platform_admin"] as Role[] };
    expect(permissionsOf(admin).sort()).toEqual(["admin.users", ...LEARN].sort());
    for (const p of [
      "admin.roles",
      "admin.settings",
      "admin.audit",
      "content.read",
      "study.view",
      "sessions.view",
      "analytics.view",
      "content.draft",
      "content.edit",
      "content.verify",
      "content.publish",
      "study.configure",
      "study.activate",
      "participants.identify",
      "participants.purge",
      "exports.create",
      "exports.identified",
      "sessions.exclude",
    ] as const) {
      expect(can(admin, p), p).toBe(false);
    }
    expect(participantDataScope(admin)).toBe("none");
  });

  it("only the PI and the Super Admin activate studies, exclude sessions, create identified exports and remove participant data", () => {
    for (const p of ["study.activate", "sessions.exclude", "exports.identified", "participants.purge"] as const) {
      expect(ROLES.filter((r) => can({ roles: [r] }, p)), p).toEqual(["super_admin", "principal_investigator"]);
    }
  });

  it("only the Super Admin changes roles and settings or reads the audit log apart from the PI; Admin and Super Admin manage people", () => {
    for (const p of ["admin.roles", "admin.settings"] as const) {
      expect(ROLES.filter((r) => can({ roles: [r] }, p)), p).toEqual(["super_admin"]);
    }
    expect(ROLES.filter((r) => can({ roles: [r] }, "admin.audit"))).toEqual(["super_admin", "principal_investigator"]);
    expect(ROLES.filter((r) => can({ roles: [r] }, "admin.users"))).toEqual(["super_admin", "platform_admin"]);
  });

  it("an Admin gives and takes only Researcher or Curator and locks only Researchers, Curators and waiting accounts", () => {
    const admin = { roles: ["platform_admin"] as Role[] };
    const superAdmin = { roles: ["super_admin"] as Role[] };
    expect(ADMIN_GRANTABLE_ROLES).toEqual(["researcher", "curator"]);
    const plain = (role: (typeof STAFF_ROLES)[number], principalInvestigator = false) => ({ role, principalInvestigator });
    expect(mayChangeRole(admin, null, plain("researcher"))).toBe(true);
    expect(mayChangeRole(admin, plain("researcher"), plain("curator"))).toBe(true);
    expect(mayChangeRole(admin, plain("curator"), null)).toBe(true);
    expect(mayChangeRole(admin, null, plain("platform_admin"))).toBe(false);
    expect(mayChangeRole(admin, null, plain("super_admin"))).toBe(false);
    expect(mayChangeRole(admin, plain("platform_admin"), plain("curator"))).toBe(false);
    expect(mayChangeRole(admin, plain("super_admin"), null)).toBe(false);
    expect(mayChangeRole(admin, null, plain("researcher", true))).toBe(false);
    expect(mayChangeRole(admin, plain("researcher", true), plain("curator"))).toBe(false);
    expect(mayChangeRole({ roles: ["researcher"] }, null, plain("curator"))).toBe(false);
    for (const before of [null, ...STAFF_ROLES.map((r) => plain(r))]) for (const after of [null, ...STAFF_ROLES.map((r) => plain(r))]) expect(mayChangeRole(superAdmin, before, after)).toBe(true);
    for (const role of [null, "researcher", "curator"] as const) expect(mayLockAccount(admin, role), String(role)).toBe(true);
    for (const role of ["platform_admin", "super_admin"] as const) expect(mayLockAccount(admin, role), role).toBe(false);
    for (const role of [null, ...STAFF_ROLES]) expect(mayLockAccount(superAdmin, role)).toBe(true);
    expect(adminMayChange(plain("researcher", true))).toBe(false);
    expect(adminMayLock("researcher")).toBe(true);
  });

  it("participants and the public hold nothing beyond learning (and participation)", () => {
    expect(permissionsOf({ roles: ["public"] }).sort()).toEqual([...LEARN].sort());
    expect(permissionsOf({ roles: ["participant"] }).sort()).toEqual([...LEARN, "study.participate"].sort());
    expect(ROLES.filter((r) => can({ roles: [r] }, "study.participate"))).toEqual(["participant"]);
  });

  it("every staff role can preview both learning conditions", () => {
    for (const r of STAFF_ROLES) expect(canAll({ roles: [r] }, LEARN), r).toBe(true);
  });

  it("identified participant data is limited to the PI and the Super Admin", () => {
    expect(ROLES.filter((r) => participantDataScope({ roles: [r] }) === "identified")).toEqual(["super_admin", "principal_investigator"]);
    expect(participantDataScope({ roles: ["curator"] })).toBe("none");
    expect(participantDataScope(null)).toBe("none");
  });
});

describe("can / canAny / canAll / permissionsOf", () => {
  it("treats null, undefined and role-less subjects as public", () => {
    for (const subject of [null, undefined, { roles: [] as Role[] }]) {
      expect(can(subject, "learn.2d")).toBe(true);
      expect(can(subject, "content.read")).toBe(false);
      expect(permissionsOf(subject).sort()).toEqual([...LEARN].sort());
    }
  });

  it("a researcher with the PI mark holds the researcher's and the PI's permissions together", () => {
    const pi = { roles: grantsOf({ role: "researcher", principalInvestigator: true }) };
    expect(pi.roles).toEqual(["researcher", "principal_investigator"]);
    expect(can(pi, "study.activate")).toBe(true);
    expect(can(pi, "admin.users")).toBe(false);
    expect(new Set(permissionsOf(pi))).toEqual(new Set([...EXPECTED.researcher, ...EXPECTED.principal_investigator]));
  });

  it("canAny / canAll", () => {
    const researcher = { roles: ["researcher"] as Role[] };
    expect(canAny(researcher, ["content.publish", "content.review"])).toBe(true);
    expect(canAny(researcher, ["content.publish", "content.verify"])).toBe(false);
    expect(canAll(researcher, ["content.read", "content.review"])).toBe(true);
    expect(canAll(researcher, ["content.review", "content.publish"])).toBe(false);
    expect(canAny(researcher, [])).toBe(false);
  });

  it("role guards", () => {
    expect(STAFF_ROLES).toEqual(["super_admin", "platform_admin", "researcher", "curator"]);
    for (const r of STAFF_ROLES) expect(isStaffRole(r)).toBe(true);
    for (const r of NON_STAFF_ROLES) expect(isStaffRole(r)).toBe(false);
    expect(isStaffRole("principal_investigator")).toBe(false);
    expect(isRole("participant")).toBe(true);
    expect(isRole("root")).toBe(false);
    expect(isPermission("content.delete")).toBe(false);
  });

  it("parses the four role names, the PI and every retired name onto one role", () => {
    expect(parseStaffRole("super_admin")).toEqual({ role: "super_admin", principalInvestigator: false });
    expect(parseStaffRole("admin")).toEqual({ role: "platform_admin", principalInvestigator: false });
    expect(parseStaffRole("platform_admin")).toEqual({ role: "platform_admin", principalInvestigator: false });
    expect(parseStaffRole("principal_investigator")).toEqual({ role: "researcher", principalInvestigator: true });
    for (const old of ["researcher", "study_facilitator", "research_analyst"]) expect(parseStaffRole(old), old).toEqual({ role: "researcher", principalInvestigator: false });
    for (const old of ["curator", "content_editor"]) expect(parseStaffRole(old), old).toEqual({ role: "curator", principalInvestigator: false });
    expect(parseStaffRole("root")).toBeNull();
    expect(parseStaffRole("constructor")).toBeNull();
  });

  it("the PI mark only counts on a researcher, and the title names it", () => {
    expect(grantsOf({ role: "curator", principalInvestigator: true })).toEqual(["curator"]);
    expect(grantsOf(null)).toEqual([]);
    expect(staffTitle(["researcher", "principal_investigator"])).toBe("Researcher (principal investigator)");
    expect(staffTitle(["platform_admin"])).toBe("Admin");
    expect(staffTitle(["super_admin"])).toBe("Super Admin");
    expect(staffTitle([])).toBeNull();
  });

  it("refusals name who can do it and what to do next", () => {
    expect(refusalMessage(["content.verify"])).toBe("Only a Curator or the principal investigator can do this. Ask them to do it for you, or ask an Admin to change your role.");
    expect(refusalMessage(["admin.users"])).toBe("Only an Admin can do this. Ask them to do it for you, or ask an Admin to change your role.");
    expect(refusalMessage(["admin.settings"])).toBe("Only a Super Admin can do this. Ask a Super Admin to do it for you.");
    expect(refusalMessage(["study.configure"])).toBe("Only a Researcher can do this. Ask them to do it for you, or ask an Admin to change your role.");
    expect(refusalMessage(["study.participate"])).toBe("No staff role can do this.");
  });
});

describe("console route table", () => {
  const allRoutes: ConsoleRoute[] = CONSOLE_AREAS.flatMap((a): ConsoleRoute[] => [...CONSOLE_ROUTES[a]]);

  it("every route requires known permissions held by some staff role", () => {
    for (const r of allRoutes) {
      expect(r.anyOf.length, r.path).toBeGreaterThan(0);
      expect(STAFF_ROLES.some((role) => canAny({ roles: [role] }, r.anyOf)), r.path).toBe(true);
    }
  });

  it("no console route is reachable by participants or the public", () => {
    for (const r of allRoutes) {
      expect(canAny({ roles: ["participant"] }, r.anyOf), r.path).toBe(false);
      expect(canAny(null, r.anyOf), r.path).toBe(false);
    }
    for (const a of CONSOLE_AREAS) {
      expect(canEnterArea({ roles: ["participant"] }, a)).toBe(false);
      expect(canEnterArea(null, a)).toBe(false);
    }
  });

  it.each([
    ["super_admin", ["cms", "research", "admin"]],
    ["platform_admin", ["admin"]],
    ["principal_investigator", ["cms", "research", "admin"]],
    ["researcher", ["cms", "research"]],
    ["curator", ["cms", "research"]],
  ] as const)("%s enters %j", (role, areas) => {
    expect(enterableAreas({ roles: [role] })).toEqual(areas);
  });

  it("nav only lists routes the subject may open, and never detail routes", () => {
    for (const role of STAFF_ROLES) {
      for (const area of CONSOLE_AREAS) {
        for (const item of visibleNav({ roles: [role] }, area)) {
          expect(item.nav).toBe(true);
          expect(canAny({ roles: [role] }, item.anyOf), `${role} ${item.path}`).toBe(true);
        }
      }
    }
    const researcherCms = visibleNav({ roles: ["researcher"] }, "cms").map((r) => r.path);
    expect(researcherCms).not.toContain("/cms/datasets");
    expect(researcherCms).toContain("/cms/review");
    expect(researcherCms).toContain("/cms/concepts");
  });

  it("puts day-to-day pages first, each area's home on top, and the internals under Advanced", () => {
    for (const a of CONSOLE_AREAS) {
      const nav = CONSOLE_ROUTES[a].filter((r) => r.nav) as ConsoleRoute[];
      expect(nav[0]!.path, a).toBe(`/${a}`);
      const firstAdvanced = nav.findIndex((r) => r.advanced);
      expect(nav.slice(firstAdvanced).every((r) => r.advanced), a).toBe(true);
    }
    expect(allRoutes.filter((r) => r.advanced).map((r) => r.path).sort()).toEqual(
      ["/admin/audit", "/admin/roles", "/admin/settings", "/cms/relations", "/research/analytics", "/research/parity", "/research/pathways"].sort(),
    );
    expect(visibleNav({ roles: ["curator"] }, "research").map((r) => r.path)).toEqual(["/research/parity"]);
  });

  it("lands every staff role on a page it can open (sign-in default and area switcher)", () => {
    const routeByPath = new Map(allRoutes.map((r) => [r.path, r] as const));
    for (const role of STAFF_ROLES) {
      const landing = staffLanding({ roles: [role] });
      expect(landing, role).not.toBeNull();
      expect(canAny({ roles: [role] }, routeByPath.get(landing!)!.anyOf), `${role} -> ${landing}`).toBe(true);
      for (const area of enterableAreas({ roles: [role] })) {
        const target = areaLanding({ roles: [role] }, area);
        expect(target, `${role} ${area}`).not.toBeNull();
        expect(canAny({ roles: [role] }, routeByPath.get(target!)!.anyOf), `${role} switcher -> ${target}`).toBe(true);
      }
    }
    expect(canAny({ roles: ["curator"] }, consoleRoute("/research").anyOf)).toBe(false);
    expect(areaLanding({ roles: ["curator"] }, "research")).toBe("/research/parity");
    expect(staffLanding({ roles: ["curator"] })).toBe("/cms");
    expect(staffLanding({ roles: ["researcher"] })).toBe("/research");
    expect(staffLanding({ roles: ["researcher", "principal_investigator"] })).toBe("/research");
    expect(staffLanding({ roles: ["platform_admin"] })).toBe("/admin");
    expect(staffLanding({ roles: ["super_admin"] })).toBe("/admin");
    expect(visibleNav({ roles: ["platform_admin"] }, "admin").map((r) => r.path)).toEqual(["/admin", "/admin/users", "/admin/access"]);
    expect(visibleNav({ roles: ["super_admin"] }, "admin").map((r) => r.path)).toEqual(["/admin", "/admin/users", "/admin/access", "/admin/settings", "/admin/roles", "/admin/audit"]);
    expect(staffLanding({ roles: [] })).toBeNull();
    expect(staffLanding(null)).toBeNull();
  });

  it("areaLanding and consoleRoute", () => {
    expect(areaLanding({ roles: ["curator"] }, "cms")).toBe("/cms");
    expect(areaLanding({ roles: ["curator"] }, "admin")).toBeNull();
    expect(consoleRoute("/admin/users").anyOf).toEqual(["admin.users"]);
    expect(() => consoleRoute("/nope" as never)).toThrow();
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/research", "/research"],
    ["/cms/concepts?q=a#x", "/cms/concepts?q=a#x"],
    ["/a/../b", "/b"],
  ])("accepts %s", (input, out) => {
    expect(safeNextPath(input)).toBe(out);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil",
    "javascript:alert(1)",
    "research",
    "/x\u0000y",
    "/x\ny",
    "",
    undefined,
    42,
    `/${"a".repeat(2100)}`,
  ])("rejects %j", (input) => {
    expect(safeNextPath(input, "/fallback")).toBe("/fallback");
  });
});
