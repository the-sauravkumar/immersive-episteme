"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clothStatePath } from "@/features/process/domain/asset-catalogue";
import { finishLabel, HELP_TITLE, HINT_TITLE, NO_GUIDANCE, PAUSE_TEXT, PAUSE_TITLE, RESUME_LABEL, sessionHelpLines, SOURCES_AND_CREDITS_LABEL, SOURCES_LABEL, type DoorGuidance } from "@/features/process/domain/guidance";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { StallCue } from "@/features/process/ui/stall-cue";
import { useGuidance, type GuidanceReport } from "@/features/process/ui/use-guidance";
import { useTabHidden } from "@/lib/use-tab-hidden";
import type { WalkEngine, WalkEngineFactory } from "../application/walk-engine";
import { buildRoute, type RouteStation } from "../domain/route-plan";
import "@/styles/walking-tokens.css";
import "./walkthrough.css";

export interface WalkStop {
  readonly traditionKey: string;
  readonly stageKey: string;
  readonly stageNumber: number;
}

export interface WalkPosition {
  readonly tradition: number;
  readonly stop: number;
}

export interface WalkResume extends WalkPosition {
  readonly reached: readonly number[];
}

export interface WalkthroughSessionEvents {
  readonly onStageEntered: (stop: WalkStop) => void;
  readonly onStageLeft: (stop: WalkStop, activeMs: number) => void;
  readonly onMovement: (stop: WalkStop, walkingMs: number, viewingMs: number) => void;
  readonly onViewpointChanges: (stop: WalkStop, count: number) => void;
  readonly onObjectDwell: (stop: WalkStop, objectKey: string, dwellMs: number, closestMetres: number) => void;
  readonly onPathSample: (traditionKey: string, segment: string, points: readonly (readonly [number, number, number])[]) => void;
  readonly onWrongTurn: (stop: WalkStop) => void;
  readonly onSourceOpened: (stop: WalkStop) => void;
  readonly onFinished: () => Promise<boolean>;
  readonly onRenderFailed: () => void;
  readonly onContextLost: () => void;
  readonly onGuidance: GuidanceReport;
  readonly registerExit: (close: () => void) => () => void;
}

export interface WalkthroughSessionProps {
  readonly templates: readonly StageTemplate[];
  readonly events: WalkthroughSessionEvents;
  readonly createEngine: WalkEngineFactory;
  readonly resume?: WalkResume | null;
  readonly restore?: WalkPosition | null;
  readonly studyMode?: boolean;
  readonly guidance?: DoorGuidance;
}

interface WalkEntry {
  readonly tradition: number;
  readonly station: number;
  readonly reached: number;
  readonly alreadyRecorded: boolean;
}

const KEY_MOVES: Record<string, readonly [number, number]> = { KeyW: [1, 0], ArrowUp: [1, 0], KeyS: [-1, 0], ArrowDown: [-1, 0], KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1] };
const LOOK_SPEED = 0.0032;

const firstEntry = (resume: WalkResume | null): WalkEntry => (resume ? { tradition: resume.tradition, station: resume.stop, reached: Math.max(resume.stop, resume.reached[resume.tradition] ?? 0), alreadyRecorded: true } : { tradition: 0, station: 0, reached: 0, alreadyRecorded: false });

export function WalkthroughSession({ templates, events, createEngine, resume = null, restore = null, studyMode = false, guidance = NO_GUIDANCE }: WalkthroughSessionProps) {
  const [entry, setEntry] = useState<WalkEntry>(() => firstEntry(resume));
  const [stationIndex, setStationIndex] = useState(entry.station);
  const [reached, setReached] = useState(entry.reached);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const tabHidden = useTabHidden();
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<WalkEngine | null>(null);
  const traditionIndex = entry.tradition;
  const template = templates[traditionIndex]!;
  const route = useMemo(() => buildRoute(template, (id) => clothStatePath(id)), [template]);
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const moveTo = useCallback((next: WalkEntry) => {
    setEntry(next);
    setStationIndex(next.station);
    setReached(next.reached);
  }, []);

  const [appliedRestore, setAppliedRestore] = useState(restore);
  if (restore !== appliedRestore) {
    setAppliedRestore(restore);
    if (restore) moveTo({ tradition: restore.tradition, station: restore.stop, reached: restore.stop, alreadyRecorded: false });
  }

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    setReady(false);
    const tradition = template.tradition;
    const segment = `${entry.station}.${Date.now().toString(36)}`;
    const texturesFor = (station: RouteStation) => station.textiles.map((textile) => ({ file: textile.product.file, name: textile.product.name, x: textile.x, z: textile.z, width: textile.width, height: textile.height, label: textile.label }));
    const stopOf = (station: RouteStation): WalkStop => ({ traditionKey: tradition, stageKey: station.stopKey, stageNumber: station.stopNumber });
    const path: [number, number, number][] = [];
    const flushPath = () => {
      if (path.length > 0) eventsRef.current.onPathSample(tradition, segment, path.splice(0));
    };
    let alreadyRecorded = entry.alreadyRecorded;
    let instance: WalkEngine | null = null;
    let unregister: (() => void) | null = null;
    const close = () => {
      unregister?.();
      unregister = null;
      const closing = instance;
      instance = null;
      runtime.current = null;
      closing?.dispose();
      flushPath();
    };
    const fail = () => {
      close();
      setFailed(true);
      eventsRef.current.onRenderFailed();
    };
    try {
      instance = createEngine(element, route, texturesFor, {
        onStationEntered(station, index) {
          setReady(true);
          setStationIndex(index);
          setReached((value) => Math.max(value, index));
          if (alreadyRecorded) {
            alreadyRecorded = false;
            return;
          }
          eventsRef.current.onStageEntered(stopOf(station));
        },
        onStationLeft(station, _index, activeMs, walkingMs, viewpointChanges) {
          flushPath();
          eventsRef.current.onStageLeft(stopOf(station), activeMs);
          eventsRef.current.onMovement(stopOf(station), walkingMs, Math.max(0, activeMs - walkingMs));
          eventsRef.current.onViewpointChanges(stopOf(station), viewpointChanges);
        },
        onObjectDwell(station, itemKey, seconds, nearest) {
          eventsRef.current.onObjectDwell(stopOf(station), itemKey, seconds * 1000, nearest);
        },
        onPath(x, z) {
          path.push([performance.now(), x, z]);
          if (path.length >= 40) flushPath();
        },
        onWrongTurn(station) {
          eventsRef.current.onWrongTurn(stopOf(station));
        },
        onContextLost() {
          eventsRef.current.onContextLost();
          fail();
        },
      });
    } catch {
      fail();
      return;
    }
    runtime.current = instance;
    unregister = eventsRef.current.registerExit(close);
    instance.start(entry.station).catch(() => {
      if (instance) fail();
    });
    const resize = () => runtime.current?.resize(element.clientWidth, element.clientHeight);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      close();
    };
  }, [createEngine, entry, route, template.tradition]);

  useEffect(() => {
    if (!ready) return;
    const pressed = new Set<string>();
    const apply = () => {
      let forward = 0;
      let strafe = 0;
      for (const code of pressed) {
        const move = KEY_MOVES[code];
        if (move) {
          forward += move[0];
          strafe += move[1];
        }
      }
      runtime.current?.setMove(Math.sign(forward), Math.sign(strafe));
    };
    const down = (event: KeyboardEvent) => {
      if (event.code === "KeyB") {
        runtime.current?.walkTo(Math.max(0, (runtime.current?.stationIndex ?? 0) - 1));
        return;
      }
      if (KEY_MOVES[event.code]) {
        pressed.add(event.code);
        apply();
      }
    };
    const up = (event: KeyboardEvent) => {
      pressed.delete(event.code);
      apply();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [ready]);

  const helpLines = useMemo(() => sessionHelpLines(guidance.time), [guidance.time]);
  const reportGuidance = useCallback<GuidanceReport>((action, cueId) => eventsRef.current.onGuidance(action, cueId), []);
  const guide = useGuidance({ guidance, progress: `${traditionIndex}.${reached}`, suspended: !ready || failed || paused || sourcesOpen || helpOpen || tabHidden, report: reportGuidance });

  useEffect(() => {
    if (runtime.current) runtime.current.paused = paused || sourcesOpen || helpOpen || guide.hintOpen || tabHidden;
  }, [entry, paused, sourcesOpen, helpOpen, guide.hintOpen, tabHidden]);

  const dragging = useRef<{ x: number; y: number } | null>(null);
  const station = route[stationIndex];
  const stage = station?.stageNumber ? template.stages.find((entry) => entry.number === station.stageNumber) : null;
  const atHall = stationIndex === route.length - 1;
  const lastTradition = traditionIndex === templates.length - 1;

  const onwards = useCallback(() => {
    if (!atHall) {
      runtime.current?.walkTo(stationIndex + 1);
      return;
    }
    if (lastTradition) {
      setFinishing(true);
      void events.onFinished().then((accepted) => {
        if (!accepted) setFinishing(false);
      });
      return;
    }
    moveTo({ tradition: traditionIndex + 1, station: 0, reached: 0, alreadyRecorded: false });
  }, [atHall, events, lastTradition, moveTo, stationIndex, traditionIndex]);

  return (
    <div className="walkthrough walking" data-slot="walkthrough-session">
      <div
        ref={host}
        className="walkthrough-view"
        role="application"
        aria-label={`Walkthrough of ${template.traditionName}. Use W, A, S and D to walk and drag to look.`}
        onPointerDown={(event) => {
          dragging.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = dragging.current;
          if (!start) return;
          runtime.current?.look((event.clientX - start.x) * LOOK_SPEED, (event.clientY - start.y) * LOOK_SPEED);
          dragging.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={() => {
          dragging.current = null;
          runtime.current?.endLook();
        }}
      />
      {ready ? null : <div className="walkthrough-cover walkthrough-loading" role="status">Opening The Yard</div>}
      <div className="walkthrough-plate walkthrough-route">
        <ol className="walkthrough-map" aria-label={`Route of ${route.length} stations`}>
          {route.map((entry, index) => (
            <li key={entry.id} data-state={index === stationIndex ? "now" : index <= reached ? "done" : "ahead"} />
          ))}
        </ol>
        <p>
          <b>{template.traditionName}</b>
          <span>{atHall ? station?.name : `Station ${station?.stageNumber ?? ""} Of ${template.stages.length}`}</span>
        </p>
      </div>
      <div className="walkthrough-tools">
        {guide.hint !== null ? (
          <button type="button" onClick={guide.openHint}>
            {HINT_TITLE}
          </button>
        ) : null}
        <button type="button" onClick={() => {
          setSourcesOpen(true);
          if (station) events.onSourceOpened({ traditionKey: template.tradition, stageKey: station.stopKey, stageNumber: station.stopNumber });
        }}>
          Sources
        </button>
        <button type="button" onClick={() => setHelpOpen(true)}>{HELP_TITLE}</button>
        <button type="button" onClick={() => setPaused(true)}>Pause</button>
      </div>
      <div className="walkthrough-move">
        <button type="button" disabled={!ready || stationIndex === 0} onClick={() => runtime.current?.walkTo(stationIndex - 1)}>
          Back
        </button>
        <button type="button" className="walkthrough-next" disabled={!ready || finishing} onClick={onwards}>
          {atHall ? (lastTradition ? finishLabel(studyMode) : "Next Tradition") : "Walk On"}
        </button>
      </div>
      {sourcesOpen && stage ? (
        <div className="walkthrough-dialog" role="dialog" aria-modal="true" aria-label={SOURCES_LABEL}>
          <h2>{SOURCES_LABEL}</h2>
          <p>{stage.caption.text}</p>
          <ul>
            {stage.caption.sources.map((source) => (
              <li key={`${source.sourceId}${source.locator}`}>
                <b>{source.title}</b>, {source.locator}. &ldquo;{source.quote}&rdquo;
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setSourcesOpen(false)}>Close</button>
        </div>
      ) : null}
      {sourcesOpen && !stage ? (
        <div className="walkthrough-dialog" role="dialog" aria-modal="true" aria-label={SOURCES_AND_CREDITS_LABEL}>
          <h2>{SOURCES_AND_CREDITS_LABEL}</h2>
          <ul>
            {template.products.map((product) => (
              <li key={product.id}>
                <b>{product.name}</b>, {product.holder}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setSourcesOpen(false)}>Close</button>
        </div>
      ) : null}
      {paused ? (
        <div className="walkthrough-dialog" role="dialog" aria-modal="true" aria-label={PAUSE_TITLE}>
          <h2>{PAUSE_TITLE}</h2>
          <p>{PAUSE_TEXT}</p>
          <button type="button" onClick={() => setPaused(false)}>{RESUME_LABEL}</button>
        </div>
      ) : null}
      {helpOpen ? (
        <div className="walkthrough-dialog" role="dialog" aria-modal="true" aria-label={HELP_TITLE}>
          <h2>{HELP_TITLE}</h2>
          <p>Walk with W, A, S and D or the arrow keys. Drag to look around. Walk On takes you to the next station, and B or Back takes you back along the route. Follow the cloth.</p>
          {helpLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <button type="button" onClick={() => setHelpOpen(false)}>Close</button>
        </div>
      ) : null}
      {guide.hint !== null && guide.hintOpen ? (
        <div className="walkthrough-dialog" role="dialog" aria-modal="true" aria-label={HINT_TITLE}>
          <h2>{HINT_TITLE}</h2>
          <p>{guide.hint}</p>
          <button type="button" onClick={guide.closeHint}>Close</button>
        </div>
      ) : null}
      <StallCue guidance={guide} />
      {failed ? <div className="walkthrough-cover walkthrough-loading" role="alert">This Device Cannot Show The Yard</div> : null}
    </div>
  );
}
