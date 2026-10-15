/**
 * Diff between two knowledge bundles (snapshot payloads). Pure.
 *
 * Entities are matched by their stable identity: traditions by slug, concepts by key, sources
 * and relationships by id (database ids, stable across snapshots built from the database),
 * claims by (concept key, position). A changed entity lists the fields that differ.
 */
import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import { canonicalJson } from "@/features/knowledge/graph/canonical-json";

export interface EntityChange {
  key: string;
  label: string;
  fields: string[];
}

export interface KindDiff {
  added: { key: string; label: string }[];
  removed: { key: string; label: string }[];
  changed: EntityChange[];
  unchanged: number;
}

export interface BundleDiff {
  traditions: KindDiff;
  concepts: KindDiff;
  claims: KindDiff;
  relationships: KindDiff;
  sources: KindDiff;
}

function diffBy<T>(a: readonly T[], b: readonly T[], key: (x: T) => string, label: (x: T) => string, ignore: readonly string[] = []): KindDiff {
  const am = new Map(a.map((x) => [key(x), x]));
  const bm = new Map(b.map((x) => [key(x), x]));
  const out: KindDiff = { added: [], removed: [], changed: [], unchanged: 0 };
  for (const [k, x] of bm) if (!am.has(k)) out.added.push({ key: k, label: label(x) });
  for (const [k, x] of am) if (!bm.has(k)) out.removed.push({ key: k, label: label(x) });
  for (const [k, x] of am) {
    const y = bm.get(k);
    if (!y) continue;
    const xo = x as Record<string, unknown>;
    const yo = y as Record<string, unknown>;
    const fields = [...new Set([...Object.keys(xo), ...Object.keys(yo)])]
      .filter((f) => !ignore.includes(f))
      .filter((f) => canonicalJson(xo[f] ?? null) !== canonicalJson(yo[f] ?? null))
      .sort();
    if (fields.length) out.changed.push({ key: k, label: label(y), fields });
    else out.unchanged++;
  }
  const byKey = (p: { key: string }, q: { key: string }) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0);
  out.added.sort(byKey);
  out.removed.sort(byKey);
  out.changed.sort(byKey);
  return out;
}

export function diffBundles(a: KnowledgeBundle, b: KnowledgeBundle): BundleDiff {
  const claimsOf = (x: KnowledgeBundle) =>
    x.concepts.flatMap((c) => c.claims.map((cl, i) => ({ ...cl, id: undefined, conceptKey: c.key, position: i })));
  const keyOf = (x: KnowledgeBundle) => new Map(x.concepts.map((c) => [c.key, c.title]));
  const titlesB = keyOf(b);
  const titlesA = keyOf(a);
  const relLabel = (r: KnowledgeBundle["relationships"][number]) => `${r.source} ${r.type} ${r.target}`;
  return {
    traditions: diffBy(a.traditions, b.traditions, (t) => t.slug, (t) => t.name, ["id"]),
    // `claims` are diffed separately; ids of claims change whenever claims are re-saved.
    concepts: diffBy(a.concepts, b.concepts, (c) => c.key, (c) => c.title, ["id", "claims"]),
    claims: diffBy(claimsOf(a), claimsOf(b), (c) => `${c.conceptKey}#${c.position + 1}`, (c) => `${titlesB.get(c.conceptKey) ?? titlesA.get(c.conceptKey) ?? c.conceptKey}, claim ${c.position + 1}`, ["id"]),
    relationships: diffBy(a.relationships, b.relationships, (r) => r.id, relLabel),
    sources: diffBy(a.sources, b.sources, (s) => s.id, (s) => s.title),
  };
}
