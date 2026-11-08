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
