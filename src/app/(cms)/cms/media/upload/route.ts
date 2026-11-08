import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { refusalMessage } from "@/lib/permissions/can";
import { authorizeRequest } from "@/server/auth/staff";
import { CmsError } from "@/server/cms/core";
import { fieldErrorsOf } from "@/server/cms/run-action";
import { createAssetFromBytes } from "@/server/cms/media/service";
import { MAX_UPLOAD_BYTES } from "@/server/cms/media/sniff";
import { getMediaStorage } from "@/server/cms/media/storage";
import { getPool } from "@/server/db/client";
import { readLimited } from "@/server/http/read-limited";

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sameOrigin(request)) return json(403, { error: "cross_origin", message: "Uploads must come from this site." });
  const auth = await authorizeRequest(["media.upload"]);
  if (!auth.ok) return json(auth.response.status, { error: auth.response.status === 401 ? "unauthenticated" : "forbidden", message: auth.response.status === 401 ? "You are signed out. Sign in again, then upload." : refusalMessage(["media.upload"]) });

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
