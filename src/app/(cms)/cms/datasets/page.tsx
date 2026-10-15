import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ActionForm } from "@/components/cms/action-form";
import { Empty, FormField, Mono, NativeSelect, one, Section, type SearchParams, ROW_LINK, SUMMARY } from "@/components/cms/bits";
import { ConsolePage } from "@/components/shell/gates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { requirePermission } from "@/server/auth/staff";
import { publishReleaseAction } from "@/server/cms/actions";
import { diffBundles, type BundleDiff, type KindDiff } from "@/server/cms/diff";
import { listSnapshots, snapshotBundle, type SnapshotRowView } from "@/server/cms/queries";
import { releaseReadiness } from "@/server/cms/release";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Dataset Versions" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/cms/datasets">) {
  return (
    <ConsolePage
      path="/cms/datasets"
      title="Dataset versions"
      description="Publish an immutable release snapshot of verified content, list every version and compare two of them."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Datasets searchParams={searchParams} />
      </Suspense>
    </ConsolePage>
  );
}

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

async function Datasets({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission("content.publish");
  const sp = await searchParams;
  const pool = getPool();
  const [readiness, snapshots] = await Promise.all([releaseReadiness(pool), listSnapshots(pool)]);
  const a = one(sp.a);
  const b = one(sp.b);
  const comparable = snapshots.filter((s) => s.status === "published" || s.kind === "review");

  return (
    <div className="flex flex-col gap-6">
      <Section
        id="readiness"
        title="Release readiness"
        description="A release contains everything in the review pipeline (under review, needs evidence, verified, published). It is refused while any of it is unverified or the integrity report has errors; reject, archive or withdraw what should not ship."
      >
        <p className="text-body">
          In the pipeline: {readiness.counts.traditions} traditions, {readiness.counts.concepts} concepts ({readiness.counts.claims} claims), {readiness.counts.relationships} relationships,{" "}
          {readiness.counts.sources} sources. Integrity: {readiness.integrity.error} error(s), {readiness.integrity.warning} warning(s).
        </p>
        {readiness.ok ? (
          <p className="text-body font-medium">Ready: every item is verified and the graph has no error-level issues.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-body font-medium">Not ready. The release would be refused with:</p>
            <ul className="list-disc pl-5 text-body">
              {readiness.refusals.map((r, i) => (
                <li key={i}>
                  <Mono>{r.code}</Mono> {r.message}
                </li>
              ))}
            </ul>
            {readiness.pending.length ? (
              <details className="text-body">
                <summary className={SUMMARY}>Unverified items ({readiness.pending.length}{readiness.pending.length >= 50 ? "+" : ""})</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {readiness.pending.map((p) => (
                    <li key={`${p.kind}-${p.id}`}>
                      {p.kind}: {p.label} <span className="text-ink-3">({p.state.replace("_", " ")})</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {readiness.errors.length ? (
              <details className="text-body">
                <summary className={SUMMARY}>Integrity errors ({readiness.integrity.error})</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {readiness.errors.map((e, i) => (
                    <li key={i}>
                      <Mono>{e.code}</Mono> {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        )}
      </Section>

      <Section id="publish" title="Publish a release" description="Irreversible. Verified items become published, and the snapshot is frozen with its sha256; studies can then pin it.">
        <ActionForm action={publishReleaseAction} submitLabel="Publish release" pendingLabel="Publishing…">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField id="r-label" name="versionLabel" label="Version label" hint="e.g. release-1 (letters, digits, '.', '_' or '-').">
              <Input id="r-label" name="versionLabel" required pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}" />
            </FormField>
            <FormField id="r-title" name="title" label="Title">
              <Input id="r-title" name="title" required maxLength={300} />
            </FormField>
            <FormField id="r-desc" name="description" label="Release notes (optional)" className="md:col-span-2">
              <Textarea id="r-desc" name="description" rows={2} />
            </FormField>
            <FormField id="r-confirm" name="confirmVersionLabel" label="Type the version label again to confirm">
              <Input id="r-confirm" name="confirmVersionLabel" required autoComplete="off" />
            </FormField>
          </div>
        </ActionForm>
      </Section>

      <Section id="versions" title="Versions">
        <VersionsTable rows={snapshots} />
      </Section>

      <Section id="compare" title="Compare two versions" description="What changed between two snapshots: entities added, removed or changed (with the changed fields).">
        <form method="get" action="/cms/datasets#compare" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-a">From</Label>
            <NativeSelect id="d-a" name="a" defaultValue={a ?? ""} className="w-64">
              <option value="">Choose…</option>
              {comparable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.versionLabel} ({s.kind})
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-b">To</Label>
            <NativeSelect id="d-b" name="b" defaultValue={b ?? ""} className="w-64">
              <option value="">Choose…</option>
              {comparable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.versionLabel} ({s.kind})
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" variant="outline">
            Compare
          </Button>
        </form>
        {a && b ? (
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <Diff a={a} b={b} />
          </Suspense>
        ) : null}
      </Section>
    </div>
  );
}

function VersionsTable({ rows }: { rows: SnapshotRowView[] }) {
  if (!rows.length) return <Empty>No snapshots yet.</Empty>;
  return (
    <Table density="compact" hoverRows caption={<>Release snapshots are publishable and immutable once published; review snapshots hold unverified content and can never be published.</>}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Version</TableHead>
          <TableHead scope="col">Kind</TableHead>
          <TableHead scope="col">Status</TableHead>
          <TableHead scope="col" numeric>Items</TableHead>
          <TableHead scope="col">Payload sha256</TableHead>
          <TableHead scope="col">Published (UTC)</TableHead>
          <TableHead scope="col" numeric>Manifests / studies</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="whitespace-normal">
              <span className="font-medium">{s.versionLabel}</span>
              <span className="text-credit block">{s.title}</span>
            </TableCell>
            <TableCell>{s.kind}</TableCell>
            <TableCell>
              <Badge variant="neutral">{s.status}</Badge>
              {s.includesUnverified ? <span className="text-credit block">includes unverified</span> : null}
            </TableCell>
            <TableCell numeric>{s.itemCount}</TableCell>
            <TableCell>
              <Mono title={s.payloadSha256}>{s.payloadSha256.slice(0, 16)}…</Mono>
            </TableCell>
            <TableCell>{s.publishedAt ? `${fmt.format(new Date(s.publishedAt))}${s.publishedBy ? ` by ${s.publishedBy}` : ""}` : "—"}</TableCell>
            <TableCell numeric>
              {s.manifests} / {s.studies}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

async function Diff({ a, b }: { a: string; b: string }) {
  const pool = getPool();
  const [ba, bb] = await Promise.all([snapshotBundle(pool, a), snapshotBundle(pool, b)]);
  if (!ba || !bb) return <Empty>One of the snapshots cannot be read (only published releases and review snapshots can be compared).</Empty>;
  const d: BundleDiff = diffBundles(ba, bb);
  const kinds: [string, KindDiff][] = [
    ["Traditions", d.traditions],
    ["Concepts", d.concepts],
    ["Claims", d.claims],
    ["Relationships", d.relationships],
    ["Sources", d.sources],
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body">
        {ba.versionLabel} → {bb.versionLabel}
      </p>
      {kinds.map(([label, k]) => (
        <details key={label} className="border-t border-rule py-2 text-body" open={k.added.length + k.removed.length + k.changed.length > 0 && k.added.length + k.removed.length + k.changed.length < 40}>
          <summary className={SUMMARY}>
            {label}: {k.added.length} added, {k.removed.length} removed, {k.changed.length} changed, {k.unchanged} unchanged
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {k.added.map((x) => (
              <li key={`a-${x.key}`}>
                <span className="font-medium">Added</span> {x.label} <Mono>{x.key}</Mono>
              </li>
            ))}
            {k.removed.map((x) => (
              <li key={`r-${x.key}`}>
                <span className="font-medium">Removed</span> {x.label} <Mono>{x.key}</Mono>
              </li>
            ))}
            {k.changed.map((x) => (
              <li key={`c-${x.key}`}>
                <span className="font-medium">Changed</span> {x.label}: {x.fields.join(", ")}
              </li>
            ))}
          </ul>
        </details>
      ))}
      <p className="text-credit">
        <Link className={ROW_LINK} href="/cms/datasets#compare">
          Clear comparison
        </Link>
      </p>
    </div>
  );
}
