/**
 * GET /research/exports/download?study=<uuid>&scope=pseudonymised|identified&format=json|csv&table=<name>
 *
 * Builds the export on request (nothing is cached or written to disk) and records an audit row.
 * The scope is decided on the server from the caller's permissions: an identified export needs
 * `exports.identified`; everyone else receives the pseudonymised scope or a 403.
 */
import { serverEnv } from "@/lib/env";
import { authorizeRequest } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { audit } from "@/server/research/db";
import { ExportForbiddenError, resolveExportScope } from "@/server/research/exports/access";
import { buildExportBundle, bundleTableCsv, type ExportScope } from "@/server/research/exports/build";
import { TABLE_BY_NAME } from "@/server/research/exports/dictionary";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const auth = await authorizeRequest(["exports.create", "exports.identified"]);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const studyId = url.searchParams.get("study") ?? "";
  const requested: ExportScope = url.searchParams.get("scope") === "identified" ? "identified" : "pseudonymised";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const table = url.searchParams.get("table") ?? "";
  if (!UUID_RE.test(studyId)) return Response.json({ error: "invalid_study" }, { status: 400 });
  if (format === "csv" && !TABLE_BY_NAME.has(table)) return Response.json({ error: "invalid_table" }, { status: 400 });

  let scope: ExportScope;
  try {
    scope = resolveExportScope(auth.principal, requested);
  } catch (err) {
    if (err instanceof ExportForbiddenError) return Response.json({ error: "forbidden", message: err.message }, { status: 403 });
    throw err;
  }
  const pool = getPool();
  const exists = await pool.query("SELECT slug FROM studies WHERE id = $1", [studyId]);
  const slug = exists.rows[0]?.slug as string | undefined;
  if (!slug) return Response.json({ error: "not_found" }, { status: 404 });

  const bundle = await buildExportBundle(pool, studyId, { scope, appBuild: serverEnv().APP_BUILD_VERSION });
  if (format === "csv" && !bundle.tables[table]) return Response.json({ error: "table_not_in_scope" }, { status: 403 });
  await audit(pool, { userId: auth.principal.userId }, "export.create", "study", studyId, {
    after: { scope, format, table: format === "csv" ? table : null, rows: Object.fromEntries(Object.entries(bundle.tables).map(([k, v]) => [k, v.length])) },
  });
  const stamp = bundle.generatedAt.replace(/[:.]/g, "-");
  const body = format === "csv" ? bundleTableCsv(bundle, table) : JSON.stringify(bundle, null, 2);
  const filename = format === "csv" ? `${slug}-${scope}-${table}-${stamp}.csv` : `${slug}-${scope}-${stamp}.json`;
  return new Response(body, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
