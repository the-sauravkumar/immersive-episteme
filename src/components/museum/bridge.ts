/**
 * The contract between the 3D scene (inside the R3F canvas) and the HTML overlays. The scene
 * reports what happens (room changes, picks, cue triggers); the overlays drive the visitor
 * through the controller (walk to an exhibit, follow a route). Both sides hold the same mutable
 * bridge object, so neither re-renders the other.
 */
import type { SceneCue } from "@/features/immersive/scene-model";

/**
 * How the visitor moved or looked (look-method telemetry, DR-021):
 *  - keys: W/A/S/D or the arrow keys walked;
 *  - drag: a left-button (or touch) drag turned the view;
 *  - rmb: the right button held turned the view (mouse look);
 *  - freelook: free mouse look (L, or the bar's Mouse look) turned the view;
 *  - click: a click (or tap) on the floor or an exhibit in the scene;
 *  - list: a rail or list row walked the visitor (reported by the overlays through
 *    `controller.noteInputMethod("list")`, since only they know a walk came from a list).
 */
export type InputMethod = "keys" | "drag" | "rmb" | "freelook" | "click" | "list";

export interface SceneEvents {
  progress(step: string, stepIndex: number, loadedBytes: number, totalBytes: number): void;
  ready(info: RenderInfo): void;
  failed(message: string): void;
  roomChanged(roomId: string, previousRoomId: string | null, viaPortalId: string | null): void;
  hover(exhibitId: string | null): void;
  pickExhibit(exhibitId: string): void;
  /** WASD / arrows / drag-walk started: the visitor is navigating again. */
  manualMove(): void;
  cueTriggered(cue: SceneCue): void;
  /** The visitor walked away from a cue's anchor. */
  cueLeft(cueId: string): void;
  contextLost(): void;
  contextRestored(): void;
  /** Free mouse look switched on or off (by the user, Esc, a panel or a pause). */
  freeLookChanged(on: boolean): void;
  /**
   * A switch of input method: emitted for the first move of a navigation interval and then each
   * time the visitor changes to another method (consecutive uses of one method are one report). An
   * interval starts when the scene is ready and again on every `controller.startNavigationInterval()`
   * (the overlays call it when a concept closes). Optional, so a host that does not log look
   * methods needs no handler.
   */
  inputMethodUsed?(method: InputMethod): void;
}

export interface SceneController {
  /** Walk to an exhibit's approach point and face it; `onArrive` runs on arrival. */
  walkToExhibit(exhibitId: string, onArrive?: () => void): boolean;
  /**
   * Walk through a doorway into the room on its far side, ending about 2 m inside and facing into
   * the room. The scene uses it for clicks on a door sign, a doorway frame or a directory row; a
   * host list of doorways can call it too (then report `noteInputMethod("list")`).
   */
  walkThroughDoorway(portalId: string, toRoomId: string): boolean;
  /** Walk to a room (its centre, or the nearest walkable point). */
  walkToRoom(roomId: string): boolean;
  /** Walk along explicit waypoints (manifest routes), then optionally face an exhibit. */
  walkWaypoints(points: readonly { x: number; z: number }[], faceExhibitId?: string, onArrive?: () => void): boolean;
  setHighlight(exhibitId: string | null, strong: boolean): void;
  setRoute(points: readonly { x: number; z: number }[] | null): void;
  /** Fraction of the canvas width covered by the information panel (the exhibit is framed beside it). */
  setPanelInset(fraction: number): void;
  /**
   * Fraction of the canvas width covered by the PlaceRail at the left (0 when hidden). While a
   * panel is docked, the exhibit is framed at the centre of the free area between the rail and the
   * panel; with no panel open the view is never shifted, so showing the rail moves nothing.
   */
  setRailInset(fraction: number): void;
  /** Fraction of the canvas height covered by the bottom sheet (narrow screens). */
  setPanelInsetBottom(fraction: number): void;
  stop(): void;
  setPaused(paused: boolean): void;
  /** Free mouse look: the cursor is captured and mouse or touchpad movement turns the view. */
  setFreeLook(on: boolean): void;
  visitorPosition(): { x: number; z: number; yaw: number };
  /**
   * Marks these exhibits as visited (the full set, replacing the previous one): each plate gains the
   * quiet "Visited" mark at its foot, the in-world form of the 2D condition's visited marking.
   */
  setVisited(exhibitIds: string[]): void;
  /** Starts a new navigation interval: every input method counts as unused again. */
  startNavigationInterval(): void;
  /** Reports an input method the overlays saw (a rail or Plan row: "list"); reported on a switch like the scene's own. */
  noteInputMethod(method: InputMethod): void;
}

export interface RenderInfo {
  backend: "webgl2" | "webgpu" | "webgpu-webgl2-fallback";
  tier: "high" | "low";
  gpuRenderer: string | null;
  antialiasing: string;
}

export interface MuseumBridge {
  events: SceneEvents;
  controller: SceneController | null;
}
