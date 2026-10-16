/**
 * Adapter: content/FORMAT.md v1 files -> `KnowledgeGraphModel`.
 *
 * Each file is checked with the canonical `contentPackageFileSchema` (contracts.ts); a file
 * that fails it contributes KG100 issues and no entities. Source ids are resolved to global
 * refs. The comparisons file re-declares tradition sources as `<slug>:<id>`; when the origin
 * file declares that id, the reference resolves to the origin's source (one source, cited from
 * two files) and the copy is checked against it (KG410).
 *
 * Pure: callers supply file contents (see `load-content-dir.ts` for the filesystem reader).
 */
import { contentPackageFileSchema, type ContentPackageFile } from "@/features/knowledge/contracts";

import { RULES } from "./rules";
import {
  sourceRef,
  type GraphConcept,
  type GraphPackage,
  type GraphRelationship,
  type GraphSource,
  type IntegrityIssue,
  type KnowledgeGraphModel,
  type PackageKind,
} from "./types";

export interface ContentFileInput {
  /** Repository-relative path, forward slashes (e.g. `content/traditions/bagru/tradition.json`). */
  path: string;
  /** Raw file text; or pass `data` directly. */
  text?: string;
  data?: unknown;
  /** sha256 of the file bytes, when known. */
  sha256?: string | null;
}

export interface LoadResult {
  model: KnowledgeGraphModel;
  issues: IntegrityIssue[];
  /** Files that parsed and were loaded. */
  loadedPaths: string[];
}

const MAX_SCHEMA_ISSUES_PER_FILE = 50;

function packageKind(slug: string, path: string): PackageKind {
  if (slug === "comparisons") return "comparisons";
  if (slug === "shared" || /(^|\/)shared\//.test(path)) return "shared";
  return "tradition";
}

interface ParsedFile {
  input: ContentFileInput;
  file: ContentPackageFile;
  raw: Record<string, unknown>;
}

export function loadContentFiles(inputs: readonly ContentFileInput[]): LoadResult {
  const issues: IntegrityIssue[] = [];
  const parsed: ParsedFile[] = [];

  // Stable processing order regardless of how the caller listed the files.
  const ordered = [...inputs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  for (const input of ordered) {
    let data: unknown = input.data;
    if (input.text !== undefined) {
      try {
        data = JSON.parse(input.text.replace(/^﻿/, ""));
      } catch (e) {
        issues.push({
          code: RULES.FILE_UNREADABLE.code,
          severity: RULES.FILE_UNREADABLE.severity,
          message: `${input.path}: ${(e as Error).message}`,
          entity: input.path,
        });
        continue;
      }
    }
    const result = contentPackageFileSchema.safeParse(data);
    if (!result.success) {
      for (const issue of result.error.issues.slice(0, MAX_SCHEMA_ISSUES_PER_FILE)) {
        issues.push({
          code: RULES.FILE_SCHEMA.code,
          severity: RULES.FILE_SCHEMA.severity,
          message: `${input.path} at ${issue.path.join(".") || "(root)"}: ${issue.message}`,
          entity: input.path,
          detail: { path: issue.path.map(String) },
        });
      }
      continue;
    }
    parsed.push({ input, file: result.data, raw: data as Record<string, unknown> });
  }

  // Duplicate slugs: keep the first file (by path) and report the rest.
  const bySlug = new Map<string, ParsedFile>();
  for (const p of parsed) {
    const prev = bySlug.get(p.file.slug);
    if (prev) {
      issues.push({
        code: RULES.DUPLICATE_PACKAGE.code,
        severity: RULES.DUPLICATE_PACKAGE.severity,
        message: `Slug "${p.file.slug}" is declared by both ${prev.input.path} and ${p.input.path}; the second is ignored`,
        packageSlug: p.file.slug,
      });
      continue;
    }
    bySlug.set(p.file.slug, p);
  }
  const files = [...bySlug.values()];

  // Local source declarations per package.
  const declared = new Map<string, Map<string, ContentPackageFile["sources"][number]>>();
  for (const { file } of files) declared.set(file.slug, new Map(file.sources.map((s) => [s.id, s])));

  /** Resolve a file-local id to a global ref (qualified ids resolve to their origin file). */
  const resolve = (fileSlug: string, id: string): string => {
    const colon = id.indexOf(":");
    if (colon > 0) {
      const origin = id.slice(0, colon);
      const local = id.slice(colon + 1);
      if (declared.get(origin)?.has(local)) return sourceRef(origin, local);
    }
    return sourceRef(fileSlug, id);
  };

  const model: KnowledgeGraphModel = { packages: [], sources: [], concepts: [], relationships: [] };

  for (const { input, file, raw } of files) {
    const kind = packageKind(file.slug, input.path);
    const pkg: GraphPackage = {
      slug: file.slug,
      kind,
      path: input.path,
      fileSha256: input.sha256 ?? null,
      name: file.name,
      altNames: file.alt_names,
      summary: file.summary ?? null,
      region: file.region
        ? {
            place: file.region.place ?? null,
            district: file.region.district ?? null,
            state: file.region.state ?? null,
            country: file.region.country ?? null,
            lat: file.region.lat ?? null,
            lon: file.region.lon ?? null,
          }
        : null,
      gi: file.gi
        ? {
            registered: file.gi.registered,
            applicationNo: file.gi.application_no ?? null,
            year: file.gi.year ?? null,
            sourceRefs: file.gi.source_ids.map((id) => resolve(file.slug, id)),
          }
        : null,
      mediaCandidates: file.media_candidates.map((m) => ({
        url: m.url,
        title: m.title,
        licence: m.licence ?? null,
        author: m.author ?? null,
        depicts: m.depicts ?? null,
        width: m.width ?? null,
        height: m.height ?? null,
        mime: m.mime ?? null,
        dimensionsSource: m.dimensions_source ?? null,
      })),
      isDemo: false,
    };
    model.packages.push(pkg);

    for (const s of file.sources) {
      const ref = resolve(file.slug, s.id);
      if (ref !== sourceRef(file.slug, s.id)) {
        // Re-declared copy of another file's source: check it, keep the origin.
        const origin = declared.get(ref.slice(0, ref.indexOf("#")))!.get(ref.slice(ref.indexOf("#") + 1))!;
        const diffs: string[] = [];
        if ((origin.url ?? null) !== (s.url ?? null)) diffs.push("url");
        if (origin.title.trim() !== s.title.trim()) diffs.push("title");
        if (origin.kind !== s.kind) diffs.push("kind");
        if (diffs.length > 0) {
          issues.push({
            code: RULES.QUALIFIED_SOURCE_MISMATCH.code,
            severity: RULES.QUALIFIED_SOURCE_MISMATCH.severity,
            message: `${file.slug}: source ${s.id} differs from ${ref} in ${diffs.join(", ")}`,
            packageSlug: file.slug,
            entity: ref,
            detail: { fields: diffs },
          });
        }
        continue;
      }
      if (s.id.includes(":")) {
        issues.push({
          code: RULES.QUALIFIED_SOURCE_MISMATCH.code,
          severity: RULES.QUALIFIED_SOURCE_MISMATCH.severity,
          message: `${file.slug}: qualified source ${s.id} has no matching source in its origin file; kept as a local source`,
          packageSlug: file.slug,
          entity: sourceRef(file.slug, s.id),
        });
      }
      const src: GraphSource = {
        ref: sourceRef(file.slug, s.id),
        packageSlug: file.slug,
        localId: s.id,
        kind: s.kind,
        title: s.title,
        author: s.author ?? null,
        publisher: s.publisher ?? null,
        year: s.year ?? null,
        url: s.url ?? null,
        accessed: s.accessed ?? null,
        reliability: s.reliability ?? null,
        notes: s.notes ?? null,
        verificationState: "under_review",
      };
      model.sources.push(src);
    }

    const rawConcepts = Array.isArray(raw.concepts) ? (raw.concepts as Record<string, unknown>[]) : [];
    file.concepts.forEach((c, i) => {
      const policy = rawConcepts[i]?.prose_policy;
      const concept: GraphConcept = {
        key: c.key,
        packageSlug: file.slug,
        type: c.type,
        category: c.category,
        title: c.title,
        summary: c.summary,
        bodyMd: c.body_md ?? null,
        localTerms: c.local_terms,
        compares: c.compares ?? [],
        provenanceKind: c.provenance_kind,
        verificationState: c.verification_state,
        claims: c.claims.map((cl) => ({
          text: cl.text,
          quote: cl.quote ?? null,
          rawSourceIds: cl.source_ids,
          sourceRefs: cl.source_ids.map((id) => resolve(file.slug, id)),
          evidence: cl.evidence.map((e) => ({ ref: resolve(file.slug, e.source_id), locator: e.locator, quote: e.quote, note: e.note ?? null })),
        })),
        prosePolicy: typeof policy === "string" ? policy : null,
        isDemo: false,
      };
      model.concepts.push(concept);
    });

    file.relationships.forEach((r, i) => {
      const rel: GraphRelationship = {
        packageSlug: file.slug,
        index: i,
        source: r.source,
        target: r.target,
        type: r.type,
        explanation: r.explanation ?? null,
        conditions: r.conditions ?? null,
        ordinal: r.ordinal ?? null,
        strength: null,
        provenanceKind: r.provenance_kind,
        verificationState: r.verification_state,
        rawSourceIds: r.source_ids,
        sourceRefs: r.source_ids.map((id) => resolve(file.slug, id)),
        evidence: r.evidence.map((e) => ({ ref: resolve(file.slug, e.source_id), locator: e.locator, quote: e.quote })),
      };
      model.relationships.push(rel);
    });
  }

  return { model, issues, loadedPaths: files.map((f) => f.input.path) };
}
