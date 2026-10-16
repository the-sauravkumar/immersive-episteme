/**
 * Validation catalogue. Geometric checks read ONLY the manifest (rooms, colliders, portals,
 * exhibits, paths), so they verify the output rather than trusting the layout engine; graph
 * checks also receive the scoped snapshot and the rule resolution.
 *
 * Each check is `{ id, label, passed, details: { severity, issues[] } }`. The manifest
 * passes when every check of severity "error" passes; "warning" checks report but never fail.
 */
import { sectionOfType } from "@/features/learning/sections";
import type { MappingRuleSetConfig } from "@/features/spatial/contracts";
import { spatialManifestSchema } from "@/features/spatial/contracts";

import type { LayoutConfig } from "./config";
import { collidersOverlap, pointInRect, segmentHitsCollider } from "./geometry";
import type { Chain, ScopedGraph } from "./graph";
import { NavGrid } from "./navgrid";
import { renderChecks, streamingChecks } from "./validate-render";
import { compareStrings } from "./prng";
import { isProximityOnly, type Resolution, type RuleIssue } from "./rules";
import type {
  Collider,
  CompiledElement,
  CompiledManifest,
  CompilerGraph,
  ExhibitAsset,
  GraphRelationship,
  ManifestValidation,
  Point,
  Rect,
  ValidationCheck,
} from "./types";

export interface ValidationContext {
  graph: CompilerGraph;
  snapshotVersion: string;
  scope: ScopedGraph;
  chains: readonly Chain[];
  config: MappingRuleSetConfig;
  cfg: LayoutConfig;
  ruleIssues: { errors: RuleIssue[]; warnings: RuleIssue[] };
  conflicts: { relationshipId: string; type: string; ruleIds: string[] }[];
  resolution: ReadonlyMap<string, Resolution>;
  layoutIssues: readonly string[];
  /** The building scheme the layout engine built, and why it departed from the configured one. */
  building?: "hub" | "row";
  layoutNotes?: readonly string[];
  unmappedCategory: readonly string[];
  assets: readonly ExhibitAsset[];
  relById: ReadonlyMap<string, GraphRelationship>;
}

const MAX_ISSUES = 50;

function check(id: string, label: string, severity: "error" | "warning", issues: string[], extra: Record<string, unknown> = {}): ValidationCheck {
  const sorted = [...new Set(issues)];
  return {
    id,
    label,
    passed: severity === "warning" ? true : sorted.length === 0,
    details: { severity, issueCount: sorted.length, issues: sorted.slice(0, MAX_ISSUES), ...extra },
  };
}

const isExhibit = (e: CompiledElement) => e.kind === "exhibit" || e.kind === "station";

export function collidersOf(manifest: CompiledManifest): Collider[] {
  return manifest.elements.flatMap((e) => (Array.isArray(e.colliders) ? (e.colliders as Collider[]) : []));
}
export function roomsOf(manifest: CompiledManifest): CompiledElement[] {
  return manifest.elements.filter((e) => e.kind === "room");
}

export function validateCompiled(manifest: CompiledManifest, ctx: ValidationContext): ManifestValidation {
  const checks: ValidationCheck[] = [];
  const { scope, cfg } = ctx;
  const els = manifest.elements;
  const byId = new Map(els.map((e) => [e.id, e]));
  const exhibits = els.filter(isExhibit);
  const rooms = roomsOf(manifest);
  const portals = els.filter((e) => e.kind === "portal");
  const colliders = collidersOf(manifest);

  // 1. Contract schema.
  {
    const parsed = spatialManifestSchema.safeParse(manifest);
    checks.push(
      check(
        "manifest.schema",
        "Manifest conforms to spatialManifestSchema",
        "error",
        parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      ),
    );
  }

  // 2. Rules.
  checks.push(check("rules.supported", "Every mapping rule names a supported strategy and encoding", "error", ctx.ruleIssues.errors.map((e) => `${e.ruleId}: ${e.message}`)));
  checks.push(check("rules.references", "Rules reference relationship types the snapshot defines", "warning", ctx.ruleIssues.warnings.map((e) => `${e.ruleId}: ${e.message}`)));
  {
    const issues = ctx.conflicts.map((c) => `${c.type} ${c.relationshipId}: equal-priority rules ${c.ruleIds.join(", ")} map it differently`);
    const typesSeen = new Set<string>();
    for (const [relId, res] of ctx.resolution) {
      const rel = ctx.relById.get(relId);
      const t = rel && ctx.graph.relationshipTypes.find((x) => x.code === rel.type);
      if (rel && t?.semantics === "causal" && res.primary && isProximityOnly(res.primary) && !typesSeen.has(rel.type)) {
        typesSeen.add(rel.type);
        issues.push(`Causal type ${rel.type} is mapped by ${res.primary.id} to proximity only`);
      }
    }
    checks.push(check("rules.consistent", "No contradictory mappings (equal-priority conflicts, causal-as-proximity rules)", "error", issues));
  }

  // 3. Content versions.
  {
    const issues: string[] = [];
    if (ctx.snapshotVersion !== ctx.graph.versionLabel) issues.push(`Requested snapshot ${ctx.snapshotVersion} but the graph is ${ctx.graph.versionLabel}`);
    if (manifest.snapshotVersion !== ctx.graph.versionLabel) issues.push(`Manifest records snapshot ${manifest.snapshotVersion}, graph is ${ctx.graph.versionLabel}`);
    const codes = new Set(ctx.graph.relationshipTypes.map((t) => t.code));
    for (const r of ctx.graph.relationships) if (!codes.has(r.type)) issues.push(`Relationship ${r.id} uses unregistered type ${r.type}`);
    const cats = new Set(ctx.graph.categories.map((c) => c.code as string));
    for (const c of ctx.graph.concepts) if (cats.size > 0 && !cats.has(c.category)) issues.push(`Concept ${c.key} uses unregistered category ${c.category}`);
    checks.push(check("content.versions", "Snapshot, relationship types and categories are consistent", "error", issues));
  }

  // 4. Missing concepts.
  {
    const issues = [...scope.danglingReferences, ...scope.missingTraditionSlugs.map((s) => `Selected tradition ${s} is not in the snapshot`)];
    for (const slug of scope.selectedSlugs) {
      const t = scope.traditionBySlug.get(slug);
      if (t && !scope.concepts.some((c) => c.traditionId === t.id)) issues.push(`Selected tradition ${slug} has no concepts`);
    }
    checks.push(check("concepts.missing", "No relationship or comparison references a missing concept", "error", issues));
  }

  // 5. Every in-scope concept placed exactly once; exhibit <-> concept references resolve.
  {
    const issues: string[] = [];
    const count = new Map<string, number>();
    for (const e of exhibits) if (e.conceptId) count.set(e.conceptId, (count.get(e.conceptId) ?? 0) + 1);
    for (const c of scope.concepts) {
      const n = count.get(c.id) ?? 0;
      if (n !== 1) issues.push(`${c.key}: ${n} exhibit(s)`);
    }
    checks.push(check("concepts.placed", "Every in-scope concept has exactly one exhibit", "error", issues, { total: scope.concepts.length }));
    const refIssues: string[] = [];
    for (const e of exhibits) {
      const c = e.conceptId ? scope.conceptById.get(e.conceptId) : undefined;
      if (!c) refIssues.push(`${e.id} references concept ${e.conceptId ?? "null"} that is not in scope`);
      else if (e.conceptKey !== c.key) refIssues.push(`${e.id} records key ${String(e.conceptKey)} but concept is ${c.key}`);
      if (e.parentId && byId.get(e.parentId)?.kind !== "room") refIssues.push(`${e.id} is not inside a room`);
    }
    for (const t of manifest.traceability.concepts) {
      if (t.status === "placed" && (!t.elementId || byId.get(t.elementId)?.conceptId !== t.conceptId)) refIssues.push(`Trace for ${t.key} points to ${t.elementId}`);
    }
    for (const e of els) {
      for (const h of (e.hotspots as { id: string; targetElementId: string | null }[] | undefined) ?? []) {
        if (h.targetElementId && !byId.has(h.targetElementId)) refIssues.push(`${h.id} targets missing element ${h.targetElementId}`);
      }
    }
    checks.push(check("refs.concept-exhibit", "Concept <-> exhibit references resolve both ways", "error", refIssues));
  }

  // 6. Relationship encoding coverage.
  {
    const issues = manifest.traceability.relationships.filter((r) => r.status !== "encoded").map((r) => `${r.type} ${r.relationshipId}: ${r.reason}`);
    checks.push(check("relationships.encoded", "Every in-scope relationship is encoded by at least one element", "error", issues));
  }

  // 7. Causality is never proximity alone.
  {
    // Explicit = an explicit encoding produced by a rule whose strategy is not proximity-based
    // (an adjacency rule's fallback link hotspot does not count as an explanation).
    const explicit = new Set(["explicit_link", "sequence_path", "threshold", "layer"]);
    const ruleById = new Map(ctx.config.rules.map((r) => [r.id, r]));
    const issues: string[] = [];
    for (const r of manifest.traceability.relationships) {
      if (r.semantics !== "causal") continue;
      const ok = r.encodings.some((e) => {
        const rule = ruleById.get(e.ruleId);
        return explicit.has(e.encoding) && !!rule && !isProximityOnly(rule);
      });
      if (!ok) {
        issues.push(`${r.type} ${r.relationshipId} is encoded only by proximity rules (${r.encodings.map((e) => `${e.ruleId}:${e.encoding}`).join(", ") || "nothing"})`);
      }
      for (const e of r.encodings.filter((x) => explicit.has(x.encoding))) {
        for (const id of e.elementIds) {
          const el = byId.get(id);
          const trig = el?.trigger as { elementId?: string } | undefined;
          if (el?.kind === "cue" && (!trig?.elementId || !byId.has(trig.elementId))) issues.push(`${id}: explanation trigger has no valid target`);
        }
      }
    }
    checks.push(check("causality.explicit", "Causal relationships have an explicit trigger or path, never proximity only", "error", issues));
  }

  // 8. Process ordering.
  checks.push(
    check("process.ordering", "PRECEDES chains are acyclic with contiguous ordinals 1..n", "error", ctx.chains.flatMap((c) => c.errors), {
      chains: ctx.chains.length,
    }),
  );
  checks.push(check("process.ordering-warnings", "Sequence chains without ordinals or with branches", "warning", ctx.chains.flatMap((c) => c.warnings)));

  // 9. Paths follow the chain order.
  {
    const issues: string[] = [];
    for (const ch of ctx.chains) {
      const path = byId.get(`path:seq:${ch.id}`);
      const placed = ch.order.filter((k) => exhibits.some((e) => e.conceptKey === k));
      if (placed.length < 2) continue;
      if (!path) {
        issues.push(`Chain ${ch.id} has no path element`);
        continue;
      }
      const stops = (path.stops as string[]) ?? [];
      const expected = placed.map((k) => exhibits.find((e) => e.conceptKey === k)!.id);
      if (stops.join("|") !== expected.join("|")) issues.push(`${path.id}: stops are not in chain order`);
      // Waypoints visit each stop's approach point, in order.
      const wps = (path.waypoints as Point[]) ?? [];
      let cursor = 0;
      for (const sid of stops) {
        const ap = byId.get(sid)?.approach as Point | undefined;
        if (!ap) continue;
        const idx = wps.findIndex((w, i) => i >= cursor && Math.abs(w.x - ap.x) < 1e-6 && Math.abs(w.z - ap.z) < 1e-6);
        if (idx < 0) {
          issues.push(`${path.id}: does not reach ${sid} in order`);
          break;
        }
        cursor = idx;
      }
      stops.forEach((sid, i) => {
        const seq = byId.get(sid)?.sequence as { pathId: string; index: number } | null | undefined;
        if (!seq || seq.pathId !== path.id || seq.index !== i) issues.push(`${sid}: sequence metadata disagrees with ${path.id}`);
      });
    }
    checks.push(check("paths.ordered", "Sequence paths visit stations in PRECEDES order", "error", issues));
  }

  // 10. Path continuity (no broken legs, no segment through a collider).
  const routes: { id: string; pts: Point[] }[] = [];
  for (const e of els) {
    if (e.kind === "path") routes.push({ id: e.id, pts: (e.waypoints as Point[]) ?? [] });
    const route = (e.effect as { route?: Point[] } | undefined)?.route;
    if (e.kind === "cue" && Array.isArray(route)) routes.push({ id: e.id, pts: route });
  }
  {
    const issues: string[] = [];
    for (const e of els) {
      if (e.kind === "path" && e.broken) issues.push(`${e.id}: one or more legs could not be routed`);
      const eff = e.effect as { route?: Point[]; type?: string } | undefined;
      if (e.kind === "cue" && eff?.type === "explain-and-guide" && (!eff.route || eff.route.length < 2)) issues.push(`${e.id}: explanation route missing`);
    }
    for (const r of routes) {
      for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1]!;
        const b = r.pts[i]!;
        const hit = colliders.find((c) => segmentHitsCollider(a, b, c, 0));
        if (hit) {
          issues.push(`${r.id}: segment ${i} crosses ${hit.id}`);
          break;
        }
      }
    }
    checks.push(check("paths.continuity", "Paths and explanation routes are unbroken and collision-free", "error", issues, { routes: routes.length }));
  }

  // 11. Colliders: axis-aligned, well-formed, disjoint.
  {
    const issues: string[] = [];
    for (const c of colliders) {
      if (!(c.min[0] < c.max[0] && c.min[1] < c.max[1] && c.min[2] < c.max[2])) issues.push(`${c.id}: degenerate box`);
    }
    const sorted = [...colliders].sort((p, q) => p.min[0] - q.min[0] || compareStrings(p.id, q.id));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length && sorted[j]!.min[0] < sorted[i]!.max[0]; j++) {
        if (collidersOverlap(sorted[i]!, sorted[j]!)) issues.push(`${sorted[i]!.id} overlaps ${sorted[j]!.id}`);
      }
    }
    const ids = new Set<string>();
    for (const c of colliders) {
      if (ids.has(c.id)) issues.push(`Duplicate collider id ${c.id}`);
      ids.add(c.id);
    }
    checks.push(check("geometry.colliders", "Collision geometry is axis-aligned and non-overlapping", "error", issues, { colliders: colliders.length }));
  }

  // Exhibit geometry is consistent: an edit to one field (e.g. a manual override of `position`
  // alone) must not leave the plinth, approach point or room behind.
  {
    const issues: string[] = [];
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const tol = 1e-3;
    const reach = cfg.exhibitDepth / 2 + cfg.approachDistance + 0.05;
    for (const e of exhibits) {
      const pos = e.position as { x: number; z: number } | undefined;
      if (!pos) continue;
      const plinth = (Array.isArray(e.colliders) ? (e.colliders as Collider[]) : []).find((c) => c.kind === "plinth");
      if (plinth && (pos.x < plinth.min[0] - tol || pos.x > plinth.max[0] + tol || pos.z < plinth.min[2] - tol || pos.z > plinth.max[2] + tol)) {
        issues.push(`${e.id}: position (${pos.x}, ${pos.z}) is outside its plinth ${plinth.id}`);
      }
      const ap = e.approach as Point | undefined;
      if (ap && Math.hypot(ap.x - pos.x, ap.z - pos.z) > reach) issues.push(`${e.id}: approach point is ${Math.hypot(ap.x - pos.x, ap.z - pos.z).toFixed(2)} m from the exhibit (max ${reach.toFixed(2)} m)`);
      const room = typeof e.parentId === "string" ? roomById.get(e.parentId) : undefined;
      if (room && !pointInRect({ x: pos.x, z: pos.z }, room.bounds as Rect)) issues.push(`${e.id}: position is outside its room ${room.id}`);
    }
    checks.push(check("geometry.exhibit-consistency", "Each exhibit's position, plinth, approach point and room agree", "error", issues, { exhibits: exhibits.length }));
  }

  // 12. Doorways.
  {
    const issues: string[] = [];
    if (cfg.doorWidth < cfg.minDoorWidth) issues.push(`Configured doorWidth ${cfg.doorWidth} m is below minDoorWidth ${cfg.minDoorWidth} m`);
    for (const p of portals) {
      const width = Number(p.width);
      if (!(width >= cfg.minDoorWidth - 1e-9)) issues.push(`${p.id}: width ${width} m < ${cfg.minDoorWidth} m`);
      const op = p.opening as { a: Point; b: Point } | undefined;
      const connects = (p.connects as string[]) ?? [];
      if (!op || connects.length !== 2) {
        issues.push(`${p.id}: missing opening or rooms`);
        continue;
      }
      for (const rid of connects) {
        const room = byId.get(rid);
        const r = room?.bounds as Rect | undefined;
        if (!r || !pointInRect(op.a, r) || !pointInRect(op.b, r)) issues.push(`${p.id}: opening is not on the boundary of ${rid}`);
      }
      // The opening must be physically clear (sample across the threshold).
      const mid = { x: (op.a.x + op.b.x) / 2, z: (op.a.z + op.b.z) / 2 };
      const axisX = Math.abs(op.a.z - op.b.z) < 1e-9;
      const across = axisX
        ? [{ x: mid.x, z: mid.z - 0.5 }, { x: mid.x, z: mid.z + 0.5 }]
        : [{ x: mid.x - 0.5, z: mid.z }, { x: mid.x + 0.5, z: mid.z }];
      const block = colliders.find((c) => segmentHitsCollider(across[0]!, across[1]!, c, 0));
      if (block) issues.push(`${p.id}: opening blocked by ${block.id}`);
    }
    checks.push(check("accessibility.doorways", `Doorways are open and at least ${cfg.minDoorWidth} m wide`, "error", issues, { portals: portals.length }));
  }

  // 13. Reachability over walkable cells.
  const spawn = byId.get("landmark:entrance")?.spawn as { x: number; z: number } | undefined;
  const hops = new Map<string, number>();
  {
    const issues: string[] = [];
    const rects = rooms.map((r) => r.bounds as Rect);
    if (!spawn || rects.length === 0) issues.push("No spawn point or no rooms");
    else {
      const nav = new NavGrid(rects, colliders, cfg.visitorRadius, cfg.navResolution);
      const start = nav.nearestFree(spawn);
      const parent = nav.bfs(start);
      const reached = (p: Point) => {
        const c = nav.nearestFree(p, 0.3);
        return c >= 0 && parent[c] !== -1;
      };
      for (const r of rooms) {
        const b = r.bounds as Rect;
        let ok = false;
        for (let j = 0; j < nav.nz && !ok; j++) {
          for (let i = 0; i < nav.nx; i++) {
            const idx = j * nav.nx + i;
            if (parent[idx] === -1) continue;
            const c = nav.center(idx);
            if (c.x > b.minX + cfg.wallThickness && c.x < b.maxX - cfg.wallThickness && c.z > b.minZ + cfg.wallThickness && c.z < b.maxZ - cfg.wallThickness) {
              ok = true;
              break;
            }
          }
        }
        if (!ok) issues.push(`Room ${r.id} is unreachable from the entrance`);
      }
      for (const e of exhibits) {
        const ap = e.approach as Point | undefined;
        if (!ap || !reached(ap)) issues.push(`Exhibit ${e.id} cannot be reached`);
      }
      for (const p of portals) {
        const pos = p.position as { x: number; z: number };
        if (!reached(pos)) issues.push(`Doorway ${p.id} cannot be reached`);
      }
    }
    checks.push(check("navigation.reachability", "Every room, exhibit and doorway is reachable from the entrance", "error", issues));
  }

  // 13b. Equal access to the traditions (DR-043; gate 1, tradition salience): the walking route from
  // the spawn to each wing's entrance doorway. The hub building must keep the longest within 10% of
  // the shortest (error); the row building reports the lengths (warning), since it cannot.
  {
    const issues: string[] = [];
    const lengths: Record<string, number> = {};
    const wingZones = els.filter((e) => e.kind === "zone" && typeof e.traditionSlug === "string");
    if (spawn && wingZones.length > 1) {
      const nav = new NavGrid(rooms.map((r) => r.bounds as Rect), colliders, cfg.visitorRadius, cfg.navResolution);
      for (const z of wingZones) {
        const entrance = rooms.find((r) => r.parentId === z.id && (r.grid as { slot?: number } | null)?.slot === 0);
        const door = entrance ? byId.get(entrance.entranceDoorId as string) : undefined;
        const at = door?.position as Point | undefined;
        const route = at ? nav.route(spawn, at) : null;
        if (!route) {
          issues.push(`${z.id}: no walking route from the spawn to its entrance doorway`);
          continue;
        }
        let len = 0;
        let prev: Point = spawn;
        for (const p of [...route, at!]) {
          len += Math.hypot(p.x - prev.x, p.z - prev.z);
          prev = p;
        }
        lengths[String(z.traditionSlug)] = Math.round(len * 100) / 100;
      }
      const vals = Object.values(lengths);
      if (vals.length > 1) {
        const ratio = Math.max(...vals) / Math.min(...vals);
        if (ratio > 1.1) issues.push(`Walking routes from the spawn to the wing doorways differ by ${Math.round((ratio - 1) * 100)}% (${Object.entries(lengths).map(([k, v]) => `${k} ${v} m`).join(", ")}); limit 10%`);
      }
    }
    checks.push(
      check("navigation.wing-equidistance", "Every wing's entrance doorway is equally far from the spawn (within 10%)", (ctx.building ?? cfg.building) === "hub" ? "error" : "warning", issues, { lengths, building: ctx.building ?? cfg.building }),
    );
  }

  // 13c. Consecutive sections one doorway apart (review finding spatial-3): inside each wing, the
  // rooms of consecutive zone groups (in the rule set's group order) share a doorway, so walking
  // outward from the entrance meets the sections in the 2D order without backtracking.
  {
    const issues: string[] = [];
    const doorPairs = new Set(portals.map((p) => [...((p.connects as string[]) ?? [])].sort(compareStrings).join("|")));
    for (const z of els.filter((e) => e.kind === "zone" && typeof e.traditionSlug === "string")) {
      const wingRooms = rooms
        .filter((r) => r.parentId === z.id && r.grid)
        .sort((a, b) => (a.grid as { slot: number }).slot - (b.grid as { slot: number }).slot);
      for (let i = 0; i + 1 < wingRooms.length; i++) {
        const k = [wingRooms[i]!.id, wingRooms[i + 1]!.id].sort(compareStrings).join("|");
        if (!doorPairs.has(k)) issues.push(`${wingRooms[i]!.id} and ${wingRooms[i + 1]!.id} (consecutive sections) share no doorway`);
      }
    }
    checks.push(check("layout.section-adjacency", "Consecutive sections of a wing are one doorway apart", "error", issues));
  }

  // 14. Inaccessible zones (topology).
  {
    const issues: string[] = [];
    const adj = new Map<string, string[]>();
    for (const p of portals) {
      const [a, b] = (p.connects as string[]) ?? [];
      if (!a || !b) continue;
      (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
      (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    }
    const lobby = rooms.find((r) => r.roomKind === "lobby")?.id;
    if (lobby) {
      hops.set(lobby, 0);
      const q = [lobby];
      while (q.length) {
        const cur = q.shift()!;
        for (const n of (adj.get(cur) ?? []).sort(compareStrings)) {
          if (hops.has(n)) continue;
          hops.set(n, hops.get(cur)! + 1);
          q.push(n);
        }
      }
    }
    for (const r of rooms) {
      if (!(adj.get(r.id)?.length ?? 0)) issues.push(`Room ${r.id} has no doorway`);
      else if (!hops.has(r.id)) issues.push(`Room ${r.id} is not connected to the entrance by doorways`);
    }
    for (const z of els.filter((e) => e.kind === "zone")) {
      if (!rooms.some((r) => r.parentId === z.id && hops.has(r.id))) issues.push(`Zone ${z.id} has no accessible room`);
    }
    checks.push(check("zones.accessible", "Every zone and room is connected to the entrance by doorways", "error", issues));
  }

  // 15. Navigation complexity.
  {
    const lim = cfg.complexity;
    const issues: string[] = [];
    if (rooms.length > lim.maxRooms) issues.push(`${rooms.length} rooms > ${lim.maxRooms}`);
    for (const r of rooms) {
      const doors = ((r.doorIds as string[]) ?? []).length;
      if (doors > lim.maxDoorsPerRoom) issues.push(`${r.id}: ${doors} doorways > ${lim.maxDoorsPerRoom}`);
      const h = hops.get(r.id);
      if (h !== undefined && h > lim.maxDoorHopsFromEntrance) issues.push(`${r.id}: ${h} doorways from the entrance > ${lim.maxDoorHopsFromEntrance}`);
      const n = exhibits.filter((e) => e.parentId === r.id).length;
      if (n > lim.maxExhibitsPerRoom) issues.push(`${r.id}: ${n} exhibits > ${lim.maxExhibitsPerRoom}`);
      const b = r.bounds as Rect;
      const side = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
      if (side > lim.maxRoomSide && r.roomKind !== "hall") issues.push(`${r.id}: side ${side} m > ${lim.maxRoomSide} m`);
    }
    for (const p of els.filter((e) => e.kind === "path")) {
      for (const leg of (p.legs as { from: string; to: string; length: number | null }[] | undefined) ?? []) {
        if (leg.length !== null && leg.length > lim.maxPathLegLength) issues.push(`${p.id}: leg ${leg.from} -> ${leg.to} is ${leg.length} m > ${lim.maxPathLegLength} m`);
      }
    }
    const maxHops = Math.max(0, ...hops.values());
    checks.push(
      check("navigation.complexity", "Navigation complexity within configured thresholds", lim.severity, issues, {
        rooms: rooms.length,
        maxDoorHops: maxHops,
        exhibits: exhibits.length,
      }),
    );
  }

  // 16. Assets.
  {
    const issues: string[] = [];
    for (const e of exhibits) {
      for (const a of (e.assetRefs as { assetId: string; missing?: boolean }[] | undefined) ?? []) {
        if (a.missing) issues.push(`${e.id}: asset ${a.assetId} is referenced by the concept but not available`);
      }
    }
    for (const a of ctx.assets) if (!scope.conceptById.has(a.conceptId) && !ctx.graph.concepts.some((c) => c.id === a.conceptId)) issues.push(`Asset ${a.id} depicts unknown concept ${a.conceptId}`);
    checks.push(check("assets.refs", "Exhibit asset references resolve", "warning", issues));
  }

  // 17. Traceability completeness.
  {
    const issues: string[] = [];
    const ruleIds = new Set(ctx.config.rules.map((r) => r.id));
    const relIds = new Set(scope.relationships.map((r) => r.id));
    for (const e of els) {
      if (!ruleIds.has(e.ruleId)) issues.push(`${e.id}: rule ${e.ruleId} is not in the rule set`);
      if (!e.rationale || e.rationale.trim().length < 10) issues.push(`${e.id}: no rationale`);
      if (!e.trace || e.trace.ruleIds.length === 0 || e.trace.interactions.length === 0) issues.push(`${e.id}: incomplete trace`);
      for (const enc of e.encodes) {
        if (!relIds.has(enc.relationshipId)) issues.push(`${e.id}: encodes out-of-scope relationship ${enc.relationshipId}`);
        if (!ruleIds.has(enc.ruleId)) issues.push(`${e.id}: encoding rule ${enc.ruleId} not in rule set`);
      }
      if (e.parentId && !byId.has(e.parentId)) issues.push(`${e.id}: unknown parent ${e.parentId}`);
      if ((e.kind === "exhibit" || e.kind === "station") && e.trace.conceptIds.length === 0) issues.push(`${e.id}: no source concept`);
      if ((e.kind === "path" || e.kind === "cue") && e.trace.conceptIds.length === 0 && e.trace.relationshipIds.length === 0) issues.push(`${e.id}: no source concept or relationship`);
    }
    for (const r of manifest.traceability.relationships) {
      for (const enc of r.encodings) {
        if (enc.elementIds.length === 0) issues.push(`${r.relationshipId}: encoding without elements`);
        for (const id of enc.elementIds) {
          const el = byId.get(id);
          if (!el || !el.encodes.some((x) => x.relationshipId === r.relationshipId && x.ruleId === enc.ruleId)) issues.push(`${r.relationshipId}: index points to ${id}, which does not encode it`);
        }
      }
    }
    checks.push(check("traceability.complete", "Every element traces concept/relationship -> rule -> element -> interaction", "error", issues));
  }

  // 19-20. Rendering quality (C6) and streaming units (§2a-2b).
  checks.push(...renderChecks(manifest, cfg), ...streamingChecks(manifest, cfg));

  // 18. Layout engine diagnostics and category mapping.
  checks.push(check("layout.engine", "Layout engine reported no construction problems", "error", [...ctx.layoutIssues]));
  checks.push(check("layout.building", "The configured building scheme was built", "warning", [...(ctx.layoutNotes ?? [])], { building: ctx.building ?? cfg.building }));
  checks.push(check("rules.categories", "Every concept category is mapped to a zone group", "warning", ctx.unmappedCategory.map((k) => `${k}: category not in any zone group (fallback used)`)));
  checks.push(sectionCheck(manifest, ctx));

  const conceptsPlaced = scope.concepts.filter((c) => exhibits.some((e) => e.conceptId === c.id)).length;
  const encoded = manifest.traceability.relationships.filter((r) => r.status === "encoded").length;
  return {
    passed: checks.every((c) => c.passed),
    checks,
    coverage: {
      concepts: { total: scope.concepts.length, placed: conceptsPlaced },
      relationships: { total: manifest.traceability.relationships.length, encoded },
    },
  };
}

/**
 * rules.sections (DR-024): every exhibit stands in the room of its 2D section, the section map
 * shared by both conditions (`sectionOfType`): a tradition's concept in its own wing's room of that
 * section, a comparison in the comparison hall, a shared concept (no tradition) in the shared
 * commons or the hall. An error for a rule set that places concepts by type (every default rule set
 * from version 2); a warning for a version 1 rule set that places them by category, which reports
 * where it disagrees with the 2D pages.
 */
function sectionCheck(manifest: CompiledManifest, ctx: ValidationContext): ValidationCheck {
  const byId = new Map(manifest.elements.map((e) => [e.id, e]));
  const zone = ctx.config.rules.find((r) => r.emit.params?.strategy === "category-zone");
  const groups = (zone?.emit.params?.groups ?? []) as { types?: unknown[] }[];
  const typed = groups.some((g) => Array.isArray(g.types) && g.types.length > 0);
  const issues: string[] = [];
  for (const e of manifest.elements) {
    if (!isExhibit(e) || !e.conceptId) continue;
    const c = ctx.scope.conceptById.get(e.conceptId);
    if (!c) continue;
    const room = e.parentId ? byId.get(e.parentId) : undefined;
    const expected = sectionOfType(c.type);
    const slug = ctx.scope.slugOf(c);
    const group = typeof room?.group === "string" ? room.group : null;
    const roomSlug = typeof room?.traditionSlug === "string" ? room.traditionSlug : null;
    const where = room?.id ?? "no room";
    if (expected.scope === "hall") {
      if (room?.roomKind !== "hall") issues.push(`${c.key}: ${c.type} belongs to the "${expected.title}" section (the comparison hall) but stands in ${where}`);
    } else if (slug === null) {
      if (room?.roomKind !== "commons" && room?.roomKind !== "hall") issues.push(`${c.key}: a shared concept stands in ${where}`);
    } else if (group !== expected.zoneGroup || roomSlug !== slug) {
      issues.push(`${c.key}: ${c.type} is in the "${expected.title}" section of ${slug} in 2D but stands in ${where}`);
    }
  }
  return check("rules.sections", "Every exhibit stands in the room of its 2D section (the shared section map)", typed ? "error" : "warning", issues);
}
