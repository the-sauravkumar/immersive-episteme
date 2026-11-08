import { canAny, type Subject } from "./can";
import type { Permission } from "./permissions";
import { staffRoleOf, type StaffRole } from "./roles";

export const CONSOLE_AREAS = ["cms", "research", "admin"] as const;
export type ConsoleArea = (typeof CONSOLE_AREAS)[number];

export type ConsoleRoute = {
  readonly path: string;
  readonly label: string;
  readonly anyOf: readonly Permission[];
  readonly nav: boolean;
  readonly advanced?: boolean;
};

const ADMIN_ANY = ["admin.users", "admin.roles", "admin.settings", "admin.audit"] as const;

export const CONSOLE_ROUTES = {
  cms: [
    { path: "/cms", label: "Home", anyOf: ["content.read"], nav: true },
    { path: "/cms/review", label: "Review Queue", anyOf: ["content.review"], nav: true },
    { path: "/cms/concepts", label: "Concepts", anyOf: ["content.read"], nav: true },
    { path: "/cms/concepts/[conceptId]", label: "Concept", anyOf: ["content.read"], nav: false },
    { path: "/cms/traditions", label: "Traditions", anyOf: ["content.read"], nav: true },
    { path: "/cms/sources", label: "Sources", anyOf: ["content.read"], nav: true },
    { path: "/cms/media", label: "Media", anyOf: ["media.upload", "media.review"], nav: true },
    { path: "/cms/datasets", label: "Releases", anyOf: ["content.publish"], nav: true },
    { path: "/cms/relations", label: "Relationships", anyOf: ["graph.edit"], nav: true, advanced: true },
  ],
  research: [
    { path: "/research", label: "Home", anyOf: ["study.view"], nav: true },
    { path: "/research/studies", label: "Studies", anyOf: ["study.view"], nav: true },
    { path: "/research/studies/[studyId]", label: "Study", anyOf: ["study.view"], nav: false },
    { path: "/research/participants", label: "Participants", anyOf: ["participants.manage"], nav: true },
    { path: "/research/sessions", label: "Sessions", anyOf: ["sessions.view"], nav: true },
    { path: "/research/sessions/[sessionId]", label: "Session", anyOf: ["sessions.view"], nav: false },
    { path: "/research/dashboard", label: "Live Dashboard", anyOf: ["analytics.view"], nav: true },
    { path: "/research/assessments", label: "Assessments", anyOf: ["assessments.author"], nav: true },
    { path: "/research/assessments/[assessmentId]", label: "Assessment", anyOf: ["assessments.author"], nav: false },
    {
      path: "/research/assessments/[assessmentId]/reference/[referenceMapId]",
      label: "Reference Map",
      anyOf: ["assessments.author"],
      nav: false,
    },
    { path: "/research/scoring", label: "Scoring", anyOf: ["assessments.score"], nav: true },
    { path: "/research/scoring/maps/[conceptMapId]", label: "Map Score", anyOf: ["assessments.score"], nav: false },
    { path: "/research/scoring/rubrics/[rubricId]", label: "Rubric", anyOf: ["assessments.score"], nav: false },
    { path: "/research/exports", label: "Exports", anyOf: ["exports.create", "exports.identified"], nav: true },
    { path: "/research/analytics", label: "Analytics", anyOf: ["analytics.view"], nav: true, advanced: true },
    { path: "/research/pathways", label: "Pathways", anyOf: ["analytics.view"], nav: true, advanced: true },
    { path: "/research/parity", label: "Parity Checks", anyOf: ["parity.run"], nav: true, advanced: true },
  ],
  admin: [
    { path: "/admin", label: "Home", anyOf: ADMIN_ANY, nav: true },
    { path: "/admin/users", label: "People", anyOf: ["admin.users"], nav: true },
    { path: "/admin/access", label: "Invite Codes", anyOf: ["admin.users"], nav: true },
    { path: "/admin/settings", label: "Settings", anyOf: ["admin.settings"], nav: true, advanced: true },
    { path: "/admin/roles", label: "Roles and Permissions", anyOf: ["admin.roles"], nav: true, advanced: true },
    { path: "/admin/audit", label: "Audit Log", anyOf: ["admin.audit"], nav: true, advanced: true },
  ],
} as const satisfies Record<ConsoleArea, readonly ConsoleRoute[]>;

export type ConsolePath = (typeof CONSOLE_ROUTES)[ConsoleArea][number]["path"];

const BY_PATH: ReadonlyMap<string, ConsoleRoute> = new Map(
  CONSOLE_AREAS.flatMap((area) => CONSOLE_ROUTES[area].map((r) => [r.path, r] as const)),
);

export function consoleRoute(path: ConsolePath): ConsoleRoute {
  const route = BY_PATH.get(path);
  if (!route) throw new Error(`Unknown console route ${path}`);
  return route;
}

export function canEnterArea(subject: Subject | null | undefined, area: ConsoleArea): boolean {
  return CONSOLE_ROUTES[area].some((r) => canAny(subject, r.anyOf));
}

export function visibleNav(subject: Subject | null | undefined, area: ConsoleArea): ConsoleRoute[] {
  return CONSOLE_ROUTES[area].filter((r) => r.nav && canAny(subject, r.anyOf));
}

export function enterableAreas(subject: Subject | null | undefined): ConsoleArea[] {
  return CONSOLE_AREAS.filter((a) => canEnterArea(subject, a));
}

export function areaLanding(subject: Subject | null | undefined, area: ConsoleArea): string | null {
  return visibleNav(subject, area)[0]?.path ?? null;
}

const ROLE_HOME: Record<StaffRole, ConsoleArea> = { platform_admin: "admin", researcher: "research", curator: "cms" };

export function staffLanding(subject: Subject | null | undefined): string | null {
  const role = staffRoleOf(subject?.roles ?? []);
  const home = role ? areaLanding(subject, ROLE_HOME[role]) : null;
  if (home) return home;
  for (const area of enterableAreas(subject)) {
    const landing = areaLanding(subject, area);
    if (landing) return landing;
  }
  return null;
}

export const STAFF_HOME = "/console";

export const AWAITING_ACCESS_PATH = "/awaiting-access";
export const FORBIDDEN_PATH = "/forbidden";

export function isAwaitingAccess(subject: Subject): boolean {
  return subject.roles.length === 0;
}

export function refusalPath(subject: Subject): string {
  return isAwaitingAccess(subject) ? AWAITING_ACCESS_PATH : FORBIDDEN_PATH;
}
