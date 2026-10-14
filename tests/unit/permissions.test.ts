/**
 * Table-driven tests over the WHOLE role x permission matrix.
 *
 * EXPECTED is written out independently of src/lib/permissions/matrix.ts: every one of the
 * |ROLES| x |PERMISSIONS| cells is asserted both ways (granted and denied), so any change to
 * the matrix must be made deliberately in two places. Policy invariants (separation of duties,
 * pseudonymised analysts, ...) are asserted separately so a reader can see the rules.
 */
import { describe, expect, it } from "vitest";

import {
  CONSOLE_AREAS,
  CONSOLE_ROUTES,
  NON_STAFF_ROLES,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  areaLanding,
  can,
  canAll,
  canAny,
  canEnterArea,
  consoleRoute,
  enterableAreas,
  isPermission,
  isRole,
  isStaffRole,
  participantDataScope,
  permissionsOf,
  safeNextPath,
  staffLanding,
  visibleNav,
  type ConsoleRoute,
  type Permission,
  type Role,
} from "@/lib/permissions";

const LEARN: Permission[] = ["learn.2d", "learn.immersive"];

const EXPECTED: Record<Role, Permission[]> = {
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
};

/** Permissions that change state (anything but reading/viewing/learning). */
const WRITE_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (p) =>
    ![
      "content.read",
      "study.view",
      "sessions.view",
      "analytics.view",
      "admin.audit",
      "learn.2d",
      "learn.immersive",
      // Pseudonymised export and the parity check are read-only derivations of existing data.
      "exports.create",
      "parity.run",
    ].includes(p),
);

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
  it("content editors cannot review, verify or publish content, or publish/override spatial layouts", () => {
    for (const p of [
      "content.review",
      "content.verify",
      "content.publish",
      "spatial.publish",
      "spatial.override",
      "media.review",
    ] as const) {
      expect(can({ roles: ["content_editor"] }, p), p).toBe(false);
    }
  });

  it("only curators and the PI can verify or publish content", () => {
    for (const p of ["content.verify", "content.publish"] as const) {
      const holders = ROLES.filter((r) => can({ roles: [r] }, p)).sort();
      expect(holders, p).toEqual(["curator", "principal_investigator"]);
    }
  });

  it("research analysts are read-only and pseudonymised", () => {
    const analyst = { roles: ["research_analyst"] as Role[] };
    for (const p of WRITE_PERMISSIONS) expect(can(analyst, p), p).toBe(false);
    expect(can(analyst, "participants.identify")).toBe(false);
    expect(can(analyst, "exports.identified")).toBe(false);
    expect(participantDataScope(analyst)).toBe("pseudonymised");
  });

  it("platform admins operate the platform but hold no domain authority", () => {
    const admin = { roles: ["platform_admin"] as Role[] };
    for (const p of [
      "content.draft",
      "content.edit",
      "content.verify",
      "content.publish",
      "study.configure",
      "study.activate",
      "participants.identify",
      "exports.create",
      "exports.identified",
      "sessions.exclude",
    ] as const) {
      expect(can(admin, p), p).toBe(false);
    }
    expect(participantDataScope(admin)).toBe("pseudonymised");
  });

  it("only the PI activates studies, excludes sessions and creates identified exports", () => {
    for (const p of ["study.activate", "sessions.exclude", "exports.identified"] as const) {
      expect(ROLES.filter((r) => can({ roles: [r] }, p)), p).toEqual(["principal_investigator"]);
    }
  });

  it("only admins manage users, roles and settings", () => {
    for (const p of ["admin.users", "admin.roles", "admin.settings"] as const) {
      expect(ROLES.filter((r) => can({ roles: [r] }, p)), p).toEqual(["platform_admin"]);
    }
  });

  it("participants and the public hold nothing beyond learning (and participation)", () => {
    expect(permissionsOf({ roles: ["public"] }).sort()).toEqual([...LEARN].sort());
    expect(permissionsOf({ roles: ["participant"] }).sort()).toEqual([...LEARN, "study.participate"].sort());
    expect(ROLES.filter((r) => can({ roles: [r] }, "study.participate"))).toEqual(["participant"]);
  });

  it("every staff role can preview both learning conditions", () => {
    for (const r of STAFF_ROLES) expect(canAll({ roles: [r] }, LEARN), r).toBe(true);
  });

  it("identified participant data is limited to the PI and facilitators", () => {
    expect(ROLES.filter((r) => participantDataScope({ roles: [r] }) === "identified").sort()).toEqual([
      "principal_investigator",
      "study_facilitator",
    ]);
    expect(participantDataScope({ roles: ["curator"] })).toBe("none");
    expect(participantDataScope({ roles: ["content_editor"] })).toBe("none");
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

  it("unions permissions across multiple roles", () => {
    const both = { roles: ["content_editor", "research_analyst"] as Role[] };
    expect(can(both, "content.edit")).toBe(true);
    expect(can(both, "analytics.view")).toBe(true);
    expect(can(both, "content.publish")).toBe(false);
    expect(new Set(permissionsOf(both))).toEqual(
      new Set([...EXPECTED.content_editor, ...EXPECTED.research_analyst]),
    );
  });

  it("canAny / canAll", () => {
    const editor = { roles: ["content_editor"] as Role[] };
    expect(canAny(editor, ["content.publish", "content.edit"])).toBe(true);
    expect(canAny(editor, ["content.publish", "content.verify"])).toBe(false);
    expect(canAll(editor, ["content.draft", "content.edit"])).toBe(true);
    expect(canAll(editor, ["content.edit", "content.publish"])).toBe(false);
    expect(canAny(editor, [])).toBe(false);
  });

  it("role guards", () => {
    for (const r of STAFF_ROLES) expect(isStaffRole(r)).toBe(true);
    for (const r of NON_STAFF_ROLES) expect(isStaffRole(r)).toBe(false);
    expect(isRole("participant")).toBe(true);
    expect(isRole("root")).toBe(false);
    expect(isPermission("content.delete")).toBe(false);
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
    ["platform_admin", ["cms", "research", "admin"]],
    ["principal_investigator", ["cms", "research", "admin"]],
    ["researcher", ["cms", "research"]],
    ["curator", ["cms", "research"]],
    ["content_editor", ["cms"]],
    ["study_facilitator", ["research"]],
    ["research_analyst", ["research"]],
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
    const editorCms = visibleNav({ roles: ["content_editor"] }, "cms").map((r) => r.path);
    expect(editorCms).not.toContain("/cms/review");
    expect(editorCms).not.toContain("/cms/datasets");
    expect(editorCms).toContain("/cms/concepts");
  });

  it("analysts see analytics/exports but not participants, assessments authoring or scoring", () => {
    const nav = visibleNav({ roles: ["research_analyst"] }, "research").map((r) => r.path);
    expect(nav).toEqual(
      expect.arrayContaining(["/research", "/research/sessions", "/research/analytics", "/research/exports"]),
    );
    for (const p of ["/research/participants", "/research/assessments", "/research/scoring"]) {
      expect(nav).not.toContain(p);
    }
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
    // The regression: curators and content editors cannot open /research itself.
    expect(canAny({ roles: ["curator"] }, consoleRoute("/research").anyOf)).toBe(false);
    expect(areaLanding({ roles: ["curator"] }, "research")).toBe("/research/parity");
    expect(staffLanding({ roles: ["curator"] })).toBe("/cms");
    expect(staffLanding({ roles: ["content_editor"] })).toBe("/cms");
    expect(staffLanding({ roles: ["study_facilitator"] })).toBe("/research");
    expect(staffLanding({ roles: [] })).toBeNull();
    expect(staffLanding(null)).toBeNull();
  });

  it("areaLanding and consoleRoute", () => {
    expect(areaLanding({ roles: ["content_editor"] }, "cms")).toBe("/cms");
    expect(areaLanding({ roles: ["content_editor"] }, "admin")).toBeNull();
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
