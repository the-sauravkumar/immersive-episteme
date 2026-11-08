import type { StationKind, TraditionKey } from "./stage-template";

interface PlannedClaim {
  readonly stage: string;
  readonly claim: number;
}

interface PlannedSource {
  readonly stage: string;
  readonly shortForm: string;
}

export interface PlannedStage {
  readonly key: string;
  readonly kind: StationKind;
  readonly sources: readonly PlannedSource[];
  readonly caption: readonly PlannedClaim[];
  readonly rationale: string;
}

export interface TraditionPlan {
  readonly tradition: TraditionKey;
  readonly traditionName: string;
  readonly unlinkedStages: readonly string[];
  readonly stages: readonly PlannedStage[];
}

export interface MergePlan {
  readonly status: string;
  readonly note: string;
  readonly traditions: readonly TraditionPlan[];
}
