import { connection, NextResponse, type NextRequest } from "next/server";

import { FIGURE_MAX_AGE, loadLearnerFigure } from "@/server/cms/media/service";
import { getMediaStorage } from "@/server/cms/media/storage";
import { getPool } from "@/server/db/client";

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

function unavailable(stage: "database" | "storage", assetId: string, error: unknown): Response {
  console.error(`[figures] ${stage} failure serving ${assetId}`, error);
  return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { ...NO_STORE, "Retry-After": "60" } });
}

export async function GET(request: NextRequest, ctx: RouteContext<"/figures/[assetId]">): Promise<Response> {
  await connection();
  const { assetId } = await ctx.params;
  let asset: Awaited<ReturnType<typeof loadLearnerFigure>>;
  try {
    asset = await loadLearnerFigure(getPool(), assetId);
  } catch (error) {
    return unavailable("database", assetId, error);
  }
  if (!asset) return notFound();

  const etag = `"${asset.sha256}"`;
  const headers = {
    "Content-Type": asset.mimeType,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": `private, max-age=${FIGURE_MAX_AGE}, must-revalidate`,
    ETag: etag,
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  };
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((t) => t.trim().replace(/^W\//, "") === etag || t.trim() === "*")) {
    return new Response(null, { status: 304, headers });
  }

  const storage = getMediaStorage();
  try {
    if (storage.mode === "s3") {
      const url = await storage.presignGet(asset.storageKey, { mime: asset.mimeType, disposition: "inline" });
      const res = await fetch(url);
      if (!res.ok || !res.body) return unavailable("storage", assetId, new Error(`object store answered ${res.status}`));
      return new Response(res.body, { status: 200, headers });
    }
    const bytes = await storage.read(asset.storageKey);
    return new Response(new Uint8Array(bytes), { status: 200, headers });
  } catch (error) {
    return unavailable("storage", assetId, error);
  }
}
