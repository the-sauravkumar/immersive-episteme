import type {
  ConceptType,
  KnowledgeCategoryCode,
  ProvenanceKind,
  SourceReliability,
  VerificationState,
} from "@/lib/validation/enums";

export type PackageKind = "tradition" | "shared" | "comparisons";

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
  verificationState: VerificationState;
}

interface GraphClaim {
  text: string;
  quote: string | null;
  sourceRefs: SourceRef[];
  rawSourceIds: string[];
  evidence: { ref: SourceRef; locator: string; quote: string; note: string | null }[];
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
  prosePolicy: string | null;
  isDemo: boolean;
}

export interface GraphRelationship {
  packageSlug: string;
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
  evidence?: { ref: SourceRef; locator: string; quote: string }[];
}

interface GraphMediaCandidate {
  url: string;
  title: string;
  licence: string | null;
  author: string | null;
  depicts: string | null;
  width: number | null;
  height: number | null;
  mime: string | null;
  dimensionsSource: string | null;
}

export interface GraphPackage {
  slug: string;
  kind: PackageKind;
  path: string;
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

export type Severity = "error" | "warning" | "info";

export interface IntegrityIssue {
  code: string;
  severity: Severity;
  message: string;
  packageSlug?: string;
  entity?: string;
  detail?: Record<string, unknown>;
}
