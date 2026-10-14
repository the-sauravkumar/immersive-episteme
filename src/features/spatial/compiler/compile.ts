/**
 * compile(snapshot graph, selected traditions, rule set, seed) -> spatial manifest.
 *
 * Pure and deterministic: no clock, no Math.random, no locale-dependent ordering, no I/O.
 * Every collection is sorted before it is emitted and every coordinate is rounded to mm, so
 * the same inputs + COMPILER_VERSION give a byte-identical canonical manifest and hash.
 * The seed only ever reaches the tie-breaking PRNG streams (prng.ts).
 */
import { mappingRuleSetConfigSchema, type MappingRule } from "@/features/spatial/contracts";

import { canonicalHash, round, shortHash } from "./canonical";
import { categoryZoneParamsSchema, layoutConfigSchema } from "./config";
import { polylineLength, roundRect } from "./geometry";
import { attachStreaming } from "./streaming";
import { fitAspect, horizontalPlane, UNIT_SCALE, wallPlane, withPart, type Surface } from "./render";
import { analyseChains, selectScope } from "./graph";
import { planLayout, type DoorPlan, type Placement } from "./layout";
import { NavGrid } from "./navgrid";
import { compareStrings } from "./prng";
import { resolveRelationshipRule, rulesWithStrategy, strategyOf, unsupportedRuleIssues, type Resolution, type StrategyId } from "./rules";
import type {
  CompiledElement,
  CompiledManifest,
  CompileInput,
  CompileResult,
  ConceptTrace,
  Encoding,
  GraphConcept,
  GraphRelationship,
  Hotspot,
  Interaction,
  Layer,
  Point,
  RelationshipTrace,
  SpatialEncoding,
} from "./types";
import { validateCompiled, type ValidationContext } from "./validate";
import { COMPILER_VERSION, LAYOUT_VERSION } from "./version";

export class SpatialCompileError extends Error {
  override name = "SpatialCompileError";
}

const SIDE_NAME = { n: "north", e: "east", s: "south", w: "west" } as const;

export function interactionFor(strategy: StrategyId | "structure", encoding: SpatialEncoding | null): Interaction {
  switch (encoding) {
    case "containment":
      return { event: "room_entered", action: "Enter the zone that contains the exhibit" };
    case "sequence_path":
      return { event: "relationship_followed", action: "Walk the ordered path from station to station" };
    case "threshold":
      return { event: "relationship_followed", action: "Cross the threshold; the prerequisite concept is named and highlighted" };
    case "adjacency":
      return strategy === "architectural-connection"
        ? { event: "relationship_followed", action: "Pass through the doorway connecting the related rooms" }
        : { event: "exhibit_selected", action: "Select neighbouring exhibits in turn" };
    case "explicit_link":
      return strategy === "explanation-trigger"
        ? { event: "guidance_cue_used", action: "Select the cause exhibit to trigger the explanation, then follow the highlighted route to the effect" }
        : { event: "relationship_followed", action: "Follow the link hotspot to the related exhibit" };
    case "juxtaposition":
      return { event: "tradition_crossed", action: "Compare across wings through the comparison hall" };
    case "layer":
      return { event: "knowledge_layer_selected", action: "Open the deeper explanation layer on the exhibit" };
    default:
      return { event: "room_entered", action: "Move through the space" };
  }
}

export function compileSpatialManifest(input: CompileInput): CompileResult {
  return compileInternal(input).result;
}

/**
 * Validate a manifest that may have been edited after compilation (e.g. manual overrides)
 * against the same inputs. The compiler is pure, so the context is rebuilt exactly.
 */
export function revalidateManifest(input: CompileInput, manifest: CompiledManifest) {
  return validateCompiled(manifest, compileInternal(input).ctx);
}

function compileInternal(input: CompileInput): { result: CompileResult; ctx: ValidationContext } {
  // --- Inputs -----------------------------------------------------------------------------
  const parsedConfig = mappingRuleSetConfigSchema.safeParse(input.ruleSet.config);
  if (!parsedConfig.success) throw new SpatialCompileError(`Invalid mapping rule set: ${parsedConfig.error.message}`);
  const config = parsedConfig.data;
  const parsedLayout = layoutConfigSchema.safeParse(config.layout ?? {});
  if (!parsedLayout.success) throw new SpatialCompileError(`Invalid layout configuration: ${parsedLayout.error.message}`);
  const cfg = parsedLayout.data;
  const typeDefs = new Map(input.graph.relationshipTypes.map((t) => [t.code, t]));
  const ruleIssues = unsupportedRuleIssues(config, new Set(typeDefs.keys()));
  const ruleOf = (s: StrategyId): MappingRule | null => rulesWithStrategy(config, s)[0] ?? null;
  const zoneRule = ruleOf("category-zone");
  const circulationRule = ruleOf("circulation");
  if (!zoneRule || !circulationRule) {
    throw new SpatialCompileError(`Rule set lacks a required strategy: ${ruleIssues.errors.map((e) => e.message).join("; ")}`);
  }
  const zoneParams = categoryZoneParamsSchema.safeParse(zoneRule.emit.params);
  if (!zoneParams.success) throw new SpatialCompileError(`Rule ${zoneRule.id}: invalid zone parameters: ${zoneParams.error.message}`);
  const wingRule = ruleOf("tradition-wing");
  const comparisonRule = ruleOf("comparison-zone");
  const sequenceRule = ruleOf("sequence-path");
  const crossRule = ruleOf("architectural-connection");
  const ruleById = new Map(config.rules.map((r) => [r.id, r]));
  const minTraditions = Number(comparisonRule?.emit.params?.minTraditions ?? 2);

  const constructsFor = (ruleId: string): string[] => {
    const fromInput = input.assessmentConstructs?.[ruleId];
    const fromRule = ruleById.get(ruleId)?.emit.params?.assessmentConstructIds;
    const list = fromInput ?? (Array.isArray(fromRule) ? (fromRule as unknown[]).filter((x): x is string => typeof x === "string") : []);
    return [...new Set(list)].sort(compareStrings);
  };

  // --- Scope and rule resolution ----------------------------------------------------------
  const scope = selectScope(input.graph, input.traditions, minTraditions);
  const resolution = new Map<string, Resolution>();
  const primaryStrategy = new Map<string, StrategyId | null>();
  for (const r of scope.relationships) {
    const s = scope.conceptByKey.get(r.source)!;
    const t = scope.conceptByKey.get(r.target)!;
    const ss = scope.slugOf(s);
    const ts = scope.slugOf(t);
    const res = resolveRelationshipRule(config, {
      type: r.type,
      semantics: typeDefs.get(r.type)?.semantics ?? null,
      crossTradition: ss !== null && ts !== null && ss !== ts,
    });
    resolution.set(r.id, res);
    primaryStrategy.set(r.id, res.primary ? strategyOf(res.primary) : null);
  }
  const sequenceRels = scope.relationships.filter((r) => primaryStrategy.get(r.id) === "sequence-path");
  const chains = analyseChains(
    sequenceRels,
    new Set(sequenceRels.map((r) => r.type)),
    new Set(input.graph.relationshipTypes.filter((t) => t.allowsCycles).map((t) => t.code)),
  );

  // --- Layout -----------------------------------------------------------------------------
  const layout = planLayout({
    scope,
    groups: zoneParams.data.groups,
    entranceGroup: zoneParams.data.entranceGroup,
    fallbackGroup: zoneParams.data.fallbackGroup,
    sharedLabel: zoneParams.data.sharedZoneLabel,
    cfg,
    seed: input.seed,
    chains,
    primaryStrategy,
  });
  const allColliders = [...layout.walls.colliders, ...[...layout.placements.values()].map((p) => p.footprint)];
  const nav = new NavGrid(
    layout.rooms.map((r) => r.rect),
    allColliders,
    cfg.visitorRadius,
    cfg.navResolution,
  );
  const routeBetween = (a: Point, b: Point): Point[] | null => {
    const pts = nav.route(a, b);
    if (!pts) return null;
    const out: Point[] = [];
    for (const p of [a, ...pts, b]) {
      const q = { x: round(p.x), z: round(p.z) };
      const last = out[out.length - 1];
      if (!last || last.x !== q.x || last.z !== q.z) out.push(q);
    }
    return out;
  };

  // --- Element construction ---------------------------------------------------------------
  const elements = new Map<string, CompiledElement>();
  const extraConcepts = new Map<string, Set<string>>();
  const extraInteractions = new Map<string, Interaction[]>();
  const relTrace = new Map<string, Map<string, { ruleId: string; encoding: SpatialEncoding; strategy: StrategyId; elementIds: Set<string> }>>();

  type ElementDraft = Pick<CompiledElement, "id" | "kind" | "parentId" | "conceptId" | "ruleId" | "label" | "rationale"> & Record<string, unknown>;
  const add = (el: ElementDraft) => {
    if (elements.has(el.id)) throw new SpatialCompileError(`Duplicate element id ${el.id}`);
    elements.set(el.id, { ...el, encodes: [], trace: { conceptIds: [], relationshipIds: [], ruleIds: [], interactions: [], assessmentConstructIds: [] } });
  };
  const encode = (elementId: string, relId: string, ruleId: string, encoding: SpatialEncoding, strategy: StrategyId) => {
    const el = elements.get(elementId);
    if (!el) throw new SpatialCompileError(`encode: unknown element ${elementId}`);
    if (!el.encodes.some((e) => e.relationshipId === relId && e.ruleId === ruleId && e.encoding === encoding)) {
      el.encodes.push({ relationshipId: relId, ruleId, encoding });
    }
    const byKey = relTrace.get(relId) ?? relTrace.set(relId, new Map()).get(relId)!;
    const k = `${ruleId}|${encoding}`;
    const entry = byKey.get(k) ?? byKey.set(k, { ruleId, encoding, strategy, elementIds: new Set() }).get(k)!;
    entry.elementIds.add(elementId);
  };
  const noteConcepts = (elementId: string, ...ids: (string | null | undefined)[]) => {
    const set = extraConcepts.get(elementId) ?? extraConcepts.set(elementId, new Set()).get(elementId)!;
    for (const id of ids) if (id) set.add(id);
  };
  const noteInteraction = (elementId: string, i: Interaction) => {
    (extraInteractions.get(elementId) ?? extraInteractions.set(elementId, []).get(elementId)!).push(i);
  };

  const roomById = new Map(layout.rooms.map((r) => [r.id, r]));
  const doorById = new Map(layout.doors.map((d) => [d.id, d]));
  const categoryLabel = new Map(input.graph.categories.map((c) => [c.code as string, c.label]));
  const traditionConcept = new Map<string, GraphConcept>();
  for (const c of scope.concepts) {
    const slug = scope.slugOf(c);
    if (c.type === "tradition" && slug && !traditionConcept.has(slug)) traditionConcept.set(slug, c);
  }
  const wingSlugs = [...new Set(layout.rooms.filter((r) => r.kind === "wing-room").map((r) => r.slug!))].sort(compareStrings);
  const tradName = (slug: string) => scope.traditionBySlug.get(slug)?.name ?? slug;
  const doorPoint = (d: DoorPlan): Point => (d.orient === "h" ? { x: d.center, z: d.c } : { x: d.c, z: d.center });

  // Chains -> station ids.
  const stationOf = new Map<string, { pathId: string; index: number; count: number; chainId: string }>();
  for (const ch of chains) {
    const placed = ch.order.filter((k) => layout.placements.has(k));
    if (placed.length < 2) continue;
    placed.forEach((k, i) => {
      if (!stationOf.has(k)) stationOf.set(k, { pathId: `path:seq:${ch.id}`, index: i, count: placed.length, chainId: ch.id });
    });
  }
  const exhibitId = (key: string) => (stationOf.has(key) ? `station:${key}` : `exhibit:${key}`);
  const tiedRooms = new Set(layout.tieBreaks.filter((t) => t.area.startsWith("room-order:")).map((t) => t.area.split(":").slice(1, -1).join(":")));
  const tiedGroupOrder = layout.tieBreaks.some((t) => t.area.startsWith("group-order"));

  // Zones.
  for (const slug of wingSlugs) {
    const rects = layout.rooms.filter((r) => r.slug === slug).map((r) => r.rect);
    const tc = traditionConcept.get(slug);
    add({
      id: `zone:${slug}`,
      kind: "zone",
      parentId: null,
      conceptId: tc?.id ?? null,
      ruleId: wingRule?.id ?? zoneRule.id,
      label: tradName(slug),
      traditionSlug: slug,
      bounds: roundRect({
        minX: Math.min(...rects.map((r) => r.minX)),
        maxX: Math.max(...rects.map((r) => r.maxX)),
        minZ: Math.min(...rects.map((r) => r.minZ)),
        maxZ: Math.max(...rects.map((r) => r.maxZ)),
      }),
      rationale: `Wing of the ${tradName(slug)} tradition: rule ${wingRule?.id ?? zoneRule.id} gives every selected tradition one wing so that concepts sharing a tradition share a region. Wings are laid out west to east in slug order (${wingSlugs.join(", ")}), each entered from the comparison hall.`,
    });
  }
  add({
    id: "zone:comparison",
    kind: "zone",
    parentId: null,
    conceptId: null,
    ruleId: comparisonRule?.id ?? circulationRule.id,
    label: "Comparison hall",
    bounds: roundRect(roomById.get("room:hall")!.rect),
    rationale: `Connected comparison area: rule ${comparisonRule?.id ?? circulationRule.id} joins every wing entrance to one hall, so comparable traditions are physically connected and cross-tradition comparisons are juxtaposed between the wings they compare.`,
  });
  add({
    id: "zone:entrance",
    kind: "zone",
    parentId: null,
    conceptId: null,
    ruleId: circulationRule.id,
    label: "Entrance",
    bounds: roundRect(roomById.get("room:lobby")!.rect),
    rationale: `Entrance (rule ${circulationRule.id}): the single spawn point; every reachability check starts here.`,
  });
  if (roomById.has("room:commons")) {
    add({
      id: "zone:shared",
      kind: "zone",
      parentId: null,
      conceptId: null,
      ruleId: zoneRule.id,
      label: zoneParams.data.sharedZoneLabel,
      bounds: roundRect(roomById.get("room:commons")!.rect),
      rationale: `Shared knowledge that belongs to no single tradition (rule ${zoneRule.id}); it opens onto the comparison hall so that it is equally close to every wing.`,
    });
  }

  // Rooms. Floors and ceilings span the interior faces only, so they never share a plane
  // region with wall tops/bottoms; door thresholds fill the floor under each opening.
  const t2 = cfg.wallThickness / 2;
  for (const r of layout.rooms) {
    const doorIds = layout.doors.filter((d) => d.rooms.includes(r.id)).map((d) => d.id);
    const w = round(r.rect.maxX - r.rect.minX);
    const d = round(r.rect.maxZ - r.rect.minZ);
    let rationale: string;
    let ruleId: string;
    if (r.kind === "wing-room") {
      ruleId = zoneRule.id;
      rationale =
        `Zone "${r.label}": rule ${zoneRule.id} maps categories ${r.categories.join(", ")} to this room in the ${tradName(r.slug!)} wing. ` +
        (r.grid!.slot === 0
          ? `It is the wing's entrance room (entranceGroup), at grid row 0, column 0 next to the hall. `
          : `Grid slot ${r.grid!.slot} (row ${r.grid!.row}, column ${r.grid!.col}) follows the shared group order [${layout.groupOrder.join(", ")}], which places each group next to the already-placed groups it shares the most cross-category relationships with (rule ${crossRule?.id ?? "-"})${tiedGroupOrder ? "; equal scores were broken by the seeded PRNG" : ""}. `) +
        `${w} x ${d} m: the smallest grid-aligned size whose wall slots hold its ${r.conceptKeys.length} exhibits at ${cfg.exhibitSpacing} m spacing. ${r.depth} doorway(s) from the entrance.`;
    } else if (r.kind === "hall") {
      ruleId = comparisonRule?.id ?? circulationRule.id;
      rationale = `Comparison hall (rule ${ruleId}): spans all wings so every wing entrance opens onto it; ${r.conceptKeys.length} comparison exhibit(s) stand on its walls nearest to the wings they compare. ${w} x ${d} m.`;
    } else if (r.kind === "lobby") {
      ruleId = circulationRule.id;
      rationale = `Entrance lobby (rule ${circulationRule.id}): contains the spawn point and opens onto the comparison hall.`;
    } else {
      ruleId = zoneRule.id;
      rationale = `Shared commons (rule ${zoneRule.id}): ${r.conceptKeys.length} shared concept(s) (no owning tradition), one doorway from the comparison hall, ${w} x ${d} m.`;
    }
    add({
      id: r.id,
      kind: "room",
      parentId: r.zoneId,
      conceptId: null,
      ruleId,
      label: r.label,
      roomKind: r.kind,
      traditionSlug: r.slug,
      group: r.groupId,
      categories: r.categories,
      bounds: roundRect(r.rect),
      grid: r.grid,
      entranceDoorId: r.entranceDoorId,
      doorHopsFromEntrance: r.depth,
      doorIds: doorIds.sort(compareStrings),
      colliders: [...(layout.wallsByRoom.get(r.id) ?? [])].sort((p, q) => compareStrings(p.id, q.id)).map((c) => withPart(c)),
      height: cfg.wallHeight,
      scale: UNIT_SCALE,
      surfaces: [
        horizontalPlane(`${r.id}#floor`, "floor", 0, r.rect.minX + t2, r.rect.maxX - t2, r.rect.minZ + t2, r.rect.maxZ - t2),
        horizontalPlane(`${r.id}#ceiling`, "ceiling", cfg.wallHeight, r.rect.minX + t2, r.rect.maxX - t2, r.rect.minZ + t2, r.rect.maxZ - t2),
      ] satisfies Surface[],
      rationale,
    });
    for (const k of r.conceptKeys) noteConcepts(r.id, scope.conceptByKey.get(k)?.id);
  }

  // Landmark (spawn).
  add({
    id: "landmark:entrance",
    kind: "landmark",
    parentId: "room:lobby",
    conceptId: null,
    ruleId: circulationRule.id,
    label: "Entrance",
    position: { x: layout.spawn.x, y: 0, z: layout.spawn.z },
    spawn: layout.spawn,
    rationale: `Spawn point at the centre of the entrance lobby, facing north towards the comparison hall (rule ${circulationRule.id}).`,
  });

  // Portals.
  for (const d of layout.doors) {
    const p = doorPoint(d);
    const half = d.width / 2;
    const [a, b] = d.rooms.map((id) => roomById.get(id)!);
    const ruleId = d.purpose === "cross-category" && crossRule ? crossRule.id : circulationRule.id;
    add({
      id: d.id,
      kind: "portal",
      parentId: null,
      conceptId: null,
      ruleId,
      label: `${a!.label} / ${b!.label}`,
      connects: [...d.rooms],
      purpose: d.purpose,
      position: { x: round(p.x), y: 0, z: round(p.z) },
      axis: d.orient === "h" ? "x" : "z",
      width: round(d.width),
      height: round(cfg.doorHeight),
      scale: UNIT_SCALE,
      frame: { part: "door-frame", width: round(d.width), height: round(cfg.doorHeight), depth: round(cfg.wallThickness) },
      renderBoxes: [
        withPart(
          d.orient === "h"
            ? { id: `lintel:${d.id}`, kind: "wall" as const, min: [round(d.center - half), round(cfg.doorHeight), round(d.c - t2)] as [number, number, number], max: [round(d.center + half), round(cfg.wallHeight), round(d.c + t2)] as [number, number, number] }
            : { id: `lintel:${d.id}`, kind: "wall" as const, min: [round(d.c - t2), round(cfg.doorHeight), round(d.center - half)] as [number, number, number], max: [round(d.c + t2), round(cfg.wallHeight), round(d.center + half)] as [number, number, number] },
          "door-lintel",
        ),
      ],
      surfaces: [
        d.orient === "h"
          ? horizontalPlane(`${d.id}#threshold`, "threshold", 0, d.center - half, d.center + half, d.c - t2, d.c + t2)
          : horizontalPlane(`${d.id}#threshold`, "threshold", 0, d.c - t2, d.c + t2, d.center - half, d.center + half),
      ] satisfies Surface[],
      opening:
        d.orient === "h"
          ? { a: { x: round(d.center - half), z: d.c }, b: { x: round(d.center + half), z: d.c } }
          : { a: { x: d.c, z: round(d.center - half) }, b: { x: d.c, z: round(d.center + half) } },
      rationale:
        d.purpose === "cross-category"
          ? `Architectural connection (rule ${ruleId}): ${d.relationshipIds.length} relationship(s) link concepts of "${a!.label}" and "${b!.label}", so the two rooms are grid neighbours joined by this ${d.width} m doorway.`
          : d.purpose === "entrance"
            ? `Entrance doorway (rule ${ruleId}) between "${a!.label}" and "${b!.label}"; ${d.width} m wide (minimum ${cfg.minDoorWidth} m).`
            : `Circulation doorway (rule ${ruleId}) on the spanning tree that keeps every room reachable; ${d.width} m wide (minimum ${cfg.minDoorWidth} m).`,
    });
  }

  // Exhibits and stations.
  const assetsByConcept = new Map<string, { assetId: string; kind: string | null; uri: string | null; missing?: true }[]>();
  for (const a of [...(input.assets ?? [])].sort((p, q) => compareStrings(p.id, q.id))) {
    (assetsByConcept.get(a.conceptId) ?? assetsByConcept.set(a.conceptId, []).get(a.conceptId)!).push({ assetId: a.id, kind: a.kind, uri: a.uri });
  }
  const placementByKey = layout.placements;
  const assetById = new Map((input.assets ?? []).map((a) => [a.id, a]));
  /** Wall text panel (always) and image plane (when the exhibit has an asset). */
  const exhibitSurfaces = (id: string, pl: Placement, refs: { assetId: string; missing?: true }[]): Surface[] => {
    const u = pl.wall.u;
    const out: Surface[] = [wallPlane(`${id}#panel`, "panel", pl.wall, cfg.panelOffset, u - cfg.panelWidth / 2, u + cfg.panelWidth / 2, cfg.panelBottom, cfg.panelTop)];
    const asset = refs.map((r) => assetById.get(r.assetId)).find((a) => !!a);
    if (asset) {
      const aspect = asset.width && asset.height ? asset.width / asset.height : null;
      // Unknown aspect: the plane is a bounding box only; the loader must fit the image (reported as a warning).
      const { w, h } = aspect ? fitAspect(aspect, cfg.imageMaxWidth, cfg.imageMaxHeight) : { w: cfg.imageMaxWidth, h: cfg.imageMaxHeight };
      out.push(
        wallPlane(`${id}#image`, "image", pl.wall, cfg.panelOffset + cfg.imageOffset, u - w / 2, u + w / 2, cfg.imageCenterY - h / 2, cfg.imageCenterY + h / 2, {
          aspectRatio: aspect ? round(aspect, 6) : null,
          assetId: asset.id,
        }),
      );
    }
    return out;
  };
  for (const c of scope.concepts) {
    const pl = placementByKey.get(c.key);
    if (!pl) continue;
    const room = roomById.get(pl.roomId)!;
    const st = stationOf.get(c.key);
    const id = exhibitId(c.key);
    const refs = [...(assetsByConcept.get(c.id) ?? [])];
    for (const aid of c.assetIds ?? []) if (!refs.some((r) => r.assetId === aid)) refs.push({ assetId: aid, kind: null, uri: null, missing: true });
    refs.sort((p, q) => compareStrings(p.assetId, q.assetId));
    const ruleId = st && sequenceRule ? sequenceRule.id : room.kind === "hall" && comparisonRule ? comparisonRule.id : zoneRule.id;
    const where =
      room.kind === "hall"
        ? `the comparison hall (rule ${comparisonRule?.id ?? zoneRule.id}), on the wall slot nearest to the wing(s) it compares (${(scope.compares.get(c.key) ?? []).map((k) => scope.slugOf(scope.conceptByKey.get(k)!)).filter((s, i, arr) => s && arr.indexOf(s) === i).join(", ") || scope.slugOf(c) || "none"})`
        : room.kind === "commons"
          ? `the shared commons (rule ${zoneRule.id}) because it belongs to no single tradition and is linked to a selected one`
          : `"${room.label}" because rule ${zoneRule.id} maps category ${c.category} to zone group ${room.groupId} of the ${tradName(room.slug!)} wing${wingRule ? ` (rule ${wingRule.id})` : ""}`;
    add({
      id,
      kind: st ? "station" : "exhibit",
      parentId: room.id,
      conceptId: c.id,
      ruleId,
      label: c.title.slice(0, 300),
      conceptKey: c.key,
      conceptType: c.type,
      category: c.category,
      display: c.type === "material" || c.type === "tool" ? "plinth" : "panel",
      position: { x: pl.position.x, y: 0, z: pl.position.z },
      yawDeg: pl.yawDeg,
      wall: pl.side,
      wallOrder: pl.order,
      approach: pl.approach,
      colliders: [withPart(pl.footprint)],
      assetRefs: refs,
      scale: UNIT_SCALE,
      wallOffset: round(cfg.panelOffset, 4),
      polygonOffset: { factor: -1, units: -1 },
      surfaces: exhibitSurfaces(id, pl, refs),
      sequence: st ? { pathId: st.pathId, index: st.index, count: st.count } : null,
      hotspots: [
        {
          id: `${id}#inspect`,
          kind: "inspect",
          label: `Inspect ${c.title}`.slice(0, 300),
          targetElementId: null,
          relationshipId: null,
          ruleId,
        } satisfies Hotspot,
      ],
      layers: [] as Layer[],
      rationale:
        `${c.title} (${c.type}, category ${c.category}) stands in ${where}. ` +
        `It is on the ${SIDE_NAME[pl.side]} wall, position ${pl.order + 1} clockwise from the room entrance` +
        (st ? `; stop ${st.index + 1} of ${st.count} on ${st.pathId} (rule ${sequenceRule?.id}), so consecutive process stages stand in consecutive slots` : "") +
        (tiedRooms.has(room.id) ? `; where several exhibits were equally associated, the slot order was broken by the seeded PRNG` : "") +
        ".",
    });
  }
  const exhibitOf = (key: string): CompiledElement | undefined => elements.get(exhibitId(key));
  const placementOf = (key: string): Placement | undefined => placementByKey.get(key);

  // Category labels.
  for (const r of layout.rooms) {
    const byCat = new Map<string, Placement[]>();
    for (const k of r.conceptKeys) {
      const pl = placementOf(k);
      if (!pl) continue;
      const cat = scope.conceptByKey.get(k)!.category;
      (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(pl);
    }
    for (const [cat, pls] of [...byCat.entries()].sort((p, q) => compareStrings(p[0], q[0]))) {
      const first = [...pls].sort((p, q) => p.order - q.order)[0]!;
      const id = `label:${r.id.slice(5)}:${cat}`;
      add({
        id,
        kind: "label",
        parentId: r.id,
        conceptId: null,
        ruleId: zoneRule.id,
        label: (categoryLabel.get(cat) ?? cat).slice(0, 300),
        category: cat,
        position: { x: first.wall.orient === "h" ? first.wall.u : first.wall.face, y: round((cfg.signBottom + cfg.signTop) / 2), z: first.wall.orient === "h" ? first.wall.face : first.wall.u },
        scale: UNIT_SCALE,
        wallOffset: round(cfg.panelOffset, 4),
        polygonOffset: { factor: -1, units: -1 },
        surfaces: [wallPlane(`${id}#sign`, "sign", first.wall, cfg.panelOffset, first.wall.u - cfg.panelWidth / 2, first.wall.u + cfg.panelWidth / 2, cfg.signBottom, cfg.signTop)],
        yawDeg: first.yawDeg,
        rationale: `Category sign (rule ${zoneRule.id}): marks where the ${pls.length} "${categoryLabel.get(cat) ?? cat}" exhibit(s) of this room begin, so categories stay distinguishable within the zone.`,
      });
      for (const pl of pls) noteConcepts(id, scope.conceptByKey.get(pl.conceptKey)?.id);
    }
  }

  // Wing entry cues.
  for (const slug of wingSlugs) {
    const entranceRoom = layout.rooms.find((r) => r.slug === slug && r.grid?.slot === 0);
    const door = entranceRoom?.entranceDoorId ? doorById.get(entranceRoom.entranceDoorId) : undefined;
    if (!door) continue;
    const p = doorPoint(door);
    const id = `cue:wing-entry:${slug}`;
    add({
      id,
      kind: "cue",
      parentId: null,
      conceptId: traditionConcept.get(slug)?.id ?? null,
      ruleId: wingRule?.id ?? circulationRule.id,
      label: `Entering ${tradName(slug)}`.slice(0, 300),
      position: { x: round(p.x), y: 0, z: round(p.z) },
      trigger: { type: "enter", elementId: door.id, radius: null },
      effect: { type: "announce", text: tradName(slug) },
      rationale: `Guidance trigger (rule ${wingRule?.id ?? circulationRule.id}): crossing the wing's entrance doorway announces the tradition, marking the boundary of its containment zone.`,
    });
    noteInteraction(id, { event: "guidance_cue_used", action: "Notice the wing announcement on entering" });
  }

  // --- Relationship encodings ---------------------------------------------------------------
  const relById = new Map(scope.relationships.map((r) => [r.id, r]));
  const hotspot = (fromKey: string, toKey: string, rel: GraphRelationship, ruleId: string, kind: Hotspot["kind"], verb: string) => {
    const from = exhibitOf(fromKey);
    const to = exhibitOf(toKey);
    if (!from || !to) return;
    const list = from.hotspots as Hotspot[];
    const hid = `${from.id}#${kind}:${shortHash(rel.id)}`;
    if (list.some((h) => h.id === hid)) return;
    list.push({ id: hid, kind, label: `${verb} ${scope.conceptByKey.get(toKey)!.title}`.slice(0, 300), targetElementId: to.id, relationshipId: rel.id, ruleId });
  };
  const doorBetween = (ra: string, rb: string) => layout.doors.find((d) => d.rooms.includes(ra) && d.rooms.includes(rb) && ra !== rb);
  const comparisonPairs = new Map<string, GraphRelationship[]>();

  for (const rel of scope.relationships) {
    const res = resolution.get(rel.id)!;
    const rule = res.primary;
    const S = scope.conceptByKey.get(rel.source)!;
    const T = scope.conceptByKey.get(rel.target)!;
    const roomS = layout.roomOf.get(S.key);
    const roomT = layout.roomOf.get(T.key);
    // Secondary: architectural connection between different rooms of one wing.
    if (crossRule && roomS && roomT && roomS !== roomT) {
      const d = doorBetween(roomS, roomT);
      if (d && d.relationshipIds.includes(rel.id)) encode(d.id, rel.id, crossRule.id, "adjacency", "architectural-connection");
    }
    if (!rule) continue;
    const strategy = strategyOf(rule)!;
    const exS = exhibitOf(S.key);
    const exT = exhibitOf(T.key);
    switch (strategy) {
      case "tradition-wing": {
        const slug = roomS ? roomById.get(roomS)?.slug : null;
        if (T.type === "tradition" && slug && scope.slugOf(T) === slug && elements.has(`zone:${slug}`)) {
          encode(`zone:${slug}`, rel.id, rule.id, "containment", strategy);
          if (exS) noteConcepts(`zone:${slug}`, S.id);
        } else if (roomS && roomS === roomT) {
          encode(roomS, rel.id, rule.id, "containment", strategy);
        } else if (exS && exT) {
          encode(exS.id, rel.id, rule.id, "explicit_link", strategy);
          hotspot(S.key, T.key, rel, rule.id, "link", "Part of");
          hotspot(T.key, S.key, rel, rule.id, "link", "Includes");
        }
        break;
      }
      case "sequence-path": {
        const st = stationOf.get(S.key);
        if (st && stationOf.get(T.key)?.pathId === st.pathId) {
          // Encoded on the path element below, once it exists.
        }
        break;
      }
      case "threshold": {
        if (!exS || !exT) break;
        const id = `cue:threshold:${shortHash(rel.id)}`;
        const d = roomS && roomT && roomS !== roomT ? doorBetween(roomS, roomT) : undefined;
        const pS = placementOf(S.key)!;
        const pos = d ? doorPoint(d) : pS.approach;
        add({
          id,
          kind: "cue",
          parentId: d ? null : roomS ?? null,
          conceptId: S.id,
          ruleId: rule.id,
          label: `Before ${S.title}: ${T.title}`.slice(0, 300),
          position: { x: round(pos.x), y: 0, z: round(pos.z) },
          relationshipType: rel.type,
          trigger: d ? { type: "enter", elementId: d.id, radius: null } : { type: "approach", elementId: exS.id, radius: 1.5 },
          effect: { type: "name-prerequisite", prerequisiteElementId: exT.id, dependentElementId: exS.id, explanation: rel.explanation ?? null },
          rationale: d
            ? `Threshold (rule ${rule.id}): ${S.title} ${rel.type} ${T.title}; the two sit in different rooms joined by doorway ${d.id}, so crossing that doorway names the prerequisite.`
            : `Threshold (rule ${rule.id}): ${S.title} ${rel.type} ${T.title}; there is no direct doorway between them, so approaching the dependent exhibit names and highlights the prerequisite.`,
        });
        noteConcepts(id, T.id);
        encode(id, rel.id, rule.id, "threshold", strategy);
        if (d) encode(d.id, rel.id, rule.id, "threshold", strategy);
        break;
      }
      case "adjacency": {
        if (!exS || !exT) break;
        const pS = placementOf(S.key)!;
        const pT = placementOf(T.key)!;
        const near = roomS === roomT && Math.hypot(pS.approach.x - pT.approach.x, pS.approach.z - pT.approach.z) <= cfg.adjacencyDistance + 1e-6;
        if (near) {
          encode(exS.id, rel.id, rule.id, "adjacency", strategy);
          encode(exT.id, rel.id, rule.id, "adjacency", strategy);
        } else {
          encode(exS.id, rel.id, rule.id, "explicit_link", strategy);
          hotspot(S.key, T.key, rel, rule.id, "link", typeDefs.get(rel.type)?.label ? `${typeDefs.get(rel.type)!.label}:` : "Related:");
          hotspot(T.key, S.key, rel, rule.id, "link", "Related:");
        }
        break;
      }
      case "comparison-zone": {
        const a = scope.slugOf(S)!;
        const b = scope.slugOf(T)!;
        const k = [a, b].sort(compareStrings).join("--");
        (comparisonPairs.get(k) ?? comparisonPairs.set(k, []).get(k)!).push(rel);
        hotspot(S.key, T.key, rel, rule.id, "compare", "Compare with");
        hotspot(T.key, S.key, rel, rule.id, "compare", "Compare with");
        break;
      }
      case "explanation-trigger": {
        if (!exS || !exT) break;
        const causeIsTarget = Array.isArray(rule.emit.params?.causeIsTarget) && (rule.emit.params.causeIsTarget as unknown[]).includes(rel.type);
        const [cause, effect] = causeIsTarget ? [T, S] : [S, T];
        const exC = exhibitOf(cause.key)!;
        const exE = exhibitOf(effect.key)!;
        const route = routeBetween(placementOf(cause.key)!.approach, placementOf(effect.key)!.approach);
        const id = `cue:cause:${shortHash(rel.id)}`;
        const pC = placementOf(cause.key)!;
        add({
          id,
          kind: "cue",
          parentId: layout.roomOf.get(cause.key) ?? null,
          conceptId: cause.id,
          ruleId: rule.id,
          label: `Why: ${cause.title} -> ${effect.title}`.slice(0, 300),
          position: { x: pC.approach.x, y: 0, z: pC.approach.z },
          relationshipType: rel.type,
          trigger: { type: "select", elementId: exC.id, radius: null },
          effect: {
            type: "explain-and-guide",
            causeElementId: exC.id,
            effectElementId: exE.id,
            explanation: rel.explanation ?? null,
            route: route ?? [],
            routeLength: route ? round(polylineLength(route)) : null,
          },
          rationale:
            `Explanatory progression (rule ${rule.id}): ${S.title} ${rel.type} ${T.title} is causal, so it is not left to proximity. ` +
            `Selecting the cause (${cause.title}) triggers the explanation and highlights a walkable route to the effect (${effect.title})` +
            (layout.roomOf.get(cause.key) === layout.roomOf.get(effect.key) ? " in the same room." : ` in ${roomById.get(layout.roomOf.get(effect.key)!)!.label}.`),
        });
        noteConcepts(id, effect.id);
        encode(id, rel.id, rule.id, "explicit_link", strategy);
        hotspot(cause.key, effect.key, rel, rule.id, "link", "Why it leads to");
        break;
      }
      case "progressive-layer": {
        const explainerSide = rule.emit.params?.explainer === "source" ? "source" : "target";
        const [explained, explainer] = explainerSide === "target" ? [S, T] : [T, S];
        const exX = exhibitOf(explained.key);
        if (!exX) break;
        const kinds = (rule.emit.params?.layerKinds ?? {}) as Record<string, string>;
        const kind = (["science", "practitioner", "explanation"].includes(kinds[rel.type] ?? "") ? kinds[rel.type] : "explanation") as Layer["kind"];
        (exX.layers as Layer[]).push({
          id: `${exX.id}#layer:${shortHash(rel.id)}`,
          kind,
          depth: 0,
          conceptId: explainer.id,
          conceptKey: explainer.key,
          relationshipId: rel.id,
          ruleId: rule.id,
          linkedElementId: exhibitOf(explainer.key)?.id ?? null,
        });
        noteConcepts(exX.id, explainer.id);
        encode(exX.id, rel.id, rule.id, "layer", strategy);
        hotspot(explainer.key, explained.key, rel, rule.id, "link", "Explains");
        break;
      }
      default:
        break;
    }
  }

  // Sequence paths.
  for (const ch of chains) {
    const keys = ch.order.filter((k) => stationOf.get(k)?.chainId === ch.id);
    if (keys.length < 2 || !sequenceRule) continue;
    const id = `path:seq:${ch.id}`;
    const waypoints: Point[] = [];
    const legs: { from: string; to: string; length: number | null }[] = [];
    let broken = false;
    for (let i = 0; i + 1 < keys.length; i++) {
      const a = placementOf(keys[i]!)!;
      const b = placementOf(keys[i + 1]!)!;
      const route = routeBetween(a.approach, b.approach);
      if (!route) {
        broken = true;
        legs.push({ from: exhibitId(keys[i]!), to: exhibitId(keys[i + 1]!), length: null });
        continue;
      }
      legs.push({ from: exhibitId(keys[i]!), to: exhibitId(keys[i + 1]!), length: round(polylineLength(route)) });
      for (const p of route) {
        const last = waypoints[waypoints.length - 1];
        if (!last || last.x !== p.x || last.z !== p.z) waypoints.push(p);
      }
    }
    const roomsOnPath = [...new Set(keys.map((k) => layout.roomOf.get(k)!))];
    const first = scope.conceptByKey.get(keys[0]!)!;
    add({
      id,
      kind: "path",
      parentId: roomsOnPath.length === 1 ? roomsOnPath[0]! : null,
      conceptId: first.id,
      ruleId: sequenceRule.id,
      label: `Sequence: ${first.title} (${keys.length} stages)`.slice(0, 300),
      ordered: true,
      orderSource: ch.orderSource,
      loops: ch.loopBacks
        .filter((l) => stationOf.get(l.from)?.chainId === ch.id && stationOf.get(l.to)?.chainId === ch.id)
        .map((l) => ({ relationshipId: l.relationshipId, fromStop: exhibitId(l.from), toStop: exhibitId(l.to) })),
      stops: keys.map(exhibitId),
      waypoints,
      legs,
      length: round(polylineLength(waypoints)),
      broken,
      rationale:
        `Ordered path (rule ${sequenceRule.id}): ${ch.relationshipIds.length} sequence link(s) form one chain, ordered ${ch.orderSource === "ordinal" ? "by PRECEDES ordinals 1.." + ch.relationshipIds.length : "topologically (no ordinals)"}. ` +
        `Its ${keys.length} stations stand in consecutive wall slots and the routed path visits them in that order.` +
        (ch.loopBacks.length ? ` ${ch.loopBacks.length} declared repeat loop(s) return from a later station to an earlier one (recorded in loops).` : ""),
    });
    for (const k of keys) noteConcepts(id, scope.conceptByKey.get(k)!.id);
    for (const relId of ch.relationshipIds) encode(id, relId, sequenceRule.id, "sequence_path", "sequence-path");
    const cueId = `cue:seq-start:${ch.id}`;
    const p0 = placementOf(keys[0]!)!;
    add({
      id: cueId,
      kind: "cue",
      parentId: layout.roomOf.get(keys[0]!) ?? null,
      conceptId: first.id,
      ruleId: sequenceRule.id,
      label: `Start of sequence: ${first.title}`.slice(0, 300),
      position: { x: p0.approach.x, y: 0, z: p0.approach.z },
      trigger: { type: "approach", elementId: exhibitId(keys[0]!), radius: 1.5 },
      effect: { type: "show-path", pathId: id },
      rationale: `Guidance trigger (rule ${sequenceRule.id}): approaching the first station reveals the ordered path through the remaining ${keys.length - 1} station(s).`,
    });
    noteInteraction(cueId, { event: "guidance_cue_used", action: "Approach the first station to reveal the ordered path" });
  }

  // Comparison paths between wings.
  if (comparisonRule) {
    for (const [pair, rels] of [...comparisonPairs.entries()].sort((p, q) => compareStrings(p[0], q[0]))) {
      const [a, b] = pair.split("--") as [string, string];
      const da = layout.rooms.find((r) => r.slug === a && r.grid?.slot === 0)?.entranceDoorId;
      const db = layout.rooms.find((r) => r.slug === b && r.grid?.slot === 0)?.entranceDoorId;
      const pa = da ? doorPoint(doorById.get(da)!) : null;
      const pb = db ? doorPoint(doorById.get(db)!) : null;
      const route = pa && pb ? routeBetween(pa, pb) : null;
      const id = `path:cmp:${pair}`;
      const comparing = [...scope.compares.entries()]
        .filter(([, ks]) => {
          const slugs = new Set(ks.map((k) => scope.slugOf(scope.conceptByKey.get(k)!)));
          return slugs.has(a) && slugs.has(b);
        })
        .map(([k]) => k)
        .sort(compareStrings);
      add({
        id,
        kind: "path",
        parentId: "room:hall",
        conceptId: null,
        ruleId: comparisonRule.id,
        label: `Compare ${tradName(a)} and ${tradName(b)}`.slice(0, 300),
        ordered: false,
        stops: [da, db, ...comparing.map(exhibitId).filter((x) => elements.has(x))].filter((x): x is string => !!x),
        waypoints: route ?? [],
        length: route ? round(polylineLength(route)) : null,
        broken: !route,
        rationale: `Connected comparison zones (rule ${comparisonRule.id}): ${rels.length} cross-tradition SIMILAR_TO / CONTRASTS_WITH link(s) connect ${tradName(a)} and ${tradName(b)}; this route joins their wing entrances through the comparison hall, where ${comparing.length} comparison exhibit(s) about both stand.`,
      });
      for (const rel of rels) {
        encode(id, rel.id, comparisonRule.id, "juxtaposition", "comparison-zone");
        noteConcepts(id, scope.conceptByKey.get(rel.source)?.id, scope.conceptByKey.get(rel.target)?.id);
      }
      for (const k of comparing) noteConcepts(id, scope.conceptByKey.get(k)?.id);
    }
  }

  // Compare hotspots from comparison exhibits to the concepts they compare.
  for (const [key, ks] of scope.compares) {
    const ex = exhibitOf(key);
    if (!ex) continue;
    for (const k of ks) {
      const target = exhibitOf(k);
      if (!target) continue;
      (ex.hotspots as Hotspot[]).push({
        id: `${ex.id}#compares:${shortHash(k)}`,
        kind: "compare",
        label: `Compared: ${scope.conceptByKey.get(k)!.title}`.slice(0, 300),
        targetElementId: target.id,
        relationshipId: null,
        ruleId: ex.ruleId,
      });
      noteConcepts(ex.id, scope.conceptByKey.get(k)!.id);
    }
  }

  // --- Finalise elements: sort members, build traces ------------------------------------------
  const finalElements: CompiledElement[] = [];
  for (const el of [...elements.values()].sort((p, q) => compareStrings(p.id, q.id))) {
    el.encodes.sort((p: Encoding, q: Encoding) => compareStrings(p.relationshipId, q.relationshipId) || compareStrings(p.ruleId, q.ruleId) || compareStrings(p.encoding, q.encoding));
    if (Array.isArray(el.hotspots)) (el.hotspots as Hotspot[]).sort((p, q) => compareStrings(p.id, q.id));
    if (Array.isArray(el.layers)) {
      const kindOrder = { science: 0, practitioner: 1, explanation: 2 } as const;
      const layers = el.layers as Layer[];
      layers.sort((p, q) => kindOrder[p.kind] - kindOrder[q.kind] || compareStrings(p.conceptKey, q.conceptKey) || compareStrings(p.id, q.id));
      layers.forEach((l, i) => (l.depth = i + 1));
    }
    const conceptIds = new Set<string>([...(el.conceptId ? [el.conceptId] : []), ...(extraConcepts.get(el.id) ?? [])]);
    const ruleIds = new Set<string>([el.ruleId, ...el.encodes.map((e) => e.ruleId)]);
    const interactions: Interaction[] = [];
    const pushI = (i: Interaction) => {
      if (!interactions.some((x) => x.event === i.event && x.action === i.action)) interactions.push(i);
    };
    if (el.kind === "exhibit" || el.kind === "station") pushI({ event: "exhibit_selected", action: "Select the exhibit to read its summary and claims" });
    if (el.kind === "room" || el.kind === "zone") pushI({ event: "room_entered", action: "Enter the space" });
    if (el.kind === "portal") pushI({ event: "relationship_followed", action: "Walk through the doorway" });
    if (el.kind === "path") pushI(interactionFor(el.ruleId === comparisonRule?.id ? "comparison-zone" : "sequence-path", el.ruleId === comparisonRule?.id ? "juxtaposition" : "sequence_path"));
    if (el.kind === "label") pushI({ event: "concept_encountered", action: "Read the category sign" });
    if (el.kind === "landmark") pushI({ event: "room_entered", action: "Start the visit at the entrance" });
    for (const i of extraInteractions.get(el.id) ?? []) pushI(i);
    for (const e of el.encodes) {
      const s = strategyOf(ruleById.get(e.ruleId)!) ?? "structure";
      pushI(interactionFor(s, e.encoding));
    }
    el.trace = {
      conceptIds: [...conceptIds].sort(compareStrings),
      relationshipIds: [...new Set(el.encodes.map((e) => e.relationshipId))].sort(compareStrings),
      ruleIds: [...ruleIds].sort(compareStrings),
      interactions,
      assessmentConstructIds: [...new Set([...ruleIds].flatMap(constructsFor))].sort(compareStrings),
    };
    finalElements.push(el);
  }
  attachStreaming(finalElements);

  // --- Traceability index -------------------------------------------------------------------
  const relationships: RelationshipTrace[] = scope.relationships.map((rel) => {
    const res = resolution.get(rel.id)!;
    const entries = [...(relTrace.get(rel.id)?.values() ?? [])].sort((p, q) => compareStrings(p.ruleId, q.ruleId) || compareStrings(p.encoding, q.encoding));
    const typeDef = typeDefs.get(rel.type);
    return {
      relationshipId: rel.id,
      type: rel.type,
      semantics: typeDef?.semantics ?? null,
      sourceConceptId: scope.conceptByKey.get(rel.source)?.id ?? null,
      targetConceptId: scope.conceptByKey.get(rel.target)?.id ?? null,
      primaryRuleId: res.primary?.id ?? null,
      status: entries.length > 0 ? "encoded" : "unencoded",
      reason:
        entries.length > 0
          ? null
          : !typeDef
            ? `Relationship type ${rel.type} is not registered in the snapshot`
            : res.primary
              ? `Rule ${res.primary.id} produced no element (an endpoint is unplaced or the sequence has fewer than two placed stations)`
              : `No rule matches type ${rel.type} (semantics ${typeDef.semantics})`,
      encodings: entries.map((e) => ({
        ruleId: e.ruleId,
        encoding: e.encoding,
        elementIds: [...e.elementIds].sort(compareStrings),
        interaction: interactionFor(e.strategy, e.encoding),
        assessmentConstructIds: constructsFor(e.ruleId),
      })),
    };
  });
  const concepts: ConceptTrace[] = [
    ...scope.concepts.map((c) => ({
      conceptId: c.id,
      key: c.key,
      status: (elements.has(exhibitId(c.key)) ? "placed" : "unplaced") as ConceptTrace["status"],
      elementId: elements.has(exhibitId(c.key)) ? exhibitId(c.key) : null,
      reason: elements.has(exhibitId(c.key)) ? null : "No wall slot or room was available",
    })),
    ...scope.outOfScope
      .filter((o) => o.concept.traditionId === null || scope.selectedSlugs.includes(scope.slugOf(o.concept) ?? ""))
      .map((o) => ({ conceptId: o.concept.id, key: o.concept.key, status: "out_of_scope" as const, elementId: null, reason: o.reason })),
  ].sort((p, q) => compareStrings(p.key, q.key));

  const manifest: CompiledManifest = {
    schemaVersion: 1,
    snapshotVersion: input.snapshotVersion,
    ruleSet: { id: input.ruleSet.id, name: input.ruleSet.name, version: input.ruleSet.version, configSha256: canonicalHash(config) },
    compilerVersion: COMPILER_VERSION,
    layoutVersion: LAYOUT_VERSION,
    seed: input.seed,
    units: "m",
    selection: { traditions: [...scope.selectedSlugs] },
    accessibility: { minDoorWidth: cfg.minDoorWidth, visitorRadius: cfg.visitorRadius },
    elements: finalElements,
    traceability: { relationships, concepts },
  };
  const manifestHash = canonicalHash(manifest);

  const conflicts = scope.relationships
    .filter((r) => resolution.get(r.id)!.conflicts.length > 0)
    .map((r) => ({ relationshipId: r.id, type: r.type, ruleIds: [resolution.get(r.id)!.primary!.id, ...resolution.get(r.id)!.conflicts.map((c) => c.id)] }));
  const ctx: ValidationContext = {
    graph: input.graph,
    snapshotVersion: input.snapshotVersion,
    scope,
    chains,
    config,
    cfg,
    ruleIssues,
    conflicts,
    resolution,
    layoutIssues: layout.issues,
    unmappedCategory: layout.unmappedCategory,
    assets: input.assets ?? [],
    relById,
  };
  const validation = validateCompiled(manifest, ctx);
  return { result: { manifest, manifestHash, validation }, ctx };
}

/** Re-export for consumers that only need to hash an existing manifest. */
export function manifestHashOf(manifest: CompiledManifest): string {
  return canonicalHash(manifest);
}

