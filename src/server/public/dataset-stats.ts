/**
 * Public-page reads (DESIGN.md 11.1, 11.2, 13): live counts of the knowledge dataset, one real
 * claim for the home specimen and the About pull-quote, the published image credits, and the
 * stored interface parity report.
 *
 * Honesty rules (DESIGN.md 13):
 *  - Every number comes from the database at request time; nothing is hard-coded. The page
 *    wrappers (`get*`) call `connection()` first, so they never run during prerendering and
 *    their callers sit inside <Suspense> (cacheComponents).
 *  - Demonstration records (`is_demo`) are never counted or shown.
 *  - The claim shown is a real dataset claim with its real source record and verbatim passage,
 *    and carries its real curator status (records under review are labelled so).
 *  - A failure to read (database down) returns `null`, and the caller renders its static,
 *    number-free fallback instead of an invented value.
 *
 * The `load*` functions take any `pg`-style queryable, so the integration test runs them
 * against a throwaway database seeded with a different dataset.
 */
import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import { sourceDisplayLabel, type Citation } from "@/features/knowledge/read/view";
import type { InterfaceParitySummary } from "@/features/research/interface-parity";
import { compareTraditions, STUDY_TRADITION_SLUGS } from "@/features/learning/labels";
import type { ProvenanceKind, SourceReliability, VerificationState } from "@/lib/validation/enums";
import { readInterfaceParity } from "@/server/research/parity/summary";
import { getPool } from "@/server/db/client";

/** The part of a `pg` Pool or client these reads need. */
export interface Queryable {
  query<R extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

// ---------------------------------------------------------------------------------------
// Dataset counts
// ---------------------------------------------------------------------------------------

export interface TraditionStats {
  slug: string;
  /** The dataset's own name for the tradition. */
  name: string;
  /** Short display name derived from the dataset slug ("machilipatnam-kalamkari" -> "Machilipatnam Kalamkari"). */
  shortName: string;
  /** "District, State" from the dataset's region fields, or null when neither is recorded. */
  region: string | null;
  concepts: number;
  claims: number;
  /** Distinct sources cited by the tradition's claims. */
  sourcesCited: number;
}

export interface DatasetStats {
  totals: {
    traditions: number;
    concepts: number;
    claims: number;
    relationships: number;
    sources: number;
    /** Claims citing at least one source. */
    citedClaims: number;
    /** Claims with at least one located verbatim passage from a cited source. */
    evidencedClaims: number;
    /** Distinct sources cited by any claim. */
    sourcesCited: number;
    /** Concepts curators have marked verified or published. */
    verifiedConcepts: number;
  };
  /** In the canonical (alphabetical) tradition order. */
  traditions: TraditionStats[];
  /** Shared concepts (no tradition of their own), with their claims and sources. */
  shared: { concepts: number; claims: number; sourcesCited: number };
}

/** "machilipatnam-kalamkari" -> "Machilipatnam Kalamkari". */
export function displayNameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function regionOf(district: string | null, state: string | null): string | null {
  const parts = [district, state].map((p) => p?.trim()).filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(", ") : null;
}

const int = (v: unknown) => Number(v ?? 0);

export async function loadDatasetStats(q: Queryable): Promise<DatasetStats> {
  const totals = await q.query<Record<string, unknown>>(
    `SELECT
       (SELECT count(*) FROM traditions WHERE NOT is_demo) AS traditions,
       (SELECT count(*) FROM concepts WHERE NOT is_demo) AS concepts,
       (SELECT count(*) FROM concept_claims WHERE NOT is_demo) AS claims,
       (SELECT count(*) FROM relationships WHERE NOT is_demo) AS relationships,
       (SELECT count(*) FROM sources WHERE NOT is_demo) AS sources,
       (SELECT count(DISTINCT cs.claim_id) FROM concept_claim_sources cs WHERE NOT cs.is_demo) AS cited_claims,
       (SELECT count(DISTINCT cs.claim_id) FROM concept_claim_sources cs
          WHERE NOT cs.is_demo AND jsonb_array_length(cs.evidence) > 0) AS evidenced_claims,
       (SELECT count(DISTINCT cs.source_id) FROM concept_claim_sources cs WHERE NOT cs.is_demo) AS sources_cited,
       (SELECT count(*) FROM concepts WHERE NOT is_demo AND verification_state IN ('verified', 'published')) AS verified_concepts`,
  );
  const t = totals.rows[0] ?? {};

  const perTradition = await q.query<{
    slug: string | null;
    name: string | null;
    region_district: string | null;
    region_state: string | null;
    concepts: unknown;
    claims: unknown;
    sources_cited: unknown;
  }>(
    `SELECT t.slug, t.name, t.region_district, t.region_state,
            (SELECT count(*) FROM concepts c WHERE NOT c.is_demo AND c.tradition_id IS NOT DISTINCT FROM t.id) AS concepts,
            (SELECT count(*) FROM concept_claims cc JOIN concepts c ON c.id = cc.concept_id
               WHERE NOT c.is_demo AND c.tradition_id IS NOT DISTINCT FROM t.id) AS claims,
            (SELECT count(DISTINCT cs.source_id) FROM concept_claim_sources cs
               JOIN concept_claims cc ON cc.id = cs.claim_id JOIN concepts c ON c.id = cc.concept_id
               WHERE NOT c.is_demo AND c.tradition_id IS NOT DISTINCT FROM t.id) AS sources_cited
       FROM (SELECT id, slug, name, region_district, region_state FROM traditions WHERE NOT is_demo
             UNION ALL SELECT NULL, NULL, NULL, NULL, NULL) t`,
  );

  const traditions: TraditionStats[] = [];
  let shared = { concepts: 0, claims: 0, sourcesCited: 0 };
  for (const r of perTradition.rows) {
    const counts = { concepts: int(r.concepts), claims: int(r.claims), sourcesCited: int(r.sources_cited) };
    if (r.slug === null || r.name === null) {
      shared = counts;
      continue;
    }
    traditions.push({ slug: r.slug, name: r.name, shortName: displayNameFromSlug(r.slug), region: regionOf(r.region_district, r.region_state), ...counts });
  }
  // Canonical order (DR-019): alphabetical by display name, the same order everywhere.
  traditions.sort((a, b) => compareTraditions({ name: a.shortName, slug: a.slug }, { name: b.shortName, slug: b.slug }));

  return {
    totals: {
      traditions: int(t.traditions),
      concepts: int(t.concepts),
      claims: int(t.claims),
      relationships: int(t.relationships),
      sources: int(t.sources),
      citedClaims: int(t.cited_claims),
      evidencedClaims: int(t.evidenced_claims),
      sourcesCited: int(t.sources_cited),
      verifiedConcepts: int(t.verified_concepts),
    },
    traditions,
    shared,
  };
}

// ---------------------------------------------------------------------------------------
// One real claim (home specimen, About pull-quote)
// ---------------------------------------------------------------------------------------

export interface FeaturedClaim {
  conceptId: string;
  conceptTitle: string;
  conceptState: VerificationState;
  traditionSlug: string;
  traditionShortName: string;
  /** 0-based authored position; shown as claim number position + 1. */
  position: number;
  text: string;
  citation: Citation;
}

/**
 * Selection limits: short enough to set as a specimen inside Plate 1's fixed 4:5 frame (the claim,
 * its source line, the verbatim quote and a three-row record must fit without clipping; asserted
 * in tests/e2e/public-pages.spec.ts).
 */
const MAX_CLAIM_CHARS = 150;
const MAX_QUOTE_CHARS = 180;
const MAX_SPECIMEN_CHARS = 240;
const MAX_SOURCE_TITLE_CHARS = 90;
/**
 * The About pull-quote sets only the claim (at 28 px) and its source line, not the quote, and has
 * no fixed frame: only the claim length is limited there, so a short claim reads as a pull-quote.
 */
const MAX_PULL_QUOTE_CLAIM_CHARS = 160;

/** Which setting the claim is chosen for: the 4:5 Plate 1 specimen, or the About pull-quote. */
export type FeaturedClaimFit = "specimen" | "pull-quote";

/**
 * One real claim for the home specimen (`fit` "specimen") or the About pull-quote (`fit`
 * "pull-quote", with the specimen's tradition in `excludeSlugs`, so the two pages never repeat
 * one claim).
 *
 * Never from a study tradition (STUDY_TRADITION_SLUGS): a visitor who reads the home page before
 * a pre-test must not be shown a study fact, and no study tradition gets front-page salience.
 * Candidates are claims of a tradition's overview concept that cite exactly one source with a
 * located verbatim passage, within the fit's length limits. Per tradition the shortest candidate
 * (the specimen: claim plus quote; the pull-quote: the claim, whose quote is not shown; then the
 * authored position) is taken; the traditions are then taken in the canonical order, starting at
 * `skip`. Returns null when fewer traditions qualify (never a repeat). Deterministic for a given
 * dataset.
 */
export async function loadFeaturedClaim(
  q: Queryable,
  opts: { skip?: number; fit?: FeaturedClaimFit; excludeSlugs?: readonly string[] } = {},
): Promise<FeaturedClaim | null> {
  const pullQuote = opts.fit === "pull-quote";
  // Limits per fit; null switches a limit off (the pull-quote does not set the quote).
  const limits = pullQuote
    ? [MAX_PULL_QUOTE_CLAIM_CHARS, null, null, null]
    : [MAX_CLAIM_CHARS, MAX_QUOTE_CHARS, MAX_SPECIMEN_CHARS, MAX_SOURCE_TITLE_CHARS];
  const r = await q.query<{
    concept_id: string;
    concept_title: string;
    concept_state: VerificationState;
    slug: string;
    position: number;
    text: string;
    locator: string | null;
    evidence: { locator: string; quote: string; note?: string | null }[];
    source_id: string;
    kind: ProvenanceKind;
    title: string;
    author: string | null;
    publisher: string | null;
    year: number | null;
    url: string | null;
    accessed_on: string | null;
    reliability: SourceReliability | null;
    source_state: VerificationState;
  }>(
    `SELECT c.id AS concept_id, c.title AS concept_title, c.verification_state AS concept_state, t.slug,
            cc.position, cc.text, cs.locator, cs.evidence,
            s.id AS source_id, s.kind, s.title, s.author, s.publisher, s.year, s.url,
            to_char(s.accessed_on, 'YYYY-MM-DD') AS accessed_on, s.reliability, s.verification_state AS source_state
       FROM concept_claims cc
       JOIN concepts c ON c.id = cc.concept_id
       JOIN traditions t ON t.id = c.tradition_id
       JOIN concept_claim_sources cs ON cs.claim_id = cc.id
       JOIN sources s ON s.id = cs.source_id
      WHERE NOT c.is_demo AND NOT t.is_demo AND c.type = 'tradition'
        AND NOT (t.slug = ANY($5::text[]))
        AND (SELECT count(*) FROM concept_claim_sources x WHERE x.claim_id = cc.id) = 1
        AND jsonb_array_length(cs.evidence) > 0
        AND char_length(cs.evidence->0->>'quote') > 0
        AND char_length(cc.text) <= $1::int
        AND ($2::int IS NULL OR char_length(cs.evidence->0->>'quote') <= $2::int)
        AND ($3::int IS NULL OR char_length(cc.text) + char_length(cs.evidence->0->>'quote') <= $3::int)
        AND ($4::int IS NULL OR char_length(s.title) <= $4::int)
      ORDER BY CASE WHEN $6::boolean THEN char_length(cc.text) ELSE char_length(cc.text) + char_length(cs.evidence->0->>'quote') END, cc.position`,
    [...limits, [...STUDY_TRADITION_SLUGS, ...(opts.excludeSlugs ?? [])], pullQuote],
  );
  const bySlug = new Map<string, (typeof r.rows)[number]>();
  for (const row of r.rows) if (!bySlug.has(row.slug)) bySlug.set(row.slug, row);
  const ordered = [...bySlug.values()].sort((a, b) =>
    compareTraditions({ name: displayNameFromSlug(a.slug), slug: a.slug }, { name: displayNameFromSlug(b.slug), slug: b.slug }),
  );
  const row = ordered[opts.skip ?? 0];
  if (!row) return null;
  const passages = row.evidence.map((e) => ({ locator: e.locator, quote: e.quote, note: e.note ?? null }));
  const first = passages[0]!;
  const citation: Citation = {
    id: row.source_id,
    label: sourceDisplayLabel(row),
    kind: row.kind,
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    year: row.year,
    url: row.url,
    accessedOn: row.accessed_on,
    reliability: row.reliability,
    verificationState: row.source_state,
    locator: row.locator ?? first.locator,
    quote: first.quote,
    passages,
  };
  return {
    conceptId: row.concept_id,
    conceptTitle: row.concept_title,
    conceptState: row.concept_state,
    traditionSlug: row.slug,
    traditionShortName: displayNameFromSlug(row.slug),
    position: row.position,
    text: row.text,
    citation,
  };
}

// ---------------------------------------------------------------------------------------
// Published image credits (About, "Images and Licences")
// ---------------------------------------------------------------------------------------

export interface ImageCredit {
  id: string;
  title: string;
  credit: string;
  licence: string;
  licenceUrl: string | null;
  sourceUrl: string | null;
}

/** Image assets curators have verified or published, with credit and licence (never demo records). */
export async function loadImageCredits(q: Queryable): Promise<ImageCredit[]> {
  const r = await q.query<{ id: string; title: string; credit: string; licence: string; licence_url: string | null; source_url: string | null }>(
    `SELECT id, title, credit, licence, licence_url, source_url FROM assets
      WHERE NOT is_demo AND kind = 'image' AND verification_state IN ('verified', 'published')
        AND credit IS NOT NULL AND licence IS NOT NULL
      ORDER BY title`,
  );
  return r.rows.map((x) => ({ id: x.id, title: x.title, credit: x.credit, licence: x.licence, licenceUrl: x.licence_url, sourceUrl: x.source_url }));
}

// ---------------------------------------------------------------------------------------
// Page-facing wrappers: request time only, null on failure
// ---------------------------------------------------------------------------------------

async function atRequestTime<T>(read: (q: Queryable) => Promise<T>): Promise<T | null> {
  await connection();
  try {
    return await read(getPool() as unknown as Queryable);
  } catch (err) {
    console.error("[public] dataset read failed", err);
    return null;
  }
}

/** Deduplicated per request (React `cache`): the home page reads the counts in several places. */
export const getDatasetStats = cache(() => atRequestTime(loadDatasetStats));
export const getFeaturedClaim = cache(() => atRequestTime((q) => loadFeaturedClaim(q)));
/** The About pull-quote: a claim from another tradition than the home specimen's. */
export const getPullQuoteClaim = cache(() =>
  atRequestTime(async (q) => {
    const specimen = await loadFeaturedClaim(q);
    return loadFeaturedClaim(q, { fit: "pull-quote", excludeSlugs: specimen ? [specimen.traditionSlug] : [] });
  }),
);
export const getImageCredits = cache(() => atRequestTime(loadImageCredits));

/**
 * The stored interface parity report, read by WP0's `readInterfaceParity` (the one reader every
 * surface of the Equivalence Monitor uses), or null when no real run is recorded.
 */
export async function getInterfaceParityReport(): Promise<InterfaceParitySummary | null> {
  await connection();
  return readInterfaceParity();
}

/** "six" for 6; numerals above twelve. Used where a count opens a sentence or heading. */
export function countWord(n: number): string {
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  return words[n] ?? String(n);
}
