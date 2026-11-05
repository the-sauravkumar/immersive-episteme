import * as THREE from "three";
import type { Box } from "../domain/geometry";
import { NEXT_YARD_OFFSET } from "../domain/yard-plan";
import type { RouteStation } from "../domain/route-plan";
import { easeYaw, eyeOf, localZ, moveTowards, nearestWaypoint, stationIndexAt, steerAlong, stepWalker, turnBetween, walkerAt, worldZ, type WalkInput, type WalkTarget, type Walker } from "../domain/walk-state";
import { buildYard, releaseYard, YardKit, type BuiltYard } from "./build-yard";
import { addHorizon } from "./horizon";
import { setLiquidTime } from "./substance-materials";
import { MaterialLibrary, texturesOf } from "./material-library";
import { addSun, CAMERA_NEAR_METRES, createRenderer, createRenderView, type RenderView } from "./render-view";
import { SceneWarmup } from "./scene-warmup";
import { prepareFillPieces } from "./substance-fill";

export interface WalkEvents {
  readonly onStationEntered: (station: RouteStation, index: number) => void;
  readonly onStationLeft: (station: RouteStation, index: number, activeMs: number, walkingMs: number, viewpointChanges: number) => void;
  readonly onWrongTurn: (station: RouteStation) => void;
  readonly onObjectDwell: (station: RouteStation, itemKey: string, seconds: number, nearestMetres: number) => void;
  readonly onPath: (x: number, z: number) => void;
  readonly onContextLost: () => void;
}

const NEAR_OBJECT_METRES = 3;
const WRONG_TURN_METRES = 6;
const STREAM_BEHIND = 1;
const STREAM_AHEAD = 1;
const STREAM_RETRY_MS = 3000;
const LONGEST_COUNTED_FRAME_SECONDS = 2;

export class WalkRuntime {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly kit: YardKit;
  private readonly library: MaterialLibrary;
  private readonly yards = new Map<number, Promise<BuiltYard>>();
  private readonly built = new Map<number, BuiltYard>();
  private readonly warmup: SceneWarmup;
  private view: RenderView | null = null;
  private sky: THREE.Mesh | null = null;
  private hills: THREE.Object3D | null = null;
  private sun: THREE.DirectionalLight | null = null;
  private walker: Walker = { x: 0, z: 0, yaw: 0, pitch: 0, walked: 0 };
  private input: { forward: number; strafe: number; lookX: number; lookY: number } = { forward: 0, strafe: 0, lookX: 0, lookY: 0 };
  private autoTarget: WalkTarget | null = null;
  private autoDirection: 1 | -1 = 1;
  private autoGoal = 0;
  private autoArriving = false;
  private autoHeading: number | null = null;
  private autoPitch = 0;
  private current = -1;
  private streamCentre = 0;
  private disposed = false;
  private readonly contextLost = () => this.events.onContextLost();
  private frame = 0;
  private last = 0;
  private lastPathReport = 0;
  private lookedThisDrag = false;
  private viewpointChanges = 0;
  private walkingMs = 0;
  private activeMs = 0;
  private furthestLocalZ = Number.POSITIVE_INFINITY;
  private turnedBack = false;
  private readonly dwell = new Map<string, { seconds: number; nearest: number }>();
  paused = false;

  constructor(
    host: HTMLElement,
    private readonly stations: readonly RouteStation[],
    private readonly textiles: (station: RouteStation) => readonly { file: string; name: string; x: number; z: number; width: number; height: number; label: RouteStation["textiles"][number]["label"] }[],
    private readonly events: WalkEvents,
  ) {
    this.renderer = createRenderer(host, host.clientWidth, host.clientHeight);
    this.scene.fog = new THREE.Fog(0xdfe4e6, 60, 420);
    this.camera = new THREE.PerspectiveCamera(55, host.clientWidth / host.clientHeight, CAMERA_NEAR_METRES, 1200);
    this.library = new MaterialLibrary(this.renderer);
    this.kit = new YardKit(this.library);
    this.warmup = new SceneWarmup(this.renderer, this.scene, this.camera, this.library.pacer, () => this.disposed);
    this.renderer.domElement.addEventListener("webglcontextlost", this.contextLost);
  }

  async start(startIndex = 0): Promise<void> {
    this.sky = await this.library.sky(this.scene, this.renderer);
    if (this.disposed) return;
    const earth = await this.library.scan("earth");
    if (this.disposed) return;
    this.hills = addHorizon(this.scene, earth.colour);
    this.sun = addSun(this.scene, new THREE.Vector3(1, 0, -2));
    const station = this.stations[startIndex]!;
    this.walker = walkerAt(station.plan.standpoint.from, station.plan.standpoint.to, startIndex);
    this.view = createRenderView(this.renderer, this.scene, this.camera);
    await prepareFillPieces(this.library, this.stations.flatMap((each) => each.plan.items.flatMap((placed) => placed.looks)));
    if (this.disposed) return;
    await this.stream(startIndex);
    if (this.disposed) return;
    this.enter(startIndex);
    this.prepareFirstFrame();
    this.library.pacer.beginWalking();
    this.last = performance.now();
    const tick = () => {
      this.frame = requestAnimationFrame(tick);
      this.update();
    };
    tick();
  }

  private prepareFirstFrame(): void {
    this.renderer.compile(this.scene, this.camera);
    const seen = new Set<THREE.Texture>();
    const restore: [THREE.Object3D, boolean][] = [];
    this.scene.traverse((node) => {
      if (node instanceof THREE.Mesh || node instanceof THREE.InstancedMesh) {
        restore.push([node, node.frustumCulled]);
        node.frustumCulled = false;
        for (const texture of texturesOf(node.material as THREE.Material)) {
          if (!seen.has(texture)) {
            seen.add(texture);
            this.renderer.initTexture(texture);
          }
        }
      }
    });
    this.applyCamera();
    this.view!.render();
    for (const [node, culled] of restore) node.frustumCulled = culled;
  }

  private wantedAround(index: number): number[] {
    const wanted: number[] = [];
    for (let i = index - STREAM_BEHIND; i <= index + STREAM_AHEAD; i++) if (i >= 0 && i < this.stations.length) wanted.push(i);
    return wanted;
  }

  private async stream(index: number): Promise<void> {
    this.streamCentre = index;
    await Promise.all(this.wantedAround(index).map((i) => this.loadYard(i)));
    if (this.disposed) return;
    const wanted = this.wantedAround(this.streamCentre);
    for (const [i, yard] of this.built) {
      if (!wanted.includes(i)) {
        this.scene.remove(yard.group);
        releaseYard(this.kit, yard.group);
        this.warmup.release(yard.group);
        this.built.delete(i);
        this.yards.delete(i);
      }
    }
    if (this.sun) {
      const z = -this.streamCentre * NEXT_YARD_OFFSET - 2;
      this.sun.position.set(-29, 24, z + 26);
      this.sun.target.position.set(1, 0, z);
      this.sun.target.updateMatrixWorld();
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  private loadYard(index: number): Promise<BuiltYard> {
    const known = this.yards.get(index);
    if (known) return known;
    const station = this.stations[index]!;
    const pending = buildYard(this.kit, station.plan, { clothBefore: station.clothBefore, clothAfter: station.clothAfter, wetAfter: station.wetAfter, textiles: this.textiles(station) }, station.id).then(async (yard) => {
      yard.group.position.z = -index * NEXT_YARD_OFFSET;
      await this.warmup.ready(yard.group);
      if (this.disposed) return yard;
      this.scene.add(yard.group);
      this.built.set(index, yard);
      return yard;
    });
    this.yards.set(index, pending);
    pending.catch(() => this.yards.delete(index));
    return pending;
  }

  setMove(forward: number, strafe: number): void {
    this.input.forward = forward;
    this.input.strafe = strafe;
    if (forward !== 0 || strafe !== 0) {
      this.autoTarget = null;
      this.autoArriving = false;
      this.autoHeading = null;
    }
  }

  endLook(): void {
    if (this.lookedThisDrag) this.viewpointChanges++;
    this.lookedThisDrag = false;
  }

  look(dx: number, dy: number): void {
    this.input.lookX += dx;
    this.input.lookY += dy;
    this.lookedThisDrag = true;
  }

  walkTo(index: number): void {
    if (this.current < 0 || !this.stations[index] || index === this.current) return;
    this.autoDirection = index > this.current ? 1 : -1;
    this.autoGoal = index;
    this.autoPitch = 0;
    const line = this.stations[this.current]!.plan.walkLine;
    const waypoint = nearestWaypoint(this.walker, line, this.current) + this.autoDirection;
    if (line[waypoint]) {
      this.autoTarget = { station: this.current, waypoint };
      this.autoArriving = false;
      return;
    }
    const station = this.current + this.autoDirection;
    this.autoTarget = { station, waypoint: this.autoDirection === 1 ? 0 : this.stations[station]!.plan.walkLine.length - 1 };
    this.autoArriving = this.autoDirection === 1 && station === index;
  }

  get stationIndex(): number {
    return this.current;
  }

  private collidersHere(): readonly Box[] {
    return this.built.get(stationIndexAt(this.walker.z))?.colliders ?? [];
  }

  private enter(index: number): void {
    if (this.current >= 0) {
      this.flushDwell();
      this.events.onStationLeft(this.stations[this.current]!, this.current, Math.round(this.activeMs), Math.round(this.walkingMs), this.viewpointChanges);
    }
    this.current = index;
    this.activeMs = 0;
    this.walkingMs = 0;
    this.viewpointChanges = 0;
    this.furthestLocalZ = Number.POSITIVE_INFINITY;
    this.turnedBack = false;
    this.events.onStationEntered(this.stations[index]!, index);
    void this.streamUntilLoaded(index);
  }

  private async streamUntilLoaded(index: number): Promise<void> {
    try {
      await this.stream(index);
    } catch {
      setTimeout(() => {
        if (!this.disposed) void this.streamUntilLoaded(this.streamCentre);
      }, STREAM_RETRY_MS);
    }
  }

  private flushDwell(): void {
    const station = this.stations[this.current];
    if (!station) return;
    for (const [key, record] of this.dwell) this.events.onObjectDwell(station, key, record.seconds, record.nearest);
    this.dwell.clear();
  }

  private trackObjects(seconds: number): void {
    const station = this.stations[this.current];
    if (!station) return;
    const z = localZ(this.walker.z, this.current);
    for (const placed of station.plan.items) {
      const distance = Math.hypot(this.walker.x - placed.x, z - placed.z);
      if (distance > NEAR_OBJECT_METRES) continue;
      const record = this.dwell.get(placed.item.key) ?? { seconds: 0, nearest: distance };
      record.seconds += seconds;
      record.nearest = Math.min(record.nearest, distance);
      this.dwell.set(placed.item.key, record);
    }
  }

  private arrive(station: number): void {
    const plan = this.stations[station]!.plan;
    const facing = walkerAt(plan.standpoint.from, plan.standpoint.to, station);
    this.autoHeading = facing.yaw;
    this.autoPitch = facing.pitch;
    this.autoTarget = null;
    this.autoArriving = false;
    this.furthestLocalZ = Number.POSITIVE_INFINITY;
  }

  private autoInput(): { forward: number; strafe: number } {
    if (!this.autoTarget) return this.input;
    const line = this.stations[this.autoTarget.station]!.plan.walkLine;
    if (this.autoArriving) {
      const point = line[0]!;
      if (Math.hypot(point[0] - this.walker.x, worldZ(point[1], this.autoTarget.station) - this.walker.z) < 0.4) {
        this.arrive(this.autoTarget.station);
        return { forward: 0, strafe: 0 };
      }
    }
    const steered = steerAlong(this.walker, line, this.autoTarget, this.autoDirection);
    if (steered.target && steered.heading !== null) {
      this.autoTarget = steered.target;
      this.autoHeading = steered.heading;
      return moveTowards(steered.heading, this.walker.yaw);
    }
    const finished = this.autoTarget.station;
    if (this.autoDirection === -1 && finished === this.autoGoal) {
      this.arrive(finished);
      return { forward: 0, strafe: 0 };
    }
    const nextStation = finished + this.autoDirection;
    const nextLine = this.stations[nextStation]!.plan.walkLine;
    if (this.autoDirection === 1 && nextStation === this.autoGoal) {
      this.autoArriving = true;
      this.autoTarget = { station: nextStation, waypoint: 0 };
      return { forward: 0, strafe: 0 };
    }
    this.autoTarget = { station: nextStation, waypoint: this.autoDirection === 1 ? 0 : nextLine.length - 1 };
    return { forward: 0, strafe: 0 };
  }

  private watchForWrongTurn(): void {
    const here = localZ(this.walker.z, this.current);
    if (this.autoTarget) {
      this.furthestLocalZ = here;
      return;
    }
    this.furthestLocalZ = Math.min(this.furthestLocalZ, here);
    if (this.turnedBack) {
      if (here <= this.furthestLocalZ + 1) this.turnedBack = false;
      return;
    }
    if (here > this.furthestLocalZ + WRONG_TURN_METRES) {
      this.turnedBack = true;
      this.events.onWrongTurn(this.stations[this.current]!);
    }
  }

  private applyCamera(): void {
    const eye = eyeOf(this.walker);
    this.camera.position.set(eye[0], eye[1], eye[2]);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.walker.pitch, this.walker.yaw, 0);
    this.sky?.position.copy(this.camera.position);
    this.hills?.position.set(this.camera.position.x, 0, this.camera.position.z);
  }

  private update(): void {
    const now = performance.now();
    setLiquidTime(now / 1000);
    const elapsed = (now - this.last) / 1000;
    const seconds = Math.min(0.1, elapsed);
    const counted = Math.min(LONGEST_COUNTED_FRAME_SECONDS, elapsed);
    this.last = now;
    if (!this.paused) {
      const moving = this.autoInput();
      const input: WalkInput = { forward: moving.forward, strafe: moving.strafe, lookX: this.input.lookX, lookY: this.input.lookY };
      const from = this.walker;
      this.walker = stepWalker(this.walker, input, seconds, this.collidersHere(), this.stations.length - 1);
      if (this.autoHeading !== null) {
        const yaw = easeYaw(this.walker.yaw, this.autoHeading, seconds);
        const pitch = this.walker.pitch + (this.autoPitch - this.walker.pitch) * Math.min(1, seconds * 2);
        this.walker = { ...this.walker, yaw, pitch };
        if (!this.autoTarget && Math.abs(turnBetween(yaw, this.autoHeading)) < 0.002) this.autoHeading = null;
      }
      const moved = this.walker.x !== from.x || this.walker.z !== from.z;
      this.input.lookX = 0;
      this.input.lookY = 0;
      const index = Math.min(this.stations.length - 1, stationIndexAt(this.walker.z));
      if (index !== this.current) this.enter(index);
      this.activeMs += counted * 1000;
      if (moved) this.walkingMs += counted * 1000;
      this.watchForWrongTurn();
      this.trackObjects(counted);
      if (now - this.lastPathReport > 500) {
        this.lastPathReport = now;
        this.events.onPath(this.walker.x, this.walker.z);
      }
    }
    this.applyCamera();
    this.view!.render();
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.view?.resize(width, height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    if (this.current >= 0) {
      this.flushDwell();
      this.events.onStationLeft(this.stations[this.current]!, this.current, Math.round(this.activeMs), Math.round(this.walkingMs), this.viewpointChanges);
    }
    this.renderer.domElement.removeEventListener("webglcontextlost", this.contextLost);
    this.library.close();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
