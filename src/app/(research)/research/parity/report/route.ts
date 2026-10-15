/** GET /research/parity/report?id=<uuid>: one stored parity report as JSON (parity.run). */
import { authorizeRequest } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { getParityReport } from "@/server/research/parity/store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const auth = await authorizeRequest("parity.run");
  if (!auth.ok) return auth.response;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return Response.json({ error: "invalid_id" }, { status: 400 });
  const r = await getParityReport(getPool(), id);
  if (!r) return Response.json({ error: "not_found" }, { status: 404 });
  return new Response(JSON.stringify({ id: r.id, createdAt: r.createdAt, reportSha256: r.reportSha256, report: r.report }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="parity-${r.report.studySlug}-${r.id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
