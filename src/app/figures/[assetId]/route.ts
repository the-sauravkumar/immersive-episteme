/**
 * GET /figures/<assetId>: the learner and public figure route (DESIGN.md 16, 9.9; DR-018, DR-020).
 *
 * The staff route /cms/media/file/<id> needs a session, so figures shown to learners and on public
 * plates come from here. Both conditions request the same URLs through the same `KnowledgeFigure`,
 * which renders them `unoptimized`: the browser fetches THIS route, never /_next/image, because the
 * image optimiser keeps its own copy for at least minimumCacheTTL and re-serves a stale copy when
 * the source starts answering 404, which would defeat a withdrawal or an expired licence (final
 * review knowledge-05). The files are already 768 px derivatives, so nothing is lost.
 *
 * An asset is served only when `loadLearnerFigure` finds it on the request date: a real image,
 * licence-valid today, no larger than the licence's display cap, and either approved and an
 * illustration of a concept in a published release snapshot (or cleared for public plates), or
 * frozen into a published release and not withdrawn (DR-037). Anything else answers 404 (an
 * unservable asset is indistinguishable from a missing one).
 *
 * Caching: `public, max-age=300, must-revalidate` (FIGURE_MAX_AGE), never longer than the time left
 * in the licence, with the file's sha256 as a strong ETag, so a withdrawal or an expiry reaches
 * every browser and shared cache within five minutes, and a revalidation of an unchanged figure is
 * a 304 (the gate is checked first, every time). Content type from the database row, nosniff,
 * sandbox CSP. The proxy matcher does not cover /figures, so no redirect applies.
 */
import { connection, NextResponse, type NextRequest } from "next/server";

import { figureMaxAge, loadLearnerFigure } from "@/server/cms/media/service";
import { getMediaStorage } from "@/server/cms/media/storage";
import { getPool } from "@/server/db/client";

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export async function GET(request: NextRequest, ctx: RouteContext<"/figures/[assetId]">): Promise<Response> {
  // Request time: licence validity is judged on today's date, never on a prerendered one.
  await connection();
  const { assetId } = await ctx.params;
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const asset = await loadLearnerFigure(getPool(), assetId, day).catch(() => null);
  if (!asset) return notFound();

  const maxAge = figureMaxAge(asset.licenceExpiresOn, now);
  const etag = `"${asset.sha256}"`;
  const headers = {
    "Content-Type": asset.mimeType,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": `public, max-age=${maxAge}, must-revalidate`,
    ETag: etag,
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  };
  // The gate above passed, so an unchanged file needs no bytes (RFC 9110 13.1.2, weak comparison).
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((t) => t.trim().replace(/^W\//, "") === etag || t.trim() === "*")) {
    return new Response(null, { status: 304, headers });
  }

  const storage = getMediaStorage();
  try {
    if (storage.mode === "s3") {
      // Stream through this origin: the CSP allows only same-origin images, and a presigned URL
      // would expire long before the cache entry.
      const url = await storage.presignGet(asset.storageKey, { mime: asset.mimeType, disposition: "inline" });
      const res = await fetch(url);
      if (!res.ok || !res.body) return notFound();
      return new Response(res.body, { status: 200, headers: { ...headers, "Content-Length": String(asset.byteSize) } });
    }
    const bytes = await storage.read(asset.storageKey);
    return new Response(new Uint8Array(bytes), { status: 200, headers: { ...headers, "Content-Length": String(bytes.byteLength) } });
  } catch {
    return notFound();
  }
}
