"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clothStatePath } from "@/features/process/domain/asset-catalogue";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { buildRoute, type RouteStation } from "../domain/route-plan";
import { WalkRuntime } from "../infrastructure/walk-runtime";

export interface WalkthroughSessionEvents {
  readonly onStageEntered: (tradition: string, stageNumber: number) => void;
  readonly onStageLeft: (tradition: string, stageNumber: number, seconds: number) => void;
  readonly onObjectDwell: (tradition: string, stageNumber: number, itemKey: string, seconds: number, nearestMetres: number) => void;
  readonly onPath: (x: number, z: number, walkedMetres: number) => void;
  readonly onViewpointChange: () => void;
  readonly onBackStep: () => void;
  readonly onSourceOpened: (tradition: string, stageNumber: number) => void;
  readonly onFinished: () => void;
}

export interface WalkthroughSessionProps {
  readonly templates: readonly StageTemplate[];
  readonly aspects: Readonly<Record<string, number>>;
  readonly events: WalkthroughSessionEvents;
}

const KEY_MOVES: Record<string, readonly [number, number]> = { KeyW: [1, 0], ArrowUp: [1, 0], KeyS: [-1, 0], ArrowDown: [-1, 0], KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1] };
const LOOK_SPEED = 0.0032;

export function WalkthroughSession({ templates, aspects, events }: WalkthroughSessionProps) {
  const [traditionIndex, setTraditionIndex] = useState(0);
  const [stationIndex, setStationIndex] = useState(0);
  const [reached, setReached] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<WalkRuntime | null>(null);
  const template = templates[traditionIndex]!;
  const route = useMemo(() => buildRoute(template, (id) => clothStatePath(id), (product) => aspects[product.id] ?? 1), [template, aspects]);
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const tradition = template.tradition;
    const texturesFor = (station: RouteStation) => station.textiles.map((textile) => ({ file: textile.product.file, name: textile.product.name, x: textile.x, z: textile.z, width: textile.width, height: textile.height, label: textile.label }));
    const instance = new WalkRuntime(element, route, texturesFor, {
      onStationEntered(station, index) {
        setStationIndex(index);
        setReached((value) => Math.max(value, index));
        if (station.stageNumber !== null) eventsRef.current.onStageEntered(tradition, station.stageNumber);
      },
      onStationLeft(station, _index, seconds) {
        if (station.stageNumber !== null) eventsRef.current.onStageLeft(tradition, station.stageNumber, seconds);
      },
      onObjectDwell(station, itemKey, seconds, nearest) {
        if (station.stageNumber !== null) eventsRef.current.onObjectDwell(tradition, station.stageNumber, itemKey, seconds, nearest);
      },
      onPath(x, z, walked) {
        eventsRef.current.onPath(x, z, walked);
      },
      onLook() {
        eventsRef.current.onViewpointChange();
      },
      onRouteEnd() {},
    });
    runtime.current = instance;
    void instance.start(0);
    const resize = () => instance.resize(element.clientWidth, element.clientHeight);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
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
        eventsRef.current.onBackStep();
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
    <div className="walkthrough" data-slot="walkthrough-session">
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
        }}
      />
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
        <button type="button" disabled={!stage} onClick={() => {
          setSourcesOpen(true);
          if (stage) events.onSourceOpened(template.tradition, stage.number);
        }}>
          Sources
        </button>
        <button type="button" onClick={() => setHelpOpen(true)}>Help</button>
        <button type="button" onClick={() => setPaused((value) => !value)}>{paused ? "Carry On" : "Pause"}</button>
      </div>
      <div className="walkthrough-move">
        <button type="button" disabled={stationIndex === 0} onClick={() => {
          runtime.current?.walkTo(stationIndex - 1);
          events.onBackStep();
        }}>
          Back
        </button>
        <button type="button" className="walkthrough-next" onClick={onwards}>
          {atHall ? (lastTradition ? "Questions" : "Next Tradition") : "Walk On"}
        </button>
      </div>
      {sourcesOpen && stage ? (
        <div className="walkthrough-dialog" role="dialog" aria-modal="true" aria-label="Sources Behind This Caption">
          <h2>Sources Behind This Caption</h2>
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
      {helpOpen ? (
        <div className="walkthrough-dialog" role="dialog" aria-modal="true" aria-label="Help">
          <h2>Help</h2>
          <p>Walk with W, A, S and D or the arrow keys. Drag to look around. Walk On takes you to the next station, and B or Back takes you back along the route. Follow the cloth.</p>
          <button type="button" onClick={() => setHelpOpen(false)}>Close</button>
        </div>
      ) : null}
    </div>
  );
}
