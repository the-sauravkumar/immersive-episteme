/**
 * In-memory knowledge graph model used by the validator and the snapshot builder.
 *
 * The loader (`loader.ts`) adapts content/FORMAT.md v1 files into this model; tests may also
 * build it directly (for example with verified states, which interchange files may never
 * carry). Source references are global: `<package slug>#<local id>`, so `S1` in two files
 * never collide and the comparisons file's `ajrakh:S7` resolves to `ajrakh#S7`.
 *
 * Pure TypeScript (no Node APIs), safe for any runtime.
 */
import type {
  ConceptType,
  KnowledgeCategoryCode,
  ProvenanceKind,
  SourceReliability,
  VerificationState,
} from "@/lib/validation/enums";

export type PackageKind = "tradition" | "shared" | "comparisons";

/** Global source reference: `<package slug>#<local id>`. */
export type SourceRef = string;

export function sourceRef(packageSlug: string, localId: string): SourceRef {
  return `${packageSlug}#${localId}`;
}

export interface GraphSource {
  ref: SourceRef;
  packageSlug: string;
  localId: string;
  kind: ProvenanceKind;
  title: string;
  author: string | null;
  publisher: string | null;
  year: number | null;
  url: string | null;
  accessed: string | null;
  reliability: SourceReliability | null;
  notes: string | null;
  /** Sources carry no review state in FORMAT v1; the loader records `under_review`. */
  verificationState: VerificationState;
}

export interface GraphClaim {
  text: string;
  quote: string | null;
  /** Resolved global refs (unresolvable ids are kept as `<pkg>#<id>` and flagged). */
  sourceRefs: SourceRef[];
  /** Ids as written in the file (for messages). */
  rawSourceIds: string[];
}

export interface GraphConcept {
  key: string;
  packageSlug: string;
  type: ConceptType;
  category: KnowledgeCategoryCode;
  title: string;
  summary: string;
  bodyMd: string | null;
  localTerms: string[];
  compares: string[];
  provenanceKind: ProvenanceKind;
  verificationState: VerificationState;
  claims: GraphClaim[];
  /** `"claims-only"` when summary/body_md are generated from claims (FORMAT.md). */
  prosePolicy: string | null;
  isDemo: boolean;
}

export interface GraphRelationship {
  packageSlug: string;
  /** Position in its file (for messages; not part of identity). */
  index: number;
  source: string;
  target: string;
  type: string;
  explanation: string | null;
  conditions: string | null;
  ordinal: number | null;
  strength: number | null;
  provenanceKind: ProvenanceKind;
  verificationState: VerificationState;
  sourceRefs: SourceRef[];
  rawSourceIds: string[];
}

export interface GraphMediaCandidate {
  url: string;
  title: string;
  licence: string | null;
  author: string | null;
  depicts: string | null;
  /** Source pixel size and type as recorded in the file (FORMAT.md), or null. */
  width: number | null;
  height: number | null;
  mime: string | null;
  dimensionsSource: string | null;
}

export interface GraphPackage {
  slug: string;
  kind: PackageKind;
  /** Repository-relative path of the file (forward slashes), or a synthetic label. */
  path: string;
  /** sha256 of the file's bytes when loaded from disk. */
  fileSha256: string | null;
  name: string;
  altNames: string[];
  summary: string | null;
  region: {
    place: string | null;
    district: string | null;
    state: string | null;
    country: string | null;
    lat: number | null;
    lon: number | null;
  } | null;
  gi: {
    registered: boolean;
    applicationNo: string | null;
    year: number | null;
    sourceRefs: SourceRef[];
  } | null;
  mediaCandidates: GraphMediaCandidate[];
  isDemo: boolean;
}

export interface KnowledgeGraphModel {
  packages: GraphPackage[];
  sources: GraphSource[];
  concepts: GraphConcept[];
  relationships: GraphRelationship[];
}

// ---------------------------------------------------------------------------------------
// Integrity report
// ---------------------------------------------------------------------------------------

export type Severity = "error" | "warning" | "info";

export interface IntegrityIssue {
  code: string;
  severity: Severity;
  message: string;
  /** Package slug / file the issue belongs to, when there is one. */
  packageSlug?: string;
  /** Concept key, relationship id (`source|TYPE|target`) or source ref. */
  entity?: string;
  /** Extra machine-readable detail (cycle members, similarity score, ...). */
  detail?: Record<string, unknown>;
}
