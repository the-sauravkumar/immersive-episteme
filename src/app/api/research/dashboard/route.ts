/**
 * GET /api/research/dashboard?study=<uuid>: live-update probe of the research dashboard
 * (/research/dashboard). Returns the server time and the study's change fingerprint
 * (src/server/research/dashboard.ts, one index-backed statement); the page re-renders from the
 * database only when the fingerprint changes. Same permission as the page (`analytics.view`),
 * checked on every request. Never cached.
 *
 * 200 { serverTime, fingerprint } | 400 invalid_study | 401 | 403 | 404 not_found.
 */
import { authorizeRequest } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { dashboardFingerprint, dashboardStudy } from "@/server/research/dashboard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const auth = await authorizeRequest("analytics.view");
  if (!auth.ok) {
    auth.response.headers.set("Cache-Control", "no-store");
    return auth.response;
  }
  const studyId = new URL(request.url).searchParams.get("study") ?? "";
  if (!UUID_RE.test(studyId)) return Response.json({ error: "invalid_study" }, { status: 400, headers: NO_STORE });
  const pool = getPool();
  if (!(await dashboardStudy(pool, studyId))) return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  return Response.json(await dashboardFingerprint(pool, studyId), { headers: NO_STORE });
}
