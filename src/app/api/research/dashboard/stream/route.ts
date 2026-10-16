/**
 * GET /api/research/dashboard/stream?study=<uuid>: Server-Sent Events for the research dashboard.
 *
 * Permission `analytics.view`, checked on connect (same check as the page). Events:
 *  - `ready`  { serverTime, fingerprint, listening }  on connect (the client compares the
 *             fingerprint with the rendered one, so a change missed while disconnected is caught);
 *  - `change` { serverTime }  after every committed change of the study (one per NOTIFY from
 *             migration 0014, delivered through the process-wide LISTEN connection);
 *  - `ping`   { serverTime, listening }  every 25 s (heartbeat; the client's stale timer).
 * `text/event-stream`, `Cache-Control: no-store`; the subscription and timer end when the client
 * disconnects, or when the server closes the stream 15 s before `maxDuration` (S1). No database work per event: the client re-renders the page, and the request
 * coalescer (src/server/research/dashboard-cache.ts) computes once for all viewers.
 */
import { authorizeRequest } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { dashboardFingerprint, dashboardStudy } from "@/server/research/dashboard";
import { dashboardNotifier } from "@/server/research/dashboard-service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };
const HEARTBEAT_MS = 25_000;

/**
 * Vercel ends a function at its max duration with a 504 (FUNCTION_INVOCATION_TIMEOUT), streamed
 * responses included (docs/deploy/RESEARCH.md s4; source change S1). 300 s is the Hobby maximum and
 * the default on every plan; settings in the function code take priority over vercel.json. Must
 * stay a literal: Next.js reads it statically from the build output.
 */
export const maxDuration = 300;
/**
 * The stream closes itself this long before maxDuration, so the cut is a clean end of stream and
 * not a 504: EventSource reconnects after `retry: 3000`, and the `ready` fingerprint on the new
 * connection catches any change made in between (live-status.tsx re-renders on a mismatch).
 */
const STREAM_CLOSE_MARGIN_MS = 15_000;
const STREAM_LIFETIME_MS = maxDuration * 1000 - STREAM_CLOSE_MARGIN_MS;

export async function GET(request: Request): Promise<Response> {
  const auth = await authorizeRequest("analytics.view");
  if (!auth.ok) {
    auth.response.headers.set("Cache-Control", "no-store");
    return auth.response;
  }
  const studyId = new URL(request.url).searchParams.get("study") ?? "";
  if (!UUID_RE.test(studyId)) return Response.json({ error: "invalid_study" }, { status: 400, headers: NO_STORE });
  const pool = getPool();
  if (!(await dashboardStudy(pool, studyId))) return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const notifier = dashboardNotifier();
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = notifier.subscribe(studyId, () => send("change", { serverTime: new Date().toISOString() }));
      const heartbeat = setInterval(() => send("ping", { serverTime: new Date().toISOString(), listening: notifier.connected }), HEARTBEAT_MS);
      // Planned end before the platform limit (the client reconnects by itself).
      const lifetime = setTimeout(() => cleanup(), STREAM_LIFETIME_MS);
      cleanup = () => {
        if (!open) return;
        open = false;
        unsubscribe();
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        request.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", cleanup);
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      void dashboardFingerprint(pool, studyId)
        .then((fp) => send("ready", { ...fp, listening: notifier.connected }))
        .catch(() => send("ready", { serverTime: new Date().toISOString(), fingerprint: null, listening: notifier.connected }));
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
