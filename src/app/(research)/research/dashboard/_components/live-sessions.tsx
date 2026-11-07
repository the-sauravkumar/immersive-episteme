"use client";

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

export function publishLiveSessions(next: LiveSessions): void {
  if (current && current.studyId === next.studyId && Date.parse(current.generatedAt) >= Date.parse(next.generatedAt)) return;
  current = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

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
            Stage Time (min)
          </TableHead>
          <TableHead scope="col" numeric>
            Stops
          </TableHead>
          <TableHead scope="col" numeric>
            Revisits
          </TableHead>
          <TableHead scope="col" numeric>
            Back-Steps
          </TableHead>
          <TableHead scope="col" numeric>
            Sources
          </TableHead>
          <TableHead scope="col" numeric>
            Pause (min)
          </TableHead>
          <TableHead scope="col">Timeline</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shown.map((s) => (
          <TableRow key={s.sessionId}>
            <TableCell className="t-table font-semibold wrap-anywhere">{s.participantCode}</TableCell>
            <TableCell className="whitespace-nowrap">{conditionNames[s.conditionId] ?? s.conditionId}</TableCell>
            <TableCell className="whitespace-nowrap">{s.status.replace(/_/g, " ")}</TableCell>
            <TableCell numeric>{s.events}</TableCell>
            <TableCell numeric>{minutes(s.stageMs)}</TableCell>
            <TableCell numeric>{s.stopsVisited}</TableCell>
            <TableCell numeric>{s.revisits}</TableCell>
            <TableCell numeric>{s.backSteps}</TableCell>
            <TableCell numeric>{s.sourcesOpened}</TableCell>
            <TableCell numeric>{minutes(s.pauseMs)}</TableCell>
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
