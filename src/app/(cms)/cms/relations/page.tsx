import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ActionForm } from "@/components/cms/action-form";
import { Empty, NativeSelect, one, Section, StateBadge, STATE_LABELS, type SearchParams, ROW_LINK, Disclosure } from "@/components/cms/bits";
import { GraphWorkspace } from "@/components/cms/graph-workspace";
import { HistoryList } from "@/components/cms/history-list";
import { RelationshipForm } from "@/components/cms/relationship-form";
import { TransitionPanel } from "@/components/cms/transition-panel";
import { ConsolePage } from "@/components/shell/gates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VERIFICATION_STATES } from "@/lib/validation/enums";
import { requirePermission } from "@/server/auth/staff";
import { deleteRelationshipAction } from "@/server/cms/actions";
import { edgeIssues, graphIntegrity } from "@/server/cms/graph";
import { conceptOptions, entityHistory, graphData, listPackages, relationshipsWhere, relationshipTypes, sourceOptions } from "@/server/cms/queries";
import { subgraph } from "@/server/cms/subgraph";
import { reviewOptions } from "@/server/cms/workflow";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Relations" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/cms/relations">) {
  return (
    <ConsolePage
      path="/cms/relations"
      title="Relationship graph"
      description="Typed, directed relationships between concepts, validated with the knowledge-graph validator. Staff only: participants never see the raw graph."
    >
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
        <Relations searchParams={searchParams} />
      </Suspense>
    </ConsolePage>
  );
}

async function Relations({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const principal = await requirePermission("graph.edit");
  const sp = await searchParams;
  const pool = getPool();
  const [graph, types, packages, concepts, sources, integrity] = await Promise.all([
    graphData(pool),
    relationshipTypes(pool),
    listPackages(pool),
    conceptOptions(pool),
    sourceOptions(pool),
    graphIntegrity(pool),
  ]);
  const focus = one(sp.focus);
  const typeFilter = one(sp.type);
  const stateFilter = one(sp.state);
  // Default view: the first tradition, so the canvas stays legible.
  const tradition = one(sp.tradition) ?? (focus ? undefined : packages.find((p) => p.kind === "tradition")?.slug);
  const depth = Number(one(sp.depth)) || 1;
  const view = subgraph(graph.nodes, graph.edges, { tradition, focus, depth, types: typeFilter ? [typeFilter] : [], states: stateFilter ? [stateFilter] : [] });
  const semanticsByType = Object.fromEntries(types.map((t) => [t.code, t.semantics]));
  const titles = new Map(graph.nodes.map((n) => [n.id, n.title]));
  const edgeId = one(sp.edge);
  const typeChoices = types.map((t) => ({ code: t.code, label: t.label, semantics: t.semantics, ordered: t.ordered, directed: t.directed, requiresEvidence: t.requiresEvidence, description: t.description }));
  const conceptChoices = concepts.map((c) => ({ id: c.id, key: c.key, title: c.title }));

  return (
    <div className="flex flex-col gap-6">
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Choose the subgraph">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="g-tradition">Tradition / package</Label>
          <NativeSelect id="g-tradition" name="tradition" defaultValue={tradition ?? ""} className="w-52">
            <option value="">All (large)</option>
            {packages.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="g-focus">Focus concept</Label>
          <NativeSelect id="g-focus" name="focus" defaultValue={focus ?? ""} className="w-64">
            <option value="">None</option>
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} — {c.key}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="g-depth">Depth (1 to 4)</Label>
          <Input id="g-depth" name="depth" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={depth} className="w-20" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="g-type">Relationship type</Label>
          <NativeSelect id="g-type" name="type" defaultValue={typeFilter ?? ""} className="w-48">
            <option value="">All</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code} ({t.semantics})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="g-state">State</Label>
          <NativeSelect id="g-state" name="state" defaultValue={stateFilter ?? ""} className="w-40">
            <option value="">All</option>
            {VERIFICATION_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Show
        </Button>
        <p className="text-body text-ink-3" role="status">
          {view.nodes.length} concepts, {view.edges.length} relationships shown
        </p>
      </form>

      {edgeId ? (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <EdgePanel id={edgeId} principal={principal} concepts={conceptChoices} types={typeChoices} sources={sources} />
        </Suspense>
      ) : null}

      <GraphWorkspace
        nodes={view.nodes}
        edges={view.edges}
        focusId={focus ?? null}
        selectedEdgeId={edgeId ?? null}
        semanticsByType={semanticsByType}
        concepts={conceptChoices}
        types={typeChoices}
        sources={sources}
      />

      <Section id="edges" title="Relationships in this view" description="Keyboard-accessible list of the edges on the canvas.">
        {view.edges.length === 0 ? (
          <Empty>None.</Empty>
        ) : (
          <Table density="compact" hoverRows caption={<>{view.edges.length} relationship(s).</>}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">From</TableHead>
                <TableHead scope="col">Type</TableHead>
                <TableHead scope="col">To</TableHead>
                <TableHead scope="col">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.edges.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-normal">{titles.get(e.source)}</TableCell>
                  <TableCell>
                    <Link className={ROW_LINK} href={`/cms/relations?${new URLSearchParams({ ...(tradition ? { tradition } : {}), ...(focus ? { focus } : {}), edge: e.id }).toString()}#edge`}>
                      {e.type}
                      {e.ordinal !== null ? ` #${e.ordinal}` : ""}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal">{titles.get(e.target)}</TableCell>
                  <TableCell>
                    <StateBadge state={e.state} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section
        id="integrity"
        title="Validator report"
        description={`Knowledge-graph validator over the review pipeline: ${integrity.counts.error} error(s), ${integrity.counts.warning} warning(s), ${integrity.counts.info} note(s). Errors block a release.`}
      >
        {integrity.issues.length === 0 ? (
          <Empty>No errors or warnings.</Empty>
        ) : (
          <Disclosure summary={<>Show {integrity.issues.length} error(s) and warning(s)</>}>
            <ul className="mt-2 flex flex-col gap-1 text-body">
              {integrity.issues.map((i, n) => (
                <li key={n}>
                  <span className={i.severity === "error" ? "font-medium text-danger" : "text-ink-3"}>{i.severity}</span> <code className="text-id">{i.code}</code> {i.message}
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </Section>
    </div>
  );
}

async function EdgePanel({
  id,
  principal,
  concepts,
  types,
  sources,
}: {
  id: string;
  principal: Awaited<ReturnType<typeof requirePermission>>;
  concepts: { id: string; key: string; title: string }[];
  types: Parameters<typeof RelationshipForm>[0]["types"];
  sources: { id: string; label: string }[];
}) {
  const pool = getPool();
  const [row] = await relationshipsWhere(pool, "r.id = $1", [id]).catch(() => []);
  if (!row) return <Empty>That relationship does not exist.</Empty>;
  const [issues, review, history] = await Promise.all([edgeIssues(pool, id), reviewOptions(pool, principal, "relationship", id, row.state), entityHistory(pool, "relationship", id)]);
  const deletable = row.state === "draft" || row.state === "rejected" || row.state === "archived";
  return (
    <div id="edge" className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <Section id="edge-edit" title={`${row.sourceTitle} ${row.typeCode} ${row.targetTitle}`} description={<StateBadge state={row.state} />}>
        <div>
          <h3 className="mb-2 text-body font-medium">Validator, If This Relationship Were in the Review Pipeline</h3>
          {issues.length === 0 ? (
            <p className="text-body text-ink-3">No issues.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-body">
              {issues.map((i, n) => (
                <li key={n}>
                  <span className={i.severity === "error" ? "font-medium text-danger" : "text-ink-3"}>{i.severity}</span> <code className="text-id">{i.code}</code> {i.message}
                </li>
              ))}
            </ul>
          )}
        </div>
        <RelationshipForm
          concepts={concepts}
          types={types}
          sources={sources}
          initial={{
            id: row.id,
            sourceConceptId: row.sourceId,
            targetConceptId: row.targetId,
            typeCode: row.typeCode,
            explanation: row.explanation,
            conditions: row.conditions,
            ordinal: row.ordinal,
            strength: row.strength,
            provenanceKind: row.provenanceKind,
            sources: row.sources.map((s) => ({ sourceId: s.sourceId, locator: s.locator ?? "", quote: s.quote ?? "" })),
          }}
        />
        {deletable ? (
          <ActionForm action={deleteRelationshipAction} submitLabel="Delete this relationship" submitVariant="destructive" pendingLabel="Deleting…">
            <input type="hidden" name="relationshipId" value={row.id} />
          </ActionForm>
        ) : null}
      </Section>
      <div className="flex flex-col gap-6">
        <Section id="edge-review" title="Review">
          <TransitionPanel entityKind="relationship" entityId={row.id} options={review.options} blockedVerify={review.blockedVerify} problems={review.problems} />
        </Section>
        <Section id="edge-history" title="History">
          <HistoryList entries={history} />
        </Section>
      </div>
    </div>
  );
}
