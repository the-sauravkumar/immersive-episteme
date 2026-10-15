/**
 * /cms/media content (server component, rendered inside <Suspense>), DESIGN.md 11.10:
 *  1. Figure Balance, the review gate (./figure-balance.tsx);
 *  2. the selected asset (preview in the fixed 3:2 slot, metadata, review, concept links with
 *     their anchor claims);
 *  3. the library: a dense booktabs table with Thumbnail (3:2), Credit, Licence, Max Pixels,
 *     Licence Expiry (tabular date; expiring rows flagged with --warn and the word), Linked
 *     Concept, Anchor Claim, Tradition and Layer;
 *  4. upload;
 *  5. imported media candidates with their licence decisions.
 * Which forms show is cosmetic; every action re-checks permissions on the server. No madder.
 */
import { Check, CircleAlert, CircleCheck, Clock } from "lucide-react";
import Link from "next/link";

import { ActionForm, FieldMessage } from "@/components/cms/action-form";
import { BLOCK_LINK, CHECK_BOX, CHECK_ROW, Empty, LINK, Mono, NativeSelect, PROVENANCE_LABELS, ROW_LINK, Section, StateBadge, STATE_LABELS, Disclosure } from "@/components/cms/bits";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { exposureLayerOf, KNOWLEDGE_LAYERS } from "@/features/learning/labels";
import { displayLongEdge, licenceValidOn, STUDY_FIGURE_CAP } from "@/features/media/contracts";
import { can } from "@/lib/permissions/can";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";
import { ASSET_LINK_ROLES, VERIFICATION_STATES, type ConceptType } from "@/lib/validation/enums";
import { getStaffPrincipal } from "@/server/auth/staff";
import {
  linkAssetAction,
  reviewAssetAction,
  reviewCandidateAction,
  submitAssetAction,
  unlinkAssetAction,
  updateAssetAction,
} from "@/server/cms/media/actions";
import {
  listAssets,
  listMediaCandidates,
  listMediaFormOptions,
  MEDIA_EVIDENCE_CHECKS,
  MEDIA_EVIDENCE_LABELS,
  type AssetListItem,
} from "@/server/cms/media/service";
import { describeMediaStorage, getMediaStorage } from "@/server/cms/media/storage";
import { getPool } from "@/server/db/client";

import { AssetMetadataFields } from "./asset-metadata-fields";
import { FigureBalanceSection } from "./figure-balance";
import { UploadForm } from "./upload-form";

/** A licence that ends within this many days is flagged as expiring (11.10). */
export const LICENCE_WARN_DAYS = 90;

export type LicenceStatus = { kind: "none" } | { kind: "valid"; day: string } | { kind: "expiring"; day: string; daysLeft: number } | { kind: "expired"; day: string };

/** The licence expiry state of an asset on `today` (YYYY-MM-DD). */
export function licenceStatus(expiresOn: string | null, today: string): LicenceStatus {
  if (!expiresOn) return { kind: "none" };
  if (!licenceValidOn(expiresOn, today)) return { kind: "expired", day: expiresOn };
  const daysLeft = Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return daysLeft <= LICENCE_WARN_DAYS ? { kind: "expiring", day: expiresOn, daysLeft } : { kind: "valid", day: expiresOn };
}

function LicenceExpiry({ status }: { status: LicenceStatus }) {
  if (status.kind === "none") return <span className="text-ink-3">No expiry</span>;
  const date = <time dateTime={status.day} className="text-id tabular-nums whitespace-nowrap text-ink">{status.day}</time>;
  if (status.kind === "valid") return date;
  return (
    <span className="flex flex-col items-end gap-1">
      {date}
      {status.kind === "expiring" ? (
        <Badge variant="warn">
          <Clock aria-hidden="true" />
          Expiring
        </Badge>
      ) : (
        <Badge variant="danger">
          <CircleAlert aria-hidden="true" />
          Expired
        </Badge>
      )}
    </span>
  );
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

const LAYER_LABEL = Object.fromEntries(KNOWLEDGE_LAYERS.map((l) => [l.id, l.label])) as Record<string, string>;
const layerOf = (type: string) => LAYER_LABEL[exposureLayerOf(type as ConceptType)] ?? "";

const ROLE_LABEL: Record<string, string> = { illustration: "Illustration" };
const roleLabel = (r: string) => ROLE_LABEL[r] ?? r.charAt(0).toUpperCase() + r.slice(1).replace(/_/g, " ");

/** The fixed 3:2 thumbnail slot (--sunk mat, 1 px rule, contain), like the study figure slot. */
function Thumb({ asset: a, width }: { asset: AssetListItem; width: number }) {
  const isImage = a.kind === "image" || a.kind === "texture";
  return (
    <span className="flex aspect-[3/2] shrink-0 items-center justify-center border border-rule bg-sunk" style={{ width }}>
      {isImage ? (
        // Staff-only authenticated original; next/image would fetch it without the session cookie.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/cms/media/file/${a.id}`} alt="" width={width} height={Math.round((width * 2) / 3)} className="size-full object-contain" loading="lazy" decoding="async" />
      ) : (
        <span className="text-label">{a.kind}</span>
      )}
    </span>
  );
}

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const CANDIDATE_STATUS: Record<string, { label: string; variant: "neutral" | "ok" | "danger"; Icon?: typeof CircleCheck }> = {
  candidate: { label: "Candidate", variant: "neutral" },
  approved: { label: "Approved", variant: "ok", Icon: CircleCheck },
  rejected: { label: "Rejected", variant: "danger", Icon: CircleAlert },
  imported: { label: "Imported", variant: "ok", Icon: CircleCheck },
};

export async function MediaLibrary({ searchParams }: { searchParams: Promise<Search> }) {
  const principal = await getStaffPrincipal();
  const sp = await searchParams;
  const stateFilter = one(sp.state);
  const state = stateFilter && (VERIFICATION_STATES as readonly string[]).includes(stateFilter) ? stateFilter : null;
  const fbSource = one(sp.fb) === "review" ? "review" : one(sp.fb) === "release" ? "release" : null;
  const fbDiagrams = one(sp.diagrams) !== "off";
  const pool = getPool();
  const [assets, candidates, options, hasRelease] = await Promise.all([
    listAssets(pool, { state }),
    listMediaCandidates(pool),
    listMediaFormOptions(pool),
    pool.query("SELECT 1 FROM content_snapshots WHERE kind = 'release' AND status = 'published' AND NOT is_demo LIMIT 1").then((r) => r.rows.length > 0),
  ]);
  const storage = describeMediaStorage(getMediaStorage());
  const canUpload = can(principal, "media.upload");
  const canReview = can(principal, "media.review");
  const selectedId = one(sp.asset);
  const selected = selectedId ? (assets.find((a) => a.id === selectedId) ?? (await listAssets(pool, {})).find((a) => a.id === selectedId)) : undefined;
  const today = new Date().toISOString().slice(0, 10);

  const query = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { state, asset: selectedId ?? null, fb: fbSource, diagrams: fbDiagrams ? null : "off", ...over };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/cms/media?${s}` : "/cms/media";
  };

  return (
    <div className="flex flex-col gap-6">
      <FigureBalanceSection
        q={pool}
        source={fbSource ?? (hasRelease ? "release" : "review")}
        diagrams={fbDiagrams}
        hrefFor={(v) => `${query({ fb: v.source, diagrams: v.diagrams ? null : "off" })}#figure-balance`}
      />

      {selected ? <SelectedAsset asset={selected} canUpload={canUpload} canReview={canReview} userId={principal?.userId ?? ""} options={options} closeHref={query({ asset: null })} /> : null}

      <Section
        id="library"
        title="Library"
        description={`Stored assets with their licence governance. Study figures are shown at ${STUDY_FIGURE_CAP} px at most on the long edge; a licence that ends within ${LICENCE_WARN_DAYS} days is flagged.`}
      >
        <nav aria-label="Filter by review state" className="flex flex-wrap gap-x-5">
          {[null, ...VERIFICATION_STATES.filter((s) => s !== "published")].map((s) => (
            <Link
              key={s ?? "all"}
              href={query({ state: s, asset: null })}
              aria-current={state === s ? "page" : undefined}
              className={cn(BLOCK_LINK, "min-w-11 justify-center aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:no-underline")}
            >
              {s ? STATE_LABELS[s] : "All"}
            </Link>
          ))}
        </nav>
        {assets.length === 0 ? (
          <Empty>{state ? `No assets in the state “${STATE_LABELS[state]}”.` : "No assets yet. Upload one below; it starts as a draft and needs a reviewer before use."}</Empty>
        ) : (
          <Table caption={`${assets.length} asset(s)`} density="compact" hoverRows className="min-w-[72rem]">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Thumbnail</TableHead>
                <TableHead scope="col">Asset</TableHead>
                <TableHead scope="col">Credit</TableHead>
                <TableHead scope="col">Licence</TableHead>
                <TableHead scope="col" numeric>
                  Max pixels
                </TableHead>
                <TableHead scope="col" numeric>
                  Licence expiry
                </TableHead>
                <TableHead scope="col">Linked concept</TableHead>
                <TableHead scope="col" numeric>
                  Anchor claim
                </TableHead>
                <TableHead scope="col">Tradition</TableHead>
                <TableHead scope="col">Layer</TableHead>
                <TableHead scope="col">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.flatMap((a) => {
                const links = a.links.length > 0 ? a.links : [null];
                const span = links.length;
                const isSel = a.id === selected?.id;
                return links.map((l, i) => (
                  <TableRow key={`${a.id}-${l?.id ?? "none"}`} data-state={isSel ? "selected" : undefined} className={cn(i < span - 1 && "border-b-0")}>
                    {i === 0 ? (
                      <>
                        <TableCell rowSpan={span} className="py-2 align-top">
                          <Thumb asset={a} width={72} />
                        </TableCell>
                        <TableCell rowSpan={span} className="min-w-48 py-2 align-top whitespace-normal">
                          <Link href={query({ asset: a.id })} className={ROW_LINK} aria-current={isSel ? "true" : undefined}>
                            {a.title}
                          </Link>
                          {isSel ? (
                            <span className="text-credit flex items-center gap-1 text-ink">
                              <Check aria-hidden="true" className="size-3.5 text-indigo" />
                              Selected
                            </span>
                          ) : null}
                          <span className="text-credit block tabular-nums">
                            {a.width && a.height ? `${a.width} × ${a.height} px, ` : ""}
                            {bytes(a.byteSize)}
                          </span>
                        </TableCell>
                        <TableCell rowSpan={span} className="max-w-48 py-2 align-top whitespace-normal">
                          {a.credit?.trim() ? (
                            a.credit
                          ) : a.kind === "image" || a.kind === "texture" ? (
                            <span className="inline-flex items-start gap-1 text-danger">
                              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                              Missing: blocks verification
                            </span>
                          ) : (
                            <span className="text-ink-3">None</span>
                          )}
                        </TableCell>
                        <TableCell rowSpan={span} className="max-w-40 py-2 align-top whitespace-normal">
                          {a.licence ?? <span className="text-ink-3">None</span>}
                        </TableCell>
                        <TableCell rowSpan={span} numeric className="py-2 align-top">
                          {a.maxPixels ?? <span className="text-ink-3">No cap</span>}
                        </TableCell>
                        <TableCell rowSpan={span} numeric className="py-2 align-top">
                          <LicenceExpiry status={licenceStatus(a.licenceExpiresOn, today)} />
                        </TableCell>
                      </>
                    ) : null}
                    {l ? (
                      <>
                        <TableCell className="min-w-44 py-2 align-top whitespace-normal">
                          <Link href={`/cms/concepts/${l.conceptId}`} className={ROW_LINK}>
                            {l.conceptTitle}
                          </Link>
                          {l.role !== "illustration" ? <span className="text-credit block">{roleLabel(l.role)}</span> : null}
                        </TableCell>
                        <TableCell numeric className="py-2 align-top">
                          {l.role === "illustration" ? (
                            l.anchorClaim ? (
                              <span title={l.anchorClaim}>Claim {l.position + 1}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-danger">
                                <CircleAlert aria-hidden="true" className="size-4" />
                                No claim {l.position + 1}
                              </span>
                            )
                          ) : (
                            <span className="text-ink-3">Not a figure</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 align-top whitespace-nowrap">
                          {l.traditionName ? (
                            <>
                              {l.traditionName}
                            </>
                          ) : (
                            <span className="text-ink-3">Shared</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 align-top">{layerOf(l.conceptType)}</TableCell>
                      </>
                    ) : (
                      <TableCell colSpan={4} className="py-2 align-top text-ink-3">
                        Not linked to a concept
                      </TableCell>
                    )}
                    {i === 0 ? (
                      <TableCell rowSpan={span} className="py-2 align-top">
                        <StateBadge state={a.verificationState} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ));
              })}
            </TableBody>
          </Table>
        )}
      </Section>

      {canUpload ? (
        <Section
          id="upload"
          title="Upload"
          description={
            <>
              Storage: {storage.mode === "s3" ? "S3-compatible object store (direct, checksum-verified upload)" : "local disk (development)"}. Licence and provenance are
              required. New uploads start as drafts; link each figure to its concept and anchor claim, then submit it for review.
            </>
          }
        >
          <UploadForm mode={storage.mode} sources={options.sources} />
        </Section>
      ) : null}

      <Section
        id="candidates"
        title="Imported media candidates"
        description="Images named by the content files. They are not downloaded or stored here; a reviewer records whether the stated licence permits use. Width and height come from the content files."
      >
        {candidates.length === 0 ? (
          <Empty>No candidates imported.</Empty>
        ) : (
          <Table caption={`${candidates.length} candidate(s)`} density="compact" className="min-w-[64rem]">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Candidate</TableHead>
                <TableHead scope="col">Depicts</TableHead>
                <TableHead scope="col">Licence and author</TableHead>
                <TableHead scope="col" numeric>
                  Size (px)
                </TableHead>
                <TableHead scope="col">Status</TableHead>
                {canReview ? <TableHead scope="col">Decision</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c) => {
                const st = CANDIDATE_STATUS[c.status] ?? { label: c.status, variant: "neutral" as const };
                return (
                  <TableRow key={c.id}>
                    <TableCell className="min-w-60 max-w-80 py-2 align-top whitespace-normal">
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className={ROW_LINK}>
                        {c.title}
                        <span className="sr-only"> (opens the source page in a new tab)</span>
                      </a>
                      {c.packageSlug ? <span className="text-credit block">{packageLabel(c.packageSlug)}</span> : null}
                    </TableCell>
                    <TableCell className="min-w-52 py-2 align-top whitespace-normal">{c.depictsKey ? <Mono>{c.depictsKey}</Mono> : <span className="text-ink-3">None</span>}</TableCell>
                    <TableCell className="max-w-56 py-2 align-top whitespace-normal">
                      {c.licence ?? <span className="text-ink-3">No licence stated</span>}
                      {c.author ? <span className="text-credit block">{c.author}</span> : null}
                    </TableCell>
                    <TableCell numeric className="py-2 align-top whitespace-nowrap">
                      {c.width && c.height ? `${c.width} × ${c.height}` : <span className="text-ink-3">Unknown</span>}
                      {c.mimeType ? <span className="text-credit block">{c.mimeType}</span> : null}
                    </TableCell>
                    <TableCell className="py-2 align-top">
                      <Badge variant={st.variant}>
                        {st.Icon ? <st.Icon aria-hidden="true" /> : null}
                        {st.label}
                      </Badge>
                      {c.notes ? <span className="text-credit mt-1 block max-w-48 whitespace-normal">{c.notes}</span> : null}
                    </TableCell>
                    {canReview ? (
                      <TableCell className="min-w-52 py-1 align-top whitespace-normal">
                        {c.status !== "imported" ? (
                          <Disclosure className="group" summary={<>Record decision<span className="sr-only"> for {c.title}</span></>}>
                            <ActionForm action={reviewCandidateAction} submitLabel="Record" submitVariant="outline" className="pt-2 pb-3">
                              <input type="hidden" name="candidateId" value={c.id} />
                              <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`cand-status-${c.id}`}>Decision</Label>
                                <NativeSelect id={`cand-status-${c.id}`} name="status" defaultValue={c.status === "candidate" ? "approved" : c.status}>
                                  <option value="approved">Approve (licence permits use)</option>
                                  <option value="rejected">Reject</option>
                                  <option value="candidate">Back to candidate</option>
                                </NativeSelect>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`cand-notes-${c.id}`}>Notes (required to reject)</Label>
                                <Input id={`cand-notes-${c.id}`} name="notes" maxLength={2000} />
                                <FieldMessage name="notes" />
                              </div>
                            </ActionForm>
                          </Disclosure>
                        ) : (
                          <span className="text-ink-3">Imported</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}

/** "machilipatnam-kalamkari" -> "Machilipatnam Kalamkari": a content package by name, not slug. */
function packageLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function SelectedAsset({
  asset: a,
  canUpload,
  canReview,
  userId,
  options,
  closeHref,
}: {
  asset: AssetListItem;
  canUpload: boolean;
  canReview: boolean;
  userId: string;
  options: { sources: { id: string; label: string }[]; concepts: { id: string; label: string }[] };
  closeHref: string;
}) {
  const isImage = a.kind === "image" || a.kind === "texture";
  const ownWork = a.createdBy === userId || a.updatedBy === userId;
  const edge = displayLongEdge(a);
  return (
    <Section
      id="asset"
      title={a.title}
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StateBadge state={a.verificationState} />
          <span className="tabular-nums">
            {a.mimeType}, {bytes(a.byteSize)}
            {a.width && a.height ? `, ${a.width} × ${a.height} px` : ""}, uploaded by {a.createdByName ?? "unknown"}
          </span>
        </span>
      }
      actions={
        <Link href={closeHref} className={cn(BLOCK_LINK, "min-w-11 justify-center")}>
          Close<span className="sr-only"> the selected asset</span>
        </Link>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          {isImage ? (
            <figure className="flex flex-col gap-2">
              <span className="flex aspect-[3/2] w-full items-center justify-center border border-rule bg-sunk">
                {/* eslint-disable-next-line @next/next/no-img-element -- staff-only authenticated original */}
                <img src={`/cms/media/file/${a.id}`} alt={a.altText ?? ""} width={a.width ?? undefined} height={a.height ?? undefined} className="size-full object-contain" />
              </span>
              <figcaption className="text-credit">
                {a.caption ?? "No caption."}
                {a.credit ? ` ${a.credit}` : ""}
                {a.licence ? `, ${a.licence}` : ""}
              </figcaption>
            </figure>
          ) : null}
          <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className="text-label pt-0.5">Shown at</dt>
            <dd className="text-value tabular-nums">
              {edge === null ? "Unknown" : `${Math.min(edge, STUDY_FIGURE_CAP)} px long edge`}
              {edge !== null && edge < STUDY_FIGURE_CAP ? <span className="block text-danger">Below the {STUDY_FIGURE_CAP} px study cap</span> : null}
            </dd>
            <dt className="text-label pt-0.5">Public plate</dt>
            <dd className="text-value">{a.publicPlate ? "Cleared" : "No"}</dd>
            <dt className="text-label pt-0.5">Checksum</dt>
            <dd className="text-value min-w-0">
              <Mono>{a.sha256}</Mono>
            </dd>
          </dl>
          <a href={`/cms/media/file/${a.id}`} className={BLOCK_LINK}>
            {isImage ? "Open original" : "Download original"}
          </a>
          {a.sourceUrl ? (
            <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className={BLOCK_LINK}>
              Source record<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
          {a.sourceTitle ? <p className="text-body">Cited source: {a.sourceTitle}</p> : null}
          <p className="text-credit">Provenance: {PROVENANCE_LABELS[a.provenanceKind] ?? a.provenanceKind}</p>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          {canUpload ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-label border-b border-rule pb-1">Metadata</h3>
              {a.verificationState === "verified" || a.verificationState === "published" ? <p className="text-body text-ink-2">Saving changes to a verified asset sends it back to review.</p> : null}
              <ActionForm action={updateAssetAction} submitLabel="Save metadata">
                <input type="hidden" name="assetId" value={a.id} />
                <AssetMetadataFields isImage={isImage} sources={options.sources} defaults={{ ...a }} />
              </ActionForm>
              {["draft", "needs_evidence", "rejected"].includes(a.verificationState) ? (
                <ActionForm action={submitAssetAction} submitLabel="Submit for review" submitVariant="outline">
                  <input type="hidden" name="assetId" value={a.id} />
                </ActionForm>
              ) : null}
            </div>
          ) : null}

          {canReview && a.verificationState === "under_review" ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-label border-b border-rule pb-1">Review</h3>
              {ownWork ? <p className="text-body text-ink-2">You uploaded or last edited this asset, so another reviewer must verify it.</p> : null}
              <ActionForm action={reviewAssetAction} submitLabel="Record decision">
                <input type="hidden" name="assetId" value={a.id} />
                <fieldset className="flex min-w-0 flex-col">
                  <legend className="text-label mb-1">Decision</legend>
                  {(
                    [
                      ["verified", "Verify", ownWork],
                      ["needs_evidence", "Needs evidence", false],
                      ["rejected", "Reject", false],
                    ] as const
                  ).map(([value, label, disabled]) => (
                    <label key={value} className={cn(CHECK_ROW, disabled && "cursor-not-allowed text-ink-3")}>
                      {/* Nothing pre-selected (a slip must not record a decision); the browser asks for one. */}
                      <input type="radio" name="to" value={value} required disabled={disabled} className={CHECK_BOX} />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <fieldset className="flex min-w-0 flex-col">
                  <legend className="text-label mb-1">Evidence checked (all required to verify)</legend>
                  {MEDIA_EVIDENCE_CHECKS.map((c) => (
                    <label key={c} className={CHECK_ROW}>
                      <input type="checkbox" name="evidenceChecked" value={c} className={CHECK_BOX} />
                      {MEDIA_EVIDENCE_LABELS[c]}
                    </label>
                  ))}
                  <FieldMessage name="evidenceChecked" />
                </fieldset>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`review-reason-${a.id}`}>Reason (required unless verifying)</Label>
                  <Textarea id={`review-reason-${a.id}`} name="reason" rows={2} maxLength={2000} />
                  <FieldMessage name="reason" />
                </div>
              </ActionForm>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <h3 className="text-label border-b border-rule pb-1">{titleCase("Linked concepts")}</h3>
            {a.links.length === 0 ? (
              <Empty>Not linked to any concept.</Empty>
            ) : (
              <ul className="flex flex-col">
                {a.links.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule py-2">
                    <div className="flex min-w-0 flex-col">
                      <Link href={`/cms/concepts/${l.conceptId}`} className={cn(LINK, "inline-flex min-h-11 items-center")}>
                        {l.conceptTitle}
                      </Link>
                      <span className="text-credit">
                        {roleLabel(l.role)}
                        {l.role === "illustration" ? `, after claim ${l.position + 1}` : ""}
                        {l.traditionName ? `, ${l.traditionName}` : ""}, {layerOf(l.conceptType)} layer
                      </span>
                      {l.role === "illustration" && l.anchorClaim ? <span className="text-body mt-1 max-w-[34rem] bg-sunk px-3 py-1 text-ink-2">{l.anchorClaim}</span> : null}
                    </div>
                    {canUpload ? (
                      <ActionForm action={unlinkAssetAction} submitLabel="Remove link" submitVariant="outline" pendingLabel="Removing…">
                        <input type="hidden" name="linkId" value={l.id} />
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canUpload ? (
              <ActionForm action={linkAssetAction} submitLabel="Link to concept" submitVariant="outline" resetOnSuccess>
                <input type="hidden" name="assetId" value={a.id} />
                <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1fr)_11rem_9rem]">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={`link-concept-${a.id}`}>Concept</Label>
                    <NativeSelect id={`link-concept-${a.id}`} name="conceptId" required defaultValue="">
                      <option value="" disabled>
                        Choose…
                      </option>
                      {options.concepts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </NativeSelect>
                    <FieldMessage name="conceptId" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={`link-role-${a.id}`}>Role</Label>
                    <NativeSelect id={`link-role-${a.id}`} name="role" defaultValue="illustration">
                      {ASSET_LINK_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={`link-anchor-${a.id}`}>Anchor claim</Label>
                    <Input
                      id={`link-anchor-${a.id}`}
                      name="anchorClaim" type="text" inputMode="numeric" pattern="[0-9]*"
                      defaultValue={1}
                      aria-describedby={`link-anchor-${a.id}-hint`}
                      className="tabular-nums"
                    />
                    <FieldMessage name="position" />
                  </div>
                </div>
                <p id={`link-anchor-${a.id}-hint`} className="text-credit">
                  Anchor claim: the number of the claim the figure follows, as the proof numbers it (1 for the first claim). A concept shows at most one
                  illustration. For other roles the number is the display order.
                </p>
              </ActionForm>
            ) : null}
          </div>
        </div>
      </div>
    </Section>
  );
}
