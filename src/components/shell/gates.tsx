/**
 * Server-side gates used by route-group layouts and pages. Each awaits a guard from
 * src/server/auth BEFORE rendering its children, and the guard redirects (throws) when access
 * is refused, so protected markup is never produced for an unauthorised request.
 *
 * Gates read cookies/headers, so they must be rendered inside <Suspense> (Cache Components).
 */
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import type { Permission } from "@/lib/permissions/permissions";
import { canEnterArea, consoleRoute, type ConsoleArea, type ConsolePath } from "@/lib/permissions/console-routes";
import type { LearningCondition } from "@/lib/permissions/learning";
import { requireLearningAccess, requireParticipantSession } from "@/server/auth/learning-access";
import { requirePermission, requireStaff } from "@/server/auth/staff";

import { AccessNotice } from "./learning-shell";
import { PageHeader } from "./page-header";

const AREA_ROOT: Record<ConsoleArea, string> = { cms: "/cms", research: "/research", admin: "/admin" };

/** Layout gate: signed-in staff who can open at least one route of the area. */
export async function StaffAreaGate({ area, children }: { area: ConsoleArea; children: ReactNode }) {
  const principal = await requireStaff({ next: AREA_ROOT[area] });
  if (!canEnterArea(principal, area)) redirect("/forbidden");
  return <>{children}</>;
}

/**
 * Console page wrapper: enforces the route's permission from the console route table (or an
 * explicit override) and renders the page title.
 */
export async function ConsolePage({
  path,
  title,
  kicker,
  description,
  permission,
  children,
}: {
  path: ConsolePath;
  title?: string;
  kicker?: string;
  description?: ReactNode;
  permission?: Permission | readonly Permission[];
  children?: ReactNode;
}) {
  const route = consoleRoute(path);
  await requirePermission(permission ?? route.anyOf, { next: path.includes("[") ? undefined : path });
  return (
    <>
      <PageHeader title={title ?? route.label} kicker={kicker} description={description} />
      {children}
    </>
  );
}

/** Layout gate for /learn/<condition>: the experimental condition guard. */
export async function LearningGate({ condition, children }: { condition: LearningCondition; children: ReactNode }) {
  const access = await requireLearningAccess(condition);
  return (
    <>
      <AccessNotice access={access} />
      {children}
    </>
  );
}

/** Layout gate for in-session study steps. */
export async function ParticipantGate({ children }: { children: ReactNode }) {
  await requireParticipantSession();
  return <>{children}</>;
}

/*
 * Page-level gates. A layout gate alone is NOT enough: Next.js renders a layout and its page in
 * parallel and streams the page's RSC payload even when the layout never renders `children`,
 * and layouts do not re-run on client navigation (node_modules/next/dist/docs/01-app/02-guides/
 * authentication.md, "Layouts and auth checks"). So every protected page wraps its content in
 * one of these; the guards are `cache()`d, so the layout + page pair costs one check.
 */

/** Page wrapper for /learn/<condition>/**: content renders only after the condition guard passes. */
export async function LearningPage({ condition, children }: { condition: LearningCondition; children: ReactNode }) {
  await requireLearningAccess(condition);
  return <>{children}</>;
}

/** Page wrapper for in-session /study steps. */
export async function ParticipantPage({ children }: { children: ReactNode }) {
  await requireParticipantSession();
  return <>{children}</>;
}
