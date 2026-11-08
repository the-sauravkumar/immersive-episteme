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

export function serveDashboard(studyId: string): Promise<Served> {
  return coalescer().get(studyId);
}
