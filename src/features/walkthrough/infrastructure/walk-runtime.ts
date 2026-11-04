import * as THREE from "three";
import type { Box, Vec3 } from "../domain/geometry";
import { NEXT_YARD_OFFSET } from "../domain/yard-plan";
import type { RouteStation } from "../domain/route-plan";
import { eyeOf, localZ, stationIndexAt, stepWalker, walkerAt, type WalkInput, type Walker } from "../domain/walk-state";
import { buildYard, YardKit, type BuiltYard } from "./build-yard";
import { addHorizon } from "./horizon";
import { MaterialLibrary } from "./material-library";
import { addSun, createRenderer, createRenderView, type RenderView } from "./render-view";

export interface WalkEvents {
  readonly onStationEntered: (station: RouteStation, index: number) => void;
  readonly onStationLeft: (station: RouteStation, index: number, seconds: number) => void;
  readonly onObjectDwell: (station: RouteStation, itemKey: string, seconds: number, nearestMetres: number) => void;
  readonly onPath: (x: number, z: number, walkedMetres: number) => void;
  readonly onLook: () => void;
  readonly onRouteEnd: () => void;
}

const NEAR_OBJECT_METRES = 3;
const STREAM_BEHIND = 1;
const STREAM_AHEAD = 1;

export class WalkRuntime {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly kit: YardKit;
  private readonly library: MaterialLibrary;
  private readonly yards = new Map<number, Promise<BuiltYard>>();
  private readonly built = new Map<number, BuiltYard>();
  private view: RenderView | null = null;
  private sky: THREE.Mesh | null = null;
  private sun: THREE.DirectionalLight | null = null;
  private walker: Walker = { x: 0, z: 0, yaw: 0, pitch: 0, walked: 0 };
  private input: { forward: number; strafe: number; lookX: number; lookY: number } = { forward: 0, strafe: 0, lookX: 0, lookY: 0 };
  private autoWalkTo: number | null = null;
  private current = -1;
  private enteredAt = 0;
  private frame = 0;
  private last = 0;
  private lastPathReport = 0;
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
    this.camera = new THREE.PerspectiveCamera(55, host.clientWidth / host.clientHeight, 0.15, 1200);
    this.library = new MaterialLibrary(this.renderer);
    this.kit = new YardKit(this.library);
  }

  async start(startIndex = 0): Promise<void> {
    this.sky = await this.library.sky(this.scene, this.renderer);
    addHorizon(this.scene, (await this.library.scan("earth")).colour);
    this.sun = addSun(this.scene, new THREE.Vector3(1, 0, -2));
    const station = this.stations[startIndex]!;
    this.walker = walkerAt(station.plan.standpoint.from, station.plan.standpoint.to, startIndex);
    this.view = createRenderView(this.renderer, this.scene, this.camera);
    await this.stream(startIndex);
    this.enter(startIndex);
    this.prepareFirstFrame();
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
        const material = node.material as THREE.MeshStandardMaterial;
        for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
          if (texture && !seen.has(texture)) {
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

  private async stream(index: number): Promise<void> {
    const wanted: number[] = [];
    for (let i = index - STREAM_BEHIND; i <= index + STREAM_AHEAD; i++) if (i >= 0 && i < this.stations.length) wanted.push(i);
    await Promise.all(wanted.map((i) => this.loadYard(i)));
    for (const [i, yard] of this.built) {
      if (!wanted.includes(i)) {
        this.scene.remove(yard.group);
        this.built.delete(i);
        this.yards.delete(i);
      }
    }
    if (this.sun) {
      const z = -index * NEXT_YARD_OFFSET - 2;
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
    const pending = buildYard(this.kit, station.plan, { clothBefore: station.clothBefore, clothAfter: station.clothAfter, wetAfter: station.wetAfter, textiles: this.textiles(station) }, station.id).then((yard) => {
      yard.group.position.z = -index * NEXT_YARD_OFFSET;
      this.scene.add(yard.group);
      this.built.set(index, yard);
      return yard;
    });
    this.yards.set(index, pending);
    return pending;
  }

  setMove(forward: number, strafe: number): void {
    this.input.forward = forward;
    this.input.strafe = strafe;
    if (forward !== 0 || strafe !== 0) this.autoWalkTo = null;
  }

  look(dx: number, dy: number): void {
    this.input.lookX += dx;
    this.input.lookY += dy;
    this.events.onLook();
  }

  walkTo(index: number): void {
    const target = this.stations[index];
    if (target) this.autoWalkTo = index;
  }

  get stationIndex(): number {
    return this.current;
  }

  private collidersHere(): readonly Box[] {
    return this.built.get(stationIndexAt(this.walker.z))?.colliders ?? [];
  }

  private enter(index: number): void {
    const now = performance.now();
    if (this.current >= 0) {
      this.flushDwell();
      this.events.onStationLeft(this.stations[this.current]!, this.current, (now - this.enteredAt) / 1000);
    }
    this.current = index;
    this.enteredAt = now;
    this.events.onStationEntered(this.stations[index]!, index);
    void this.stream(index);
    if (index === this.stations.length - 1) this.events.onRouteEnd();
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

  private autoInput(): { forward: number; strafe: number } {
    if (this.autoWalkTo === null) return this.input;
    const target = this.stations[this.autoWalkTo]!;
    const from: Vec3 = [target.plan.standpoint.from[0], 0, target.plan.standpoint.from[2] - this.autoWalkTo * NEXT_YARD_OFFSET];
    const lineX = 3 - (this.autoWalkTo >= this.current ? 2.4 : -2.4) * 0;
    const dz = from[2] - this.walker.z;
    const crossing = Math.abs(dz) > 8;
    const aimX = crossing ? lineX - 2.2 : from[0];
    const dx = aimX - this.walker.x;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.4) {
      this.autoWalkTo = null;
      return { forward: 0, strafe: 0 };
    }
    this.walker = { ...this.walker, yaw: Math.atan2(-dx, -dz) };
    return { forward: 1, strafe: 0 };
  }

  private applyCamera(): void {
    const eye = eyeOf(this.walker);
    this.camera.position.set(eye[0], eye[1], eye[2]);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.walker.pitch, this.walker.yaw, 0);
    this.sky?.position.copy(this.camera.position);
  }

  private update(): void {
    const now = performance.now();
    const seconds = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      const moving = this.autoInput();
      const input: WalkInput = { forward: moving.forward, strafe: moving.strafe, lookX: this.input.lookX, lookY: this.input.lookY };
      this.walker = stepWalker(this.walker, input, seconds, this.collidersHere(), this.stations.length - 1);
      this.input.lookX = 0;
      this.input.lookY = 0;
      const index = Math.min(this.stations.length - 1, stationIndexAt(this.walker.z));
      if (index !== this.current) this.enter(index);
      this.trackObjects(seconds);
      if (now - this.lastPathReport > 500) {
        this.lastPathReport = now;
        this.events.onPath(this.walker.x, this.walker.z, this.walker.walked);
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
    cancelAnimationFrame(this.frame);
    this.flushDwell();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
