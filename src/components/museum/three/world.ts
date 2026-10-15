/**
 * The museum's three.js scene graph, built from the scene model (never from hard-coded layout).
 *
 * Two layers:
 *  - Architecture, resident for the whole visit: walls, posts and lintels (wall material), plinths
 *    (chamfered, instanced as merged boxes), door linings and thresholds (trim), and per room the
 *    floor and ceiling with that room's baked AO. Merged per zone and material, so the whole
 *    building is a few dozen draw calls and a few hundred kilobytes of geometry.
 *  - Lettering, streamed per room (the manifest's streaming units): the panel and sign atlases,
 *    which are the dominant texture memory. A room's lettering is built when it enters the
 *    resident set (the visitor's room and its doorway neighbours, to `depth`) and disposed when it
 *    leaves; until then the room shows the same cards without lettering, so geometry never pops.
 */
import * as THREE from "three";

import { CATEGORY_SIGN_EM_FRACTION, DOOR_SIGN, doorSigns, panelTypeScale, type SceneDoorSign } from "@/features/immersive/placement";
import type { SceneExhibit, SceneLabel, SceneModel, ScenePlane, SceneRoom } from "@/features/immersive/scene-model";

import { GeometryBuilder, addAtlasPlane, addBox, addChamferedBox, addPlane, ribbonGeometry } from "./geometry";
import { buildLabelAtlas, type LabelItem } from "./labels";
import { bakeRoomAo, panelMaterial, withRoomAo, type Materials } from "./resources";

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
  private readonly typeScale: ReturnType<typeof panelTypeScale>;

  constructor(
    private readonly model: SceneModel,
    private readonly mats: Materials,
    private readonly anisotropy: number,
    private readonly describe: (e: SceneExhibit) => { kicker: string | null; footer: string | null },
    private readonly describeDoor: (s: SceneDoorSign) => { kicker: string | null; title: string },
  ) {
    this.typeScale = panelTypeScale(model);
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
    const zones = new Map<string, SceneRoom[]>();
    for (const r of this.model.rooms) (zones.get(r.zoneId ?? "none") ?? zones.set(r.zoneId ?? "none", []).get(r.zoneId ?? "none")!).push(r);
    const roomZone = new Map(this.model.rooms.map((r) => [r.id, r.zoneId ?? "none"]));

    for (const [zoneId, rooms] of zones) {
      const walls = new GeometryBuilder();
      const plinths = new GeometryBuilder();
      const trims = new GeometryBuilder();
      const plinthOwners: string[] = [];
      for (const r of rooms) for (const w of r.walls) addBox(walls, w, { height: H }, { skipBottom: true });
      for (const p of this.model.portals) {
        // A doorway is built once, with the zone of its first room.
        if (roomZone.get(p.connects[0]) !== zoneId) continue;
        if (p.lintel) addBox(walls, p.lintel, { height: H });
        for (const l of p.linings) addChamferedBox(trims, l, LINING_CHAMFER, { height: H });
        if (p.threshold) addPlane(trims, p.threshold, { height: H });
      }
      for (const r of rooms) {
        for (const e of this.exhibitsByRoom.get(r.id) ?? []) {
          if (!e.plinth) continue;
          const before = plinths.triangles;
          addChamferedBox(plinths, e.plinth, PLINTH_CHAMFER, { height: H });
          for (let i = before; i < plinths.triangles; i++) plinthOwners.push(e.id);
        }
      }
      const wm = this.addMesh(this.architecture, walls.build(`walls:${zoneId}`), this.mats.wall, `walls:${zoneId}`);
      if (wm) this.pickables.push({ mesh: wm, ownerOf: () => ({ kind: "wall", id: zoneId }) });
      const pm = this.addMesh(this.architecture, plinths.build(`plinths:${zoneId}`), this.mats.plinth, `plinths:${zoneId}`);
      if (pm) this.pickables.push({ mesh: pm, ownerOf: (f) => (plinthOwners[f] ? { kind: "exhibit", id: plinthOwners[f]! } : null) });
      this.addMesh(this.architecture, trims.build(`trims:${zoneId}`), this.mats.trim, `trims:${zoneId}`);
    }

    // Floors and ceilings: one mesh each per room with that room's baked AO.
    const plinthBoxes = this.model.exhibits.flatMap((e) => (e.plinth ? [e.plinth] : []));
    for (const r of this.model.rooms) {
      const wallBoxes = r.walls;
      if (r.floor) {
        const rect = { minX: r.floor.min[0], maxX: r.floor.max[0], minZ: r.floor.min[2], maxZ: r.floor.max[2] };
        const ao = bakeRoomAo(rect, [...wallBoxes, ...plinthBoxes], { strength: 0.3, falloff: 0.32, texelsPerMetre: 16 });
        ao.name = `ao-floor:${r.id}`;
        const mat = withRoomAo(this.mats.floor, ao);
        this.owned.textures.push(ao);
        this.owned.materials.push(mat);
        const g = new GeometryBuilder();
        addPlane(g, r.floor, { rect });
        const fm = this.addMesh(this.architecture, g.build(`floor:${r.id}`), mat, `floor:${r.id}`);
        if (fm) this.pickables.push({ mesh: fm, ownerOf: () => ({ kind: "floor", id: r.id }) });
      }
      if (r.ceiling) {
        const rect = { minX: r.ceiling.min[0], maxX: r.ceiling.max[0], minZ: r.ceiling.min[2], maxZ: r.ceiling.max[2] };
        const ao = bakeRoomAo(rect, wallBoxes, { strength: 0.22, falloff: 0.4, texelsPerMetre: 8 });
        ao.name = `ao-ceiling:${r.id}`;
        const mat = withRoomAo(this.mats.ceiling, ao);
        this.owned.textures.push(ao);
        this.owned.materials.push(mat);
        const g = new GeometryBuilder();
        addPlane(g, r.ceiling, { rect });
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
      for (const d of this.doorSignsByRoom.get(r.id) ?? []) {
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

  /** Rooms in `want` whose lettering is not built yet. */
  pending(want: ReadonlySet<string>): number {
    let n = 0;
    for (const id of want) if (!this.resident.has(id)) n++;
    return n;
  }

  residentRoomIds(): string[] {
    return [...this.resident.keys()].sort();
  }

  private buildLettering(roomId: string) {
    const exhibits = this.exhibitsByRoom.get(roomId) ?? [];
    const labels = this.labelsByRoom.get(roomId) ?? [];
    const size = (p: ScenePlane) => {
      const d = [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]];
      return { w: Math.max(d[0]!, d[2]!), h: d[1]! };
    };
    const doors = this.doorSignsByRoom.get(roomId) ?? [];
    const ts = this.typeScale;
    const items: LabelItem[] = [
      ...exhibits.map((e) => {
        const s = size(e.panel);
        const d = this.describe(e);
        return { id: e.id, kind: "panel" as const, widthM: s.w, heightM: s.h, kicker: d.kicker, title: e.label, footer: d.footer, em: { kicker: ts.kickerEm, title: ts.titleEm, footer: ts.footerEm } };
      }),
      ...labels.map((l) => {
        const s = size(l.sign);
        const em = s.h * CATEGORY_SIGN_EM_FRACTION;
        return { id: `sign:${l.id}`, kind: "sign" as const, widthM: s.w, heightM: s.h, kicker: null, title: l.label, footer: null, em: { kicker: em, title: em, footer: em } };
      }),
      ...doors.map((d) => {
        const s = size(d.sign);
        const t = this.describeDoor(d);
        return { id: `sign:${d.id}`, kind: "door" as const, widthM: s.w, heightM: s.h, kicker: t.kicker, title: t.title, footer: null, em: { kicker: DOOR_SIGN.kickerEm, title: DOOR_SIGN.titleEm, footer: DOOR_SIGN.kickerEm } };
      }),
    ];
    const entry: RoomLettering = { meshes: [], materials: [], textures: [], geometries: [] };
    const pick: Pickable[] = [];
    if (items.length > 0) {
      const atlas = buildLabelAtlas(items, this.anisotropy, roomId);
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
        if (!geo) return;
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
