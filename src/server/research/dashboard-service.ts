/**
 * Server wiring of the research dashboard's live data path (server-only): the process-wide
 * LISTEN notifier (./dashboard-live.ts) on the direct database URL and the request coalescer
 * (./dashboard-cache.ts) over the shared pool. The page, the CSV route and the SSE stream use
 * these; services and tests use the plain functions in ./dashboard.ts.
 */
import "server-only";

import { directDatabaseUrl, serverEnv } from "@/lib/env";
import { getPool } from "@/server/db/client";
import { pgConnectionConfig } from "@/server/db/connection-config";

import { dashboardFingerprint, loadDashboard } from "./dashboard";
import { DashboardCoalescer, type Served } from "./dashboard-cache";
import { getDashboardNotifier, type DashboardNotifier } from "./dashboard-live";

type ServiceGlobal = typeof globalThis & { __episteme_dashboard_coalescer?: DashboardCoalescer };

export function dashboardNotifier(): DashboardNotifier {
  const env = serverEnv();
  // The LISTEN connection is not pooled: it needs the same TLS settings as the pool (S3), and a
  // direct URL, because a transaction-mode pooler (Neon `-pooler`) does not support LISTEN.
  const n = getDashboardNotifier(pgConnectionConfig(directDatabaseUrl(env), env.DATABASE_CA_PEM));
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
