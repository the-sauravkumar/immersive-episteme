import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ActionForm } from "@/components/cms/action-form";
import { BLOCK_LINK, Empty, FormField, Mono, NativeSelect, RunningHead, Section, StateBadge } from "@/components/cms/bits";
import { ClaimsEditor } from "@/components/cms/claims-editor";
import { claimDraftsOf } from "@/components/cms/claim-drafts";
import { HistoryList } from "@/components/cms/history-list";
import { NotesEditor } from "@/components/cms/notes-editor";
import { ProofFrame } from "@/components/cms/proof-frame";
import { RelationshipTable } from "@/components/cms/relationship-table";
import { TransitionPanel } from "@/components/cms/transition-panel";
import { ClaimList, KnowledgeSheet, RelatedConcepts, relatedLinksFromGroups, SheetReferences, type SheetConcept } from "@/components/knowledge";
import { ConsolePage } from "@/components/shell/gates";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";
import { createKnowledgeView, sourceDisplayLabel, type Citation, type ClaimView } from "@/features/knowledge/read/view";
import { KNOWLEDGE_CATEGORIES } from "@db/seeds/reference-data";
import { can } from "@/lib/permissions/can";
import type { ConceptType, KnowledgeCategoryCode, ProvenanceKind, SourceReliability, VerificationState } from "@/lib/validation/enums";
import { PROVENANCE_KINDS } from "@/lib/validation/enums";
import { requirePermission } from "@/server/auth/staff";
import { updateConceptAction } from "@/server/cms/actions";
import { entityHistory, getConcept, sourceOptions, type ConceptDetail } from "@/server/cms/queries";
import { renderDocHtml, isEmptyDoc, sanitizeDoc } from "@/server/cms/rich-text";
import { reviewOptions } from "@/server/cms/workflow";
import { buildReviewSnapshotFromDb } from "@/server/content/review-snapshot";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Concept" };

export const instant = false;

export default function Page({ params }: PageProps<"/cms/concepts/[conceptId]">) {
  return (
    <ConsolePage path="/cms/concepts/[conceptId]" title="Concept" description="Claims with their evidence, curator notes, relationships and review history, beside a preview of the record as the next release carries it.">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ConceptEditor params={params} />
      </Suspense>
    </ConsolePage>
  );
}

const PROVENANCE_LABEL: Record<string, string> = {
  practitioner_testimony: "Practitioner testimony",
  historical_documentation: "Historical documentation",
  scientific_evidence: "Scientific evidence",
  researcher_interpretation: "Researcher interpretation",
  hypothesis: "Hypothesis",
  unverified: "Unverified",
};

async function ConceptEditor({ params }: { params: Promise<{ conceptId: string }> }) {
  const principal = await requirePermission("content.read");
  const { conceptId } = await params;
  const pool = getPool();
  const concept = await getConcept(pool, conceptId);
  if (!concept) notFound();
  const editable = can(principal, "content.edit") && !concept.isDemo;
  const [sources, history, review] = await Promise.all([
    editable ? sourceOptions(pool) : Promise.resolve([]),
    entityHistory(pool, "concept", concept.id),
    concept.isDemo ? Promise.resolve(null) : reviewOptions(pool, principal, "concept", concept.id, concept.state),
  ]);
  const choices = new Map(sources.map((s) => [s.id, { id: s.id, label: s.label, key: s.key }]));
  for (const cl of concept.claims) for (const s of cl.sources) if (!choices.has(s.sourceId)) choices.set(s.sourceId, { id: s.sourceId, label: s.label, key: s.key });
  const notes = sanitizeDoc(concept.notes);
  const accepted = concept.state === "verified" || concept.state === "published";

  return (
    <div className="flex flex-col gap-6">
      <dl aria-label="Concept facts" className="grid grid-cols-1 gap-x-4 gap-y-1 xs:grid-cols-[9rem_minmax(0,1fr)]">
        <dt className="t-label pt-0.5">Key</dt>
        <dd className="t-b min-w-0">
          <Mono>{concept.key}</Mono>
        </dd>
        <dt className="t-label pt-0.5">State</dt>
        <dd className="t-b flex flex-wrap items-center gap-2">
          <StateBadge state={concept.state} />
          {concept.isDemo ? (
            <>
              <Badge variant="neutral">Demo</Badge>
              <span className="text-lime-dim">Fixture, read-only, never publishable into a study</span>
            </>
          ) : null}
        </dd>
        <dt className="t-label pt-0.5">Package</dt>
        <dd className="t-b">{concept.traditionName ?? concept.packageSlug ?? "No package"}</dd>
        <dt className="t-label pt-0.5">Type</dt>
        <dd className="t-b">{humanise(concept.type)}</dd>
        <dt className="t-label pt-0.5">Provenance</dt>
        <dd className="t-b">{PROVENANCE_LABEL[concept.provenanceKind]}</dd>
      </dl>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section
          id="claims"
          className="xl:col-start-1"
          title="Claims and evidence"
          description="Every statement a learner sees is a claim here, with a verbatim quotation and a page or locator for each cited source. Learner text is generated from these claims; there is no free-prose field."
        >
          <ClaimsEditor
            conceptId={concept.id}
            readOnly={!editable}
            sources={[...choices.values()]}
            initial={claimDraftsOf(concept.claims)}
          />
        </Section>

        <div className="min-w-0 xl:col-start-2 xl:row-span-6 xl:row-start-1">
          <div className="xl:sticky xl:top-4">
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <Proof concept={concept} />
            </Suspense>
          </div>
        </div>

        {editable ? (
          <Section id="meta" className="xl:col-start-1" title="Details" description="The key and type are fixed: they identify the concept in snapshots, manifests and telemetry.">
            <ActionForm action={updateConceptAction} submitLabel="Save details">
              <input type="hidden" name="conceptId" value={concept.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField id="c-title" name="title" label="Title" className="md:col-span-2">
                  <Input id="c-title" name="title" defaultValue={concept.title} required maxLength={300} />
                </FormField>
                <FormField id="c-cat" name="categoryCode" label="Knowledge category">
                  <NativeSelect id="c-cat" name="categoryCode" defaultValue={concept.category}>
                    {KNOWLEDGE_CATEGORIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField id="c-prov" name="provenanceKind" label="Provenance kind" hint="Keep practitioner testimony, scientific interpretation, documented history and open questions distinct.">
                  <NativeSelect id="c-prov" name="provenanceKind" defaultValue={concept.provenanceKind} aria-describedby="c-prov-hint">
                    {PROVENANCE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {PROVENANCE_LABEL[k]}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField id="c-terms" name="localTerms" label="Local terms" hint="Comma-separated; only terms the cited sources use." className="md:col-span-2">
                  <Input id="c-terms" name="localTerms" defaultValue={concept.localTerms.join(", ")} aria-describedby="c-terms-hint" />
                </FormField>
                {concept.type === "comparison" ? (
                  <FormField id="c-compares" name="compares" label="Compared concepts (keys)" hint="Comma-separated concept keys." className="md:col-span-2">
                    <Input id="c-compares" name="compares" defaultValue={concept.compares.join(", ")} aria-describedby="c-compares-hint" />
                  </FormField>
                ) : (
                  <input type="hidden" name="compares" value="" />
                )}
              </div>
            </ActionForm>
          </Section>
        ) : null}

        <Section id="review" className="xl:col-start-1" title="Review">
          {review ? <TransitionPanel entityKind="concept" entityId={concept.id} options={review.options} blockedVerify={review.blockedVerify} problems={review.problems} /> : <Empty>Demo fixtures never enter review.</Empty>}
        </Section>

        <Section id="notes" className="xl:col-start-1" title="Curator notes" description="Editorial notes for the team (sources to chase, open questions). Never shown to learners.">
          {!isEmptyDoc(notes) ? (
            <div
              className="t-b bg-vat-2 p-4 text-lime [&_a]:text-turmeric [&_a]:underline [&_blockquote]:bg-vat-2 [&_blockquote]:px-4 [&_blockquote]:py-2 [&_h2]:t-label [&_h3]:t-label [&_h4]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: renderDocHtml(notes) }}
            />
          ) : (
            <Empty>No notes yet.</Empty>
          )}
          {can(principal, "content.edit") || can(principal, "content.review") ? concept.isDemo ? null : <NotesEditor conceptId={concept.id} initial={notes} warnAccepted={accepted} /> : null}
        </Section>

        <Section
          id="relations"
          className="xl:col-start-1"
          title="Relationships"
          description="Typed, directed links. Edit them in the relationship graph editor."
          actions={
            can(principal, "graph.edit") ? (
              <Link className={BLOCK_LINK} href={`/cms/relations?focus=${concept.id}`}>
                Open in graph editor
              </Link>
            ) : null
          }
        >
          <RunningHead id="rel-out">Outgoing</RunningHead>
          <RelationshipTable rows={concept.outgoing} perspective="outgoing" labelledBy="rel-out" />
          <RunningHead id="rel-in">Incoming</RunningHead>
          <RelationshipTable rows={concept.incoming} perspective="incoming" labelledBy="rel-in" />
        </Section>

        <Section id="learner" className="xl:col-start-1" title="Generated learner text" description="The stored summary and body, generated from the claims (search and export use them; the Proof shows how the claims themselves are set).">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 xs:grid-cols-[9rem_minmax(0,1fr)]">
            <dt className="t-label pt-0.5">Summary</dt>
            <dd className="t-b min-w-0">{concept.summary || "None"}</dd>
            <dt className="t-label pt-0.5">Body</dt>
            <dd className="t-b min-w-0 whitespace-pre-wrap">{concept.bodyMd || "None"}</dd>
          </dl>
        </Section>

        <Section id="history" className="xl:col-start-1" title="History" description="Review decisions (verification records) and CMS edits (audit log).">
          <HistoryList entries={history} />
        </Section>
      </div>
    </div>
  );
}

const humanise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

async function Proof({ concept }: { concept: ConceptDetail }) {
  const pool = getPool();
  const built = await buildReviewSnapshotFromDb(pool, { hasher: nodeSha256, generatedAt: new Date().toISOString() }).catch(() => null);
  const view = built?.ok ? createKnowledgeView(built.envelope.payload) : null;
  const detail = view?.getConcept(concept.id) ?? null;

  if (view && detail) {
    const chain = detail.tradition ? view.getProcessChain(detail.tradition.slug) : null;
    const at = chain?.steps.findIndex((s) => s.id === detail.id) ?? -1;
    const traditionNames = Object.fromEntries(view.listTraditions().map((t) => [t.slug, t.name]));
    const links = relatedLinksFromGroups(view.getRelatedConcepts(detail.id) ?? []);
    const sheet = (
      <KnowledgeSheet
        placement="page"
        autoFocusTitle={false}
        titleAs="h2"
        concept={sheetConcept(detail.id, detail.title, detail.type, detail.category, detail.localTerms, detail.tradition, detail.verificationState)}
        step={chain && at >= 0 ? { index: at + 1, total: chain.steps.length } : null}
        references={<SheetReferences conceptId={detail.id} claims={detail.claims} />}
        related={
          links.length > 0 ? (
            <RelatedConcepts
              conceptId={detail.id}
              traditionSlug={detail.tradition?.slug ?? null}
              links={links}
              traditionNames={traditionNames}
              headingId={`proof-related-${detail.id}`}
              renderLink={(link, content, className) => (
                <Link href={`/cms/concepts/${link.concept.id}`} className={className}>
                  {content}
                </Link>
              )}
            />
          ) : null
        }
      >
        <ClaimList conceptId={detail.id} claims={detail.claims} references="sheet" />
      </KnowledgeSheet>
    );
    return (
      <ProofFrame
        sheet={sheet}
        note={
          <>
            Built from the review pipeline as the next release would carry it ({built?.ok ? built.envelope.versionLabel : ""}). This is the record for review, not a
            learner screen: the doors show each stage&rsquo;s caption, names and sources from the stage template, and the six study photographs.
          </>
        }
      />
    );
  }

  const claims = await draftClaims(concept);
  const tradition = await pool
    .query<{ slug: string; name: string }>("SELECT t.slug, t.name FROM concepts c JOIN traditions t ON t.id = c.tradition_id WHERE c.id = $1", [concept.id])
    .then((r) => r.rows[0] ?? null);
  const sheet = (
    <KnowledgeSheet
      placement="page"
      autoFocusTitle={false}
      titleAs="h2"
      concept={sheetConcept(concept.id, concept.title, concept.type as ConceptType, concept.category as KnowledgeCategoryCode, concept.localTerms, tradition, concept.state)}
      references={<SheetReferences conceptId={concept.id} claims={claims} />}
    >
      <ClaimList conceptId={concept.id} claims={claims} references="sheet" />
    </KnowledgeSheet>
  );
  return (
    <ProofFrame
      sheet={sheet}
      note={
        built && !built.ok
          ? "The review pipeline does not build right now (see the validator report), so this preview shows the saved claims only, without related concepts."
          : "This concept is not in the review pipeline yet, so this preview shows its saved claims only. Its related concepts appear once it is submitted for review."
      }
    />
  );
}

function sheetConcept(
  id: string,
  title: string,
  type: ConceptType,
  category: KnowledgeCategoryCode,
  localTerms: readonly string[],
  tradition: { slug: string; name: string } | null,
  verificationState: string,
): SheetConcept {
  return { id, title, type, category, localTerms, tradition: tradition ? { slug: tradition.slug, name: tradition.name } : null, verificationState };
}

async function draftClaims(concept: ConceptDetail): Promise<ClaimView[]> {
  const ids = [...new Set(concept.claims.flatMap((c) => c.sources.map((s) => s.sourceId)))];
  const rows = ids.length
    ? (
        await getPool().query<{
          id: string; kind: ProvenanceKind; title: string; author: string | null; publisher: string | null; year: number | null; url: string | null; accessed_on: string | null; reliability: SourceReliability | null; verification_state: VerificationState;
        }>("SELECT id, kind, title, author, publisher, year, url, accessed_on::text AS accessed_on, reliability, verification_state FROM sources WHERE id = ANY($1::uuid[])", [ids])
      ).rows
    : [];
  const byId = new Map(rows.map((s) => [s.id, s]));
  return concept.claims.map((cl, position) => ({
    id: cl.id,
    position,
    text: cl.text,
    quote: cl.quote,
    evidence: cl.sources
      .map((ref): Citation | null => {
        const s = byId.get(ref.sourceId);
        if (!s) return null;
        return {
          id: s.id,
          label: sourceDisplayLabel(s),
          kind: s.kind,
          title: s.title,
          author: s.author,
          publisher: s.publisher,
          year: s.year,
          url: s.url,
          accessedOn: s.accessed_on,
          reliability: s.reliability,
          verificationState: s.verification_state,
          locator: ref.locator,
          quote: cl.sources.length === 1 ? cl.quote : null,
          passages: ref.evidence.map((p) => ({ locator: p.locator ?? ref.locator ?? "", quote: p.quote, note: p.note ?? null })),
        };
      })
      .filter((x): x is Citation => x !== null),
  }));
}
