import { canAny, type Subject } from "./can";
import type { Permission } from "./permissions";

export const CONSOLE_AREAS = ["cms", "research", "admin"] as const;
export type ConsoleArea = (typeof CONSOLE_AREAS)[number];

export type ConsoleRoute = {
  readonly path: string;
  readonly label: string;
  readonly anyOf: readonly Permission[];
  readonly nav: boolean;
};

const ADMIN_ANY = ["admin.users", "admin.roles", "admin.settings", "admin.audit"] as const;

export const CONSOLE_ROUTES = {
  cms: [
    { path: "/cms", label: "Overview", anyOf: ["content.read"], nav: true },
    { path: "/cms/traditions", label: "Traditions", anyOf: ["content.read"], nav: true },
    { path: "/cms/concepts", label: "Concepts", anyOf: ["content.read"], nav: true },
    { path: "/cms/concepts/[conceptId]", label: "Concept", anyOf: ["content.read"], nav: false },
    { path: "/cms/relations", label: "Relations", anyOf: ["graph.edit"], nav: true },
    { path: "/cms/sources", label: "Sources", anyOf: ["content.read"], nav: true },
    { path: "/cms/media", label: "Media", anyOf: ["media.upload", "media.review"], nav: true },
    { path: "/cms/review", label: "Review Queue", anyOf: ["content.review"], nav: true },
    { path: "/cms/datasets", label: "Dataset Versions", anyOf: ["content.publish"], nav: true },
  ],
  research: [
    { path: "/research/dashboard", label: "Dashboard", anyOf: ["analytics.view"], nav: true },
    { path: "/research", label: "Overview", anyOf: ["study.view"], nav: true },
    { path: "/research/studies", label: "Studies", anyOf: ["study.view"], nav: true },
    { path: "/research/studies/[studyId]", label: "Study", anyOf: ["study.view"], nav: false },
    { path: "/research/participants", label: "Participants", anyOf: ["participants.manage"], nav: true },
    { path: "/research/sessions", label: "Sessions", anyOf: ["sessions.view"], nav: true },
    { path: "/research/sessions/[sessionId]", label: "Session", anyOf: ["sessions.view"], nav: false },
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
    { path: "/research/analytics", label: "Analytics", anyOf: ["analytics.view"], nav: true },
    { path: "/research/pathways", label: "Pathways", anyOf: ["analytics.view"], nav: true },
    { path: "/research/parity", label: "Parity Checks", anyOf: ["parity.run"], nav: true },
    { path: "/research/exports", label: "Exports", anyOf: ["exports.create", "exports.identified"], nav: true },
  ],
  admin: [
    { path: "/admin", label: "Overview", anyOf: ADMIN_ANY, nav: true },
    { path: "/admin/users", label: "Users", anyOf: ["admin.users"], nav: true },
    { path: "/admin/access", label: "Access", anyOf: ["admin.users"], nav: true },
    { path: "/admin/roles", label: "Roles", anyOf: ["admin.roles"], nav: true },
    { path: "/admin/settings", label: "Settings", anyOf: ["admin.settings"], nav: true },
    { path: "/admin/audit", label: "Audit Log", anyOf: ["admin.audit"], nav: true },
  ],
} as const satisfies Record<ConsoleArea, readonly ConsoleRoute[]>;

export const CONSOLE_AREA_LABELS: Record<ConsoleArea, string> = {
  cms: "Content",
  research: "Research",
  admin: "Administration",
};

export type ConsolePath = (typeof CONSOLE_ROUTES)[ConsoleArea][number]["path"];

const BY_PATH: ReadonlyMap<string, ConsoleRoute> = new Map(
  CONSOLE_AREAS.flatMap((area) => CONSOLE_ROUTES[area].map((r) => [r.path, r] as const)),
);

export function consoleRoute(path: ConsolePath): ConsoleRoute {
  const route = BY_PATH.get(path);
  if (!route) throw new Error(`Unknown console route ${path}`);
  return route;
}

export function areaPermissions(area: ConsoleArea): Permission[] {
  return [...new Set(CONSOLE_ROUTES[area].flatMap((r) => r.anyOf))];
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

export function staffLanding(subject: Subject | null | undefined): string | null {
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
