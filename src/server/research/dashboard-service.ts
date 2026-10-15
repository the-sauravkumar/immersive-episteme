/**
 * Server wiring of the research dashboard's live data path (server-only): the process-wide
 * LISTEN notifier (./dashboard-live.ts) on DATABASE_URL and the request coalescer
 * (./dashboard-cache.ts) over the shared pool. The page, the CSV route and the SSE stream use
 * these; services and tests use the plain functions in ./dashboard.ts.
 */
import "server-only";

import { serverEnv } from "@/lib/env";
import { getPool } from "@/server/db/client";

import { dashboardFingerprint, loadDashboard } from "./dashboard";
import { DashboardCoalescer, type Served } from "./dashboard-cache";
import { getDashboardNotifier, type DashboardNotifier } from "./dashboard-live";

type ServiceGlobal = typeof globalThis & { __episteme_dashboard_coalescer?: DashboardCoalescer };

export function dashboardNotifier(): DashboardNotifier {
  const n = getDashboardNotifier(serverEnv().DATABASE_URL);
  n.ensure();
  return n;
}

function coalescer(): DashboardCoalescer {
  const g = globalThis as ServiceGlobal;
  g.__episteme_dashboard_coalescer ??= new DashboardCoalescer({
    fingerprint: (id) => dashboardFingerprint(getPool(), id),
    load: (id, fp) => loadDashboard(getPool(), id, { fingerprint: fp }),
    version: (id) => dashboardNotifier().version(id),
  });
  return g.__episteme_dashboard_coalescer;
}

/** The dashboard data of a study, computed once per change however many viewers ask. */
export function serveDashboard(studyId: string): Promise<Served> {
  return coalescer().get(studyId);
}
