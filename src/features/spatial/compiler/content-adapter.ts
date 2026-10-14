/**
 * content/ interchange files (FORMAT.md v1) -> CompilerGraph, without a database.
 *
 * The importer assigns database UUIDs; before import, ids are derived deterministically from
 * the content keys (RFC 9562 v8 name-based UUIDs, canonical.ts), so a manifest compiled from
 * files is reproducible and its ids are stable across runs. Pure: callers read the files.
 */
import { contentPackageFileSchema, type ContentPackageFile } from "@/features/knowledge/contracts";

import { canonicalHash, deterministicUuid } from "./canonical";
import { compareStrings } from "./prng";
import type { CompilerGraph, ExhibitAsset, GraphCategory, GraphConcept, GraphRelationship, GraphRelationshipType } from "./types";

export const conceptUuid = (key: string) => deterministicUuid("concept", key);
export const relationshipUuid = (r: { source: string; type: string; target: string }) => deterministicUuid("relationship", `${r.source}|${r.type}|${r.target}`);
export const traditionUuid = (slug: string) => deterministicUuid("tradition", slug);
export const ruleSetUuid = (name: string, version: number) => deterministicUuid("mapping-rule-set", `${name}@${version}`);

export interface ContentFiles {
  /** content/traditions/<slug>/tradition.json — each owns its concepts. */
  traditions: readonly unknown[];
  /** content/shared/*.json and content/comparisons.json — concepts without a tradition. */
  shared: readonly unknown[];
}

export interface AdaptedContent {
  graph: CompilerGraph;
  assets: ExhibitAsset[];
  /** sha256 over the canonical form of all input files (content version fingerprint). */
  contentSha256: string;
  problems: string[];
}

export function contentToGraph(
  files: ContentFiles,
  vocab: { categories: readonly GraphCategory[]; relationshipTypes: readonly GraphRelationshipType[] },
  versionLabel?: string,
): AdaptedContent {
  const problems: string[] = [];
  const parse = (raw: unknown, i: number): ContentPackageFile | null => {
    const r = contentPackageFileSchema.safeParse(raw);
    if (!r.success) {
      problems.push(`File #${i}: ${r.error.issues.slice(0, 3).map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
      return null;
    }
    return r.data;
  };
  const traditionFiles = files.traditions.map(parse).filter((f): f is ContentPackageFile => !!f);
  const sharedFiles = files.shared.map((f, i) => parse(f, i + files.traditions.length)).filter((f): f is ContentPackageFile => !!f);

  const traditions = traditionFiles
    .map((f) => ({ id: traditionUuid(f.slug), slug: f.slug, name: f.name }))
    .sort((a, b) => compareStrings(a.slug, b.slug));
  const concepts: GraphConcept[] = [];
  const relationships: GraphRelationship[] = [];
  const assets: ExhibitAsset[] = [];
  const all = [...traditionFiles.map((f) => ({ f, traditionId: traditionUuid(f.slug) })), ...sharedFiles.map((f) => ({ f, traditionId: null }))];
  for (const { f, traditionId } of all) {
    for (const c of f.concepts) {
      concepts.push({
        id: conceptUuid(c.key),
        key: c.key,
        type: c.type,
        category: c.category,
        traditionId,
        title: c.title,
        summary: c.summary,
        compares: c.compares ?? [],
        assetIds: [],
        verificationState: c.verification_state,
      });
    }
    for (const r of f.relationships) {
      relationships.push({
        id: relationshipUuid(r),
        source: r.source,
        target: r.target,
        type: r.type,
        explanation: r.explanation ?? null,
        ordinal: r.ordinal ?? null,
        strength: null,
        verificationState: r.verification_state,
      });
    }
    for (const m of f.media_candidates) {
      if (!m.depicts) continue;
      assets.push({
        id: deterministicUuid("asset", m.url),
        conceptId: conceptUuid(m.depicts),
        kind: "image",
        uri: m.url,
        title: m.title,
        licence: m.licence ?? null,
        // Source pixel size (FORMAT.md media_candidates), so image planes keep the true aspect.
        width: m.width ?? null,
        height: m.height ?? null,
      });
    }
  }
  const contentSha256 = canonicalHash({ traditions: files.traditions, shared: files.shared });
  return {
    graph: {
      versionLabel: versionLabel ?? `content-${contentSha256.slice(0, 16)}`,
      categories: [...vocab.categories],
      relationshipTypes: [...vocab.relationshipTypes],
      traditions,
      concepts: concepts.sort((a, b) => compareStrings(a.key, b.key)),
      relationships: relationships.sort((a, b) => compareStrings(a.id, b.id)),
    },
    assets: assets.sort((a, b) => compareStrings(a.id, b.id)),
    contentSha256,
    problems,
  };
}
