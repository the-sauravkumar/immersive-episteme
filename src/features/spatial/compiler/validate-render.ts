/**
 * Render-quality and streaming checks (docs/architecture/immersive-rendering-quality.md
 * §1 check C6, §2a-2b). They read only the manifest.
 *
 * Coplanar faces: two faces z-fight when they are parallel, face the same way, lie within
 * `coplanarTolerance` (1 mm) of each other and their 2D projections overlap with positive
 * area. Faces pointing in opposite directions are not compared: with single-sided
 * materials (the renderer's default) one of them is always back-face culled, and the only
 * such pairs in a compiled plan are the hidden contact faces between touching boxes.
 */
import type { LayoutConfig } from "./config";
import type { Surface } from "./render";
import type { RoomStreaming, ZoneStreaming } from "./streaming";
import { roomsForElement } from "./streaming";
import type { Collider, CompiledManifest, ValidationCheck, Vec3 } from "./types";

interface Face {
  id: string;
  elementId: string;
  axis: 0 | 1 | 2;
  sign: 1 | -1;
  at: number;
  /** Extents on the two other axes, in axis order. */
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  plane: boolean;
}

const AXIS = { x: 0, y: 1, z: 2 } as const;
const others = (axis: 0 | 1 | 2): [0 | 1 | 2, 0 | 1 | 2] => (axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]);

function boxFaces(elementId: string, b: Collider): Face[] {
  const out: Face[] = [];
  for (const axis of [0, 1, 2] as const) {
    const [p, q] = others(axis);
    for (const sign of [1, -1] as const) {
      out.push({
        id: `${b.id}/${sign > 0 ? "+" : "-"}${"xyz"[axis]}`,
        elementId,
        axis,
        sign,
        at: sign > 0 ? b.max[axis] : b.min[axis],
        u0: b.min[p],
        u1: b.max[p],
        v0: b.min[q],
        v1: b.max[q],
        plane: false,
      });
    }
  }
  return out;
}

function surfaceFace(elementId: string, s: Surface): Face {
  const axis = AXIS[s.facing[1] as "x" | "y" | "z"];
  const [p, q] = others(axis);
  return { id: s.id, elementId, axis, sign: s.facing[0] === "+" ? 1 : -1, at: s.min[axis], u0: s.min[p], u1: s.max[p], v0: s.min[q], v1: s.max[q], plane: true };
}

const overlapArea = (a: Face, b: Face) => Math.max(0, Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0)) * Math.max(0, Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0));

export function facesOf(manifest: CompiledManifest): Face[] {
  const out: Face[] = [];
  for (const e of manifest.elements) {
    for (const b of [...((e.colliders as Collider[] | undefined) ?? []), ...((e.renderBoxes as Collider[] | undefined) ?? [])]) out.push(...boxFaces(e.id, b));
    for (const s of (e.surfaces as Surface[] | undefined) ?? []) out.push(surfaceFace(e.id, s));
  }
  return out;
}

function check(id: string, label: string, severity: "error" | "warning", issues: string[], extra: Record<string, unknown> = {}): ValidationCheck {
  const unique = [...new Set(issues)];
  return { id, label, passed: severity === "warning" ? true : unique.length === 0, details: { severity, issueCount: unique.length, issues: unique.slice(0, 50), ...extra } };
}

const AREA_EPS = 1e-8;

export function renderChecks(manifest: CompiledManifest, cfg: LayoutConfig): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const faces = facesOf(manifest);
  const tol = cfg.coplanarTolerance;

  // 1. Coplanar overlapping faces (z-fighting).
  {
    const issues: string[] = [];
    const offending = new Set<string>();
    const groups = new Map<string, Face[]>();
    for (const f of faces) (groups.get(`${f.axis}${f.sign}`) ?? groups.set(`${f.axis}${f.sign}`, []).get(`${f.axis}${f.sign}`)!).push(f);
    for (const list of groups.values()) {
      list.sort((a, b) => a.at - b.at || a.u0 - b.u0);
      // Cluster faces whose planes chain within the tolerance, then sweep each cluster on u.
      let start = 0;
      for (let i = 1; i <= list.length; i++) {
        if (i < list.length && list[i]!.at - list[i - 1]!.at <= tol + 1e-9) continue;
        const cluster = list.slice(start, i).sort((a, b) => a.u0 - b.u0);
        start = i;
        for (let a = 0; a < cluster.length; a++) {
          for (let b = a + 1; b < cluster.length && cluster[b]!.u0 < cluster[a]!.u1; b++) {
            const fa = cluster[a]!;
            const fb = cluster[b]!;
            if (Math.abs(fa.at - fb.at) > tol + 1e-9) continue;
            if (overlapArea(fa, fb) > AREA_EPS) {
              offending.add(fa.elementId);
              offending.add(fb.elementId);
              issues.push(`${fa.elementId} (${fa.id}) and ${fb.elementId} (${fb.id}) are coplanar and overlap`);
            }
          }
        }
      }
    }
    checks.push(
      check("render.coplanar-faces", "No coplanar overlapping faces (z-fighting)", "error", issues, {
        faces: faces.length,
        offendingElementIds: [...offending].sort().slice(0, 100),
      }),
    );
  }

  // 2. Wall-mounted planes stand proud of the surface behind them.
  {
    const issues: string[] = [];
    let mounted = 0;
    const byAxis = new Map<string, Face[]>();
    for (const f of faces) (byAxis.get(`${f.axis}${f.sign}`) ?? byAxis.set(`${f.axis}${f.sign}`, []).get(`${f.axis}${f.sign}`)!).push(f);
    for (const e of manifest.elements) {
      for (const s of (e.surfaces as Surface[] | undefined) ?? []) {
        if (s.kind !== "panel" && s.kind !== "sign" && s.kind !== "image") continue;
        mounted++;
        if (!(typeof s.wallOffset === "number" && s.wallOffset >= cfg.minPanelOffset - 1e-9)) issues.push(`${e.id} ${s.id}: recorded wallOffset ${String(s.wallOffset)} m < ${cfg.minPanelOffset} m`);
        if (!s.polygonOffset) issues.push(`${e.id} ${s.id}: no polygonOffset hint`);
        const f = surfaceFace(e.id, s);
        let nearest = Infinity;
        for (const g of byAxis.get(`${f.axis}${f.sign}`) ?? []) {
          if (g.id === f.id) continue;
          const d = (f.at - g.at) * f.sign; // > 0: g lies behind f
          if (d < -1e-9 || d > 0.05) continue;
          if (overlapArea(f, g) > AREA_EPS) nearest = Math.min(nearest, d);
        }
        if (nearest === Infinity) issues.push(`${e.id} ${s.id}: no wall or panel behind it within 5 cm`);
        else if (nearest < cfg.minPanelOffset - 1e-6) issues.push(`${e.id} ${s.id}: only ${(nearest * 1000).toFixed(2)} mm proud of the surface behind (< ${cfg.minPanelOffset * 1000} mm)`);
      }
    }
    checks.push(check("render.panel-offset", `Wall-mounted panels, signs and images stand >= ${cfg.minPanelOffset * 1000} mm proud`, "error", issues, { mountedPlanes: mounted }));
  }

  // 3. Textures: uniform scale, declared UV mapping, image aspect.
  {
    const issues: string[] = [];
    const undeclared: string[] = [];
    const uniform = (s: unknown) => Array.isArray(s) && s.length === 3 && s.every((x) => x === s[0]) && s[0] === 1;
    for (const e of manifest.elements) {
      if (e.scale !== undefined && !uniform(e.scale)) issues.push(`${e.id}: element scale ${JSON.stringify(e.scale)} is not uniform 1`);
      for (const s of (e.surfaces as Surface[] | undefined) ?? []) {
        if (s.textured && !uniform(s.scale)) issues.push(`${e.id} ${s.id}: textured surface with scale ${JSON.stringify(s.scale)}`);
        if (s.textured && s.uv !== "metre" && s.uv !== "image") issues.push(`${e.id} ${s.id}: undeclared UV mapping`);
        if (s.kind === "image") {
          const axis = AXIS[s.facing[1] as "x" | "y" | "z"];
          const horiz = axis === 0 ? 2 : 0;
          const w = s.max[horiz] - s.min[horiz];
          const h = s.max[1] - s.min[1];
          if (s.aspectRatio == null) undeclared.push(`${e.id}: image ${s.assetId ?? "?"} has no declared aspect ratio`);
          else if (Math.abs(w / h - s.aspectRatio) / s.aspectRatio > cfg.aspectTolerance) {
            issues.push(`${e.id} ${s.id}: plane ${w.toFixed(3)} x ${h.toFixed(3)} m does not match aspect ${s.aspectRatio}`);
          }
        }
      }
    }
    checks.push(check("render.textures", "Textured surfaces are unscaled, metre/image-mapped and keep image aspect", "error", issues));
    checks.push(check("render.image-aspect-declared", "Image planes declare their source aspect ratio", "warning", undeclared));
  }

  // 4. Axis-aligned, metre-based geometry.
  {
    const issues: string[] = [];
    for (const e of manifest.elements) {
      if (typeof e.yawDeg === "number" && e.yawDeg % 90 !== 0) issues.push(`${e.id}: yaw ${e.yawDeg} is not axis-aligned`);
      for (const s of (e.surfaces as Surface[] | undefined) ?? []) {
        const axis = AXIS[s.facing[1] as "x" | "y" | "z"];
        const flat = [0, 1, 2].filter((i) => Math.abs(s.max[i]! - s.min[i]!) < 1e-9);
        if (flat.length !== 1 || flat[0] !== axis) issues.push(`${e.id} ${s.id}: not a plane perpendicular to ${s.facing}`);
        if ([0, 1, 2].some((i) => s.max[i]! < s.min[i]!)) issues.push(`${e.id} ${s.id}: inverted extents`);
      }
      for (const b of [...((e.colliders as Collider[] | undefined) ?? []), ...((e.renderBoxes as Collider[] | undefined) ?? [])]) {
        const d = [0, 1, 2].map((i) => b.max[i]! - b.min[i]!) as unknown as Vec3;
        if (d.some((x) => !(x > 0))) issues.push(`${e.id} ${b.id}: degenerate box`);
        const typed = b as Collider & { part?: string; partKey?: string };
        if (!typed.part || !typed.partKey) issues.push(`${e.id} ${b.id}: box has no typed part`);
      }
    }
    checks.push(check("render.axis-aligned", "Geometry is axis-aligned, metre-based boxes and planes with typed parts", "error", issues));
  }
  return checks;
}

export function streamingChecks(manifest: CompiledManifest, cfg: LayoutConfig): ValidationCheck[] {
  const els = manifest.elements;
  const byId = new Map(els.map((e) => [e.id, e]));
  const rooms = els.filter((e) => e.kind === "room");
  const issues: string[] = [];
  const unitOf = new Map<string, RoomStreaming>();
  for (const r of rooms) {
    const s = r.streaming as RoomStreaming | undefined;
    if (!s || s.unit !== "room") {
      issues.push(`${r.id}: no streaming unit`);
      continue;
    }
    unitOf.set(r.id, s);
    for (const id of s.elementIds) if (!byId.has(id)) issues.push(`${r.id}: unit lists unknown element ${id}`);
    for (const n of s.neighbours) {
      const other = unitOf.get(n.roomId) ?? (byId.get(n.roomId)?.streaming as RoomStreaming | undefined);
      if (!other?.neighbours.some((m) => m.roomId === r.id && m.portalId === n.portalId)) issues.push(`${r.id}: neighbour ${n.roomId} via ${n.portalId} is not symmetric`);
      if (!s.elementIds.includes(n.portalId)) issues.push(`${r.id}: doorway ${n.portalId} missing from the unit`);
    }
  }
  const resident = new Set(rooms.flatMap((r) => (r.streaming as RoomStreaming | undefined)?.elementIds ?? []));
  for (const e of els) {
    if (e.kind === "zone") continue;
    if (!resident.has(e.id)) issues.push(`${e.id} belongs to no streaming unit`);
    for (const rid of roomsForElement(e, byId, rooms)) {
      if (!unitOf.get(rid)?.elementIds.includes(e.id)) issues.push(`${e.id} missing from unit ${rid}`);
    }
  }
  const zoneCounts: Record<string, unknown> = {};
  for (const z of els.filter((e) => e.kind === "zone")) {
    const s = z.streaming as ZoneStreaming | undefined;
    if (!s) {
      issues.push(`${z.id}: no streaming summary`);
      continue;
    }
    const expected = rooms.filter((r) => r.parentId === z.id).map((r) => r.id).sort();
    if (s.roomIds.join("|") !== expected.join("|")) issues.push(`${z.id}: roomIds disagree with room parents`);
    zoneCounts[z.id] = s.counts;
  }
  const over = rooms
    .filter((r) => ((r.streaming as RoomStreaming | undefined)?.counts.exhibits ?? 0) > cfg.unitExhibitBudget)
    .map((r) => `${r.id}: ${(r.streaming as RoomStreaming).counts.exhibits} exhibits > budget ${cfg.unitExhibitBudget}`);
  return [
    check("streaming.units", "Every room is a self-contained streaming unit with symmetric doorway adjacency", "error", issues, { units: rooms.length }),
    check("streaming.unit-budget", `No streaming unit exceeds ${cfg.unitExhibitBudget} exhibits`, "warning", over, { zoneCounts }),
  ];
}
