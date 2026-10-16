"use client";

/**
 * The per-session telemetry table of the research dashboard, updated in place by the live stream.
 *
 * Why not only router.refresh(): a refresh re-renders the whole dashboard (every figure and table)
 * inside a React transition, and on the production build that transition committed 2.2-4.0 s
 * after the insert although the server answered in 200-300 ms (step 3 open item
 * research-dashboard-live). The per-session rows are the figures researchers watch live, so they
 * take a direct path: on every `change` event LiveStatus fetches just these rows
 * (GET /api/research/dashboard?study=…&include=sessions, the same coalesced server computation
 * as the page) and publishes them here; the table re-renders through useSyncExternalStore, which
 * commits synchronously, not as a transition. router.refresh() still follows for the rest of the
 * page. Whichever data are newer (server `generatedAt`) are shown, so a slower refresh can never
 * roll the table back.
 */
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { fixed } from "@/components/analytics/encoding";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SessionTelemetryRow } from "@/server/research/dashboard";

import { LINK_44 } from "../../_components/common";

export interface LiveSessions {
  studyId: string;
  generatedAt: string;
  rows: SessionTelemetryRow[];
}

let current: LiveSessions | null = null;
const listeners = new Set<() => void>();

/** Publishes rows fetched by the live stream (ignored when older than what is already held). */
export function publishLiveSessions(next: LiveSessions): void {
  if (current && current.studyId === next.studyId && Date.parse(current.generatedAt) >= Date.parse(next.generatedAt)) return;
  current = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The newer of the server-rendered rows and the live rows of the same study. */
export function newestSessions(rendered: LiveSessions, live: LiveSessions | null): LiveSessions {
  return live && live.studyId === rendered.studyId && Date.parse(live.generatedAt) > Date.parse(rendered.generatedAt) ? live : rendered;
}

const minutes = (ms: number) => fixed(ms / 60000, 2);

export function LiveSessionsTable({
  studyId,
  generatedAt,
  rows,
  conditionNames,
  maySessions,
  number,
}: {
  studyId: string;
  generatedAt: string;
  rows: SessionTelemetryRow[];
  conditionNames: Record<string, string>;
  maySessions: boolean;
  number: number;
}) {
  const live = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const shown = newestSessions({ studyId, generatedAt, rows }, live).rows;
  return (
    <Table caption="Per-Session Telemetry" number={number} hoverRows density="compact">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Participant</TableHead>
          <TableHead scope="col">Condition</TableHead>
          <TableHead scope="col">Status</TableHead>
          <TableHead scope="col" numeric>
            Events
          </TableHead>
          <TableHead scope="col" numeric>
            Exposure (min)
          </TableHead>
          <TableHead scope="col" numeric>
            Navigation (min)
          </TableHead>
          <TableHead scope="col" numeric>
            Pause (min)
          </TableHead>
          <TableHead scope="col" numeric>
            Concepts
          </TableHead>
          <TableHead scope="col" numeric>
            Coverage
          </TableHead>
          <TableHead scope="col" numeric>
            Relations
          </TableHead>
          <TableHead scope="col" numeric>
            Citations
          </TableHead>
          <TableHead scope="col" numeric>
            Guidance
          </TableHead>
          <TableHead scope="col">Timeline</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shown.map((s) => (
          <TableRow key={s.sessionId}>
            <TableCell className="text-id">{s.participantCode}</TableCell>
            <TableCell className="whitespace-nowrap">{conditionNames[s.conditionId] ?? s.conditionId}</TableCell>
            <TableCell className="whitespace-nowrap">{s.status.replace(/_/g, " ")}</TableCell>
            <TableCell numeric>{s.events}</TableCell>
            <TableCell numeric>{minutes(s.exposureMs)}</TableCell>
            <TableCell numeric>{minutes(s.navigationMs)}</TableCell>
            <TableCell numeric>{minutes(s.pauseMs)}</TableCell>
            <TableCell numeric>{s.conceptsExposed}</TableCell>
            <TableCell numeric>{fixed(s.coverage, 2)}</TableCell>
            <TableCell numeric>{s.relationshipsFollowed}</TableCell>
            <TableCell numeric>{s.citationOpens}</TableCell>
            <TableCell numeric>{s.guidanceUses}</TableCell>
            <TableCell>
              {maySessions ? (
                <Link className={LINK_44} href={`/research/sessions/${s.sessionId}`}>
                  Open<span className="sr-only"> the timeline of {s.participantCode}</span>
                </Link>
              ) : (
                "–"
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
