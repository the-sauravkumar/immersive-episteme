import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ActionForm } from "@/components/cms/action-form";
import { Empty, FormField, Mono, NativeSelect, one, Section, StateBadge, type SearchParams, ROW_LINK } from "@/components/cms/bits";
import { HistoryList } from "@/components/cms/history-list";
import { TransitionPanel } from "@/components/cms/transition-panel";
import { ConsolePage } from "@/components/shell/gates";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inCanonicalOrder } from "@/features/learning/labels";
import { can, canAny } from "@/lib/permissions/can";
import { requirePermission } from "@/server/auth/staff";
import { saveTraditionAction, traditionSourceAction } from "@/server/cms/actions";
import { entityHistory, listTraditions, sourceOptions, type TraditionRow } from "@/server/cms/queries";
import { reviewOptions } from "@/server/cms/workflow";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Traditions" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/cms/traditions">) {
  return (
    <ConsolePage path="/cms/traditions" title="Traditions" description="Craft traditions, their GI and region records with sources, and their verification state.">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Traditions searchParams={searchParams} />
      </Suspense>
    </ConsolePage>
  );
}

async function Traditions({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const principal = await requirePermission("content.read");
  const sp = await searchParams;
  const pool = getPool();
  // Canonical alphabetical order (DR-019, DESIGN.md 12.3 rule 12), the same as every learner list.
  const rows = inCanonicalOrder(await listTraditions(pool));
  const selected = rows.find((t) => t.id === one(sp.edit)) ?? null;
  const canCreate = canAny(principal, ["content.draft", "content.edit"]);
  const canEdit = can(principal, "content.edit");

  return (
    <div className="flex flex-col gap-6">
      {rows.length === 0 ? (
        <Empty>No traditions yet.</Empty>
      ) : (
        <Table density="compact" hoverRows caption={<>{rows.length} tradition(s). Choose one to edit it, link its sources or review it.</>}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Tradition</TableHead>
              <TableHead scope="col">Region</TableHead>
              <TableHead scope="col">GI</TableHead>
              <TableHead scope="col" numeric>Concepts</TableHead>
              <TableHead scope="col" numeric>Sources</TableHead>
              <TableHead scope="col">State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} aria-current={selected?.id === t.id ? "true" : undefined} data-state={selected?.id === t.id ? "selected" : undefined}>
                <TableCell className="whitespace-normal">
                  <Link href={`/cms/traditions?edit=${t.id}#tradition`} className={ROW_LINK}>
                    {t.name}
                  </Link>
                  {selected?.id === t.id ? <span className="text-credit"> (selected)</span> : null}
                  <Mono className="block">{t.slug}</Mono>
                </TableCell>
                <TableCell className="whitespace-normal">{[t.regionPlace, t.regionDistrict, t.regionState].filter(Boolean).join(", ") || "—"}</TableCell>
                <TableCell>{t.giRegistered === null ? "—" : t.giRegistered ? `Yes${t.giYear ? ` (${t.giYear})` : ""}` : "No"}</TableCell>
                <TableCell numeric>
                  <Link className={ROW_LINK} href={`/cms/concepts?tradition=${t.slug}`}>
                    {t.conceptCount}
                  </Link>
                </TableCell>
                <TableCell numeric>{t.sources.length}</TableCell>
                <TableCell>
                  <StateBadge state={t.state} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {selected ? <SelectedTradition t={selected} canEdit={canEdit} principal={principal} /> : null}

      {canCreate ? (
        <Section id="new-tradition" title="New tradition" description="Creates the tradition and its content package as a draft. Add its tradition concept and sourced claims in Concepts.">
          <TraditionForm t={null} />
        </Section>
      ) : null}
    </div>
  );
}

async function SelectedTradition({ t, canEdit, principal }: { t: TraditionRow; canEdit: boolean; principal: Awaited<ReturnType<typeof requirePermission>> }) {
  const pool = getPool();
  const [history, review, sources] = await Promise.all([
    entityHistory(pool, "tradition", t.id),
    reviewOptions(pool, principal, "tradition", t.id, t.state),
    canEdit ? sourceOptions(pool) : Promise.resolve([]),
  ]);
  return (
    <div id="tradition" className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <div className="flex flex-col gap-6">
        <Section id="t-edit" title={`Edit: ${t.name}`} description="Editing an accepted tradition sends it back to review.">
          {canEdit ? <TraditionForm t={t} /> : <Empty>You can read but not edit traditions.</Empty>}
        </Section>
        <Section id="t-sources" title="Sources for tradition facts" description="The GI record, region and identity facts must be backed by sources before the tradition can be verified.">
          {t.sources.length ? (
            <ul className="flex flex-col gap-2 text-body">
              {t.sources.map((s) => (
                <li key={`${s.sourceId}-${s.purpose}`} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.purpose}</span>
                  <span>
                    {s.localKey ? `${s.localKey}: ` : ""}
                    {s.title}
                  </span>
                  {canEdit ? (
                    <ActionForm action={traditionSourceAction} submitLabel="Unlink" submitVariant="outline" pendingLabel="Unlinking…" className="inline-flex">
                      <input type="hidden" name="traditionId" value={t.id} />
                      <input type="hidden" name="sourceId" value={s.sourceId} />
                      <input type="hidden" name="purpose" value={s.purpose} />
                      <input type="hidden" name="remove" value="on" />
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No sources linked.</Empty>
          )}
          {canEdit ? (
            <ActionForm action={traditionSourceAction} submitLabel="Link source">
              <input type="hidden" name="traditionId" value={t.id} />
              <div className="grid gap-3 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
                <FormField id="ts-source" name="sourceId" label="Source">
                  <NativeSelect id="ts-source" name="sourceId" required defaultValue="">
                    <option value="" disabled>
                      Choose a source…
                    </option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField id="ts-purpose" name="purpose" label="Supports">
                  <NativeSelect id="ts-purpose" name="purpose" defaultValue="general">
                    <option value="gi">GI record</option>
                    <option value="region">Region</option>
                    <option value="summary">Summary</option>
                    <option value="general">General</option>
                  </NativeSelect>
                </FormField>
              </div>
            </ActionForm>
          ) : null}
        </Section>
      </div>
      <div className="flex flex-col gap-6">
        <Section id="t-review" title="Review">
          <TransitionPanel entityKind="tradition" entityId={t.id} options={review.options} blockedVerify={review.blockedVerify} problems={review.problems} />
        </Section>
        <Section id="t-history" title="History">
          <HistoryList entries={history} />
        </Section>
      </div>
    </div>
  );
}

function TraditionForm({ t }: { t: TraditionRow | null }) {
  const p = t ? "e" : "n";
  return (
    <ActionForm action={saveTraditionAction} submitLabel={t ? "Save tradition" : "Create tradition"} resetOnSuccess={!t}>
      <input type="hidden" name="traditionId" value={t?.id ?? ""} />
      <div className="grid gap-4 md:grid-cols-2">
        <FormField id={`${p}-slug`} name="slug" label="Slug" hint={t ? "Fixed: it prefixes every concept key." : "Lowercase words joined by hyphens, e.g. bagru."}>
          <Input id={`${p}-slug`} name="slug" defaultValue={t?.slug} readOnly={!!t} required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </FormField>
        <FormField id={`${p}-name`} name="name" label="Name">
          <Input id={`${p}-name`} name="name" defaultValue={t?.name} required maxLength={300} />
        </FormField>
        <FormField id={`${p}-alt`} name="altNames" label="Alternative names" hint="Comma-separated.">
          <Input id={`${p}-alt`} name="altNames" defaultValue={t?.altNames.join(", ")} />
        </FormField>
        <FormField id={`${p}-place`} name="regionPlace" label="Place">
          <Input id={`${p}-place`} name="regionPlace" defaultValue={t?.regionPlace ?? ""} />
        </FormField>
        <FormField id={`${p}-district`} name="regionDistrict" label="District">
          <Input id={`${p}-district`} name="regionDistrict" defaultValue={t?.regionDistrict ?? ""} />
        </FormField>
        <FormField id={`${p}-state`} name="regionState" label="State">
          <Input id={`${p}-state`} name="regionState" defaultValue={t?.regionState ?? ""} />
        </FormField>
        <FormField id={`${p}-country`} name="regionCountry" label="Country">
          <Input id={`${p}-country`} name="regionCountry" defaultValue={t?.regionCountry ?? "India"} />
        </FormField>
        <FormField id={`${p}-lat`} name="latitude" label="Latitude (degrees, -90 to 90)">
          <Input id={`${p}-lat`} name="latitude" type="text" inputMode="decimal" pattern="-?[0-9]*([.][0-9]+)?" defaultValue={t?.latitude ?? ""} />
        </FormField>
        <FormField id={`${p}-lon`} name="longitude" label="Longitude (degrees, -180 to 180)">
          <Input id={`${p}-lon`} name="longitude" type="text" inputMode="decimal" pattern="-?[0-9]*([.][0-9]+)?" defaultValue={t?.longitude ?? ""} />
        </FormField>
        <FormField id={`${p}-gi`} name="giRegistered" label="GI registered">
          <NativeSelect id={`${p}-gi`} name="giRegistered" defaultValue={t?.giRegistered === null || !t ? "" : t.giRegistered ? "yes" : "no"}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </NativeSelect>
        </FormField>
        <FormField id={`${p}-gino`} name="giApplicationNo" label="GI application number">
          <Input id={`${p}-gino`} name="giApplicationNo" defaultValue={t?.giApplicationNo ?? ""} />
        </FormField>
        <FormField id={`${p}-giyear`} name="giYear" label="GI year (four digits)">
          <Input id={`${p}-giyear`} name="giYear" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={t?.giYear ?? ""} />
        </FormField>
      </div>
    </ActionForm>
  );
}
