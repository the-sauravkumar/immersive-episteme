import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ActionForm } from "@/components/cms/action-form";
import { Empty, FormField, Mono, NativeSelect, one, Pager, Section, StateBadge, STATE_LABELS, type SearchParams, ROW_LINK } from "@/components/cms/bits";
import { ConsolePage } from "@/components/shell/gates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KNOWLEDGE_CATEGORIES } from "@db/seeds/reference-data";
import { CONCEPT_TYPE_LABELS } from "@/features/learning/labels";
import { canAny } from "@/lib/permissions/can";
import { plural } from "@/lib/text/plural";
import { CONCEPT_TYPES, PROVENANCE_KINDS, VERIFICATION_STATES } from "@/lib/validation/enums";
import { requirePermission } from "@/server/auth/staff";
import { createConceptAction } from "@/server/cms/actions";
import { listConcepts, listPackages, PAGE_SIZE } from "@/server/cms/queries";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Concepts" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/cms/concepts">) {
  return (
    <ConsolePage path="/cms/concepts" title="Concepts" description="Concepts, their claims and verification state. Learner text is generated from claims only.">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Concepts searchParams={searchParams} />
      </Suspense>
    </ConsolePage>
  );
}

/** Concept types by their shared display names (the same wording both learning conditions use). */
const label = (s: string) => CONCEPT_TYPE_LABELS[s as keyof typeof CONCEPT_TYPE_LABELS] ?? s.replace(/_/g, " ");

async function Concepts({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const principal = await requirePermission("content.read");
  const sp = await searchParams;
  const f = { tradition: one(sp.tradition), state: one(sp.state), type: one(sp.type), q: one(sp.q) };
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const pool = getPool();
  const [list, packages] = await Promise.all([listConcepts(pool, { ...f, page }), listPackages(pool)]);
  const canCreate = canAny(principal, ["content.draft", "content.edit"]);
  const packageName = new Map(packages.map((p) => [p.slug, p.name]));

  return (
    <div className="flex flex-col gap-6">
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter concepts">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-q">Search</Label>
          <Input id="f-q" name="q" defaultValue={f.q} placeholder="Title or key" className="w-56" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-tradition">Tradition / package</Label>
          <NativeSelect id="f-tradition" name="tradition" defaultValue={f.tradition ?? ""} className="w-52">
            <option value="">All</option>
            {packages.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-state">State</Label>
          <NativeSelect id="f-state" name="state" defaultValue={f.state ?? ""} className="w-40">
            <option value="">All</option>
            {VERIFICATION_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-type">Type</Label>
          <NativeSelect id="f-type" name="type" defaultValue={f.type ?? ""} className="w-48">
            <option value="">All</option>
            {CONCEPT_TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {list.rows.length === 0 ? (
        <Empty>No concepts match.</Empty>
      ) : (
        <Table density="compact" hoverRows caption={<>{plural(list.total, "concept")}. “Incomplete” counts claims without a verbatim quotation or a page/locator for every citation; such concepts cannot be verified.</>}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Concept</TableHead>
              <TableHead scope="col">Type</TableHead>
              <TableHead scope="col">Tradition</TableHead>
              <TableHead scope="col" numeric>Claims</TableHead>
              <TableHead scope="col" numeric>Incomplete</TableHead>
              <TableHead scope="col">State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="min-w-56 whitespace-normal">
                  <Link href={`/cms/concepts/${c.id}`} className={ROW_LINK}>
                    {c.title}
                  </Link>
                  <Mono className="block">{c.key}</Mono>
                </TableCell>
                <TableCell>{label(c.type)}</TableCell>
                <TableCell>{c.tradition ? (packageName.get(c.tradition) ?? c.tradition) : <span className="text-ink-3">None</span>}</TableCell>
                <TableCell numeric>{c.claims}</TableCell>
                <TableCell numeric>{c.incompleteClaims}</TableCell>
                <TableCell>
                  <StateBadge state={c.state} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pager base="/cms/concepts" params={f} page={page} total={list.total} pageSize={PAGE_SIZE} />

      {canCreate ? (
        <Section id="new-concept" title="New concept" description="Created as a draft. Its key is <tradition or package>.<type>.<name> and never changes. Add sourced claims on the next screen.">
          <ActionForm action={createConceptAction} submitLabel="Create concept" resetOnSuccess>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField id="n-pkg" name="packageSlug" label="Tradition or package">
                <NativeSelect id="n-pkg" name="packageSlug" required defaultValue="">
                  <option value="" disabled>
                    Choose…
                  </option>
                  {packages.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name} ({p.slug})
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="n-type" name="type" label="Type">
                <NativeSelect id="n-type" name="type" required defaultValue="material">
                  {CONCEPT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {label(t)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="n-name" name="name" label="Key name" hint="Lowercase words joined by hyphens, e.g. indigo-vat.">
                <Input id="n-name" name="name" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} />
              </FormField>
              <FormField id="n-title" name="title" label="Title">
                <Input id="n-title" name="title" required maxLength={300} />
              </FormField>
              <FormField id="n-cat" name="categoryCode" label="Knowledge category">
                <NativeSelect id="n-cat" name="categoryCode" required>
                  {KNOWLEDGE_CATEGORIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="n-prov" name="provenanceKind" label="Provenance kind">
                <NativeSelect id="n-prov" name="provenanceKind" required defaultValue="historical_documentation">
                  {PROVENANCE_KINDS.filter((k) => k !== "unverified").map((k) => (
                    <option key={k} value={k}>
                      {label(k)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="n-terms" name="localTerms" label="Local terms (optional)" hint="Comma-separated; only terms the sources use." className="md:col-span-2">
                <Input id="n-terms" name="localTerms" />
              </FormField>
            </div>
          </ActionForm>
        </Section>
      ) : null}
    </div>
  );
}
