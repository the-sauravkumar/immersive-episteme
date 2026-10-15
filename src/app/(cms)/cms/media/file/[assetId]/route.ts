/**
 * GET /cms/media/file/<assetId> — staff-only preview/download of a stored asset original.
 * Local store: streams the bytes. S3: redirects to a 5-minute presigned GET (after the same
 * authorisation). Content-Type always comes from the database row (the sniffed type), never from
 * the stored object, with nosniff; images inline, everything else as an attachment.
 */
import { NextResponse, type NextRequest } from "next/server";

import { authorizeRequest } from "@/server/auth/staff";
import { loadAssetRef } from "@/server/cms/media/service";
import { getMediaStorage } from "@/server/cms/media/storage";
import { getPool } from "@/server/db/client";

function disposition(kind: string, title: string, storageKey: string): string {
  const ext = storageKey.split(".").pop() ?? "bin";
  const safe = title.replace(/[^A-Za-z0-9 ._-]/g, "_").slice(0, 80).trim() || "asset";
  return `${kind === "image" ? "inline" : "attachment"}; filename="${safe}.${ext}"`;
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/cms/media/file/[assetId]">): Promise<Response> {
  const auth = await authorizeRequest(["content.read", "media.upload", "media.review"]);
  if (!auth.ok) return auth.response;
  const { assetId } = await ctx.params;
  const asset = await loadAssetRef(getPool(), assetId);
  if (!asset) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const storage = getMediaStorage();
  const headers = {
    "Content-Type": asset.mimeType,
    "Content-Disposition": disposition(asset.kind, asset.title, asset.storageKey),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=300",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  };
  if (storage.mode === "s3") {
    const url = await storage.presignGet(asset.storageKey, { mime: asset.mimeType, disposition: headers["Content-Disposition"] });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const bytes = await storage.read(asset.storageKey);
    return new Response(new Uint8Array(bytes), { status: 200, headers: { ...headers, "Content-Length": String(bytes.byteLength) } });
  } catch {
    return NextResponse.json({ error: "file_missing", message: "The stored file is missing." }, { status: 404 });
  }
}
