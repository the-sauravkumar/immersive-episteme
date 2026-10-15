/**
 * POST /cms/media/upload — local-disk media upload (development fallback; with S3 configured the
 * browser uploads directly through a presigned PUT, see src/server/cms/media/actions.ts).
 *
 * multipart/form-data: `file` plus the asset metadata fields (assetMetadataSchema). Staff with
 * `media.upload` only, same-origin only. The body is size-limited while it streams (no trust in
 * Content-Length), the bytes are sniffed against the declared type, hashed and stored under a
 * content-addressed key; the asset row, its version row and the audit entry commit together.
 *
 * 201 { assetId } | 400 invalid_form | 401/403 | 409 duplicate_asset { assetId } | 413 too_large |
 * 422 validation refusals { error, message, fieldErrors? } | 500 server_error.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { authorizeRequest } from "@/server/auth/staff";
import { CmsError } from "@/server/cms/core";
import { fieldErrorsOf } from "@/server/cms/run-action";
import { createAssetFromBytes } from "@/server/cms/media/service";
import { MAX_UPLOAD_BYTES } from "@/server/cms/media/sniff";
import { getMediaStorage } from "@/server/cms/media/storage";
import { getPool } from "@/server/db/client";

/** Multipart overhead allowed on top of the largest file (boundaries + metadata fields). */
const FORM_OVERHEAD = 256 * 1024;

const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Reads the request body, cancelling it as soon as more than `limit` bytes have arrived (no trust
 * in Content-Length). Returns null when the limit was exceeded.
 */
async function readLimited(body: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let seen = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    seen += value.byteLength;
    if (seen > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(seen);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sameOrigin(request)) return json(403, { error: "cross_origin", message: "Uploads must come from this site." });
  const auth = await authorizeRequest(["media.upload"]);
  if (!auth.ok) return json(auth.response.status, { error: auth.response.status === 401 ? "unauthenticated" : "forbidden", message: "Not allowed to upload media." });

  const limit = MAX_UPLOAD_BYTES + FORM_OVERHEAD;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > limit) return json(413, { error: "too_large", message: "The upload is larger than the largest accepted file." });
  if (!request.body) return json(400, { error: "invalid_form", message: "No file was sent." });

  const storage = getMediaStorage();
  if (storage.mode !== "local") return json(409, { error: "wrong_storage_mode", message: "This server uses S3 storage; upload through the presigned flow." });

  let form: FormData;
  try {
    const raw = await readLimited(request.body, limit);
    if (!raw) return json(413, { error: "too_large", message: "The upload is larger than the largest accepted file." });
    form = await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type") ?? "" }, body: raw }).formData();
  } catch {
    return json(400, { error: "invalid_form", message: "The upload could not be read as a form." });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return json(400, { error: "invalid_form", message: "Choose a file to upload." });
  const metadata: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (k !== "file" && typeof v === "string") metadata[k] = v;

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const asset = await createAssetFromBytes(getPool(), auth.principal, storage, { bytes, declaredMime: file.type, metadata });
    return json(201, { assetId: asset.id, message: "Uploaded. Submit it for review when the metadata is complete." });
  } catch (err) {
    if (err instanceof ZodError) return json(422, { error: "invalid_input", message: "Check the highlighted fields.", fieldErrors: fieldErrorsOf(err) });
    if (err instanceof CmsError) {
      const details = err.details as { assetId?: string } | undefined;
      return json(err.status === 422 && err.code === "too_large" ? 413 : err.status, { error: err.code, message: err.message, assetId: details?.assetId });
    }
    console.error("[cms/media] upload failed", err);
    return json(500, { error: "server_error", message: "The upload could not be stored. Nothing was saved; try again." });
  }
}
