"use client";

/**
 * The immersive condition's client app: capability check and tier lock, the dynamically loaded
 * canvas, the HTML overlays, and the telemetry that maps what happens in the museum onto the
 * shared §13.1 vocabulary (same event types and the same exposure/navigation hooks as 2D).
 *
 *  - room_entered / room_exited (dwellMs), item_revisited, tradition_crossed: room changes
 *  - exhibit_selected, concept_encountered (opened): selecting an exhibit / showing a concept
 *  - information_layer_opened / _closed (layerId = overview | artisan | process | science |
 *    comparison), knowledge_layer_selected (artisan | process | science)
 *  - relationship_followed: walking to a connected exhibit from the panel, a cue or a sequence
 *  - guidance_cue_used (shown | followed | dismissed): the manifest's cues
 *  - exposure: useContentExposure while the panel is open (concept shown, its 2D layer);
 *    navigation: useNavigationPhase("walk" | "map") while no panel is open; pauses: modal screens
 *  - render_quality_changed once per session (tier covariate), webgl_context_lost
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";

import { StallCue } from "@/components/learning/guidance";
import { LearningPhaseContent } from "@/components/learning/learning-phase";
import { LearningTaskPrompts } from "@/components/learning/learning-task-prompts";
import { UnverifiedContentNotice } from "@/components/learning/unverified-content-notice";
import { exposureFor, type PanelTab } from "@/features/immersive/panel-content";
import type { SceneDoorSign } from "@/features/immersive/placement";
import { classifyTier, lockTier, probeGpu, type GpuInfo, type QualityTier } from "@/features/immersive/quality";
import type { SceneCue, SceneExhibit, ScenePortal } from "@/features/immersive/scene-model";
import { createMuseumStore, type CueNote } from "@/features/immersive/store";
import type { MuseumPayload, PanelConcept } from "@/features/immersive/types";
import type { LearningPrompt } from "@/features/learning/settings";
import { MUSEUM_TEXT } from "@/features/learning/strings";
import { useContentExposure, useNavigationPhase, usePauseWhile, useTelemetry } from "@/features/telemetry/client/provider";
import { cn } from "@/lib/utils";
import type { KnowledgeCategoryCode } from "@/lib/validation/enums";

import type { MuseumBridge, SceneEvents } from "./bridge";
import { CueNoteBar, MuseumStudyBar, RoomContents } from "./overlays/hud";
import { dockedPanelWidthPx, InfoPanel, MUSEUM_PANEL_ID, type CausalNote } from "./overlays/info-panel";
import { Minimap, PlanDialog } from "./overlays/minimap";
import { ContextLostScreen, FailureScreen, HelpScreen, LoadingScreen, OnboardingScreen, PauseScreen, WebGLFallback } from "./overlays/screens";

const MuseumCanvas = dynamic(() => import("./museum-canvas"), { ssr: false });

/** Id of the scene region: the StudyBar's skip target while no panel is open. */
const MUSEUM_SCENE_ID = "museum-scene";

/** The panel docks beside the scene at 1024 px and wider (DESIGN.md 6, 11.6); below, it covers it. */
const DOCKED_QUERY = "(min-width: 1024px)";
const subscribeDocked = (cb: () => void) => {
  const mq = window.matchMedia(DOCKED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const clientDocked = () => window.matchMedia(DOCKED_QUERY).matches;
const serverDocked = () => true;

export interface MuseumAppProps {
  payload: MuseumPayload;
  mode: "study" | "demo" | "preview";
  telemetrySessionId: string;
  /**
   * Key of the "controls tutorial seen" flag: the study session, shared by the practice room and
   * the learning museum. Practice teaches the controls, so the timed learning phase does not show
   * the tutorial again (it would cost 3D participants learning time the 2D condition does not
   * spend). Demo and preview use their telemetry session.
   */
  onboardingKey: string;
  unverifiedContent: boolean;
  /** Learning-task prompts from the protocol (shared component, as in 2D). */
  learningPrompts: readonly LearningPrompt[];
}

interface RelInfo {
  type: string;
  from: string;
  to: string;
}

const ONBOARDED = (s: string) => `ie-immersive-onboarded:v1:${s}`;

/**
 * The condition onboarding screen is OFF until the 2D condition shows the same shared onboarding
 * under the same rule (DESIGN.md 9.20, parity check P23: the same number of onboarding screens in
 * both conditions). Today the 2D practice and learning entry show none, so the museum shows none
 * either; "Controls help" in the StudyBar lists the controls on request. Turn this on in the same
 * change that adds `<Onboarding condition="2d">` to the 2D side (once, at practice, untimed).
 */
const CONDITION_ONBOARDING = false;

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* storage unavailable: onboarding shows again on reload */
  }
}

/** URL overrides for measurement runs, honoured only outside study mode. */
function overrides(mode: MuseumAppProps["mode"]) {
  if (mode === "study" || typeof window === "undefined")
    return {
      tier: null as QualityTier | null,
      probe: false,
      allowSoftware: false,
    };
  const q = new URLSearchParams(window.location.search);
  const t = q.get("tier");
  // allowSoftware: functional tests on CI machines without a GPU (SwiftShader); never in a study.
  return {
    tier: t === "high" || t === "low" ? (t as QualityTier) : null,
    probe: q.get("probe") === "1",
    allowSoftware: q.get("allowSoftware") === "1",
  };
}

let gpuCache: GpuInfo | null = null;
const clientGpu = () => (gpuCache ??= probeGpu());
const serverGpu = () => null;
const noSubscribe = () => () => {};

export function MuseumApp(props: MuseumAppProps) {
  // Probed once on the client; the server render shows the loading state.
  const gpu = useSyncExternalStore(noSubscribe, clientGpu, serverGpu);
  if (!gpu) return <LoadingScreen step="Checking this device" stepIndex={0} stepCount={4} loadedBytes={0} totalBytes={0} />;
  if (!gpu.webgl2 || (gpu.software && !overrides(props.mode).allowSoftware)) {
    return <WebGLFallback mode={props.mode} settings={props.payload.settings} reason={!gpu.webgl2 ? "no WebGL 2 context" : "software rendering only"} />;
  }
  return <MuseumRuntime {...props} gpu={gpu} />;
}

function MuseumRuntime({ payload, mode, telemetrySessionId, onboardingKey, unverifiedContent, learningPrompts, gpu }: MuseumAppProps & { gpu: GpuInfo }) {
  const { scene: model, concepts, sources, settings } = payload;
  const t = useTelemetry();
  const store = useMemo(() => createMuseumStore({ mapOpen: settings.minimap === "on" }), [settings.minimap]);
  const ui = useStore(store);
  const [attempt, setAttempt] = useState(0);
  const docked = useSyncExternalStore(subscribeDocked, clientDocked, serverDocked);
  const [planOpen, setPlanOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  /** The element that opened the panel, to return focus to on Escape or Close (DESIGN.md 11.6). */
  const panelTrigger = useRef<{
    el: HTMLElement | null;
    exhibitId: string;
  } | null>(null);
  const pendingFocus = useRef<{
    el: HTMLElement | null;
    exhibitId: string;
  } | null>(null);
  /** "In this room" was open when the docked panel collapsed it; it reopens when the panel closes. */
  const listReopen = useRef(false);

  const ov = useMemo(() => overrides(mode), [mode]);
  const locked = useMemo(() => lockTier(telemetrySessionId, classifyTier(gpu), ov.tier), [telemetrySessionId, gpu, ov.tier]);

  const exhibitsById = useMemo(() => new Map(model.exhibits.map((e) => [e.id, e])), [model]);
  const exhibitByConcept = useMemo(() => new Map(model.exhibits.map((e) => [e.conceptId, e])), [model]);
  const roomsById = useMemo(() => new Map(model.rooms.map((r) => [r.id, r])), [model]);
  const zonesById = useMemo(() => new Map(model.zones.map((z) => [z.id, z])), [model]);
  const traditionBySlug = useMemo(() => new Map(payload.traditions.map((x) => [x.slug, x])), [payload.traditions]);
  const traditionNames = useMemo(() => Object.fromEntries(payload.traditions.map((x) => [x.slug, x.name])), [payload.traditions]);
  const placed = useMemo(() => new Set(model.exhibits.map((e) => e.conceptId)), [model]);
  const rels = useMemo(() => {
    const m = new Map<string, RelInfo>();
    for (const c of Object.values(concepts))
      for (const g of c.related)
        for (const r of g.relations) {
          if (m.has(r.relationshipId)) continue;
          m.set(r.relationshipId, r.direction === "incoming" ? { type: r.type, from: r.conceptId, to: c.id } : { type: r.type, from: c.id, to: r.conceptId });
        }
    return m;
  }, [concepts]);
  const selectCues = useMemo(() => {
    const m = new Map<string, SceneCue[]>();
    for (const c of model.cues) if (c.trigger.type === "select") (m.get(c.trigger.elementId) ?? m.set(c.trigger.elementId, []).get(c.trigger.elementId)!).push(c);
    return m;
  }, [model]);

  const roomLabel = useCallback(
    (roomId: string) => {
      const r = roomsById.get(roomId);
      if (!r) return "Museum";
      const zone = r.zoneId ? zonesById.get(r.zoneId) : undefined;
      // Wing rooms are labelled "<tradition>: <group>" in the manifest; the zone is shown above it.
      return zone && r.label.startsWith(`${zone.label}: `) ? r.label.slice(zone.label.length + 2) : r.label;
    },
    [roomsById, zonesById],
  );
  const zoneLabelOf = useCallback(
    (roomId: string | null) => {
      const r = roomId ? roomsById.get(roomId) : undefined;
      const z = r?.zoneId ? zonesById.get(r.zoneId) : undefined;
      if (!z) return null;
      return z.traditionSlug ? (traditionBySlug.get(z.traditionSlug)?.name ?? z.label) : z.label;
    },
    [roomsById, traditionBySlug, zonesById],
  );
  /**
   * Wall plates carry the concept title only (DESIGN.md 11.6): no kicker or footer line. Secondary
   * lettering at reduced ink coverage measured 3.1:1 under the scene lighting (WCAG 1.4.3 needs
   * 4.5:1), and the type, step, tradition and category are in the panel's header and metadata,
   * identical to the 2D sheet.
   */
  const describe = useCallback(
    (): { kicker: string | null; footer: string | null } => ({
      kicker: null,
      footer: null,
    }),
    [],
  );

  /** Doorway signs name where they lead: the room, under its zone when the doorway changes zone. */
  const describeDoor = useCallback(
    (s: SceneDoorSign) => {
      const from = zoneLabelOf(s.roomId);
      const to = zoneLabelOf(s.toRoomId);
      const title = roomLabel(s.toRoomId);
      return { kicker: to && to !== from && to !== title ? to : null, title };
    },
    [roomLabel, zoneLabelOf],
  );

  // ---------------------------------------------------------------------------------------
  // Telemetry state
  // ---------------------------------------------------------------------------------------
  const visits = useRef({
    rooms: new Map<string, number>(),
    exhibits: new Map<string, number>(),
    roomSince: 0,
    layerSince: 0,
    lastTradition: null as string | null,
  });
  const loggedTier = useRef(false);
  // Scene -> overlay events go through a stable proxy to the latest handlers (set after render).
  const latest = useRef<SceneEvents | null>(null);
  const [bridgeObj] = useState<MuseumBridge>(() => ({
    controller: null,
    events: {
      progress: (...a) => latest.current?.progress(...a),
      ready: (...a) => latest.current?.ready(...a),
      failed: (...a) => latest.current?.failed(...a),
      roomChanged: (...a) => latest.current?.roomChanged(...a),
      hover: (...a) => latest.current?.hover(...a),
      pickExhibit: (...a) => latest.current?.pickExhibit(...a),
      manualMove: (...a) => latest.current?.manualMove(...a),
      cueTriggered: (...a) => latest.current?.cueTriggered(...a),
      cueLeft: (...a) => latest.current?.cueLeft(...a),
      contextLost: (...a) => latest.current?.contextLost(...a),
      contextRestored: (...a) => latest.current?.contextRestored(...a),
      freeLookChanged: (...a) => latest.current?.freeLookChanged(...a),
    },
  }));
  /** The scene's controller (installed by the canvas; null while it loads). */
  const ctl = useCallback(() => bridgeObj.controller, [bridgeObj]);

  const roomContext = useCallback(
    (roomId: string | null) => {
      const r = roomId ? roomsById.get(roomId) : undefined;
      const tr = r?.traditionSlug ? traditionBySlug.get(r.traditionSlug) : undefined;
      return {
        ...(roomId ? { roomOrPageId: roomId } : {}),
        ...(tr ? { traditionId: tr.id } : {}),
      };
    },
    [roomsById, traditionBySlug],
  );

  const conceptContext = useCallback(
    (c: PanelConcept | undefined) =>
      c
        ? {
            conceptId: c.id,
            category: c.category as KnowledgeCategoryCode,
            ...(c.traditionId ? { traditionId: c.traditionId } : {}),
          }
        : {},
    [],
  );

  const closePanel = useCallback(() => {
    const s = store.getState();
    if (!s.panelExhibitId) return;
    const e = exhibitsById.get(s.panelExhibitId);
    const c = s.panelConceptId ? concepts[s.panelConceptId] : undefined;
    const openMs = Math.max(0, Math.floor(performance.now() - visits.current.layerSince));
    void t.informationLayerClosed({
      ...conceptContext(c),
      roomOrPageId: e?.roomId,
      target: s.panelExhibitId,
      metadata: { layerId: s.panelTab, openMs },
    });
    store.setState({
      panelExhibitId: null,
      panelConceptId: null,
      panelTab: "overview",
      ...(listReopen.current ? { listOpen: true } : {}),
    });
    listReopen.current = false;
    ctl()?.setPanelInset(0);
    ctl()?.setHighlight(s.hoverExhibitId, false);
  }, [concepts, conceptContext, exhibitsById, store, t, ctl]);

  /** Escape or Close: close the panel and return focus to what opened it. */
  const dismissPanel = useCallback(() => {
    const s = store.getState();
    if (!s.panelExhibitId) return;
    pendingFocus.current = panelTrigger.current ?? {
      el: null,
      exhibitId: s.panelExhibitId,
    };
    closePanel();
  }, [closePanel, store]);

  /**
   * Share of the scene the docked panel covers (0 when the panel covers the whole scene). The camera
   * frames the exhibit in the visible part with a lens shift (museum-scene.tsx). It is set BEFORE
   * the walk to the exhibit, so the shift eases in during the walk and nothing moves while the
   * panel is open.
   */
  const panelInset = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia(DOCKED_QUERY).matches) return 0;
    const w = sceneRef.current?.clientWidth || window.innerWidth;
    return Math.min(0.5, dockedPanelWidthPx() / Math.max(1, w));
  }, []);

  /**
   * Top of the scene left free by the overlays, in px below the canvas top: under the "In this room"
   * toggle (the list itself collapses while the docked panel is open), with an 8 px gap. The camera
   * frames the exhibit between it and the bottom of the canvas (MuseumSceneProps.frameTop).
   */
  const frameTop = useCallback(() => {
    const toggle = sceneRef.current?.querySelector("[data-slot=museum-room-contents-toggle]");
    const scene = sceneRef.current;
    if (!toggle || !scene) return 0;
    return Math.max(0, toggle.getBoundingClientRect().bottom - scene.getBoundingClientRect().top + 8);
  }, []);

  const openPanel = useCallback(
    (exhibitId: string) => {
      const e = exhibitsById.get(exhibitId);
      if (!e) return;
      const s = store.getState();
      if (s.panelExhibitId && s.panelExhibitId !== exhibitId) closePanel();
      if (store.getState().panelExhibitId === exhibitId) return;
      const c = concepts[e.conceptId];
      // Reading the panel needs the cursor: free mouse look ends when a panel opens.
      ctl()?.setFreeLook(false);
      // The docked panel frames the exhibit in the scene left of it; the open "In this room" list
      // would cover that view, so it collapses while the panel is open (its toggle stays).
      const collapse = store.getState().listOpen && panelInset() > 0;
      if (collapse) listReopen.current = true;
      store.setState({
        panelExhibitId: exhibitId,
        panelTab: "overview",
        panelConceptId: e.conceptId,
        note: null,
        ...(collapse ? { listOpen: false } : {}),
      });
      visits.current.layerSince = performance.now();
      void t.informationLayerOpened({
        ...conceptContext(c),
        roomOrPageId: e.roomId,
        target: exhibitId,
        metadata: { layerId: "overview" },
      });
      void t.conceptEncountered({
        ...conceptContext(c),
        roomOrPageId: e.roomId,
        target: exhibitId,
        metadata: { mode: "opened" },
      });
      for (const cue of selectCues.get(exhibitId) ?? [])
        void t.guidanceCueUsed({
          ...conceptContext(c),
          roomOrPageId: e.roomId,
          target: exhibitId,
          metadata: { action: "shown", cueId: cue.id },
        });
      // Already applied before the walk (selectExhibit), so this changes nothing on screen.
      ctl()?.setPanelInset(panelInset());
      ctl()?.setPanelInsetBottom(0);
      ctl()?.setHighlight(exhibitId, true);
    },
    [closePanel, concepts, conceptContext, exhibitsById, panelInset, selectCues, store, t, ctl],
  );

  const selectExhibit = useCallback(
    (exhibitId: string) => {
      const e = exhibitsById.get(exhibitId);
      if (!e) return;
      const c = concepts[e.conceptId];
      const n = (visits.current.exhibits.get(exhibitId) ?? 0) + 1;
      visits.current.exhibits.set(exhibitId, n);
      void t.exhibitSelected({
        ...conceptContext(c),
        roomOrPageId: e.roomId,
        target: exhibitId,
        metadata: { elementKind: e.kind },
      });
      if (n > 1)
        void t.itemRevisited({
          ...conceptContext(c),
          roomOrPageId: e.roomId,
          target: exhibitId,
          metadata: { itemKind: "exhibit", visitCount: n },
        });
      if (store.getState().panelExhibitId && store.getState().panelExhibitId !== exhibitId) closePanel();
      const active = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
      panelTrigger.current = {
        el: active && active !== document.body && rootRef.current?.contains(active) ? active : null,
        exhibitId,
      };
      ctl()?.setPanelInset(panelInset());
      const ok = ctl()?.walkToExhibit(exhibitId, () => openPanel(exhibitId));
      if (!ok) openPanel(exhibitId);
    },
    [closePanel, concepts, conceptContext, exhibitsById, openPanel, panelInset, store, t, ctl],
  );

  /** Walk to the exhibit presenting `targetElementId` along a typed relationship. */
  const followRelationship = useCallback(
    (targetElementId: string, relationshipId: string | null, waypoints?: { x: number; z: number }[]) => {
      const target = exhibitsById.get(targetElementId);
      if (!target) return;
      const s = store.getState();
      const from = s.panelConceptId ?? (s.panelExhibitId ? exhibitsById.get(s.panelExhibitId)?.conceptId : undefined);
      const rel = relationshipId ? rels.get(relationshipId) : undefined;
      if (rel && relationshipId) {
        const forward = rel.to === target.conceptId;
        void t.relationshipFollowed({
          ...conceptContext(concepts[from ?? ""]),
          roomOrPageId: store.getState().roomId ?? undefined,
          target: targetElementId,
          metadata: {
            relationshipId,
            relationshipTypeCode: rel.type,
            ...(from ? { fromConceptId: from } : {}),
            toConceptId: target.conceptId,
            direction: forward ? "forward" : "inverse",
          },
        });
      }
      closePanel();
      store.setState({
        route: waypoints && waypoints.length > 1 ? { kind: "causal", id: targetElementId, points: waypoints } : null,
      });
      ctl()?.setRoute(waypoints && waypoints.length > 1 ? waypoints : null);
      const arrive = () => {
        ctl()?.setRoute(null);
        store.setState({ route: null });
        selectExhibit(targetElementId);
      };
      const ok = waypoints && waypoints.length > 0 ? ctl()?.walkWaypoints(waypoints, targetElementId, arrive) : ctl()?.walkToExhibit(targetElementId, arrive);
      if (!ok) arrive();
    },
    [closePanel, concepts, conceptContext, exhibitsById, rels, selectExhibit, store, t, ctl],
  );

  const showNote = useCallback(
    (cue: SceneCue) => {
      const e = cue.effect;
      let note: CueNote;
      if (e.type === "name-prerequisite")
        note = {
          cueId: cue.id,
          kind: e.type,
          targetElementId: e.prerequisiteElementId,
          relationshipId: cue.relationshipId,
          anchor: cue.position,
          radius: cue.trigger.radius,
        };
      else if (e.type === "show-path") {
        const path = model.paths.find((p) => p.id === e.pathId);
        note = {
          cueId: cue.id,
          kind: e.type,
          targetElementId: path?.stops[1] ?? null,
          relationshipId: null,
          anchor: cue.position,
          radius: cue.trigger.radius,
        };
        if (path) {
          ctl()?.setRoute(path.waypoints);
          store.setState({
            route: { kind: "sequence", id: path.id, points: path.waypoints },
          });
        }
      } else if (e.type === "announce")
        note = {
          cueId: cue.id,
          kind: e.type,
          targetElementId: null,
          relationshipId: null,
          anchor: null,
          radius: null,
        };
      else return;
      if (store.getState().panelExhibitId) return;
      store.setState({ note });
      void t.guidanceCueUsed({
        ...roomContext(store.getState().roomId),
        target: cue.trigger.elementId,
        metadata: { action: "shown", cueId: cue.id },
      });
    },
    [model.paths, roomContext, store, t, ctl],
  );

  const dismissNote = useCallback(
    (logged: boolean) => {
      const n = store.getState().note;
      if (!n) return;
      if (logged)
        void t.guidanceCueUsed({
          ...roomContext(store.getState().roomId),
          metadata: { action: "dismissed", cueId: n.cueId },
        });
      if (n.kind === "show-path" && store.getState().route?.kind === "sequence") {
        ctl()?.setRoute(null);
        store.setState({ route: null });
      }
      store.setState({ note: null });
    },
    [roomContext, store, t, ctl],
  );

  // Scene events (latest handlers; installed after each render).
  const handlers: SceneEvents = {
    progress(step, stepIndex, loadedBytes, totalBytes) {
      store.setState({
        loading: { step, stepIndex, stepCount: 4, loadedBytes, totalBytes },
      });
    },
    ready(info) {
      if (locked.fresh && !loggedTier.current) {
        loggedTier.current = true;
        void t.renderQualityChanged({
          metadata: { from: "unset", to: `${info.tier}-${info.backend}` },
        });
      }
      store.setState({
        phase: CONDITION_ONBOARDING && !readFlag(ONBOARDED(onboardingKey)) ? "onboarding" : "exploring",
      });
    },
    failed(message) {
      store.setState({ phase: "error", errorMessage: message });
    },
    roomChanged(roomId, prev, viaPortalId) {
      const v = visits.current;
      const now = performance.now();
      if (prev)
        void t.roomExited({
          ...roomContext(prev),
          metadata: { dwellMs: Math.max(0, Math.floor(now - v.roomSince)) },
        });
      v.roomSince = now;
      const n = (v.rooms.get(roomId) ?? 0) + 1;
      v.rooms.set(roomId, n);
      const route = store.getState().route;
      const via = !prev ? (n > 1 ? "resume" : "start") : route && route.kind !== "walk" ? "guidance" : viaPortalId ? "portal" : "navigation";
      void t.roomEntered({
        ...roomContext(roomId),
        metadata: { via, ...(prev ? { fromId: prev } : {}) },
      });
      if (n > 1 && prev)
        void t.itemRevisited({
          ...roomContext(roomId),
          metadata: { itemKind: "room", visitCount: n },
        });
      const slug = roomsById.get(roomId)?.traditionSlug ?? null;
      if (slug && v.lastTradition && slug !== v.lastTradition) {
        const from = traditionBySlug.get(v.lastTradition);
        const to = traditionBySlug.get(slug);
        void t.traditionCrossed({
          ...roomContext(roomId),
          metadata: {
            ...(from ? { fromTraditionId: from.id } : {}),
            ...(to ? { toTraditionId: to.id } : {}),
          },
        });
      }
      if (slug) v.lastTradition = slug;
      // Notes raised on entering a room (wing announcements, doorway thresholds) end when the
      // visitor moves on; approach notes end when the visitor walks away from their exhibit.
      const note = store.getState().note;
      const enterNote = note && (note.kind === "announce" || model.cues.find((c) => c.id === note.cueId)?.trigger.type === "enter");
      store.setState({ roomId, ...(enterNote ? { note: null } : {}) });
    },
    hover(id) {
      if (store.getState().hoverExhibitId === id) return;
      store.setState({ hoverExhibitId: id });
      if (!store.getState().panelExhibitId) ctl()?.setHighlight(id ?? store.getState().previewExhibitId, false);
    },
    pickExhibit(id) {
      selectExhibit(id);
    },
    manualMove() {
      if (store.getState().panelExhibitId) closePanel();
    },
    cueTriggered(cue) {
      showNote(cue);
    },
    cueLeft(cueId) {
      if (store.getState().note?.cueId === cueId) dismissNote(false);
    },
    contextLost() {
      void t.webglContextLost();
      store.setState({ phase: "context-lost" });
    },
    contextRestored() {
      store.setState({ phase: "exploring" });
    },
    freeLookChanged(on) {
      store.setState({ freeLook: on });
    },
  };
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  // Exposure / navigation / pause accounting (shared hooks, identical rules to 2D).
  const panelConcept = ui.panelConceptId ? concepts[ui.panelConceptId] : undefined;
  const panelExhibit = ui.panelExhibitId ? exhibitsById.get(ui.panelExhibitId) : undefined;
  const exploring = ui.phase === "exploring";
  useContentExposure(panelConcept?.id ?? null, panelConcept ? exposureFor(panelConcept) : "overview", {
    active: exploring && !!panelExhibit,
    context: {
      roomOrPageId: panelExhibit?.roomId,
      target: panelExhibit?.id,
      category: panelConcept?.category as KnowledgeCategoryCode | undefined,
      traditionId: panelConcept?.traditionId ?? undefined,
    },
  });
  useNavigationPhase(ui.mapOpen || planOpen ? "map" : "walk", {
    active: exploring && !panelExhibit,
    context: { roomOrPageId: ui.roomId ?? undefined },
  });
  usePauseWhile(ui.phase === "paused" || ui.helpOpen || ui.phase === "onboarding" || ui.phase === "context-lost");

  useEffect(() => {
    ctl()?.setPaused(ui.phase !== "exploring" || ui.helpOpen);
  }, [ui.phase, ui.helpOpen, ctl]);

  // Escape closes the panel or the map from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape inside the figure lightbox, the plan or another dialog closes that, not the panel.
      if ((e.target as Element | null)?.closest?.("dialog[open], [role=dialog]")) return;
      const s = store.getState();
      if (s.panelExhibitId) dismissPanel();
      else if (s.mapOpen && settings.minimap === "toggle") store.setState({ mapOpen: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissPanel, settings.minimap, store]);

  // Focus return after Escape or Close: the trigger, else its row in "In this room", else the scene.
  useEffect(() => {
    const want = pendingFocus.current;
    if (ui.panelExhibitId || !want) return;
    pendingFocus.current = null;
    const usable = (el: Element | null | undefined): el is HTMLElement => !!el && el.isConnected && !el.closest("[inert]") && (el as HTMLElement).offsetParent !== null;
    const row = rootRef.current?.querySelector(`[data-exhibit-id="${CSS.escape(want.exhibitId)}"]`);
    const target = usable(want.el) ? want.el : usable(row) ? row : sceneRef.current;
    target?.focus({ preventScroll: true });
  }, [ui.panelExhibitId]);

  const setTab = useCallback(
    (tab: PanelTab, conceptId: string) => {
      const s = store.getState();
      if (!s.panelExhibitId || (s.panelTab === tab && s.panelConceptId === conceptId)) return;
      const e = exhibitsById.get(s.panelExhibitId);
      const now = performance.now();
      if (s.panelTab !== tab) {
        void t.informationLayerClosed({
          ...conceptContext(concepts[s.panelConceptId ?? ""]),
          roomOrPageId: e?.roomId,
          target: s.panelExhibitId,
          metadata: {
            layerId: s.panelTab,
            openMs: Math.max(0, Math.floor(now - visits.current.layerSince)),
          },
        });
        visits.current.layerSince = now;
        void t.informationLayerOpened({
          ...conceptContext(concepts[conceptId]),
          roomOrPageId: e?.roomId,
          target: s.panelExhibitId,
          metadata: { layerId: tab },
        });
        if (tab === "artisan" || tab === "process" || tab === "science")
          void t.knowledgeLayerSelected({
            ...conceptContext(concepts[conceptId]),
            roomOrPageId: e?.roomId,
            target: s.panelExhibitId,
            metadata: { layer: tab },
          });
      }
      if (conceptId !== s.panelConceptId)
        void t.conceptEncountered({
          ...conceptContext(concepts[conceptId]),
          roomOrPageId: e?.roomId,
          target: s.panelExhibitId,
          metadata: { mode: "opened" },
        });
      store.setState({ panelTab: tab, panelConceptId: conceptId });
    },
    [concepts, conceptContext, exhibitsById, store, t],
  );

  const causalNotes = useMemo<CausalNote[]>(() => {
    if (!panelExhibit) return [];
    const own = concepts[panelExhibit.conceptId];
    return (selectCues.get(panelExhibit.id) ?? []).flatMap((cue) => {
      if (cue.effect.type !== "explain-and-guide") return [];
      const effect = exhibitsById.get(cue.effect.effectElementId);
      const rel = own?.related.flatMap((g) => g.relations).find((r) => r.relationshipId === cue.relationshipId);
      if (!effect) return [];
      return [
        {
          cueId: cue.id,
          label: rel?.label ?? "Leads to",
          conceptTitle: concepts[effect.conceptId]?.title ?? effect.label,
          explanation: rel?.explanation ?? cue.effect.explanation,
          effectElementId: effect.id,
          relationshipId: cue.relationshipId,
        },
      ];
    });
  }, [concepts, exhibitsById, panelExhibit, selectCues]);

  const roomExhibits = useMemo(
    () => (ui.roomId ? model.exhibits.filter((e) => e.roomId === ui.roomId).sort((a, b) => (a.sequence && b.sequence && a.sequence.pathId === b.sequence.pathId ? a.sequence.index - b.sequence.index : 0)) : []),
    [model.exhibits, ui.roomId],
  );
  const roomDoorways = useMemo(() => (ui.roomId ? model.portals.filter((p) => p.connects.includes(ui.roomId!)) : []), [model.portals, ui.roomId]);
  const doorLabel = useCallback((p: ScenePortal) => roomLabel(p.connects.find((r) => r !== ui.roomId) ?? p.connects[0]), [roomLabel, ui.roomId]);

  const note = ui.note;
  const noteView = useMemo(() => {
    if (!note) return null;
    const cue = model.cues.find((c) => c.id === note.cueId);
    if (!cue) return null;
    if (cue.effect.type === "announce") {
      const z = model.zones.find((x) => x.conceptId === cue.conceptId);
      const name = z?.traditionSlug ? traditionNames[z.traditionSlug] : cue.effect.text;
      return { text: `Entering ${name}`, detail: null, action: null };
    }
    if (cue.effect.type === "name-prerequisite") {
      const dep = exhibitsById.get(cue.effect.dependentElementId);
      const pre = exhibitsById.get(cue.effect.prerequisiteElementId);
      const rel = dep ? concepts[dep.conceptId]?.related.flatMap((g) => g.relations).find((r) => r.relationshipId === cue.relationshipId) : undefined;
      return {
        text: `${dep ? (concepts[dep.conceptId]?.title ?? dep.label) : ""} ${rel?.label ?? "depends on"} ${pre ? (concepts[pre.conceptId]?.title ?? pre.label) : ""}`.trim(),
        detail: rel?.explanation ?? cue.effect.explanation,
        action: pre ? "Go to it" : null,
      };
    }
    if (cue.effect.type === "show-path") {
      const path = model.paths.find((p) => p.id === (cue.effect as { pathId: string }).pathId);
      return {
        text: `Start of a sequence of ${path?.stops.length ?? 0} steps`,
        detail: "The route on the floor follows the steps in order.",
        action: path && path.stops.length > 1 ? "Go to step 2" : null,
      };
    }
    return null;
  }, [concepts, exhibitsById, model.cues, model.paths, model.zones, note, traditionNames]);

  const onNoteAction = useCallback(() => {
    const n = store.getState().note;
    if (!n || !n.targetElementId) return;
    void t.guidanceCueUsed({
      ...roomContext(store.getState().roomId),
      target: n.targetElementId,
      metadata: { action: "followed", cueId: n.cueId },
    });
    const target = n.targetElementId;
    const relId = n.relationshipId ?? (n.kind === "show-path" ? findPrecedes(rels, exhibitsById, target) : null);
    store.setState({ note: null });
    followRelationship(target, relId);
  }, [exhibitsById, followRelationship, rels, roomContext, store, t]);

  const onboardingDone = useCallback(() => {
    writeFlag(ONBOARDED(onboardingKey));
    store.setState({ phase: "exploring" });
  }, [store, onboardingKey]);

  // The shell may show a notice above the museum: fit the museum to the space below it, so no
  // overlay is pushed off screen. Also measures the chrome over the top of the museum, which the
  // camera crops out of its virtual frame (MuseumSceneProps.cropTop).
  const chromeRef = useRef<HTMLDivElement>(null);
  const [cropTop, setCropTop] = useState(0);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = `${Math.max(0, window.innerHeight - el.getBoundingClientRect().top)}px`;
      setCropTop(Math.round(chromeRef.current?.getBoundingClientRect().height ?? 0));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (el.parentElement) ro.observe(el.parentElement);
    if (chromeRef.current) ro.observe(chromeRef.current);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [ctl]);

  const running = ui.phase === "exploring" || ui.phase === "paused" || ui.phase === "context-lost";
  const panelOpen = !!(panelExhibit && ui.panelConceptId);
  /** Under 1024 px the open panel covers the scene: the scene overlays are inert meanwhile. */
  const panelCovers = panelOpen && !docked;
  const roomName = ui.roomId ? roomLabel(ui.roomId) : MUSEUM_TEXT.museum;
  const zoneName = zoneLabelOf(ui.roomId);
  // The room first, so a phone that truncates the line still shows where the visitor is.
  const location = zoneName && zoneName !== roomName ? `${roomName} · ${zoneName}` : roomName;
  // The room name is the view's h1 while no concept is open; the panel title is the h1 once it opens.
  const locationAs = running ? (panelOpen ? "live" : "h1") : "text";
  const planShown = ui.mapOpen && settings.minimap !== "off" && !panelCovers;
  /** Help and Pause cover the scene region: what they cover is inert meanwhile (they are not modal). */
  const screenCovers = ui.helpOpen || ui.phase === "paused" || ui.phase === "context-lost";
  const rightOverlayOffset = panelOpen && docked ? `calc(${dockedPanelWidthPx()}px + 1rem)` : undefined;

  return (
    <LearningPhaseContent>
      <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-ground" data-testid="museum-root" data-phase={ui.phase}>
        {/*
          The canvas starts below the opaque chrome; nothing sits over it but the overlays. The
          camera renders the lower part of a virtual frame as tall as the museum (cropTop), so the
          on-screen size of the lettering is that of a full-height canvas (the legibility rule in
          placement.ts assumes the canvas is the viewport height) and no pixel is drawn behind the
          chrome. (A canvas running up under the chrome left a chrome-high band at its bottom
          uncomposited in Chromium.)
        */}
        <div className={cn("absolute inset-x-0 bottom-0", SCENE_TOP)} data-slot="museum-canvas">
          <MuseumCanvas key={attempt} model={model} tier={locked.tier} bridge={bridgeObj} describe={describe} describeDoor={describeDoor} probe={ov.probe} gpuRenderer={gpu.renderer} cropTop={cropTop} frameTop={frameTop} />
        </div>
        {/* Above the panel and the scene screens, so the Hint panel opens over them as it does in 2D. */}
        <div ref={chromeRef} className="absolute inset-x-0 top-0 z-[calc(var(--z-modal)+1)]" data-slot="museum-chrome">
          {/* The one notice slot above the StudyBar (DESIGN.md 9.15), as in the 2D condition. */}
          {unverifiedContent ? <UnverifiedContentNotice /> : null}
          <MuseumStudyBar
            location={location}
            locationAs={locationAs}
            skipTargetId={panelOpen ? MUSEUM_PANEL_ID : MUSEUM_SCENE_ID}
            mapAvailable={settings.minimap === "toggle"}
            mapOpen={ui.mapOpen}
            controlsEnabled={ui.phase === "exploring"}
            onToggleMap={() => store.setState({ mapOpen: !ui.mapOpen })}
            onHelp={() => store.setState({ helpOpen: true })}
            onPause={() => store.setState({ phase: "paused" })}
            freeLook={ui.freeLook}
            onToggleFreeLook={() => ctl()?.setFreeLook(!ui.freeLook)}
          />
        </div>
        {/* Everything below the chrome; pointer events pass through to the canvas except on overlays. */}
        <div
          ref={sceneRef}
          id={MUSEUM_SCENE_ID}
          tabIndex={-1}
          aria-label={MUSEUM_TEXT.sceneLabel}
          role="region"
          className={cn("pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden outline-none", SCENE_TOP)}
          data-slot="museum-scene"
        >
          {running ? (
            <>
              {ui.freeLook ? (
                // Free mouse look: a small ink crosshair at the canvas centre (a click acts on it).
                <div aria-hidden="true" data-slot="museum-crosshair" className="pointer-events-none absolute top-1/2 left-1/2 z-(--z-hud) size-5 -translate-x-1/2 -translate-y-1/2">
                  <span className="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 bg-ink shadow-[0_0_0_1px_var(--ground)]" />
                  <span className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-ink shadow-[0_0_0_1px_var(--ground)]" />
                </div>
              ) : null}
              {/*
                The panel comes first in the DOM (it is drawn above the overlays by z-index): from its h1,
                Shift+Tab reaches the StudyBar's Finish directly, as from the 2D sheet (P24), and the
                room list and plan follow the panel in the Tab order.
              */}
              {panelExhibit && ui.panelConceptId ? (
                <div inert={screenCovers} className="contents">
                  <InfoPanel
                    key={panelExhibit.id}
                    model={model}
                    exhibit={panelExhibit}
                    concepts={concepts}
                    sources={sources}
                    traditionNames={traditionNames}
                    figures={payload.figures}
                    tab={ui.panelTab}
                    conceptId={ui.panelConceptId}
                    causal={causalNotes}
                    docked={docked}
                    placedConceptIds={placed}
                    onTab={setTab}
                    onFocusConcept={(id) => setTab(ui.panelTab, id)}
                    onClose={dismissPanel}
                    onWalkToConcept={(conceptId, relId) => {
                      const target = exhibitByConcept.get(conceptId);
                      if (target) followRelationship(target.id, relId);
                    }}
                    onWalkToElement={(id, relId) => followRelationship(id, relId ?? findPrecedes(rels, exhibitsById, id, panelExhibit.conceptId))}
                    onFollowCausal={(c) => {
                      void t.guidanceCueUsed({
                        ...roomContext(ui.roomId),
                        target: c.effectElementId,
                        metadata: { action: "followed", cueId: c.cueId },
                      });
                      const cue = model.cues.find((x) => x.id === c.cueId);
                      followRelationship(c.effectElementId, c.relationshipId, cue?.effect.type === "explain-and-guide" ? cue.effect.route : undefined);
                    }}
                  />
                </div>
              ) : null}
              <div inert={panelCovers || screenCovers} className="contents" data-slot="museum-overlays">
                {/* Top left: the task prompts and "In this room" (the keyboard route to exhibits). */}
                <div
                  className={cn(
                    "pointer-events-none absolute top-4 left-4 z-(--z-hud) flex w-[min(24rem,calc(100%-2rem))] flex-col items-start gap-3 [&>*]:pointer-events-auto",
                    // Leaves room for the plan below, so the two never overlap.
                    planShown ? "max-h-[calc(100%-2rem-19rem)]" : "max-h-[calc(100%-2rem)]",
                  )}
                >
                  {learningPrompts.length > 0 ? (
                    <div className="w-full" data-museum-keys="ui">
                      <LearningTaskPrompts prompts={learningPrompts} />
                    </div>
                  ) : null}
                  <RoomContents
                    open={ui.listOpen}
                    onToggle={() => store.setState({ listOpen: !ui.listOpen })}
                    exhibits={roomExhibits}
                    doorways={roomDoorways}
                    selectedId={ui.panelExhibitId}
                    onPreview={(id) => {
                      store.setState({ previewExhibitId: id });
                      if (!store.getState().panelExhibitId) ctl()?.setHighlight(id ?? store.getState().hoverExhibitId, false);
                    }}
                    onSelect={selectExhibit}
                    onDoorway={(p) => ctl()?.walkToRoom(p.connects.find((r) => r !== ui.roomId) ?? p.connects[0])}
                    doorLabel={doorLabel}
                  />
                </div>
                {/* Bottom left: the plan (DESIGN.md 11.6), hidden while the panel covers the scene. */}
                {planShown ? (
                  <div className="pointer-events-auto absolute bottom-4 left-4 z-(--z-hud)">
                    <Minimap model={model} roomId={ui.roomId} roomLabel={roomLabel} onExpand={() => setPlanOpen(true)} />
                  </div>
                ) : null}
                <div
                  className="pointer-events-none absolute right-4 bottom-4 z-(--z-hud) flex max-w-[calc(100%-2rem)] flex-col items-end gap-3 [&>*]:pointer-events-auto"
                  style={rightOverlayOffset ? { right: rightOverlayOffset } : undefined}
                >
                  <StallCue />
                  {noteView && !panelOpen ? <CueNoteBar text={noteView.text} detail={noteView.detail} actionLabel={noteView.action} onAction={onNoteAction} onDismiss={() => dismissNote(true)} /> : null}
                </div>
              </div>
              {settings.minimap !== "off" ? (
                <PlanDialog
                  open={planOpen}
                  onOpenChange={setPlanOpen}
                  model={model}
                  roomId={ui.roomId}
                  roomLabel={roomLabel}
                  zoneLabel={zoneLabelOf}
                  onRoom={(id) => {
                    if (store.getState().panelExhibitId) closePanel();
                    ctl()?.walkToRoom(id);
                  }}
                />
              ) : null}
            </>
          ) : null}

          {ui.phase === "loading" ? <LoadingScreen {...ui.loading} /> : null}
          {ui.phase === "onboarding" ? <OnboardingScreen onStart={onboardingDone} /> : null}
          {ui.helpOpen ? <HelpScreen onClose={() => store.setState({ helpOpen: false })} /> : null}
          {ui.phase === "paused" ? <PauseScreen onResume={() => store.setState({ phase: "exploring" })} /> : null}
          {ui.phase === "context-lost" ? <ContextLostScreen /> : null}
          {ui.phase === "error" ? (
            <FailureScreen
              message={ui.errorMessage ?? "unknown error"}
              mode={mode}
              settings={settings}
              onRetry={() => {
                store.setState({ phase: "loading", errorMessage: null });
                setAttempt((a) => a + 1);
              }}
            />
          ) : null}
        </div>
      </div>
    </LearningPhaseContent>
  );
}

/** Top of the scene region and the canvas: the bottom of the chrome (notice slot, StudyBar, rule). */
/**
 * Top of the scene: below the chrome (the notice strip when it is shown in the chrome, then the
 * StudyBar and its 2 px rule). --museum-notice is set in globals.css (AccessNotice merge): the
 * "under review" strip height while it shows here, 0 while the shell's AccessNotice carries it.
 */
const SCENE_TOP = "top-[calc(var(--museum-notice,0px)+var(--studybar-h)+2px)]";


/** The PRECEDES relationship between the open station and a neighbouring one, if any. */
function findPrecedes(rels: ReadonlyMap<string, RelInfo>, exhibits: ReadonlyMap<string, SceneExhibit>, targetElementId: string, fromConceptId?: string): string | null {
  const target = exhibits.get(targetElementId);
  if (!target) return null;
  for (const [id, r] of rels) {
    if (r.type !== "PRECEDES") continue;
    if ((r.to === target.conceptId && (!fromConceptId || r.from === fromConceptId)) || (r.from === target.conceptId && fromConceptId && r.to === fromConceptId)) return id;
  }
  return null;
}
