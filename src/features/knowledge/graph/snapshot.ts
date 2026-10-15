/**
 * Content -> snapshot builder. Produces a knowledge bundle v1 (`knowledgeBundleSchema`, the
 * `content_snapshots.payload` contract) wrapped in an envelope that records hashes, the
 * content files, the source manifest, verification-state counts and the integrity summary.
 *
 * Two kinds:
 *  - `review`: for researchers. `includesUnverified: true`; may hold under_review and
 *    needs_evidence content; the envelope says so in `notice`. Refused only on error-level
 *    integrity issues or demo content.
 *  - `publishable`: refused unless there are no error-level issues and every tradition,
 *    concept, relationship and source is verified or published. Interchange files can never
 *    carry those states (FORMAT.md), so content/ alone never yields a publishable snapshot;
 *    only curator-accepted content (CMS) can.
 *
 * Determinism: ids are name-based (hash.ts), every array is sorted (concepts by key, the
 * rest by id or code; claims keep their authored position), and hashes are taken over
 * canonical JSON. `contentSha256` excludes `generatedAt` and `versionLabel`, so the same
 * content always has the same content hash regardless of input order or build time.
 */
import { KNOWLEDGE_CATEGORIES } from "@db/seeds/reference-data";
import { knowledgeBundleSchema, slugFromConceptKey, type KnowledgeBundle, type SnapshotItem } from "@/features/knowledge/contracts";
import { ACCEPTED_STATES, type VerificationState } from "@/lib/validation/enums";

import { canonicalJson, postgresJsonbText } from "./canonical-json";
import { hashCanonical, nameBasedUuid, type Sha256Hasher } from "./hash";
import { DEFAULT_REGISTRY, type RelationshipTypeRegistry } from "./registry";
import { countStates, type StateCounts } from "./report";
import { SNAPSHOT_REFUSALS } from "./rules";
import { manifestUrlKey, type SourceManifestEntry } from "./source-manifest";
import type { IntegrityIssue, KnowledgeGraphModel, Severity } from "./types";
import { relationshipId } from "./validate";

export type SnapshotKind = "review" | "publishable";

export const SNAPSHOT_ENVELOPE_VERSION = 1 as const;

export const SNAPSHOT_NOTICES: Record<SnapshotKind, string> = {
  review:
    "REVIEW SNAPSHOT. Contains content that no curator has verified (under_review / needs_evidence). " +
    "For researcher review only: not publishable, and not for use in a study.",
  publishable: "Publishable snapshot: every item is verified or published and the graph has no error-level integrity issues.",
};

export interface BuildSnapshotOptions {
  kind: SnapshotKind;
  hasher: Sha256Hasher;
  /** ISO 8601 with offset. Pass a fixed value for reproducible payload hashes. */
  generatedAt: string;
  /** Integrity issues from validation (loader + validators) of this same model. */
  issues: readonly IntegrityIssue[];
  /** Defaults to `<kind>-<first 12 hex of contentSha256>`. */
  versionLabel?: string;
  sourceManifest?: { path: string; sha256: string; entries: readonly SourceManifestEntry[] } | null;
  registry?: RelationshipTypeRegistry;
  /** The model is demo content (bundle `isDemo`). Real content must not contain demo rows. */
  isDemo?: boolean;
}

export interface SnapshotRefusal {
  code: string;
  message: string;
}

export interface SnapshotEnvelope {
  envelopeVersion: typeof SNAPSHOT_ENVELOPE_VERSION;
  kind: SnapshotKind;
  notice: string;
  versionLabel: string;
  /** sha256(canonicalJson(payload without generatedAt and versionLabel)). */
  contentSha256: string;
  /** sha256(canonicalJson(payload)). */
  payloadSha256: string;
  /** sha256 of the payload as PostgreSQL jsonb text = expected `content_snapshots.payload_sha256`. */
  predictedDbPayloadSha256: string;
  contentFiles: { path: string; slug: string; sha256: string | null }[];
  sourceManifest: {
    path: string;
    sha256: string;
    entries: number;
    sources: { sourceId: string; ref: string; url: string; sha256: string | null; httpStatus: number | null }[];
    notArchived: string[];
  } | null;
  verificationCounts: { traditions: StateCounts; concepts: StateCounts; relationships: StateCounts; sources: StateCounts };
  integrity: Record<Severity, number>;
  itemCount: number;
  items: SnapshotItem[];
  payload: KnowledgeBundle;
}

export type SnapshotBuildResult =
  | { ok: true; snapshot: SnapshotEnvelope }
  | { ok: false; kind: SnapshotKind; refusals: SnapshotRefusal[] };

const isAccepted = (s: VerificationState) => (ACCEPTED_STATES as readonly string[]).includes(s);
const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export interface ContentIds {
  tradition(slug: string): string;
  source(ref: string): string;
  concept(key: string): string;
  claim(key: string, position: number): string;
  relationship(id: string): string;
}

export function contentIds(hasher: Sha256Hasher): ContentIds {
  return {
    tradition: (slug) => nameBasedUuid(hasher, "tradition", slug),
    source: (ref) => nameBasedUuid(hasher, "source", ref),
    concept: (key) => nameBasedUuid(hasher, "concept", key),
    claim: (key, position) => nameBasedUuid(hasher, "claim", key, String(position)),
    relationship: (id) => nameBasedUuid(hasher, "relationship", id),
  };
}

/** Builds the bundle payload (unvalidated). Exposed for exporters and tests. */
export function buildBundle(
  model: KnowledgeGraphModel,
  opts: { hasher: Sha256Hasher; versionLabel: string; generatedAt: string; includesUnverified: boolean; isDemo?: boolean; registry?: RelationshipTypeRegistry },
): KnowledgeBundle {
  const ids = contentIds(opts.hasher);
  const registry = opts.registry ?? DEFAULT_REGISTRY;
  const traditionPackages = model.packages.filter((p) => p.kind === "tradition");
  const traditionIdBySlug = new Map(traditionPackages.map((p) => [p.slug, ids.tradition(p.slug)]));

  return {
    schemaVersion: 1,
    versionLabel: opts.versionLabel,
    isDemo: opts.isDemo ?? false,
    includesUnverified: opts.includesUnverified,
    generatedAt: opts.generatedAt,
    categories: KNOWLEDGE_CATEGORIES.map((c, i) => ({ code: c.code, label: c.label, templateGroup: c.templateGroup, position: i + 1 })),
    relationshipTypes: registry.all().map((t) => ({
      code: t.code,
      label: t.label,
      inverseLabel: t.inverseLabel ?? null,
      semantics: t.semantics,
      directed: t.directed,
      ordered: t.ordered,
      allowsCycles: t.allowsCycles,
    })),
    traditions: traditionPackages
      .map((p) => ({
        id: traditionIdBySlug.get(p.slug)!,
        slug: p.slug,
        name: p.name,
        altNames: [...p.altNames],
        summary: p.summary,
        region: p.region ?? { place: null, district: null, state: null, country: null, lat: null, lon: null },
        gi: p.gi
          ? { registered: p.gi.registered, applicationNo: p.gi.applicationNo, year: p.gi.year, sourceIds: dedupe(p.gi.sourceRefs).map(ids.source) }
          : null,
        verificationState: traditionState(model, p.slug),
      }))
      .sort((a, b) => byString(a.slug, b.slug)),
    sources: model.sources
      .map((s) => ({
        id: ids.source(s.ref),
        kind: s.kind,
        title: s.title,
        author: s.author,
        publisher: s.publisher,
        year: s.year,
        url: s.url,
        accessedOn: s.accessed,
        reliability: s.reliability,
        verificationState: s.verificationState,
      }))
      .sort((a, b) => byString(a.id, b.id)),
    concepts: model.concepts
      .map((c) => ({
        id: ids.concept(c.key),
        key: c.key,
        slug: slugFromConceptKey(c.key),
        type: c.type,
        category: c.category,
        traditionId: traditionIdBySlug.get(c.packageSlug) ?? null,
        title: c.title,
        summary: c.summary,
        body: null,
        bodyMd: c.bodyMd,
        localTerms: [...c.localTerms],
        compares: [...c.compares],
        provenanceKind: c.provenanceKind,
        verificationState: c.verificationState,
        claims: c.claims.map((cl, i) => ({
          id: ids.claim(c.key, i),
          text: cl.text,
          quote: cl.quote,
          // Sorted by id like relationship sources, so a bundle rebuilt from the database (which
          // keeps no citation order) is byte-identical to one built from the files.
          sources: dedupe(cl.sourceRefs)
            .map((ref) => {
              const evidence = cl.evidence.filter((e) => e.ref === ref).map(({ locator, quote, note }) => ({ locator, quote, note }));
              return { sourceId: ids.source(ref), locator: evidence[0]?.locator ?? null, evidence };
            })
            .sort((x, y) => byString(x.sourceId, y.sourceId)),
        })),
        assetIds: [],
      }))
      .sort((a, b) => byString(a.key, b.key)),
    relationships: model.relationships
      .map((r) => ({
        id: ids.relationship(relationshipId(r)),
        source: r.source,
        target: r.target,
        type: r.type,
        explanation: r.explanation,
        conditions: r.conditions,
        strength: r.strength,
        ordinal: r.ordinal,
        provenanceKind: r.provenanceKind,
        verificationState: r.verificationState,
        sources: dedupe(r.sourceRefs)
          .map((ref) => ({ sourceId: ids.source(ref), quote: null, locator: null }))
          .sort((a, b) => byString(a.sourceId, b.sourceId)),
      }))
      .sort((a, b) => byString(a.id, b.id)),
  };
}

function dedupe(xs: readonly string[]): string[] {
  return [...new Set(xs)];
}

/** A tradition's review state is its `tradition` concept's state (FORMAT v1 has no file-level state). */
function traditionState(model: KnowledgeGraphModel, slug: string): VerificationState {
  const c = model.concepts.find((x) => x.packageSlug === slug && x.type === "tradition");
  return c?.verificationState ?? "under_review";
}

/** snapshot_items rows (same shape and hashing as db/seeds/demo.ts `snapshotItemsFor`). */
export function snapshotItems(bundle: KnowledgeBundle, hasher: Sha256Hasher): SnapshotItem[] {
  const row = (itemKind: SnapshotItem["itemKind"], entityRef: string, entityKey: string | null, value: unknown): SnapshotItem => ({
    itemKind,
    entityRef,
    entityKey,
    itemSha256: hashCanonical(hasher, value),
  });
  return [
    ...bundle.categories.map((c) => row("category", c.code, c.code, c)),
    ...bundle.relationshipTypes.map((t) => row("relationship_type", t.code, t.code, t)),
    ...bundle.traditions.map((t) => row("tradition", t.id, t.slug, t)),
    ...bundle.sources.map((s) => row("source", s.id, null, s)),
    ...bundle.concepts.map((c) => row("concept", c.id, c.key, c)),
    ...bundle.concepts.flatMap((c) => c.claims.map((cl) => row("claim", cl.id, c.key, cl))),
    ...bundle.relationships.map((r) => row("relationship", r.id, `${r.source}|${r.type}|${r.target}`, r)),
  ].sort((a, b) => byString(a.itemKind, b.itemKind) || byString(a.entityRef, b.entityRef));
}

export function contentHash(bundle: KnowledgeBundle, hasher: Sha256Hasher): string {
  return hasher.sha256Hex(canonicalJson({ ...bundle, generatedAt: undefined, versionLabel: undefined }));
}

export function buildSnapshot(model: KnowledgeGraphModel, opts: BuildSnapshotOptions): SnapshotBuildResult {
  const refusals: SnapshotRefusal[] = [];
  const errors = opts.issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    refusals.push({
      code: SNAPSHOT_REFUSALS.ERRORS_PRESENT,
      message: `${errors.length} error-level integrity issue(s): ${[...new Set(errors.map((e) => e.code))].sort().join(", ")}`,
    });
  }
  if (!opts.isDemo && (model.packages.some((p) => p.isDemo) || model.concepts.some((c) => c.isDemo))) {
    refusals.push({ code: SNAPSHOT_REFUSALS.DEMO_CONTENT, message: "Demo content cannot go into a real snapshot" });
  }

  const traditionStates = model.packages.filter((p) => p.kind === "tradition").map((p) => ({ verificationState: traditionState(model, p.slug) }));
  if (opts.kind === "publishable") {
    const pending = [
      ["traditions", traditionStates],
      ["concepts", model.concepts],
      ["relationships", model.relationships],
      ["sources", model.sources],
    ] as const;
    for (const [label, items] of pending) {
      const n = items.filter((i) => !isAccepted(i.verificationState)).length;
      if (n > 0) refusals.push({ code: SNAPSHOT_REFUSALS.UNACCEPTED_CONTENT, message: `${n} of ${items.length} ${label} are not verified or published` });
    }
  }
  if (refusals.length > 0) return { ok: false, kind: opts.kind, refusals };

  const draft = buildBundle(model, {
    hasher: opts.hasher,
    versionLabel: "pending",
    generatedAt: opts.generatedAt,
    includesUnverified: opts.kind === "review",
    isDemo: opts.isDemo,
    registry: opts.registry,
  });
  const contentSha256 = contentHash(draft, opts.hasher);
  const versionLabel = opts.versionLabel ?? `${opts.kind}-${contentSha256.slice(0, 12)}`;
  const parsed = knowledgeBundleSchema.safeParse({ ...draft, versionLabel });
  if (!parsed.success) {
    return {
      ok: false,
      kind: opts.kind,
      refusals: parsed.error.issues.slice(0, 20).map((i) => ({ code: SNAPSHOT_REFUSALS.BUNDLE_INVALID, message: `${i.path.join(".")}: ${i.message}` })),
    };
  }
  // Keep the builder's key order and arrays (the parse only adds defaults that are already present).
  const payload: KnowledgeBundle = { ...draft, versionLabel };
  const items = snapshotItems(payload, opts.hasher);

  let sourceManifest: SnapshotEnvelope["sourceManifest"] = null;
  if (opts.sourceManifest) {
    const byUrl = new Map(opts.sourceManifest.entries.map((e) => [manifestUrlKey(e.url), e]));
    const ids = contentIds(opts.hasher);
    const sources = [...model.sources]
      .filter((s) => s.url)
      .map((s) => {
        const e = byUrl.get(manifestUrlKey(s.url!));
        return { sourceId: ids.source(s.ref), ref: s.ref, url: s.url!, sha256: e?.sha256 ?? null, httpStatus: e?.httpStatus ?? null };
      })
      .sort((a, b) => byString(a.sourceId, b.sourceId));
    sourceManifest = {
      path: opts.sourceManifest.path,
      sha256: opts.sourceManifest.sha256,
      entries: opts.sourceManifest.entries.length,
      sources,
      notArchived: sources.filter((s) => s.sha256 === null).map((s) => s.ref).sort(),
    };
  }

  const integrity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const i of opts.issues) integrity[i.severity]++;

  return {
    ok: true,
    snapshot: {
      envelopeVersion: SNAPSHOT_ENVELOPE_VERSION,
      kind: opts.kind,
      notice: SNAPSHOT_NOTICES[opts.kind],
      versionLabel,
      contentSha256,
      payloadSha256: hashCanonical(opts.hasher, payload),
      predictedDbPayloadSha256: opts.hasher.sha256Hex(postgresJsonbText(payload)),
      contentFiles: [...model.packages].sort((a, b) => byString(a.path, b.path)).map((p) => ({ path: p.path, slug: p.slug, sha256: p.fileSha256 })),
      sourceManifest,
      verificationCounts: {
        traditions: countStates(traditionStates),
        concepts: countStates(model.concepts),
        relationships: countStates(model.relationships),
        sources: countStates(model.sources),
      },
      integrity,
      itemCount: items.length,
      items,
      payload,
    },
  };
}
