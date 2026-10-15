/**
 * The secondary lines of an exhibit's wall plate, shared by both conditions: the 3D plate letters
 * them (three/world.ts) and the 2D place rail can show the same words, so the step a learner reads
 * is identical in kind and wording in both conditions.
 *
 * Only sequence stations (a stage on an ordered manifest path: process stages, two-stage history
 * sequences) carry lines: "Step n of N" above the title, and "Start" or "Last step" under it on the
 * first and last stage. Every other exhibit is title only. The words are interface copy, not craft
 * facts; n and N come from the compiled manifest (the stage's place in its PRECEDES chain).
 */
import type { SceneExhibit, SceneModel } from "./scene-model";

export interface PlaqueText {
  /** "Step n of N" on a sequence station; null otherwise. */
  kicker: string | null;
  /** "Start" on the first stage, "Last step" on the last; null otherwise. */
  footer: string | null;
}

export const PLAQUE_WORDS = {
  step: (n: number, of: number) => `Step ${n} of ${of}`,
  start: "Start",
  last: "Last step",
  visited: "Visited",
} as const;

export function plaqueText(exhibit: Pick<SceneExhibit, "sequence">, model?: Pick<SceneModel, "paths">): PlaqueText {
  const s = exhibit.sequence;
  if (!s || s.count < 2 || s.index < 0 || s.index >= s.count) return { kicker: null, footer: null };
  // A sequence station belongs to an ordered path; when the model is given, an unordered path
  // (a comparison route) never numbers its stops.
  if (model && model.paths.some((p) => p.id === s.pathId && !p.ordered)) return { kicker: null, footer: null };
  const footer = s.index === 0 ? PLAQUE_WORDS.start : s.index === s.count - 1 ? PLAQUE_WORDS.last : null;
  return { kicker: PLAQUE_WORDS.step(s.index + 1, s.count), footer };
}
