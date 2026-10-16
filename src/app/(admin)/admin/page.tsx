import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { BLOCK_LINK, Mono } from "@/components/cms/bits";
import { ConsolePage } from "@/components/shell/gates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { can } from "@/lib/permissions/can";
import { visibleNav } from "@/lib/permissions/console-routes";
import { titleCase } from "@/lib/text/title-case";
import { ADMIN_ANY, getHealthReport, type Check } from "@/server/admin/health";
import { requirePermission } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Administration" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page() {
  return (
    <ConsolePage path="/admin" title="Administration" description="Platform health, and the users, roles, settings and audit log you can manage.">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Overview />
      </Suspense>
    </ConsolePage>
  );
}

/** What each admin section holds (the sidebar shows only the names). */
const SECTION_NOTES: Record<string, string> = {
  "/admin/users": "Staff accounts: create, lock and unlock them, and add or remove roles.",
  "/admin/access": "Invite codes for the invite-only site: create them, see their use counts and revoke them.",
  "/admin/roles": "The role and permission matrix, the policy behind it and who holds each role.",
  "/admin/settings": "The effective platform configuration, fixed by the deployment.",
  "/admin/audit": "The append-only record of privileged actions, with filters.",
};

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function duration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s < 120 ? `${s.toFixed(1)} s` : `${(s / 60).toFixed(1)} min`;
}

type State = "ok" | "warn" | "error";

/** Status with an icon and a word, never colour alone (R-A4); ok / warn / danger are console-only colours. */
function StatusBadge({ state }: { state: State }) {
  if (state === "ok")
    return (
      <Badge variant="ok">
        <CircleCheck aria-hidden="true" />
        OK
      </Badge>
    );
  if (state === "warn")
    return (
      <Badge variant="warn">
        <TriangleAlert aria-hidden="true" />
        Attention
      </Badge>
    );
  return (
    <Badge variant="danger">
      <CircleAlert aria-hidden="true" />
      Unavailable
    </Badge>
  );
}

/**
 * One health check as an equal-height card (grid stretch): a Title Case h3 with the status badge on
 * its line, then a label/value list. Numeric values are right-aligned with tabular figures.
 */
function Panel<T>({ id, title, check, status, children }: { id: string; title: string; check: Check<T>; status?: (v: T) => "ok" | "warn"; children: (v: T) => ReactNode }) {
  const state: State = !check.ok ? "error" : status ? status(check.value) : "ok";
  return (
    <Card size="sm" plate className="h-full">
      <section aria-labelledby={`h-${id}`} className="flex flex-col gap-3">
        <CardHeader className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h3 id={`h-${id}`} className="text-h3 text-ink">
            {titleCase(title)}
          </h3>
          <StatusBadge state={state} />
        </CardHeader>
        <CardContent>
          {check.ok ? (
            <dl className="flex flex-col">{children(check.value)}</dl>
          ) : (
            <p className="flex items-start gap-2 text-[0.9375rem] leading-6 text-danger">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 stroke-[1.75]" />
              <span className="min-w-0">
                <span className="font-semibold">Error: </span>
                {check.error}
              </span>
            </p>
          )}
        </CardContent>
      </section>
    </Card>
  );
}

/**
 * A version string such as "18.6 (Debian 18.6-1.pgdg12+2)" in mono that wraps only at its spaces,
 * never inside a token (browsers otherwise break after "-").
 */
function Version({ text }: { text: string }) {
  const parts = text.split(/\s+/).filter(Boolean);
  return (
    <code className="text-id text-ink">
      {parts.map((p, i) => (
        <span key={i} className="whitespace-nowrap">
          {i > 0 ? " " : null}
          {p}
        </span>
      ))}
    </code>
  );
}

function Row({ k, v, numeric = false }: { k: ReactNode; v: ReactNode; numeric?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-x-4 border-b border-b-rule py-2 last:border-b-0">
      <dt className="min-w-0 text-[0.9375rem] leading-6 text-ink-2">{k}</dt>
      <dd className={numeric ? "text-value text-right whitespace-nowrap tabular-nums" : "text-value min-w-0 text-right [overflow-wrap:anywhere]"}>{v}</dd>
    </div>
  );
}

async function Overview() {
  const actor = await requirePermission(ADMIN_ANY);
  const h = await getHealthReport(getPool(), actor);
  const links = visibleNav(actor, "admin").filter((r) => r.path !== "/admin");
  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="health" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="health" className="text-h2 text-ink">
            {titleCase("health")}
          </h2>
          <p className="text-body text-ink-2">
            Checked <time dateTime={h.checkedAt} className="text-id tabular-nums">{h.checkedAt.slice(0, 19).replace("T", " ")}</time> UTC. Reload the page to check again.
          </p>
        </div>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <li>
            <Panel id="database" title="Database" check={h.database}>
              {(v) => (
                <>
                  <Row
                    k="Server"
                    v={
                      <>
                        PostgreSQL <Version text={v.serverVersion} />
                      </>
                    }
                  />
                  <Row k="Round trip" v={`${v.latencyMs} ms`} numeric />
                </>
              )}
            </Panel>
          </li>
          <li>
            <Panel id="migrations" title="Migrations" check={h.migrations} status={(v) => (v.applied === v.expected ? "ok" : "warn")}>
              {(v) => (
                <>
                  <Row k="Applied" v={`${v.applied} of ${v.expected}`} numeric />
                  <Row k="Pending" v={v.pendingTags.length ? v.pendingTags.join(", ") : "none"} />
                </>
              )}
            </Panel>
          </li>
          <li>
            <Panel id="telemetry" title="Telemetry ingest" check={h.telemetry} status={(v) => (v.openSequenceGaps > 0 ? "warn" : "ok")}>
              {(v) =>
                v.batchesTotal === 0 ? (
                  <Row k="Batches" v="No batches received yet" />
                ) : (
                  <>
                    <Row
                      k="Last batch (UTC)"
                      v={
                        v.lastReceivedAt ? (
                          <time dateTime={v.lastReceivedAt} className="text-id tabular-nums">
                            {v.lastReceivedAt.slice(0, 19).replace("T", " ")}
                          </time>
                        ) : (
                          "—"
                        )
                      }
                      numeric
                    />
                    <Row k="Received" v={`${duration((v.lastReceivedAgeSeconds ?? 0) * 1000)} ago`} numeric />
                    <Row k="Batches, last 24 h" v={v.batches24h} numeric />
                    <Row k="Ingest lag p50 / p95" v={v.batches24h ? `${duration(v.lagP50Ms)} / ${duration(v.lagP95Ms)}` : "no batches in 24 h"} numeric />
                    <Row k="Open sequence gaps" v={v.openSequenceGaps} numeric />
                  </>
                )
              }
            </Panel>
          </li>
          <li>
            <Panel id="quarantine" title="Quarantine" check={h.quarantine} status={(v) => (v.unresolved > 0 ? "warn" : "ok")}>
              {(v) => (
                <>
                  <Row k="Unresolved events" v={v.unresolved} numeric />
                  {v.byReason.map((r) => (
                    <Row key={r.reason} k={<Mono>{r.reason}</Mono>} v={r.n} numeric />
                  ))}
                </>
              )}
            </Panel>
          </li>
          <li>
            <Panel id="storage" title="Media storage" check={h.storage} status={(v) => (v.localDirWritable === false ? "warn" : "ok")}>
              {(v) => (
                <>
                  <Row k="Mode" v={v.config.mode === "s3" ? `S3 bucket ${v.config.bucket}` : "Local disk"} />
                  {v.config.mode === "local" ? <Row k="Directory" v={<span className="text-id">{v.config.localDir}</span>} /> : null}
                  {v.config.mode === "local" ? <Row k="Writable" v={v.localDirWritable ? "yes" : "no (missing or not writable)"} /> : null}
                  <Row k="Assets" v={v.assets} numeric />
                  <Row k="Stored" v={bytes(v.totalBytes)} numeric />
                </>
              )}
            </Panel>
          </li>
        </ul>
        <p className="text-credit max-w-[40rem]">
          Ingest lag is the time between the client sending a batch and the server receiving it (client clocks can be wrong, so treat outliers with care).
        </p>
      </section>

      <section aria-labelledby="research-dashboard" className="flex max-w-[40rem] flex-col gap-3">
        <h2 id="research-dashboard" className="text-h2 text-ink">
          {titleCase("research dashboard")}
        </h2>
        <p className="text-body text-ink">
          Scores by condition (primary outcome first), telemetry and time, data quality and metric definitions for one study, updated live. Descriptive reference for the
          research team.
        </p>
        {can(actor, "analytics.view") ? (
          <Button asChild variant="outline" className="w-fit">
            <Link href="/research/dashboard">Open the research dashboard</Link>
          </Button>
        ) : (
          <p className="text-body text-ink-2">
            Your roles do not include the analytics.view permission, so the dashboard is not available to you. A principal investigator, researcher or research analyst role
            grants it.
          </p>
        )}
      </section>

      {links.length ? (
        <section aria-labelledby="sections" className="flex max-w-[48rem] flex-col gap-3">
          <h2 id="sections" className="text-h2 text-ink">
            {titleCase("sections")}
          </h2>
          <ul className="flex flex-col border-y-[1.5px] border-y-ink">
            {links.map((l) => (
              <li key={l.path} className="grid gap-x-6 border-b border-b-rule py-1 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-baseline">
                <Link href={l.path} className={`${BLOCK_LINK} text-ui`}>
                  {l.label}
                </Link>
                {SECTION_NOTES[l.path] ? <p className="text-body pb-2 text-ink-2 sm:pb-0">{SECTION_NOTES[l.path]}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
