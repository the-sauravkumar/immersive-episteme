/**
 * GET /research/dashboard/csv?study=<uuid>&table=<dashboard table>: one research-dashboard table
 * as CSV, generated from the database on every request (never cached or written to disk),
 * pseudonymised (participant codes only), with a `#` header line naming the metric versions.
 * The tables of rows 3 and 4 (gain by tradition, dwell time per layer, per-item statistics) come
 * from src/server/research/dashboard-extra-tables.ts, with the same header.
 *
 * Permission: `analytics.view` (the dashboard) AND `exports.create` or `exports.identified`
 * (taking data out of the platform is an export). A role with only `analytics.view` (e.g.
 * platform_admin) is refused with 403. Each download is audited like the research exports.
 */
import { can } from "@/lib/permissions/can";
import { authorizeRequest } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { dashboardTableCsv, loadDashboard } from "@/server/research/dashboard";
import { dashboardExtraTableCsv } from "@/server/research/dashboard-extra-tables";
import { audit } from "@/server/research/db";
import { DASHBOARD_EXTRA_TABLE_BY_NAME, DASHBOARD_TABLE_BY_NAME, type DashboardExtraTableName, type DashboardTableName } from "@/server/research/exports/dictionary";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const auth = await authorizeRequest("analytics.view");
  if (!auth.ok) {
    auth.response.headers.set("Cache-Control", "no-store");
    return auth.response;
  }
  if (!can(auth.principal, "exports.create") && !can(auth.principal, "exports.identified")) {
    return Response.json({ error: "forbidden", message: "CSV downloads need the exports.create permission." }, { status: 403, headers: NO_STORE });
  }
  const url = new URL(request.url);
  const studyId = url.searchParams.get("study") ?? "";
  const table = url.searchParams.get("table") ?? "";
  if (!UUID_RE.test(studyId)) return Response.json({ error: "invalid_study" }, { status: 400, headers: NO_STORE });
  const extra = DASHBOARD_EXTRA_TABLE_BY_NAME.has(table);
  if (!DASHBOARD_TABLE_BY_NAME.has(table) && !extra) return Response.json({ error: "invalid_table" }, { status: 400, headers: NO_STORE });

  const pool = getPool();
  const data = await loadDashboard(pool, studyId);
  if (!data) return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  const body = extra ? await dashboardExtraTableCsv(pool, data, table as DashboardExtraTableName) : dashboardTableCsv(data, table as DashboardTableName);
  await audit(pool, { userId: auth.principal.userId }, "export.dashboard_csv", "study", studyId, { after: { table, scope: "pseudonymised", generatedAt: data.generatedAt } });
  const stamp = data.generatedAt.replace(/[:.]/g, "-");
  return new Response(body, {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${data.study.slug}-${table}-${stamp}.csv"`,
    },
  });
}
