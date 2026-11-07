import { AssessmentError } from "@/server/assessment/common";
import { EDGE_EXPORT_COLUMNS, exportMapEdges, exportScores, SCORE_EXPORT_COLUMNS, toCsv } from "@/server/assessment/scoring";
import { authorizeRequest } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { audit } from "@/server/research/db";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const auth = await authorizeRequest("exports.create");
  if (!auth.ok) {
    auth.response.headers.set("Cache-Control", "no-store");
    return auth.response;
  }
  const url = new URL(request.url);
  const dataset = url.searchParams.get("dataset") ?? "scores";
  const format = url.searchParams.get("format") ?? "csv";
  const assessment = url.searchParams.get("assessment") ?? undefined;
  if (!["scores", "map-edges"].includes(dataset) || !["csv", "json"].includes(format)) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
  }
  try {
    const pool = getPool();
    const rows = dataset === "scores" ? await exportScores(pool, assessment) : await exportMapEdges(pool, assessment);
    const columns = dataset === "scores" ? SCORE_EXPORT_COLUMNS : EDGE_EXPORT_COLUMNS;
    await audit(pool, { userId: auth.principal.userId }, "export.scoring", "assessment", assessment ?? null, { after: { dataset, format, scope: "pseudonymised", rows: rows.length, assessment: assessment ?? "all" } });
    const headers = { ...NO_STORE, "Content-Disposition": `attachment; filename="assessment-${dataset}.${format}"` };
    if (format === "json") return Response.json({ columns, rows }, { headers });
    return new Response(toCsv(columns, rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  } catch (err) {
    if (err instanceof AssessmentError) return Response.json({ error: err.code }, { status: 404, headers: NO_STORE });
    throw err;
  }
}
