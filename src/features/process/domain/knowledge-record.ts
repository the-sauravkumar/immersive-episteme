interface EvidenceRecord {
  readonly source_id: string;
  readonly locator: string;
  readonly quote: string;
}

export interface ClaimRecord {
  readonly text: string;
  readonly evidence: readonly EvidenceRecord[];
}

export interface ConceptRecord {
  readonly key: string;
  readonly type: string;
  readonly title: string;
  readonly local_terms?: readonly string[];
  readonly claims?: readonly ClaimRecord[];
}

interface RelationshipRecord {
  readonly source: string;
  readonly target: string;
  readonly type: string;
  readonly ordinal?: number | null;
  readonly verification_state?: string;
}

interface SourceRecord {
  readonly id: string;
  readonly title: string;
}

export interface TraditionRecord {
  readonly slug: string;
  readonly sources: readonly SourceRecord[];
  readonly concepts: readonly ConceptRecord[];
  readonly relationships: readonly RelationshipRecord[];
}

export const PROCESS_STAGE_TYPE = "process_stage";
export const UNBACKED_LINK_STATE = "needs_evidence";

export function conceptByKey(record: TraditionRecord, key: string): ConceptRecord | null {
  return record.concepts.find((concept) => concept.key === key) ?? null;
}

export function processStages(record: TraditionRecord): readonly ConceptRecord[] {
  return record.concepts.filter((concept) => concept.type === PROCESS_STAGE_TYPE);
}
