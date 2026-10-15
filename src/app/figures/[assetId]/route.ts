/**
 * GET /figures/<assetId>: the learner and public figure route (DESIGN.md 16, 9.9; DR-018, DR-020).
 *
 * The staff route /cms/media/file/<id> needs a session, and the Next image optimiser fetches its
 * sources without the visitor's cookies, so figures shown to learners and on public plates come
 * from here. Both conditions request the same URLs through the same `KnowledgeFigure`.
 *
 * An asset is served only when `loadLearnerFigure` finds it on the request date: a real image,
 * approved, licence-valid today, no larger than the licence's display cap, and either an
 * illustration of a concept in a published release snapshot or cleared for public plates.
 * Anything else answers 404 (an unservable asset is indistinguishable from a missing one).
 *
 * Caching: `public, max-age=31536000, immutable` (content-addressed files never change), except
 * that a licence with an expiry date limits max-age to the time left in the licence, so no cache
 * keeps a figure after its term. Content type from the database row, nosniff, sandbox CSP. The
 * proxy matcher does not cover /figures, so no redirect applies.
 */
import { connection, NextResponse, type NextRequest } from "next/server";

import { FIGURE_MAX_AGE, figureMaxAge, loadLearnerFigure } from "@/server/cms/media/service";
import { getMediaStorage } from "@/server/cms/media/storage";
import { getPool } from "@/server/db/client";

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export async function GET(_request: NextRequest, ctx: RouteContext<"/figures/[assetId]">): Promise<Response> {
  // Request time: licence validity is judged on today's date, never on a prerendered one.
  await connection();
  const { assetId } = await ctx.params;
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const asset = await loadLearnerFigure(getPool(), assetId, day).catch(() => null);
  if (!asset) return notFound();

  const maxAge = figureMaxAge(asset.licenceExpiresOn, now);
  const headers = {
    "Content-Type": asset.mimeType,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": maxAge >= FIGURE_MAX_AGE ? `public, max-age=${FIGURE_MAX_AGE}, immutable` : `public, max-age=${maxAge}`,
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  };

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
