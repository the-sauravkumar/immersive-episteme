/**
 * POST /api/telemetry/batch: telemetry uploads from both learning conditions and the study
 * pages (client: src/features/telemetry/client). Body: `telemetryBatchSchema`
 * (src/features/telemetry/contracts.ts). Same-origin only; the session comes from the cookies.
 *
 * 200 TelemetryIngestResponse | 400 invalid_json/invalid_batch | 401 unauthenticated |
 * 403 session_mismatch | 410 session_closed | 413 payload_too_large | 429 rate_limited (Retry-After) |
 * 500 server_error. Logic: src/server/telemetry/ingest.ts.
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { MAX_BATCH_BYTES, type TelemetryIngestError } from "@/features/telemetry/contracts";
import { serverEnv } from "@/lib/env";
import { DEMO_COOKIE, PARTICIPANT_COOKIE } from "@/server/auth/cookie-names";
import { getStaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { readLimited } from "@/server/http/read-limited";
import { ingestTelemetryBatch } from "@/server/telemetry/ingest";
import { principalKey, resolveTelemetryPrincipal } from "@/server/telemetry/principal";
import { TokenBucketLimiter } from "@/server/telemetry/rate-limit";

const limiter = new TokenBucketLimiter();

const error = (status: number, code: TelemetryIngestError, message: string, headers?: HeadersInit) =>
  NextResponse.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store", ...headers } });

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BATCH_BYTES) return error(413, "payload_too_large", `Batches are limited to ${MAX_BATCH_BYTES} bytes`);

  // Same-origin only (the cookies are SameSite=Lax; this also refuses cross-site fetches).
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && safeHost(origin) !== host) return error(403, "session_mismatch", "Cross-origin telemetry is not accepted");

  const jar = await cookies();
  const who = await resolveTelemetryPrincipal(
    {
      participantCookie: jar.get(PARTICIPANT_COOKIE)?.value,
      demoCookie: jar.get(DEMO_COOKIE)?.value,
      staff: async () => {
        const p = await getStaffPrincipal();
        return p ? { userId: p.userId, roles: p.roles } : null;
      },
    },
    { secret: serverEnv().BETTER_AUTH_SECRET },
  );
  if (!who.ok) return error(401, "unauthenticated", who.reason === "no_credential" ? "No study, demo or staff session" : "Invalid participant session");

  const rate = limiter.take(principalKey(who.principal));
  if (!rate.allowed) {
    return error(429, "rate_limited", "Too many telemetry uploads", { "Retry-After": String(rate.retryAfterSeconds) });
  }

  // Size-limited while it streams: Content-Length (checked above) is absent on a chunked request,
  // and request.text() would buffer a body of any size before it could be measured.
  const raw = request.body ? await readLimited(request.body, MAX_BATCH_BYTES) : new Uint8Array(0);
  if (!raw) return error(413, "payload_too_large", `Batches are limited to ${MAX_BATCH_BYTES} bytes`);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return error(400, "invalid_json", "The body is not JSON");
  }

  try {
    const outcome = await ingestTelemetryBatch(getPool(), who.principal, body);
    return NextResponse.json(outcome.body, { status: outcome.status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[telemetry] ingest failed", err);
    return error(500, "server_error", "Telemetry could not be stored; retry later");
  }
}
