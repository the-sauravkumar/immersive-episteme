import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import type { Permission } from "@/lib/permissions/permissions";
import { canEnterArea, consoleRoute, refusalPath, type ConsoleArea, type ConsolePath } from "@/lib/permissions/console-routes";
import type { LearningCondition } from "@/lib/permissions/learning";
import { requireLearningAccess, requireParticipantSession } from "@/server/auth/learning-access";
import { requirePermission, requireStaff } from "@/server/auth/staff";

import { AccessNotice } from "./learning-shell";
import { PageHeader } from "./page-header";

const AREA_ROOT: Record<ConsoleArea, string> = { cms: "/cms", research: "/research", admin: "/admin" };

export async function StaffAreaGate({ area, children }: { area: ConsoleArea; children: ReactNode }) {
  const principal = await requireStaff({ next: AREA_ROOT[area] });
  if (!canEnterArea(principal, area)) redirect(refusalPath(principal));
  return <>{children}</>;
}

export async function ConsolePage({
  path,
  title,
  description,
  permission,
  children,
}: {
  path: ConsolePath;
  title?: string;
  description?: ReactNode;
  permission?: Permission | readonly Permission[];
  children?: ReactNode;
}) {
  const route = consoleRoute(path);
  await requirePermission(permission ?? route.anyOf, { next: path.includes("[") ? undefined : path });
  return (
    <>
      <PageHeader title={title ?? route.label} description={description} />
      {children}
    </>
  );
}

export async function LearningGate({ condition, children }: { condition: LearningCondition; children: ReactNode }) {
  const access = await requireLearningAccess(condition);
  return (
    <>
      <AccessNotice access={access} />
      {children}
    </>
  );
}

export async function ParticipantGate({ children }: { children: ReactNode }) {
  await requireParticipantSession();
  return <>{children}</>;
}

export async function LearningPage({ condition, children }: { condition: LearningCondition; children: ReactNode }) {
  await requireLearningAccess(condition);
  return <>{children}</>;
}

export async function ParticipantPage({ children }: { children: ReactNode }) {
  await requireParticipantSession();
  return <>{children}</>;
}
