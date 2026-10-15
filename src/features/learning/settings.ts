/**
 * Study protocol settings that BOTH learning conditions read, as the learning context exposes
 * them (`ctx.settings`, src/server/learning/context.ts). Client-safe: pages pass the values down
 * as props, and no learning page reads `studies.config` itself.
 */
import type { StudyConfig } from "@/features/study/contracts";

export interface LearningPrompt {
  /** Stable id from the protocol. */
  id: string;
  text: string;
}

export interface GuidanceSettings {
  policy: StudyConfig["guidance"]["policy"];
  cueEnabled: boolean;
  /** Active seconds without a newly exposed concept before the stall cue shows (D6 pilot parameter). */
  stallSeconds: number;
  /** The on-demand hint, written by the researchers; null when the protocol has none. */
  hintText: string | null;
}

export interface LearningSettings {
  minimap: StudyConfig["minimap"];
  webglFailurePolicy: StudyConfig["webglFailurePolicy"];
  guidance: GuidanceSettings;
  /** Learning-task prompts, verbatim from the protocol (empty: none). */
  learningPrompts: LearningPrompt[];
  /** Knowledge figures (DR-018): the structure-diagram switch, identical in both conditions. */
  figures: FigureSettings;
}

export interface FigureSettings {
  /** Graph-derived structure diagrams on (default) or off, in both conditions together. */
  structureDiagrams: boolean;
}

export function learningSettingsOf(cfg: StudyConfig): LearningSettings {
  return {
    minimap: cfg.minimap,
    webglFailurePolicy: cfg.webglFailurePolicy,
    guidance: {
      policy: cfg.guidance.policy,
      cueEnabled: cfg.guidance.cueEnabled,
      stallSeconds: cfg.guidance.stallSeconds,
      hintText: cfg.guidance.hintText ?? null,
    },
    learningPrompts: cfg.learningPrompts.map((p) => ({ id: p.id, text: p.text })),
    figures: { structureDiagrams: cfg.figures.structureDiagrams },
  };
}

/** The D6 hybrid guidance (hint + stall cue) is on only for `policy = "hybrid"` with `cueEnabled`. */
export function hybridGuidanceOn(g: Pick<GuidanceSettings, "policy" | "cueEnabled">): boolean {
  return g.policy === "hybrid" && g.cueEnabled;
}
