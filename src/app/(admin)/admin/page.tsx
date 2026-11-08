import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { RevealInviteButton } from "@/components/access/invite-admin-forms";
import { Empty, Section, Stamp } from "@/components/cms/bits";
import { ConsolePage } from "@/components/shell/gates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { serverEnv } from "@/lib/env";
import { can } from "@/lib/permissions/can";
import { titleCase } from "@/lib/text/title-case";
import { listInvites } from "@/server/access/invites";
import { ADMIN_ANY, getHealthReport, type Check } from "@/server/admin/health";
import { listStaffUsers } from "@/server/admin/users";
import { requirePermission } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Admin Home" };

export const instant = false;

export default async function Page() {
  const actor = await requirePermission(ADMIN_ANY);
  const superAdmin = can(actor, "admin.roles");
  return (
    <ConsolePage
      path="/admin"
      title={superAdmin ? "Super Admin home" : "Admin home"}
      description={
        superAdmin
          ? "People waiting for access, the invite codes in use and their links, whether the platform is healthy, and the settings, audit log and roles that only a Super Admin can open."
          : "People waiting for access, and the invite codes in use and their links."
      }
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Overview />
      </Suspense>
    </ConsolePage>
  );
}

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

function Panel<T>({ id, title, check, status, children }: { id: string; title: string; check: Check<T>; status?: (v: T) => "ok" | "warn"; children: (v: T) => ReactNode }) {
  const state: State = !check.ok ? "error" : status ? status(check.value) : "ok";
  return (
    <Card size="sm" plate className="h-full">
      <section aria-labelledby={`h-${id}`} className="flex flex-col gap-3">
        <CardHeader className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h3 id={`h-${id}`} className="t-label text-lime">
            {titleCase(title)}
          </h3>
          <StatusBadge state={state} />
        </CardHeader>
        <CardContent>
          {check.ok ? (
            <dl className="flex flex-col">{children(check.value)}</dl>
          ) : (
            <p className="flex items-start gap-2 t-s text-madder-text">
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

function Version({ text }: { text: string }) {
  const parts = text.split(/\s+/).filter(Boolean);
  return (
    <code className="t-table font-semibold wrap-anywhere text-lime">
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
    <div className="flex items-baseline justify-between gap-x-4 border-b border-b-line py-2 last:border-b-0">
      <dt className="shrink-0 t-s text-lime-dim">{k}</dt>
      <dd className={numeric ? "t-b text-right whitespace-nowrap tabular-nums" : "t-b min-w-0 text-right [overflow-wrap:anywhere]"}>{v}</dd>
    </div>
  );
}

const SHOWN = 8;

async function NeedsYou() {
  const actor = await requirePermission(ADMIN_ANY);
  if (!can(actor, "admin.users")) return null;
  const pool = getPool();
  const [people, invites] = await Promise.all([listStaffUsers(pool, actor), listInvites(pool, actor)]);
  const waiting = people.filter((u) => !u.disabledAt && u.role === null);
  const active = invites.filter((i) => i.status === "active");
  const ending = active.filter((i) => i.endsWithinWeek);
  const full = invites.filter((i) => i.status === "used_up");
  const origin = serverEnv().BETTER_AUTH_URL;
  return (
    <div className="grid items-stretch gap-6 lg:grid-cols-2">
      <Section
        id="awaiting"
        title="People waiting for access"
        description="They signed in with Google and see nothing until you give them a role. Open Manage on their row in People and choose Give access."
        actions={
          <Button asChild variant={waiting.length ? "default" : "outline"}>
            <Link href={waiting.length ? "/admin/users?status=awaiting" : "/admin/users"}>{waiting.length ? `Give access (${waiting.length})` : "Open people"}</Link>
          </Button>
        }
      >
        {waiting.length === 0 ? (
          <Empty>Nobody is waiting.</Empty>
        ) : (
          <ul className="flex flex-col">
            {waiting.slice(0, SHOWN).map((u) => (
              <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-line py-2 first:border-t-0">
                <span className="min-w-0">
                  <span className="text-lime">{u.name}</span> <span className="t-s text-lime-dim [overflow-wrap:anywhere]">{u.email}</span>
                </span>
                <span className="t-s text-lime-dim">
                  since <Stamp at={u.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section
        id="invites"
        title="Invite codes"
        description={`${active.length} code${active.length === 1 ? "" : "s"} let people in now.${ending.length ? ` ${ending.length} end${ending.length === 1 ? "s" : ""} within a week.` : ""}${full.length ? ` ${full.length} ${full.length === 1 ? "is" : "are"} used up: make a new one if recruitment goes on.` : ""}`}
        actions={
          <span className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/admin/access">Open invite codes</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/participants">Participants&apos; return links</Link>
            </Button>
          </span>
        }
      >
        {active.length === 0 ? (
          <Empty>No code is active, so only signed-in staff can open the site.</Empty>
        ) : (
          <ul className="flex flex-col">
            {active.slice(0, SHOWN).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line py-2 first:border-t-0">
                <span className="flex min-w-0 flex-col">
                  <span>
                    <span className="text-lime">{i.label}</span>
                    {i.studyTitle ? <span className="t-s text-lime-dim"> for {i.studyTitle}</span> : null}
                  </span>
                  <span className="t-s text-lime-dim tabular-nums">
                    {i.maxUses === null ? `${i.useCount} used` : `${i.useCount} of ${i.maxUses} used`}
                    {i.expiresAt ? (
                      <>
                        , last day <Stamp at={i.expiresAt} withTime={false} />
                      </>
                    ) : null}
                  </span>
                </span>
                {i.revealable ? <RevealInviteButton inviteId={i.id} label={i.label} hint={i.hint} origin={origin} /> : <span className="t-s text-lime-dim">Made before codes could be shown again</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

const PLATFORM = [
  { id: "settings", title: "Settings", description: "The platform configuration as deployed, to read and check.", href: "/admin/settings", label: "Open settings" },
  { id: "audit", title: "Audit log", description: "Every change made on the platform, who made it and why.", href: "/admin/audit", label: "Open audit log" },
  { id: "roles", title: "Roles and permissions", description: "What each role may do and how many people hold it.", href: "/admin/roles", label: "Open roles" },
] as const;

function Platform() {
  return (
    <Section id="platform" title="Only for a Super Admin" description="Pages an Admin does not see.">
      <ul className="flex flex-col">
        {PLATFORM.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line py-3 first:border-t-0">
            <span className="flex max-w-[40rem] min-w-0 flex-col gap-1">
              <span className="font-semibold text-lime">{titleCase(p.title)}</span>
              <span className="t-s text-lime-dim">{p.description}</span>
            </span>
            <Button asChild variant="outline">
              <Link href={p.href}>{p.label}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

async function Overview() {
  const actor = await requirePermission(ADMIN_ANY);
  if (!can(actor, "admin.settings")) return <NeedsYou />;
  const h = await getHealthReport(getPool(), actor);
  return (
    <div className="flex flex-col gap-12">
      <NeedsYou />
      <Platform />
      <section aria-labelledby="health" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="health" className="t-h4 text-lime">
            {titleCase("platform health")}
          </h2>
          <p className="t-b text-lime-dim">
            Checked <time dateTime={h.checkedAt} className="t-table font-semibold wrap-anywhere tabular-nums">{h.checkedAt.slice(0, 19).replace("T", " ")}</time> UTC. Reload the page to check again.
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
                          <time dateTime={v.lastReceivedAt} className="t-table font-semibold wrap-anywhere tabular-nums">
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
                    <Row key={r.reason} k={r.reason.replace(/_/g, " ")} v={r.n} numeric />
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
                  {v.config.mode === "local" ? <Row k="Directory" v={<span className="t-table font-semibold wrap-anywhere">{v.config.localDir}</span>} /> : null}
                  {v.config.mode === "local" ? <Row k="Writable" v={v.localDirWritable ? "yes" : "no (missing or not writable)"} /> : null}
                  <Row k="Assets" v={v.assets} numeric />
                  <Row k="Stored" v={bytes(v.totalBytes)} numeric />
                </>
              )}
            </Panel>
          </li>
        </ul>
        <p className="t-s text-lime-dim max-w-[40rem]">
          Ingest lag is the time between the client sending a batch and the server receiving it (client clocks can be wrong, so treat outliers with care).
        </p>
      </section>
    </div>
  );
}
