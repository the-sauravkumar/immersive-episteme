"use client";

import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { SessionTelemetryRow } from "@/server/research/dashboard";

import { publishLiveSessions } from "./live-sessions";

const REFRESH_DELAY_MS = 250;
const STALE_MS = 30_000;
const FALLBACK_POLL_MS = 30_000;
const FALLBACK_AFTER_ERRORS = 3;

function clockUtc(iso: string): string {
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
  const lastOk = useRef<number | null>(null);
  const rendered = useRef(fingerprint);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulling = useRef<{ again: boolean } | null>(null);
  const updatedAt = later(serverTime, confirmedAt);

  useEffect(() => {
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
        if (!res.ok) break;
        const body = (await res.json()) as { serverTime: string; generatedAt: string; sessions: SessionTelemetryRow[] };
        publishLiveSessions({ studyId, generatedAt: body.generatedAt, rows: body.sessions });
        confirm(body.serverTime);
      } while (pulling.current.again);
    } catch {
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
      const notListening = (listening: boolean | undefined): boolean => {
        if (listening !== false) return false;
        close();
        startPolling();
        return true;
      };
      es.addEventListener("ready", (e) => {
        errors = 0;
        const d = JSON.parse((e as MessageEvent<string>).data) as { serverTime: string; fingerprint: string | null; listening?: boolean };
        confirm(d.serverTime);
        if (notListening(d.listening)) return;
        stopPolling();
        setMode("live");
        if (d.fingerprint && d.fingerprint !== rendered.current) scheduleRefresh(0);
      });
      es.addEventListener("change", (e) => {
        confirm((JSON.parse((e as MessageEvent<string>).data) as { serverTime: string }).serverTime);
        void pullSessions();
        scheduleRefresh();
      });
      es.addEventListener("ping", (e) => {
        const d = JSON.parse((e as MessageEvent<string>).data) as { serverTime: string; listening?: boolean };
        confirm(d.serverTime);
        notListening(d.listening);
      });
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
  const tone = stale ? "text-madder-text" : mode === "live" ? "text-ok" : "text-turmeric";
  const Icon = stale ? CircleAlert : mode === "live" ? CircleCheck : RefreshCw;
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:items-end">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
        <span className="inline-flex items-center gap-2 font-sans t-s" data-testid="dashboard-updated" data-mode={mode}>
          <Icon aria-hidden="true" className={`size-4 shrink-0 stroke-[1.75] ${tone}`} />
          <span>
            <span className={`font-semibold ${tone}`}>{label}</span>
            <span className="text-lime-dim">, as of </span>
            <time dateTime={updatedAt} className="t-table font-semibold wrap-anywhere text-lime">
              {clockUtc(updatedAt)}
            </time>
            <span className="text-lime-dim"> UTC</span>
          </span>
        </span>
        <Button type="button" variant="outline" onClick={() => void poll(true)}>
          Refresh
        </Button>
      </div>
      <span className="t-s text-lime-dim sm:text-right">
        {mode === "polling" ? `Live connection unavailable: checking every ${FALLBACK_POLL_MS / 1000} s.` : "Updates as soon as new data are stored, while this tab is visible."}
      </span>
      {stale ? (
        <p role="alert" className="inline-flex items-start gap-2 border border-madder-text bg-vat px-3 py-1 t-b text-lime">
          <span>
            <span className="font-semibold text-madder-text">Stale:</span> the figures were last confirmed at <span className="t-table font-semibold wrap-anywhere">{clockUtc(updatedAt)}</span> UTC, more than {STALE_MS / 1000} s ago.{" "}
            {error ?? "Waiting for the server."}
          </span>
        </p>
      ) : null}
    </div>
  );
}
