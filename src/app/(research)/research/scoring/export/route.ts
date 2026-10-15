/**
 * GET /research/scoring/export?dataset=scores|map-edges&format=csv|json[&assessment=<id>]
 * Pseudonymised assessment data for independent analysis (participant codes, never names).
 * Requires `assessments.score` or `exports.create`.
 */
import { AssessmentError } from "@/server/assessment/common";
import { EDGE_EXPORT_COLUMNS, exportMapEdges, exportScores, SCORE_EXPORT_COLUMNS, toCsv } from "@/server/assessment/scoring";
import { authorizeRequest } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

export async function GET(request: Request): Promise<Response> {
  const auth = await authorizeRequest(["assessments.score", "exports.create"]);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const dataset = url.searchParams.get("dataset") ?? "scores";
  const format = url.searchParams.get("format") ?? "csv";
  const assessment = url.searchParams.get("assessment") ?? undefined;
  if (!["scores", "map-edges"].includes(dataset) || !["csv", "json"].includes(format)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const pool = getPool();
    const rows = dataset === "scores" ? await exportScores(pool, assessment) : await exportMapEdges(pool, assessment);
    const columns = dataset === "scores" ? SCORE_EXPORT_COLUMNS : EDGE_EXPORT_COLUMNS;
    const name = `assessment-${dataset}.${format}`;
    const headers = {
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    };
    if (format === "json") return Response.json({ columns, rows }, { headers });
    return new Response(toCsv(columns, rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  } catch (err) {
    if (err instanceof AssessmentError) return Response.json({ error: err.code }, { status: 404 });
    throw err;
  }
}
