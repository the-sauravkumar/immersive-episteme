/**
 * UI state of one museum visit (React overlays and the scene read and write it). The visitor's
 * pose lives outside React (`visitor`, mutated every frame) so movement never re-renders the UI.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import { SCREEN_TEXT } from "@/features/learning/strings";

import type { PanelTab } from "./panel-content";

export type MuseumPhase = "loading" | "onboarding" | "exploring" | "paused" | "context-lost" | "error";

export interface CueNote {
  cueId: string;
  kind: "explain-and-guide" | "show-path" | "name-prerequisite" | "announce";
  /** Exhibit the note's action walks to (prerequisite, next station, effect), if any. */
  targetElementId: string | null;
  relationshipId: string | null;
  /** Where the note was triggered, to dismiss it when the visitor walks away. */
  anchor: { x: number; z: number } | null;
  radius: number | null;
}

export interface ActiveRoute {
  kind: "sequence" | "causal" | "comparison" | "walk";
  id: string;
  points: { x: number; z: number }[];
}

export interface MuseumUiState {
  phase: MuseumPhase;
  loading: { step: string; loadedBytes: number; totalBytes: number; stepIndex: number; stepCount: number };
  errorMessage: string | null;
  roomId: string | null;
  hoverExhibitId: string | null;
  /** Exhibit whose information panel is open. */
  panelExhibitId: string | null;
  panelTab: PanelTab;
  /** The concept whose claims the panel shows (exposure attribution). */
  panelConceptId: string | null;
  note: CueNote | null;
  route: ActiveRoute | null;
  mapOpen: boolean;
  helpOpen: boolean;
  /** Free mouse look is on (cursor captured, crosshair shown). */
  freeLook: boolean;
  /** Bumped when keyboard focus in the exhibit list previews an exhibit (highlight). */
  previewExhibitId: string | null;
  /** The visitor's facing on the plan, in 45 degree steps clockwise from north (the Plan's arrow); null before the scene is ready. */
  headingDeg: number | null;
}

export type MuseumStore = StoreApi<MuseumUiState>;

export function createMuseumStore(initial: Partial<MuseumUiState> = {}): MuseumStore {
  return createStore<MuseumUiState>(() => ({
    phase: "loading",
    loading: { step: SCREEN_TEXT.loadingTitle, loadedBytes: 0, totalBytes: 0, stepIndex: 0, stepCount: 4 },
    errorMessage: null,
    roomId: null,
    hoverExhibitId: null,
    panelExhibitId: null,
    panelTab: "overview",
    panelConceptId: null,
    note: null,
    route: null,
    mapOpen: false,
    helpOpen: false,
    freeLook: false,
    previewExhibitId: null,
    headingDeg: null,
    ...initial,
  }));
}
