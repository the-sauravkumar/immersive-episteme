/**
 * GET /api/research/dashboard?study=<uuid>: live-update probe of the research dashboard
 * (/research/dashboard). Returns the server time and the study's change fingerprint
 * (src/server/research/dashboard.ts, one index-backed statement); the page re-renders from the
 * database only when the fingerprint changes. Same permission as the page (`analytics.view`),
 * checked on every request. Never cached.
 *
 * `&include=sessions` adds the per-session telemetry rows (`{ generatedAt, sessions }`) from the
 * same coalesced computation as the page (serveDashboard): the live stream updates that table in
 * place without waiting for a full page refresh (dashboard/_components/live-sessions.tsx).
 *
 * 200 { serverTime, fingerprint, generatedAt?, sessions? } | 400 invalid_study | 401 | 403 | 404 not_found.
 */
import { authorizeRequest } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { dashboardFingerprint, dashboardStudy } from "@/server/research/dashboard";
import { serveDashboard } from "@/server/research/dashboard-service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const auth = await authorizeRequest("analytics.view");
  if (!auth.ok) {
    auth.response.headers.set("Cache-Control", "no-store");
    return auth.response;
  }
  const params = new URL(request.url).searchParams;
  const studyId = params.get("study") ?? "";
  if (!UUID_RE.test(studyId)) return Response.json({ error: "invalid_study" }, { status: 400, headers: NO_STORE });
  const pool = getPool();
  if (!(await dashboardStudy(pool, studyId))) return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  if (params.get("include") === "sessions") {
    const { data } = await serveDashboard(studyId);
    if (!data) return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    return Response.json(
      { serverTime: data.generatedAt, fingerprint: data.fingerprint, generatedAt: data.generatedAt, sessions: data.telemetry.sessions },
      { headers: NO_STORE },
    );
  }
  return Response.json(await dashboardFingerprint(pool, studyId), { headers: NO_STORE });
}
