/**
 * The museum's three.js scene graph, built from the scene model (never from hard-coded layout).
 *
 * Two layers:
 *  - Architecture, resident for the whole visit, with the gallery finish of DR-023 (one parameter
 *    set, resources.ts GALLERY_FINISH): walls, posts and lintels on a 25 mm shadow-gap skirting and
 *    running up into a 150 mm ceiling cove; plinths (chamfered) on a recessed toe; door openings
 *    with plaster reveals and a 20 mm flush edge; thresholds; and per room the floor and ceiling
 *    with that room's normalised light map. All unlit (the finish's light is baked), merged per zone
 *    and material, so the whole building is a few dozen draw calls.
 *  - Lettering, streamed per room (the manifest's streaming units): the panel and sign atlases,
 *    which are the dominant texture memory. A room's lettering is built when it enters the
 *    resident set (the visitor's room and its doorway neighbours, to `depth`) and disposed when it
 *    leaves; until then the room shows the same cards without lettering, so geometry never pops.
 */
import * as THREE from "three";

import { CATEGORY_SIGN_EM_FRACTION, DOOR_SIGN, doorSigns, panelTypeScale, type SceneDoorSign } from "@/features/immersive/placement";
import { PLAQUE_WORDS, plaqueText } from "@/features/immersive/plaque-text";
import { DIRECTORY, entranceDirectory, type DirectoryRow } from "@/features/immersive/wayfinding";
import type { SceneExhibit, SceneLabel, SceneModel, ScenePlane, SceneRoom } from "@/features/immersive/scene-model";
import type { Vec3 } from "@/features/spatial/compiler/types";

import { GeometryBuilder, addAtlasPlane, addBox, addChamferedBox, addPlane, ribbonGeometry } from "./geometry";
import { atlasTextures, buildLabelAtlas, drawNextItems, planLabelAtlas, type AtlasJob, type LabelAtlas, type LabelItem } from "./labels";
import { GALLERY_FINISH, bakeRoomLight, panelMaterial, plasterTint, plasterTintRgb, preToneMap, roomLightTexture, sceneValueFor, storedMean, wallWash, withRoomLight, type Materials } from "./resources";

export const PLINTH_CHAMFER = 0.006;
export const LINING_CHAMFER = 0.003;

export interface Pickable {
  mesh: THREE.Mesh;
  /** Element id per triangle (panels, plinths) or one id for the whole mesh (floors). */
  ownerOf(faceIndex: number): { kind: "exhibit" | "floor" | "wall" | "sign"; id: string } | null;
}

interface RoomLettering {
  meshes: THREE.Mesh[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
  geometries: THREE.BufferGeometry[];
}

export interface WorldStats {
  architectureTriangles: number;
  architectureMeshes: number;
  residentRooms: number;
  letteringTexels: number;
}

export class MuseumWorld {
  readonly root = new THREE.Group();
  private readonly architecture = new THREE.Group();
  private readonly lettering = new THREE.Group();
  private readonly overlays = new THREE.Group();
  private readonly blanks = new Map<string, THREE.Mesh>();
  private readonly resident = new Map<string, RoomLettering>();
  private readonly owned: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[]; textures: THREE.Texture[] } = { geometries: [], materials: [], textures: [] };
  readonly pickables: Pickable[] = [];
  private readonly letterPickables = new Map<string, Pickable[]>();
  private readonly exhibitsByRoom = new Map<string, SceneExhibit[]>();
  private readonly labelsByRoom = new Map<string, SceneLabel[]>();
  private highlightMesh: THREE.Mesh | null = null;
  private routeMesh: THREE.Mesh | null = null;
  stats: WorldStats = { architectureTriangles: 0, architectureMeshes: 0, residentRooms: 0, letteringTexels: 0 };

  private readonly doorSignsByRoom = new Map<string, SceneDoorSign[]>();
  /** The entrance directory rows (wayfinding.ts), by the room they hang in. */
  private readonly directoryByRoom = new Map<string, DirectoryRow[]>();
  readonly directoryRows: readonly DirectoryRow[];
  private readonly typeScale: ReturnType<typeof panelTypeScale>;
  /** The room whose lettering is being drawn across frames (stepLettering). */
  private job: { roomId: string; job: AtlasJob } | null = null;
  /** A drawn atlas whose pages are being uploaded, one per call, before it is shown. */
  private uploading: { roomId: string; atlas: LabelAtlas; next: number } | null = null;
  /** Exhibits marked visited (setVisited); their plates carry the "Visited" mark. */
  private visited = new Set<string>();
  /** The finish tints actually used (relative to the wall), for the probe and the record. */
  finish: { wallTint: number; shadow: number; plinth: number; cove: number; doorEdge: [number, number, number]; threshold: number } | null = null;
  /** Mean of every room's stored floor and ceiling light map (F4: one mean for all rooms). */
  readonly lightMeans: { roomId: string; kind: "floor" | "ceiling"; mean: number }[] = [];

  constructor(
    private readonly model: SceneModel,
    private readonly mats: Materials,
    private readonly anisotropy: number,
    private readonly describeDoor: (s: SceneDoorSign) => { kicker: string | null; title: string },
  ) {
    this.typeScale = panelTypeScale(model);
    const directory = entranceDirectory(model).directory;
    this.directoryRows = directory?.rows ?? [];
    if (directory) this.directoryByRoom.set(directory.roomId, [...directory.rows]);
    for (const d of doorSigns(model)) (this.doorSignsByRoom.get(d.roomId) ?? this.doorSignsByRoom.set(d.roomId, []).get(d.roomId)!).push(d);
    this.root.name = "museum";
    this.architecture.name = "architecture";
    this.lettering.name = "lettering";
    this.overlays.name = "overlays";
    this.root.add(this.architecture, this.lettering, this.overlays);
    for (const e of model.exhibits) (this.exhibitsByRoom.get(e.roomId) ?? this.exhibitsByRoom.set(e.roomId, []).get(e.roomId)!).push(e);
    for (const l of model.labels) (this.labelsByRoom.get(l.roomId) ?? this.labelsByRoom.set(l.roomId, []).get(l.roomId)!).push(l);
    this.buildArchitecture();
  }

  private addMesh(group: THREE.Group, geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string): THREE.Mesh | null {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
    this.owned.geometries.push(geo);
    this.stats.architectureTriangles += (geo.index?.count ?? 0) / 3;
    this.stats.architectureMeshes++;
    return m;
  }

  private buildArchitecture() {
    const H = this.model.rooms[0]?.height ?? 3.2;
    const F = GALLERY_FINISH;
    const top = H + F.cove.rise;
    const wallScene = sceneValueFor(F.wallSrgb);
    // Tints relative to the wall, divided by the wash at the surface's height so each detail renders
    // at its target value (F6, F7, F8, F5).
    const grey = (v: number): [number, number, number] => [v, v, v];
    const at = (y: number) => wallWash(y, H);
    const shadow = grey(plasterTint(F.shadowSrgb) / at(F.skirting.height / 2));
    const toe = grey(plasterTint(F.shadowSrgb) / at(F.plinthToe.height / 2));
    const plinth = grey(plasterTint(F.plinthSrgb) / at(0.7));
    const edgeRgb = plasterTintRgb(F.doorEdge);
    const edge = (y: number): [number, number, number] => [edgeRgb[0] / at(y), edgeRgb[1] / at(y), edgeRgb[2] / at(y)];
    const cove = grey(preToneMap(F.coveLinear) / wallScene / at(H));
    const threshold = grey(plasterTint(F.floorSrgb) / at(0));
    this.finish = { wallTint: 1, shadow: shadow[0], plinth: plinth[0], cove: cove[0], doorEdge: edgeRgb, threshold: threshold[0] };

    const zones = new Map<string, SceneRoom[]>();
    for (const r of this.model.rooms) (zones.get(r.zoneId ?? "none") ?? zones.set(r.zoneId ?? "none", []).get(r.zoneId ?? "none")!).push(r);
    const roomZone = new Map(this.model.rooms.map((r) => [r.id, r.zoneId ?? "none"]));
    const reach = (b: { min: Vec3; max: Vec3 }) => (b.max[1] >= H - 1e-6 ? top : b.max[1]);

    for (const [zoneId, rooms] of zones) {
      const walls = new GeometryBuilder();
      const plinths = new GeometryBuilder();
      const trims = new GeometryBuilder();
      const plinthOwners: string[] = [];
      for (const r of rooms) {
        for (const w of r.walls) {
          // F6: the wall stands on a 25 mm shadow gap recessed 15 mm on its room faces (both
          // horizontal axes for a post), and runs up into the cove slot.
          addBox(walls, { min: [w.min[0], F.skirting.height, w.min[2]], max: [w.max[0], reach(w), w.max[2]] }, { height: H }, { skipBottom: true });
          const post = w.part === "wall-post";
          const thinX = w.max[0] - w.min[0] <= w.max[2] - w.min[2];
          const dx = post || thinX ? F.skirting.depth : 0;
          const dz = post || !thinX ? F.skirting.depth : 0;
          walls.tint = shadow;
          addBox(walls, { min: [w.min[0] + dx, 0, w.min[2] + dz], max: [w.max[0] - dx, F.skirting.height, w.max[2] - dz] }, { height: H }, { skipBottom: true, skipTop: true });
          walls.tint = [1, 1, 1];
        }
        // F5: the 150 mm cove, a slot `rise` above the ceiling round the room's edge. Its top and
        // its inner lip (facing the wall) are the cove surface; the walls run up to its top.
        if (r.ceiling) {
          const [x0, , z0] = r.ceiling.min;
          const [x1, , z1] = r.ceiling.max;
          const c = F.cove.width;
          walls.tint = cove;
          const strip = (min: Vec3, max: Vec3) => addPlane(walls, { min, max, facing: "-y" }, { height: H });
          strip([x0, top, z0], [x1, top, z0 + c]);
          strip([x0, top, z1 - c], [x1, top, z1]);
          strip([x0, top, z0 + c], [x0 + c, top, z1 - c]);
          strip([x1 - c, top, z0 + c], [x1, top, z1 - c]);
          const lip = (min: Vec3, max: Vec3, facing: "+x" | "-x" | "+z" | "-z") => addPlane(walls, { min, max, facing }, { height: H });
          lip([x0 + c, H, z0 + c], [x1 - c, top, z0 + c], "-z");
          lip([x0 + c, H, z1 - c], [x1 - c, top, z1 - c], "+z");
          lip([x0 + c, H, z0 + c], [x0 + c, top, z1 - c], "-x");
          lip([x1 - c, H, z0 + c], [x1 - c, top, z1 - c], "+x");
          walls.tint = [1, 1, 1];
        }
      }
      for (const p of this.model.portals) {
        // A doorway is built once, with the zone of its first room.
        if (roomZone.get(p.connects[0]) !== zoneId) continue;
        if (p.lintel) addBox(walls, { min: p.lintel.min, max: [p.lintel.max[0], reach(p.lintel), p.lintel.max[2]] }, { height: H });
        // F7: plaster reveals with a 20 mm flush edge: a lining's faces towards the rooms are the
        // edge colour, its face into the opening (and the head's soffit) plaster.
        const roomAxis = p.axis === "z" ? 0 : 2;
        for (const l of p.linings) {
          const mid = (l.min[1] + l.max[1]) / 2;
          addBox(trims, l, { height: H }, { skipBottom: true, tintFor: (n) => (Math.abs(n[roomAxis]) > 0.5 ? edge(mid) : null) });
        }
        if (p.threshold) {
          trims.tint = threshold;
          addPlane(trims, p.threshold, { height: H });
          trims.tint = [1, 1, 1];
        }
      }
      for (const r of rooms) {
        for (const e of this.exhibitsByRoom.get(r.id) ?? []) {
          if (!e.plinth) continue;
          const before = plinths.triangles;
          // F8: a 30 mm toe recessed 20 mm under the plinth body.
          const t = F.plinthToe;
          const [bx0, by0, bz0] = e.plinth.min;
          const [bx1, by1, bz1] = e.plinth.max;
          plinths.tint = plinth;
          addChamferedBox(plinths, { min: [bx0, by0 + t.height, bz0], max: [bx1, by1, bz1] }, PLINTH_CHAMFER, { height: H });
          plinths.tint = toe;
          addBox(plinths, { min: [bx0 + t.inset, by0, bz0 + t.inset], max: [bx1 - t.inset, by0 + t.height, bz1 - t.inset] }, { height: H }, { skipBottom: true, skipTop: true });
          plinths.tint = [1, 1, 1];
          for (let i = before; i < plinths.triangles; i++) plinthOwners.push(e.id);
        }
      }
      const wm = this.addMesh(this.architecture, walls.build(`walls:${zoneId}`), this.mats.wall, `walls:${zoneId}`);
      if (wm) this.pickables.push({ mesh: wm, ownerOf: () => ({ kind: "wall", id: zoneId }) });
      const pm = this.addMesh(this.architecture, plinths.build(`plinths:${zoneId}`), this.mats.plinth, `plinths:${zoneId}`);
      if (pm) this.pickables.push({ mesh: pm, ownerOf: (f) => (plinthOwners[f] ? { kind: "exhibit", id: plinthOwners[f]! } : null) });
      this.addMesh(this.architecture, trims.build(`trims:${zoneId}`), this.mats.trim, `trims:${zoneId}`);
    }

    // Floors and ceilings (F4): one mesh each per room, with that room's light map normalised to
    // the one mean every room shares.
    const plinthBoxes = this.model.exhibits.flatMap((e) => (e.plinth ? [e.plinth] : []));
    for (const r of this.model.rooms) {
      const wallBoxes = r.walls;
      if (r.floor) {
        const rect = { minX: r.floor.min[0], maxX: r.floor.max[0], minZ: r.floor.min[2], maxZ: r.floor.max[2] };
        const bake = bakeRoomLight(rect, [...wallBoxes, ...plinthBoxes], { ...F.floorContact, sign: -1 });
        const light = roomLightTexture(bake, `light-floor:${r.id}`);
        const mat = withRoomLight(this.mats.floor, light);
        this.lightMeans.push({ roomId: r.id, kind: "floor", mean: storedMean(light) });
        this.owned.textures.push(light);
        this.owned.materials.push(mat);
        const g = new GeometryBuilder();
        addPlane(g, r.floor, { rect });
        const fm = this.addMesh(this.architecture, g.build(`floor:${r.id}`), mat, `floor:${r.id}`);
        if (fm) this.pickables.push({ mesh: fm, ownerOf: () => ({ kind: "floor", id: r.id }) });
      }
      if (r.ceiling) {
        const rect = { minX: r.ceiling.min[0], maxX: r.ceiling.max[0], minZ: r.ceiling.min[2], maxZ: r.ceiling.max[2] };
        const bake = bakeRoomLight(rect, wallBoxes, { ...F.ceilingCove, sign: 1 });
        const light = roomLightTexture(bake, `light-ceiling:${r.id}`);
        const mat = withRoomLight(this.mats.ceiling, light);
        this.lightMeans.push({ roomId: r.id, kind: "ceiling", mean: storedMean(light) });
        this.owned.textures.push(light);
        this.owned.materials.push(mat);
        const g = new GeometryBuilder();
        // The ceiling stops at the cove; its light map still spans the whole room.
        const c = F.cove.width;
        addPlane(g, { min: [rect.minX + c, H, rect.minZ + c], max: [rect.maxX - c, H, rect.maxZ - c], facing: "-y" }, { rect });
        this.addMesh(this.architecture, g.build(`ceiling:${r.id}`), mat, `ceiling:${r.id}`);
      }
      // Unlettered cards for the room (shown while its lettering is not resident).
      const blank = new GeometryBuilder();
      const owners: string[] = [];
      const full = { u0: 0, v0: 0, u1: 1, v1: 1 };
      for (const e of this.exhibitsByRoom.get(r.id) ?? []) {
        addAtlasPlane(blank, e.panel, full);
        owners.push(e.id, e.id);
      }
      for (const l of this.labelsByRoom.get(r.id) ?? []) {
        addAtlasPlane(blank, l.sign, full);
        owners.push(`sign:${l.id}`, `sign:${l.id}`);
      }
      for (const d of [...(this.doorSignsByRoom.get(r.id) ?? []), ...(this.directoryByRoom.get(r.id) ?? [])]) {
        addAtlasPlane(blank, d.sign, full);
        owners.push(`sign:${d.id}`, `sign:${d.id}`);
      }
      const bm = this.addMesh(this.architecture, blank.build(`cards:${r.id}`), this.mats.panelBlank, `cards:${r.id}`);
      if (bm) {
        bm.renderOrder = 0;
        this.blanks.set(r.id, bm);
        this.pickables.push({ mesh: bm, ownerOf: (f) => ownerAt(owners, f) });
      }
    }
  }

  /** Builds lettering for rooms entering `want` and disposes it for rooms leaving. Returns true if anything changed. */
  setResident(want: ReadonlySet<string>, budgetRooms = Infinity): boolean {
    let changed = false;
    for (const id of [...this.resident.keys()]) {
      if (want.has(id)) continue;
      this.disposeLettering(id);
      changed = true;
    }
    let built = 0;
    for (const id of [...want].sort()) {
      if (this.resident.has(id)) continue;
      if (built >= budgetRooms) break;
      this.buildLettering(id);
      built++;
      changed = true;
    }
    this.stats.residentRooms = this.resident.size;
    return changed;
  }

  /**
   * Marks exhibits as visited: their plates gain the quiet "Visited" mark (the same kind of marking
   * the 2D condition shows on visited links). Rebuilds the lettering of resident rooms whose marks
   * changed; other rooms pick the marks up when their lettering is next built. Returns true if any
   * resident lettering was rebuilt (the caller re-renders).
   */
  setVisited(exhibitIds: readonly string[]): boolean {
    const next = new Set(exhibitIds);
    const changedRooms = new Set<string>();
    for (const id of new Set([...next, ...this.visited])) {
      if (next.has(id) === this.visited.has(id)) continue;
      const e = this.exhibitById(id);
      if (e) changedRooms.add(e.roomId);
    }
    this.visited = next;
    if (this.job && changedRooms.has(this.job.roomId)) this.job = null;
    if (this.uploading && changedRooms.has(this.uploading.roomId)) {
      for (const t of this.uploading.atlas.pages) t.dispose();
      this.uploading = null;
    }
    let rebuilt = false;
    for (const roomId of changedRooms) {
      if (!this.resident.has(roomId)) continue;
      this.disposeLettering(roomId);
      this.buildLettering(roomId);
      rebuilt = true;
    }
    this.stats.residentRooms = this.resident.size;
    return rebuilt;
  }

  visitedIds(): string[] {
    return [...this.visited].sort();
  }

  private exhibitById(id: string): SceneExhibit | undefined {
    for (const list of this.exhibitsByRoom.values()) {
      const e = list.find((x) => x.id === id);
      if (e) return e;
    }
    return undefined;
  }

  /** Rooms in `want` whose lettering is not built yet. */
  pending(want: ReadonlySet<string>): number {
    let n = 0;
    for (const id of want) if (!this.resident.has(id)) n++;
    return n;
  }

  residentRoomIds(): string[] {
    return [...this.resident.keys()].sort();
  }

  private letteringItems(roomId: string): LabelItem[] {
    const exhibits = this.exhibitsByRoom.get(roomId) ?? [];
    const labels = this.labelsByRoom.get(roomId) ?? [];
    const size = (p: ScenePlane) => {
      const d = [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]];
      return { w: Math.max(d[0]!, d[2]!), h: d[1]! };
    };
    const doors = this.doorSignsByRoom.get(roomId) ?? [];
    const ts = this.typeScale;
    return [
      ...exhibits.map((e) => {
        const s = size(e.panel);
        const d = plaqueText(e, this.model);
        const mark = this.visited.has(e.id) ? PLAQUE_WORDS.visited : null;
        return { id: e.id, kind: "panel" as const, widthM: s.w, heightM: s.h, kicker: d.kicker, title: e.label, footer: d.footer, mark, em: { kicker: ts.kickerEm, title: ts.titleEm, footer: ts.footerEm } };
      }),
      ...labels.map((l) => {
        const s = size(l.sign);
        const em = s.h * CATEGORY_SIGN_EM_FRACTION;
        return { id: `sign:${l.id}`, kind: "sign" as const, widthM: s.w, heightM: s.h, kicker: null, title: l.label, footer: null, em: { kicker: em, title: em, footer: em } };
      }),
      ...(this.directoryByRoom.get(roomId) ?? []).map((d) => {
        const s = size(d.sign);
        return { id: `sign:${d.id}`, kind: "directory" as const, widthM: s.w, heightM: s.h, kicker: null, title: d.title, footer: d.direction, em: { kicker: DIRECTORY.lineEm, title: DIRECTORY.titleEm, footer: DIRECTORY.lineEm } };
      }),
      ...doors.map((d) => {
        const s = size(d.sign);
        const t = this.describeDoor(d);
        return { id: `sign:${d.id}`, kind: "door" as const, widthM: s.w, heightM: s.h, kicker: t.kicker, title: t.title, footer: null, em: { kicker: DOOR_SIGN.kickerEm, title: DOOR_SIGN.titleEm, footer: DOOR_SIGN.kickerEm } };
      }),
    ];
  }

  /** Builds a room's lettering at once (the start rooms before entry, and visited-mark updates). */
  private buildLettering(roomId: string) {
    const items = this.letteringItems(roomId);
    this.installLettering(roomId, items.length > 0 ? buildLabelAtlas(items, this.anisotropy, roomId) : null);
  }

  /**
   * Streams lettering in time slices (C4): rooms leaving `want` are disposed at once; the next
   * missing room is drawn item by item, at most `budgetMs` of drawing per call; its pages are then
   * uploaded one per call through `upload` (the renderer's initTexture), and the room is shown
   * once all are on the GPU. Returns true if what is drawn changed.
   */
  stepLettering(want: ReadonlySet<string>, budgetMs: number, upload?: (t: THREE.Texture) => void): boolean {
    let changed = false;
    for (const id of [...this.resident.keys()]) {
      if (want.has(id)) continue;
      this.disposeLettering(id);
      changed = true;
    }
    if (this.job && !want.has(this.job.roomId)) this.job = null;
    if (this.uploading && !want.has(this.uploading.roomId)) {
      for (const t of this.uploading.atlas.pages) t.dispose();
      this.uploading = null;
    }
    if (this.uploading) {
      const u = this.uploading;
      if (upload && u.next < u.atlas.pages.length) upload(u.atlas.pages[u.next]!);
      u.next++;
      if (!upload || u.next >= u.atlas.pages.length) {
        this.uploading = null;
        this.installLettering(u.roomId, u.atlas);
        changed = true;
      }
      this.stats.residentRooms = this.resident.size;
      return changed;
    }
    if (!this.job) {
      const next = [...want].sort().find((id) => !this.resident.has(id));
      if (next) {
        const items = this.letteringItems(next);
        if (items.length === 0) {
          this.installLettering(next, null);
          changed = true;
        } else this.job = { roomId: next, job: planLabelAtlas(items, next) };
      }
    }
    if (this.job && drawNextItems(this.job.job, budgetMs)) {
      const { roomId, job } = this.job;
      this.job = null;
      const atlas = atlasTextures(job, this.anisotropy);
      if (upload) this.uploading = { roomId, atlas, next: 0 };
      else {
        this.installLettering(roomId, atlas);
        changed = true;
      }
    }
    this.stats.residentRooms = this.resident.size;
    return changed;
  }

  private installLettering(roomId: string, atlas: LabelAtlas | null) {
    const exhibits = this.exhibitsByRoom.get(roomId) ?? [];
    const labels = this.labelsByRoom.get(roomId) ?? [];
    const doors = [...(this.doorSignsByRoom.get(roomId) ?? []), ...(this.directoryByRoom.get(roomId) ?? [])];
    const entry: RoomLettering = { meshes: [], materials: [], textures: [], geometries: [] };
    const pick: Pickable[] = [];
    if (atlas) {
      this.stats.letteringTexels += atlas.texels;
      atlas.pages.forEach((tex, page) => {
        const g = new GeometryBuilder();
        const owners: string[] = [];
        for (const e of exhibits) {
          const r = atlas.rects.get(e.id);
          if (!r || r.page !== page) continue;
          addAtlasPlane(g, e.panel, r);
          owners.push(e.id, e.id);
        }
        for (const l of [...labels.map((x) => ({ id: x.id, sign: x.sign })), ...doors.map((x) => ({ id: x.id, sign: x.sign }))]) {
          const r = atlas.rects.get(`sign:${l.id}`);
          if (!r || r.page !== page) continue;
          addAtlasPlane(g, l.sign, r);
          owners.push(`sign:${l.id}`, `sign:${l.id}`);
        }
        const geo = g.build(`lettering:${roomId}:${page}`);
        if (!geo) {
          tex.dispose();
          this.stats.letteringTexels -= (tex.image as { width: number; height: number }).width * (tex.image as { width: number; height: number }).height;
          return;
        }
        const mat = panelMaterial();
        mat.map = tex;
        mat.name = `panel:${roomId}:${page}`;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `lettering:${roomId}:${page}`;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.lettering.add(mesh);
        entry.meshes.push(mesh);
        entry.materials.push(mat);
        entry.textures.push(tex);
        entry.geometries.push(geo);
        pick.push({ mesh, ownerOf: (f) => ownerAt(owners, f) });
      });
    }
    this.resident.set(roomId, entry);
    this.letterPickables.set(roomId, pick);
    const blank = this.blanks.get(roomId);
    if (blank) blank.visible = false;
  }

  private disposeLettering(roomId: string) {
    const entry = this.resident.get(roomId);
    if (!entry) return;
    for (const m of entry.meshes) this.lettering.remove(m);
    for (const g of entry.geometries) g.dispose();
    for (const m of entry.materials) m.dispose();
    for (const t of entry.textures) {
      t.dispose();
      this.stats.letteringTexels -= (t.image as { width: number; height: number }).width * (t.image as { width: number; height: number }).height;
    }
    this.resident.delete(roomId);
    this.letterPickables.delete(roomId);
    const blank = this.blanks.get(roomId);
    if (blank) blank.visible = true;
  }

  /** Everything the pointer can hit, nearest first decides (walls occlude exhibits). */
  allPickables(): Pickable[] {
    const out = this.pickables.filter((p) => p.mesh.visible);
    for (const list of this.letterPickables.values()) out.push(...list);
    return out;
  }

  /** Selection / hover frame around an exhibit's panel (a ring outside the panel, never over it). */
  setHighlight(exhibit: SceneExhibit | null, strong: boolean) {
    if (this.highlightMesh) {
      this.overlays.remove(this.highlightMesh);
      this.highlightMesh.geometry.dispose();
      this.highlightMesh = null;
    }
    if (!exhibit) return;
    const p = exhibit.panel;
    const gap = 0.012;
    const bar = strong ? 0.022 : 0.012;
    const g = new GeometryBuilder();
    const along = p.facing === "+x" || p.facing === "-x" ? 2 : 0;
    const lo = p.min[along]!;
    const hi = p.max[along]!;
    const y0 = p.min[1];
    const y1 = p.max[1];
    const strip = (a0: number, a1: number, b0: number, b1: number) => {
      const min = [...p.min] as [number, number, number];
      const max = [...p.max] as [number, number, number];
      min[along] = a0;
      max[along] = a1;
      min[1] = b0;
      max[1] = b1;
      addAtlasPlane(g, { min, max, facing: p.facing }, { u0: 0, v0: 0, u1: 1, v1: 1 });
    };
    strip(lo - gap - bar, hi + gap + bar, y1 + gap, y1 + gap + bar);
    strip(lo - gap - bar, hi + gap + bar, y0 - gap - bar, y0 - gap);
    strip(lo - gap - bar, lo - gap, y0 - gap, y1 + gap);
    strip(hi + gap, hi + gap + bar, y0 - gap, y1 + gap);
    const geo = g.build("highlight");
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, this.mats.highlight);
    mesh.name = "highlight";
    mesh.renderOrder = 1;
    this.overlays.add(mesh);
    this.highlightMesh = mesh;
  }

  /** The active route on the floor (sequence path, causal progression or comparison route). */
  setRoute(points: readonly { x: number; z: number }[] | null) {
    if (this.routeMesh) {
      this.overlays.remove(this.routeMesh);
      this.routeMesh.geometry.dispose();
      this.routeMesh = null;
    }
    if (!points || points.length < 2) return;
    const geo = ribbonGeometry(points, 0.1, 0.004);
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, this.mats.route);
    mesh.name = "route";
    mesh.renderOrder = 1;
    this.overlays.add(mesh);
    this.routeMesh = mesh;
  }

  /**
   * Puts one highlight frame and one route ribbon in the scene so `compileAsync` compiles their
   * programs before entry (no shader compile after the visitor is inside: C4). Removed afterwards.
   */
  precompileHighlightAndRoute() {
    const e = this.model.exhibits[0];
    if (e) this.setHighlight(e, true);
    this.setRoute([
      { x: this.model.spawn.x, z: this.model.spawn.z },
      { x: this.model.spawn.x + 0.5, z: this.model.spawn.z },
    ]);
  }

  clearPrecompileHelpers() {
    this.setHighlight(null, false);
    this.setRoute(null);
  }

  dispose() {
    for (const t of this.uploading?.atlas.pages ?? []) t.dispose();
    this.uploading = null;
    this.job = null;
    for (const id of [...this.resident.keys()]) this.disposeLettering(id);
    this.setHighlight(null, false);
    this.setRoute(null);
    for (const g of this.owned.geometries) g.dispose();
    for (const m of this.owned.materials) m.dispose();
    for (const t of this.owned.textures) t.dispose();
    this.root.clear();
  }
}

function ownerAt(owners: readonly string[], face: number): { kind: "exhibit" | "sign"; id: string } | null {
  const id = owners[face];
  if (!id) return null;
  return id.startsWith("sign:") ? { kind: "sign", id: id.slice(5) } : { kind: "exhibit", id };
}
