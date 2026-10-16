/**
 * Navigation metrics v1 (concept note CN-20; spec §10.3). Pure and deterministic: the same
 * ordered raw events always give the same values, so every stored `derived_metrics` row can be
 * recomputed from an export (see ../exports/validate.ts).
 *
 * OBSERVATIONAL ONLY. These describe how a participant moved through the content. They are not
 * learning outcomes and imply nothing causal: "do not equate frequent interaction, longer dwell
 * time, or more visited exhibits with better learning without supporting evidence" (spec §10.3).
 *
 * Unit of analysis: the VISIT SEQUENCE. A visit is a content-exposure interval
 * (`exposure_started`, emitted by the shared time accountant in both conditions: 2D
 * concept page shown, 3D information panel open; one rule, DR-050), so both conditions are measured on
 * the same definition. Consecutive exposures of the same concept (e.g. switching layers inside
 * one panel or scrolling within one page) collapse into one visit.
 *
 * Definitions (all over one session, technical events ignored):
 *  nav.path_length              number of visits (after collapsing consecutive repeats)
 *  nav.breadth                  distinct concepts visited; details: distinct traditions, categories
 *  nav.depth                    mean number of distinct content layers (overview, artisan, process,
 *                               science, comparison) opened per visited concept; details: max,
 *                               per-layer counts
 *  nav.revisit_rate             (visits - distinct concepts) / visits; null with no visits
 *  nav.cross_domain_transitions consecutive visits whose tradition differs (traditionless shared
 *                               and comparison concepts count as the domain "shared");
 *                               details: cross-category transitions, share of transitions
 *  nav.science_layer_engagement science-layer exposure ms / all exposure ms (completed intervals);
 *                               null when no exposure; details: science intervals, concepts,
 *                               knowledge_layer_selected(science) count
 *  nav.path_entropy             conditional entropy H(next | current) in bits of the first-order
 *                               concept transition counts (0 = fully predictable route); null with
 *                               fewer than 2 transitions; details: visit-distribution entropy H(V)
 *                               and the number of distinct transitions. PROVISIONAL definition
 *                               (spec: "path entropy where an appropriate definition is established").
 *  nav.sequence_patterns        number of distinct analytic-concept bigrams; details: the 10 most
 *                               frequent bigrams and trigrams of the condition-neutral analytic
 *                               concept sequence (event_types.analytic_concept), so 2D and 3D raw
 *                               types that mean the same thing compare
 *  nav.relationships_followed   relationship_followed events; details: distinct relationships
 */
import { EVENT_TYPE_REGISTRY } from "@/features/telemetry/contracts";

export const NAVIGATION_METRICS_VERSION = "1";

export const NAVIGATION_METRIC_DEFINITIONS = [
  { name: "nav.path_length", unit: "visits", definition: "Number of concept visits (exposure intervals), consecutive repeats of the same concept collapsed." },
  { name: "nav.breadth", unit: "concepts", definition: "Distinct concepts visited. details: distinct traditions and categories." },
  { name: "nav.depth", unit: "layers/concept", definition: "Mean distinct content layers (overview, artisan, process, science, comparison) opened per visited concept." },
  { name: "nav.revisit_rate", unit: "ratio", definition: "(visits - distinct concepts) / visits; null without visits." },
  { name: "nav.cross_domain_transitions", unit: "transitions", definition: "Consecutive visits whose tradition differs (shared/comparison concepts = 'shared'). details: cross-category transitions." },
  { name: "nav.science_layer_engagement", unit: "ratio", definition: "Science-layer exposure ms / total exposure ms over completed intervals; null without exposure." },
  { name: "nav.path_entropy", unit: "bits", definition: "Conditional entropy H(next|current) of first-order concept transitions; null with < 2 transitions. Provisional." },
  { name: "nav.sequence_patterns", unit: "bigrams", definition: "Distinct bigrams of the analytic-concept sequence; details: top bigrams and trigrams." },
  { name: "nav.relationships_followed", unit: "count", definition: "relationship_followed events; details: distinct relationships." },
] as const;

export type NavigationMetricName = (typeof NAVIGATION_METRIC_DEFINITIONS)[number]["name"];

export interface NavEvent {
  eventId?: string;
  seq: number;
  type: string;
  conceptId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ConceptFacts {
  traditionId: string | null;
  category: string;
}

export interface MetricValue {
  metricName: string;
  metricVersion: string;
  value: number | null;
  details: Record<string, unknown>;
}

const ANALYTIC: ReadonlyMap<string, { concept: string; technical: boolean }> = new Map(
  EVENT_TYPE_REGISTRY.map((e) => [e.code, { concept: e.analyticConcept, technical: "isTechnical" in e && e.isTechnical === true }]),
);

export interface Visit {
  conceptId: string;
  seq: number;
}

/** The visit sequence of a session (see module doc). */
export function visitSequence(events: readonly NavEvent[]): Visit[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const out: Visit[] = [];
  for (const e of sorted) {
    if (e.type !== "exposure_started" || !e.conceptId) continue;
    if (out.length && out[out.length - 1]!.conceptId === e.conceptId) continue;
    out.push({ conceptId: e.conceptId, seq: e.seq });
  }
  return out;
}

const log2 = (x: number) => Math.log(x) / Math.LN2;

function entropy(counts: Iterable<number>): number {
  const arr = [...counts];
  const n = arr.reduce((a, b) => a + b, 0);
  if (n === 0) return 0;
  let h = 0;
  for (const c of arr) if (c > 0) h -= (c / n) * log2(c / n);
  return h;
}

const round = (x: number, dp = 6) => Math.round(x * 10 ** dp) / 10 ** dp;

function topN(m: Map<string, number>, n: number): { pattern: string; count: number }[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, n)
    .map(([pattern, count]) => ({ pattern, count }));
}

export function computeNavigationMetrics(events: readonly NavEvent[], concepts: ReadonlyMap<string, ConceptFacts>): MetricValue[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const visits = visitSequence(sorted);
  const distinct = new Set(visits.map((v) => v.conceptId));
  const domainOf = (id: string) => concepts.get(id)?.traditionId ?? "shared";
  const categoryOf = (id: string) => concepts.get(id)?.category ?? "unknown";

  // depth: distinct layers per concept, from all exposure starts (not only visit heads)
  const layers = new Map<string, Set<string>>();
  const layerTotals: Record<string, number> = {};
  let exposureMs = 0;
  let scienceMs = 0;
  let scienceIntervals = 0;
  const scienceConcepts = new Set<string>();
  let scienceSelected = 0;
  let followed = 0;
  const followedIds = new Set<string>();
  for (const e of sorted) {
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    if (e.type === "exposure_started" && e.conceptId) {
      const layer = String(m.layer ?? "overview");
      (layers.get(e.conceptId) ?? layers.set(e.conceptId, new Set()).get(e.conceptId)!).add(layer);
    } else if (e.type === "exposure_ended" && e.conceptId) {
      const ms = Number(m.activeMs);
      if (Number.isFinite(ms)) {
        exposureMs += ms;
        const layer = String(m.layer ?? "overview");
        layerTotals[layer] = (layerTotals[layer] ?? 0) + 1;
        if (layer === "science") {
          scienceMs += ms;
          scienceIntervals++;
          scienceConcepts.add(e.conceptId);
        }
      }
    } else if (e.type === "knowledge_layer_selected" && m.layer === "science") scienceSelected++;
    else if (e.type === "relationship_followed") {
      followed++;
      if (typeof m.relationshipId === "string") followedIds.add(m.relationshipId);
    }
  }
  const layerCounts = [...layers.values()].map((s) => s.size);

  // transitions
  let crossDomain = 0;
  let crossCategory = 0;
  const transitions = new Map<string, number>();
  const fromCounts = new Map<string, Map<string, number>>();
  for (let i = 1; i < visits.length; i++) {
    const a = visits[i - 1]!.conceptId;
    const b = visits[i]!.conceptId;
    if (domainOf(a) !== domainOf(b)) crossDomain++;
    if (categoryOf(a) !== categoryOf(b)) crossCategory++;
    transitions.set(`${a}>${b}`, (transitions.get(`${a}>${b}`) ?? 0) + 1);
    const row = fromCounts.get(a) ?? fromCounts.set(a, new Map()).get(a)!;
    row.set(b, (row.get(b) ?? 0) + 1);
  }
  const nTransitions = Math.max(visits.length - 1, 0);
  let condEntropy: number | null = null;
  if (nTransitions >= 2) {
    let h = 0;
    for (const row of fromCounts.values()) {
      const rowN = [...row.values()].reduce((x, y) => x + y, 0);
      h += (rowN / nTransitions) * entropy(row.values());
    }
    condEntropy = round(h);
  }
  const visitCounts = new Map<string, number>();
  for (const v of visits) visitCounts.set(v.conceptId, (visitCounts.get(v.conceptId) ?? 0) + 1);

  // analytic-concept sequence patterns (behavioural events only)
  const seq = sorted.filter((e) => ANALYTIC.has(e.type) && !ANALYTIC.get(e.type)!.technical).map((e) => ANALYTIC.get(e.type)!.concept);
  const bigrams = new Map<string, number>();
  const trigrams = new Map<string, number>();
  for (let i = 1; i < seq.length; i++) {
    const k = `${seq[i - 1]} > ${seq[i]}`;
    bigrams.set(k, (bigrams.get(k) ?? 0) + 1);
    if (i >= 2) {
      const t = `${seq[i - 2]} > ${k}`;
      trigrams.set(t, (trigrams.get(t) ?? 0) + 1);
    }
  }

  const v = (metricName: NavigationMetricName, value: number | null, details: Record<string, unknown> = {}): MetricValue => ({
    metricName,
    metricVersion: NAVIGATION_METRICS_VERSION,
    value,
    details,
  });
  return [
    v("nav.path_length", visits.length, { transitions: nTransitions }),
    v("nav.breadth", distinct.size, {
      traditions: new Set([...distinct].map(domainOf)).size,
      categories: new Set([...distinct].map(categoryOf)).size,
    }),
    v("nav.depth", layerCounts.length ? round(layerCounts.reduce((a, b) => a + b, 0) / layerCounts.length) : null, {
      maxLayers: layerCounts.length ? Math.max(...layerCounts) : 0,
      completedIntervalsByLayer: layerTotals,
    }),
    v("nav.revisit_rate", visits.length ? round((visits.length - distinct.size) / visits.length) : null, { revisits: visits.length - distinct.size }),
    v("nav.cross_domain_transitions", crossDomain, { crossCategory, transitions: nTransitions, share: nTransitions ? round(crossDomain / nTransitions) : null }),
    v("nav.science_layer_engagement", exposureMs > 0 ? round(scienceMs / exposureMs) : null, {
      scienceMs,
      exposureMs,
      scienceIntervals,
      scienceConcepts: scienceConcepts.size,
      scienceLayerSelected: scienceSelected,
    }),
    v("nav.path_entropy", condEntropy, { visitEntropy: round(entropy(visitCounts.values())), distinctTransitions: transitions.size }),
    v("nav.sequence_patterns", bigrams.size, { topBigrams: topN(bigrams, 10), topTrigrams: topN(trigrams, 10), events: seq.length }),
    v("nav.relationships_followed", followed, { distinct: followedIds.size }),
  ];
}
