import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ActionForm } from "@/components/cms/action-form";
import { Empty, FormField, NativeSelect, one, Pager, Section, StateBadge, STATE_LABELS, type SearchParams, ROW_LINK } from "@/components/cms/bits";
import { HistoryList } from "@/components/cms/history-list";
import { TransitionPanel } from "@/components/cms/transition-panel";
import { ConsolePage } from "@/components/shell/gates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { can, canAny } from "@/lib/permissions/can";
import { PROVENANCE_KINDS, SOURCE_RELIABILITIES, VERIFICATION_STATES } from "@/lib/validation/enums";
import { requirePermission } from "@/server/auth/staff";
import { saveSourceAction } from "@/server/cms/actions";
import { entityHistory, getSource, listSources, PAGE_SIZE, type SourceRow } from "@/server/cms/queries";
import { reviewOptions } from "@/server/cms/workflow";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Sources" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/cms/sources">) {
  return (
    <ConsolePage path="/cms/sources" title="Sources" description="Cited sources, their reliability and verification state. Claims cite them with a page or locator and a verbatim quotation.">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Sources searchParams={searchParams} />
      </Suspense>
    </ConsolePage>
  );
}

const label = (s: string) => s.replace(/_/g, " ");

async function Sources({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const principal = await requirePermission("content.read");
  const sp = await searchParams;
  const f = { q: one(sp.q), state: one(sp.state) };
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const pool = getPool();
  const editId = one(sp.edit);
  const [list, selected] = await Promise.all([listSources(pool, { ...f, page }), editId ? getSource(pool, editId) : Promise.resolve(null)]);

  return (
    <div className="flex flex-col gap-6">
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter sources">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-q">Search</Label>
          <Input id="s-q" name="q" defaultValue={f.q} placeholder="Title, author, publisher or id" className="w-64" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-state">State</Label>
          <NativeSelect id="s-state" name="state" defaultValue={f.state ?? ""} className="w-40">
            <option value="">All</option>
            {VERIFICATION_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {list.rows.length === 0 ? (
        <Empty>No sources match.</Empty>
      ) : (
        <Table density="compact" hoverRows caption={<>{list.total} source(s). Ids are file-local (S1 …) or CMS-assigned (C1 …).</>}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Id</TableHead>
              <TableHead scope="col">Source</TableHead>
              <TableHead scope="col">Kind</TableHead>
              <TableHead scope="col">Reliability</TableHead>
              <TableHead scope="col" numeric>Cited</TableHead>
              <TableHead scope="col">State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <code>
                    {s.packageSlug ?? "cms"}#{s.localKey ?? "?"}
                  </code>
                </TableCell>
                <TableCell className="max-w-xl whitespace-normal">
                  <Link href={`/cms/sources?edit=${s.id}#source`} className={ROW_LINK}>
                    {s.title}
                  </Link>
                  <span className="text-credit block">{[s.author, s.publisher, s.year].filter(Boolean).join(", ")}</span>
                </TableCell>
                <TableCell>{label(s.kind)}</TableCell>
                <TableCell>{s.reliability ?? "—"}</TableCell>
                <TableCell numeric>{s.citedBy}</TableCell>
                <TableCell>
                  <StateBadge state={s.state} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pager base="/cms/sources" params={f} page={page} total={list.total} pageSize={PAGE_SIZE} />

      {selected ? <SelectedSource s={selected} principal={principal} /> : null}

      {canAny(principal, ["content.draft", "content.edit"]) ? (
        <Section id="new-source" title="New source" description="Only sources you have actually read. Give enough detail for someone else to find the exact page you cite.">
          <SourceForm s={null} />
        </Section>
      ) : null}
    </div>
  );
}

async function SelectedSource({ s, principal }: { s: SourceRow; principal: Awaited<ReturnType<typeof requirePermission>> }) {
  const pool = getPool();
  const [history, review] = await Promise.all([entityHistory(pool, "source", s.id), reviewOptions(pool, principal, "source", s.id, s.state)]);
  return (
    <div id="source" className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <Section id="source-edit" title={`Edit: ${s.packageSlug ?? "cms"}#${s.localKey ?? "?"}`} description="Editing an accepted source sends it back to review.">
        {can(principal, "content.edit") ? <SourceForm s={s} /> : <Empty>You can read but not edit sources.</Empty>}
      </Section>
      <div className="flex flex-col gap-6">
        <Section id="source-review" title="Review">
          <TransitionPanel entityKind="source" entityId={s.id} options={review.options} blockedVerify={review.blockedVerify} problems={review.problems} />
        </Section>
        <Section id="source-history" title="History">
          <HistoryList entries={history} />
        </Section>
      </div>
    </div>
  );
}

function SourceForm({ s }: { s: SourceRow | null }) {
  const p = s ? "e" : "n";
  return (
    <ActionForm action={saveSourceAction} submitLabel={s ? "Save source" : "Create source"} resetOnSuccess={!s}>
      <input type="hidden" name="sourceId" value={s?.id ?? ""} />
      <div className="grid gap-4 md:grid-cols-2">
        <FormField id={`${p}-title`} name="title" label="Title" className="md:col-span-2">
          <Input id={`${p}-title`} name="title" defaultValue={s?.title} required maxLength={1000} />
        </FormField>
        <FormField id={`${p}-kind`} name="kind" label="Kind of evidence">
          <NativeSelect id={`${p}-kind`} name="kind" defaultValue={s?.kind ?? "historical_documentation"}>
            {PROVENANCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id={`${p}-rel`} name="reliability" label="Reliability">
          <NativeSelect id={`${p}-rel`} name="reliability" defaultValue={s?.reliability ?? ""}>
            <option value="">Not rated</option>
            {SOURCE_RELIABILITIES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id={`${p}-author`} name="author" label="Author(s)">
          <Input id={`${p}-author`} name="author" defaultValue={s?.author ?? ""} />
        </FormField>
        <FormField id={`${p}-publisher`} name="publisher" label="Publisher / venue">
          <Input id={`${p}-publisher`} name="publisher" defaultValue={s?.publisher ?? ""} />
        </FormField>
        <FormField id={`${p}-year`} name="year" label="Year (four digits)">
          <Input id={`${p}-year`} name="year" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={s?.year ?? ""} />
        </FormField>
        <FormField id={`${p}-accessed`} name="accessedOn" label="Accessed on (web pages)" hint="Format: YYYY-MM-DD">
          <Input id={`${p}-accessed`} name="accessedOn" type="date" aria-describedby={`${p}-accessed-hint`} defaultValue={s?.accessedOn ?? ""} className="tabular-nums" />
        </FormField>
        <FormField id={`${p}-url`} name="url" label="URL or DOI link" className="md:col-span-2">
          <Input id={`${p}-url`} name="url" type="url" defaultValue={s?.url ?? ""} placeholder="https://" />
        </FormField>
        <FormField id={`${p}-citation`} name="citation" label="Formatted citation (optional)" className="md:col-span-2">
          <Textarea id={`${p}-citation`} name="citation" defaultValue={s?.citation ?? ""} rows={2} />
        </FormField>
        <FormField id={`${p}-notes`} name="notes" label="What it supports (notes)" className="md:col-span-2">
          <Textarea id={`${p}-notes`} name="notes" defaultValue={s?.notes ?? ""} rows={2} />
        </FormField>
      </div>
    </ActionForm>
  );
}
