"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clothStatePath } from "@/features/process/domain/asset-catalogue";
import { HELP_LINES, HELP_TITLE, PAUSE_TEXT, PAUSE_TITLE, RESUME_LABEL, SOURCES_AND_CREDITS_LABEL, SOURCES_LABEL } from "@/features/process/domain/guidance";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { buildRoute, type RouteStation } from "../domain/route-plan";
import { WalkRuntime } from "../infrastructure/walk-runtime";
import "@/styles/walking-tokens.css";
import "./walkthrough.css";

export interface WalkStop {
  readonly traditionKey: string;
  readonly stageKey: string;
  readonly stageNumber: number;
}

export interface WalkthroughSessionEvents {
  readonly onStageEntered: (stop: WalkStop) => void;
  readonly onStageLeft: (stop: WalkStop, activeMs: number) => void;
  readonly onMovement: (stop: WalkStop, walkingMs: number, viewingMs: number) => void;
  readonly onViewpointChanges: (stop: WalkStop, count: number) => void;
  readonly onObjectDwell: (stop: WalkStop, objectKey: string, dwellMs: number, closestMetres: number) => void;
  readonly onPathSample: (traditionKey: string, points: readonly (readonly [number, number, number])[]) => void;
  readonly onWrongTurn: (stop: WalkStop) => void;
  readonly onSourceOpened: (stop: WalkStop) => void;
  readonly onFinished: () => void;
}

export interface WalkthroughSessionProps {
  readonly templates: readonly StageTemplate[];
  readonly events: WalkthroughSessionEvents;
}

const KEY_MOVES: Record<string, readonly [number, number]> = { KeyW: [1, 0], ArrowUp: [1, 0], KeyS: [-1, 0], ArrowDown: [-1, 0], KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1] };
const LOOK_SPEED = 0.0032;

export function WalkthroughSession({ templates, events }: WalkthroughSessionProps) {
  const [traditionIndex, setTraditionIndex] = useState(0);
  const [stationIndex, setStationIndex] = useState(0);
  const [reached, setReached] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<WalkRuntime | null>(null);
  const template = templates[traditionIndex]!;
  const route = useMemo(() => buildRoute(template, (id) => clothStatePath(id)), [template]);
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    setReady(false);
    const tradition = template.tradition;
    const texturesFor = (station: RouteStation) => station.textiles.map((textile) => ({ file: textile.product.file, name: textile.product.name, x: textile.x, z: textile.z, width: textile.width, height: textile.height, label: textile.label }));
    const stopOf = (station: RouteStation): WalkStop => ({ traditionKey: tradition, stageKey: station.stopKey, stageNumber: station.stopNumber });
    const path: [number, number, number][] = [];
    let open: { stop: WalkStop; enteredAt: number } | null = null;
    const flushPath = () => {
      if (path.length > 0) eventsRef.current.onPathSample(tradition, path.splice(0));
    };
    const instance = new WalkRuntime(element, route, texturesFor, {
      onStationEntered(station, index) {
        setReady(true);
        setStationIndex(index);
        setReached((value) => Math.max(value, index));
        open = { stop: stopOf(station), enteredAt: performance.now() };
        eventsRef.current.onStageEntered(open.stop);
      },
      onStationLeft(station, _index, activeMs, walkingMs, viewpointChanges) {
        flushPath();
        open = null;
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
    });
    runtime.current = instance;
    void instance.start(0);
    const resize = () => instance.resize(element.clientWidth, element.clientHeight);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      flushPath();
      if (open) eventsRef.current.onStageLeft(open.stop, performance.now() - open.enteredAt);
      instance.dispose();
      runtime.current = null;
    };
  }, [route, template.tradition]);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (runtime.current) runtime.current.paused = paused || sourcesOpen || helpOpen;
  }, [paused, sourcesOpen, helpOpen]);

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
      events.onFinished();
      return;
    }
    setTraditionIndex((value) => value + 1);
    setStationIndex(0);
    setReached(0);
  }, [atHall, events, lastTradition, stationIndex]);

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
        <button type="button" className="walkthrough-next" disabled={!ready} onClick={onwards}>
          {atHall ? (lastTradition ? "Questions" : "Next Tradition") : "Walk On"}
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
          {HELP_LINES.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <button type="button" onClick={() => setHelpOpen(false)}>Close</button>
        </div>
      ) : null}
    </div>
  );
}
