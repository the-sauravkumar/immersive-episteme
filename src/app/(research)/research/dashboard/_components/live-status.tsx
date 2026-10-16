"use client";

/**
 * Live updates of the research dashboard (push, not poll).
 *
 * While the tab is visible the page holds one Server-Sent Events stream
 * (GET /api/research/dashboard/stream, same permission as the page). A `change` event (a commit
 * that touched the study, from PostgreSQL NOTIFY) at once fetches the per-session telemetry rows
 * and updates that table in place (./live-sessions.tsx: no router transition, so it shows within
 * the 2 s target), and schedules ONE page re-render REFRESH_DELAY_MS later for everything else
 * (router.refresh(); bursts of changes coalesce into one refresh, at most one per
 * REFRESH_DELAY_MS, and into at most one rows fetch in flight plus one queued). On (re)connect the `ready` event carries the current fingerprint; if it
 * differs from the rendered one the page refreshes at once, so nothing missed while disconnected
 * is lost. The stream is closed while the tab is hidden and reopened when it becomes visible.
 *
 * Fallback: when the stream fails FALLBACK_AFTER_ERRORS times without delivering an event, the
 * page polls the cheap fingerprint (GET /api/research/dashboard) every FALLBACK_POLL_MS and
 * retries the stream when the tab is shown again.
 *
 * "Updated" is the SERVER time of the latest confirmation (render, stream event or poll). A stale
 * notice appears when no confirmation arrived for STALE_MS (the stream's heartbeat is 25 s).
 */
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { SessionTelemetryRow } from "@/server/research/dashboard";

import { publishLiveSessions } from "./live-sessions";

export const REFRESH_DELAY_MS = 250;
export const STALE_MS = 30_000;
export const FALLBACK_POLL_MS = 30_000;
export const FALLBACK_AFTER_ERRORS = 3;

/** HH:MM:SS of an ISO timestamp, in UTC (identical on server and client render). */
export function clockUtc(iso: string): string {
  return new Date(iso).toISOString().slice(11, 19);
}

const later = (a: string, b: string | null) => (b && Date.parse(b) > Date.parse(a) ? b : a);

type Mode = "connecting" | "live" | "polling";

export function LiveStatus({ studyId, serverTime, fingerprint }: { studyId: string; serverTime: string; fingerprint: string }) {
  const router = useRouter();
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  /** Client clock of the latest confirmation (set on mount: the page was just rendered from the database). */
  const lastOk = useRef<number | null>(null);
  const rendered = useRef(fingerprint);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Rows fetch in flight, and whether another change arrived meanwhile. */
  const pulling = useRef<{ again: boolean } | null>(null);
  const updatedAt = later(serverTime, confirmedAt);

  useEffect(() => {
    // A new render (after router.refresh) is a confirmation too.
    rendered.current = fingerprint;
    lastOk.current = Date.now();
  }, [fingerprint, serverTime]);

  const confirm = useCallback((time: string) => {
    lastOk.current = Date.now();
    setConfirmedAt((prev) => later(time, prev));
    setError(null);
    setStale(false);
  }, []);

  const scheduleRefresh = useCallback(
    (delay = REFRESH_DELAY_MS) => {
      if (pending.current) return;
      pending.current = setTimeout(() => {
        pending.current = null;
        router.refresh();
      }, delay);
    },
    [router],
  );

  /** Fetches the per-session rows and publishes them (the in-place table update). */
  const pullSessions = useCallback(async () => {
    if (pulling.current) {
      pulling.current.again = true;
      return;
    }
    pulling.current = { again: false };
    try {
      do {
        pulling.current.again = false;
        const res = await fetch(`/api/research/dashboard?study=${encodeURIComponent(studyId)}&include=sessions`, { cache: "no-store", headers: { accept: "application/json" } });
        if (!res.ok) break; // the page refresh still follows; the probe reports errors
        const body = (await res.json()) as { serverTime: string; generatedAt: string; sessions: SessionTelemetryRow[] };
        publishLiveSessions({ studyId, generatedAt: body.generatedAt, rows: body.sessions });
        confirm(body.serverTime);
      } while (pulling.current.again);
    } catch {
      // Network error: the scheduled router.refresh() is the fallback.
    } finally {
      pulling.current = null;
    }
  }, [confirm, studyId]);

  const poll = useCallback(
    async (force = false) => {
      try {
        const res = await fetch(`/api/research/dashboard?study=${encodeURIComponent(studyId)}`, { cache: "no-store", headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "Your session no longer allows this view. Sign in again." : `Server answered ${res.status}.`);
        const body = (await res.json()) as { serverTime: string; fingerprint: string };
        confirm(body.serverTime);
        if (force || body.fingerprint !== rendered.current) {
          rendered.current = body.fingerprint;
          scheduleRefresh(0);
        }
      } catch (err) {
        setError(err instanceof Error && !(err instanceof TypeError) ? err.message : "The server could not be reached.");
      }
    },
    [confirm, scheduleRefresh, studyId],
  );

  useEffect(() => {
    let es: EventSource | null = null;
    let errors = 0;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const stopPolling = () => {
      if (pollTimer !== null) clearInterval(pollTimer);
      pollTimer = null;
    };
    const startPolling = () => {
      if (pollTimer !== null) return;
      setMode("polling");
      void poll();
      pollTimer = setInterval(() => void poll(), FALLBACK_POLL_MS);
    };
    const close = () => {
      es?.close();
      es = null;
    };
    const open = () => {
      if (es || typeof EventSource === "undefined") {
        if (typeof EventSource === "undefined") startPolling();
        return;
      }
      setMode("connecting");
      es = new EventSource(`/api/research/dashboard/stream?study=${encodeURIComponent(studyId)}`);
      es.addEventListener("ready", (e) => {
        errors = 0;
        stopPolling();
        setMode("live");
        const d = JSON.parse((e as MessageEvent<string>).data) as { serverTime: string; fingerprint: string | null };
        confirm(d.serverTime);
        if (d.fingerprint && d.fingerprint !== rendered.current) scheduleRefresh(0);
      });
      es.addEventListener("change", (e) => {
        confirm((JSON.parse((e as MessageEvent<string>).data) as { serverTime: string }).serverTime);
        void pullSessions();
        scheduleRefresh();
      });
      es.addEventListener("ping", (e) => confirm((JSON.parse((e as MessageEvent<string>).data) as { serverTime: string }).serverTime));
      es.onerror = () => {
        errors++;
        setError("The live connection was interrupted; reconnecting.");
        if (errors >= FALLBACK_AFTER_ERRORS) {
          close();
          startPolling();
        }
      };
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        stopPolling();
        errors = 0;
        open();
      } else {
        close();
        stopPolling();
      }
    };
    lastOk.current ??= Date.now();
    if (document.visibilityState === "visible") open();
    document.addEventListener("visibilitychange", onVisibility);
    const staleTimer = setInterval(() => setStale(Date.now() - (lastOk.current ?? Date.now()) > STALE_MS), 1_000);
    return () => {
      close();
      stopPolling();
      clearInterval(staleTimer);
      if (pending.current) clearTimeout(pending.current);
      pending.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [confirm, poll, pullSessions, scheduleRefresh, studyId]);

  const label = stale ? "Stale" : mode === "live" ? "Live" : mode === "polling" ? "Polling" : "Connecting";
  // DESIGN.md 10 "Live status": token colour, an icon AND a word, plus an "as of" time in mono.
  const tone = stale ? "text-danger" : mode === "live" ? "text-ok" : "text-warn";
  const Icon = stale ? CircleAlert : mode === "live" ? CircleCheck : RefreshCw;
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:items-end">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
        <span className="inline-flex items-center gap-2 font-sans text-[0.9375rem] leading-5" data-testid="dashboard-updated" data-mode={mode}>
          <Icon aria-hidden="true" className={`size-4 shrink-0 stroke-[1.75] ${tone}`} />
          <span>
            <span className={`font-semibold ${tone}`}>{label}</span>
            <span className="text-ink-2">, as of </span>
            <time dateTime={updatedAt} className="text-id text-ink">
              {clockUtc(updatedAt)}
            </time>
            <span className="text-ink-2"> UTC</span>
          </span>
        </span>
        <Button type="button" variant="outline" onClick={() => void poll(true)}>
          Refresh
        </Button>
      </div>
      <span className="text-credit sm:text-right">
        {mode === "polling" ? `Live connection unavailable: checking every ${FALLBACK_POLL_MS / 1000} s.` : "Updates as soon as new data are stored, while this tab is visible."}
      </span>
      {stale ? (
        <p role="alert" className="inline-flex items-start gap-2 border border-danger bg-ground px-3 py-1 font-sans text-base leading-6 text-ink">
          <span>
            <span className="font-semibold text-danger">Stale:</span> the figures were last confirmed at <span className="text-id">{clockUtc(updatedAt)}</span> UTC, more than {STALE_MS / 1000} s ago.{" "}
            {error ?? "Waiting for the server."}
          </span>
        </p>
      ) : null}
    </div>
  );
}
