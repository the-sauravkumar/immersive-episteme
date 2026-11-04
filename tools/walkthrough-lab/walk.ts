import ajrakh from "../../content/study/ajrakh.template.json";
import { clothStatePath } from "@/features/process/domain/asset-catalogue";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { buildRoute, type RouteStation } from "@/features/walkthrough/domain/route-plan";
import { WalkRuntime } from "@/features/walkthrough/infrastructure/walk-runtime";

const route = buildRoute(ajrakh as StageTemplate, clothStatePath);
await Promise.all(["800 40px Eczar", "700 40px Eczar", "600 40px Eczar", "600 40px Mukta"].map((font) => document.fonts.load(font)));
const host = document.createElement("div");
host.style.cssText = "position:fixed;inset:0";
document.body.appendChild(host);
const log: { event: string; station: number; at: number; detail?: unknown }[] = [];
const texturesFor = (station: RouteStation) => station.textiles.map((textile) => ({ file: textile.product.file, name: textile.product.id, x: textile.x, z: textile.z, width: textile.width, height: textile.height, label: textile.label }));
const runtime = new WalkRuntime(host, route, texturesFor, {
  onStationEntered(_station, index) {
    log.push({ event: "entered", station: index, at: performance.now() });
  },
  onStationLeft(_station, index, activeMs, walkingMs, viewpoints) {
    log.push({ event: "left", station: index, at: performance.now(), detail: { activeMs, walkingMs, viewpoints } });
  },
  onObjectDwell() {},
  onContextLost() {
    log.push({ event: "contextLost", station: runtime.stationIndex, at: performance.now() });
  },
  onPath() {},
  onWrongTurn(station) {
    log.push({ event: "wrongTurn", station: route.indexOf(station), at: performance.now() });
  },
});
const started = performance.now();
await runtime.start(0);
const frames: number[] = [];
let last = performance.now();
const watch = () => {
  const now = performance.now();
  frames.push(now - last);
  last = now;
  requestAnimationFrame(watch);
};
requestAnimationFrame(watch);
const win = window as unknown as Record<string, unknown>;
win.runtime = runtime;
win.walkLog = log;
win.frames = frames;
win.stations = route.length;
win.loadSeconds = (performance.now() - started) / 1000;
win.READY = true;
