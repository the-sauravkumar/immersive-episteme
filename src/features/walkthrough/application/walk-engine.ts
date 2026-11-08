import type { RouteStation } from "../domain/route-plan";

export interface WalkEngineEvents {
  readonly onStationEntered: (station: RouteStation, index: number) => void;
  readonly onStationLeft: (station: RouteStation, index: number, activeMs: number, walkingMs: number, viewpointChanges: number) => void;
  readonly onWrongTurn: (station: RouteStation) => void;
  readonly onObjectDwell: (station: RouteStation, itemKey: string, seconds: number, nearestMetres: number) => void;
  readonly onPath: (x: number, z: number) => void;
  readonly onContextLost: () => void;
}

export interface WalkEngine {
  paused: boolean;
  readonly stationIndex: number;
  start(startIndex?: number): Promise<void>;
  setMove(forward: number, strafe: number): void;
  look(dx: number, dy: number): void;
  endLook(): void;
  walkTo(index: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

interface WalkTextile {
  readonly file: string;
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly label: RouteStation["textiles"][number]["label"];
}

export type WalkEngineFactory = (host: HTMLElement, stations: readonly RouteStation[], textiles: (station: RouteStation) => readonly WalkTextile[], events: WalkEngineEvents) => WalkEngine;
