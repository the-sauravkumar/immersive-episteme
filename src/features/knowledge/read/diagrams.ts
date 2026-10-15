/**
 * Graph-derived structure diagrams (DR-018; DESIGN.md 9.9 "Figure kinds", 12.3 rules 8-9).
 *
 * A pure generator: from ONE knowledge bundle it builds, for a tradition, the data and the layout
 * of three diagram types, which the shared `KnowledgeFigure` renders as SVG identically in both
 * conditions:
 *
 *  - `process-sequence`: the tradition's PRECEDES chain of process stages, stage titles as node
 *    labels (anchor: the first stage of the chain; process section).
 *  - `materials-tools`: the USES / REQUIRES edges from one process stage to material and tool
 *    concepts (anchor: the stage with the most such edges, other than the sequence anchor;
 *    process section).
 *  - `colour-mechanism`: the chain from the tradition's stages and materials to outcome concepts,
 *    through SCIENTIFICALLY_EXPLAINED_BY hops to a scientific mechanism that PRODUCES an outcome
 *    (anchor: a science-section concept of the tradition; science section).
 *
 * What a diagram may show (the DR-018 rule "a figure states nothing the claims and relationships
 * do not state"): every node is a concept of the bundle with its title, and every edge is a
 * relationship of the bundle, of the diagram type's stated relationship types, drawn in its own
 * direction and labelled with the registry's own label for that type. Nothing else is drawn or
 * written, apart from the band labels of the colour diagram, which repeat the edge labels of the
 * edges in that band. tests/unit/knowledge/diagrams.test.ts checks this against the real content.
 *
 * Balance (12.3 rule 9): `balanceDiagramSets` keeps a diagram type only when EVERY tradition in
 * scope has it, so each study tradition gets the same types in the same sections.
 *
 * Layout: fixed 576 x 384 viewBox (3:2, the figure slot), deterministic, no measurement of real
 * text (an average character width is used, with a safety margin), so server and client agree.
 */
import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import { titleCase } from "@/lib/text/title-case";
import type { ConceptType } from "@/lib/validation/enums";

type BundleConcept = KnowledgeBundle["concepts"][number];
type BundleRelationship = KnowledgeBundle["relationships"][number];

export const STRUCTURE_DIAGRAM_TYPES = ["process-sequence", "materials-tools", "colour-mechanism"] as const;
export type StructureDiagramType = (typeof STRUCTURE_DIAGRAM_TYPES)[number];

/** The relationship types each diagram type may draw (and nothing else). */
export const DIAGRAM_EDGE_TYPES: Record<StructureDiagramType, readonly string[]> = {
  "process-sequence": ["PRECEDES"],
  "materials-tools": ["USES", "REQUIRES"],
  "colour-mechanism": ["SCIENTIFICALLY_EXPLAINED_BY", "PRODUCES"],
};

/** The tradition-page section (EPISTEMIC_SECTIONS id) whose concept anchors each type. */
export const DIAGRAM_SECTION: Record<StructureDiagramType, "process" | "science"> = {
  "process-sequence": "process",
  "materials-tools": "process",
  "colour-mechanism": "science",
};

/** Interface wording of the diagram types (caption lead). Not craft content. */
export const DIAGRAM_TYPE_LABELS: Record<StructureDiagramType, string> = {
  "process-sequence": "Process sequence",
  "materials-tools": "Materials and tools",
  "colour-mechanism": "Colour mechanism",
};

export const DIAGRAM_WIDTH = 576;
export const DIAGRAM_HEIGHT = 384;

export interface DiagramNode {
  /** Concept id (uuid). */
  id: string;
  key: string;
  /** The concept title exactly as in the bundle. */
  title: string;
  type: ConceptType;
  /** The anchor concept: drawn with the one indigo accent. */
  current: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Title Case label, wrapped into lines. */
  lines: string[];
}

export interface DiagramEdge {
  relationshipId: string;
  /** Relationship type code (one of DIAGRAM_EDGE_TYPES[type]). */
  type: string;
  /** The registry label of the type ("precedes", "uses", ...). */
  label: string;
  /** Concept ids. */
  source: string;
  target: string;
  /** SVG path (absolute coordinates). */
  d: string;
  /** Where the edge's own label is printed; null when its band label carries it. */
  labelAt: { x: number; y: number; anchor: "start" | "middle" | "end" } | null;
}

export interface DiagramBand {
  /** The registry label shared by every edge in the band. */
  label: string;
  x: number;
  y: number;
}

export interface StructureDiagram {
  /** Stable id: `<type>:<tradition slug>`. */
  id: string;
  type: StructureDiagramType;
  traditionSlug: string;
  traditionName: string;
  section: "process" | "science";
  anchor: { conceptId: string; conceptKey: string; claimIndex: number };
  width: number;
  height: number;
  /** Type sizes used by the layout (px in viewBox units). */
  fontSize: number;
  lineHeight: number;
  labelSize: number;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  bands: DiagramBand[];
  /** Text equivalent: every node and edge in reading order (the figure's alt text). */
  alt: string;
  /** Caption without the "Fig. n" prefix: names the concepts shown and the anchor statement. */
  caption: string;
}

// ---------------------------------------------------------------------------------------
// Graph extraction (what a diagram shows)
// ---------------------------------------------------------------------------------------

export interface DiagramGraph {
  type: StructureDiagramType;
  anchorKey: string;
  /** Concept keys, in reading order. */
  nodeKeys: string[];
  /** Relationship ids, in reading order. */
  edgeIds: string[];
}

interface Index {
  bundle: KnowledgeBundle;
  conceptByKey: Map<string, BundleConcept>;
  out: Map<string, BundleRelationship[]>;
  into: Map<string, BundleRelationship[]>;
  labelOf(type: string): string;
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function indexBundle(bundle: KnowledgeBundle): Index {
  const conceptByKey = new Map(bundle.concepts.map((c) => [c.key, c]));
  const out = new Map<string, BundleRelationship[]>();
  const into = new Map<string, BundleRelationship[]>();
  for (const r of bundle.relationships) {
    if (!conceptByKey.has(r.source) || !conceptByKey.has(r.target)) continue;
    out.set(r.source, [...(out.get(r.source) ?? []), r]);
    into.set(r.target, [...(into.get(r.target) ?? []), r]);
  }
  const labels = new Map(bundle.relationshipTypes.map((t) => [t.code, t.label]));
  return { bundle, conceptByKey, out, into, labelOf: (type) => labels.get(type) ?? type.toLowerCase().replace(/_/g, " ") };
}

const hasClaims = (c: BundleConcept | undefined) => !!c && c.claims.length > 0;

/** The tradition's process chain: ordinalled PRECEDES edges between its process stages, by ordinal. */
function processChain(ix: Index, traditionId: string): { steps: string[]; edges: BundleRelationship[] } {
  const isStage = (k: string) => {
    const c = ix.conceptByKey.get(k);
    return c?.type === "process_stage" && c.traditionId === traditionId;
  };
  const edges = ix.bundle.relationships
    .filter((r) => r.type === "PRECEDES" && r.ordinal != null && isStage(r.source) && isStage(r.target))
    .sort((a, b) => a.ordinal! - b.ordinal! || byString(a.id, b.id));
  const steps: string[] = [];
  for (const r of edges) {
    if (!steps.includes(r.source)) steps.push(r.source);
    if (!steps.includes(r.target)) steps.push(r.target);
  }
  return { steps, edges };
}

function processSequenceGraph(ix: Index, traditionId: string): DiagramGraph | null {
  const { steps, edges } = processChain(ix, traditionId);
  if (edges.length === 0) return null;
  const anchorKey = steps.find((k) => hasClaims(ix.conceptByKey.get(k)));
  if (!anchorKey) return null;
  return { type: "process-sequence", anchorKey, nodeKeys: steps, edgeIds: edges.map((e) => e.id) };
}

const MATERIAL_TOOL: readonly ConceptType[] = ["material", "tool"];

function materialsGraph(ix: Index, traditionId: string, excludeKey: string | null): DiagramGraph | null {
  const { steps } = processChain(ix, traditionId);
  const stageOrder = (k: string) => {
    const i = steps.indexOf(k);
    return i === -1 ? steps.length : i;
  };
  const stages = ix.bundle.concepts
    .filter((c) => c.type === "process_stage" && c.traditionId === traditionId && c.key !== excludeKey && hasClaims(c))
    .sort((a, b) => stageOrder(a.key) - stageOrder(b.key) || byString(a.key, b.key));
  const edgesOf = (k: string) =>
    (ix.out.get(k) ?? []).filter((r) => DIAGRAM_EDGE_TYPES["materials-tools"].includes(r.type) && MATERIAL_TOOL.includes(ix.conceptByKey.get(r.target)!.type));
  let best: { key: string; edges: BundleRelationship[] } | null = null;
  for (const s of stages) {
    const e = edgesOf(s.key);
    if (e.length > 0 && (!best || e.length > best.edges.length)) best = { key: s.key, edges: e };
  }
  if (!best) return null;
  const typeRank = (r: BundleRelationship) => DIAGRAM_EDGE_TYPES["materials-tools"].indexOf(r.type);
  const kindRank = (r: BundleRelationship) => MATERIAL_TOOL.indexOf(ix.conceptByKey.get(r.target)!.type);
  const ordered = [...best.edges].sort(
    (a, b) => typeRank(a) - typeRank(b) || kindRank(a) - kindRank(b) || byString(ix.conceptByKey.get(a.target)!.title, ix.conceptByKey.get(b.target)!.title) || byString(a.id, b.id),
  );
  const targets: string[] = [];
  for (const r of ordered) if (!targets.includes(r.target)) targets.push(r.target);
  return { type: "materials-tools", anchorKey: best.key, nodeKeys: [best.key, ...targets], edgeIds: ordered.map((r) => r.id) };
}

const SCIENCE_TYPES: readonly ConceptType[] = ["scientific_mechanism", "explanation"];
const SEED_TYPES: readonly ConceptType[] = ["process_stage", "material"];
const MAX_EXPLANATION_HOPS = 3;

function colourGraph(ix: Index, traditionId: string): DiagramGraph | null {
  const { steps } = processChain(ix, traditionId);
  const stageOrder = (k: string) => {
    const i = steps.indexOf(k);
    return i === -1 ? steps.length : i;
  };
  const concept = (k: string) => ix.conceptByKey.get(k)!;
  const seb = (k: string) => (ix.out.get(k) ?? []).filter((r) => r.type === "SCIENTIFICALLY_EXPLAINED_BY" && SCIENCE_TYPES.includes(concept(r.target).type));
  const produces = (k: string) => (ix.out.get(k) ?? []).filter((r) => r.type === "PRODUCES" && concept(r.target).type === "outcome");

  const seeds = ix.bundle.concepts
    .filter((c) => c.traditionId === traditionId && SEED_TYPES.includes(c.type))
    .sort((a, b) => stageOrder(a.key) - stageOrder(b.key) || byString(a.key, b.key));

  // Every path seed -SEB-> ... -SEB-> mechanism -PRODUCES-> outcome (acyclic, bounded depth).
  const edgeIds = new Set<string>();
  const onPath = new Set<string>();
  const seedsOnPath: string[] = [];
  const walk = (k: string, trail: BundleRelationship[], seen: Set<string>): boolean => {
    let found = false;
    if (concept(k).type === "scientific_mechanism") {
      for (const p of produces(k)) {
        found = true;
        for (const e of [...trail, p]) {
          edgeIds.add(e.id);
          onPath.add(e.source);
          onPath.add(e.target);
        }
      }
    }
    if (trail.length >= MAX_EXPLANATION_HOPS) return found;
    for (const r of seb(k)) {
      if (seen.has(r.target)) continue;
      if (walk(r.target, [...trail, r], new Set([...seen, r.target]))) found = true;
    }
    return found;
  };
  for (const s of seeds) {
    if (seb(s.key).length === 0) continue;
    if (walk(s.key, [], new Set([s.key]))) seedsOnPath.push(s.key);
  }
  if (edgeIds.size === 0) return null;

  // Anchor: a science-section concept OF THIS TRADITION (12.3 rule 9 places this type in the
  // science section), chosen by rule so it is always drawn in the diagram:
  //  1. one that lies on a colour path;
  //  2. else one that a stage on a colour path is SCIENTIFICALLY_EXPLAINED_BY (edge added);
  //  3. else one that explains the process stage nearest in the PRECEDES order to a stage on a
  //     colour path (that stage and edge added); ties by concept key.
  const candidates = ix.bundle.concepts
    .filter((c) => c.traditionId === traditionId && SCIENCE_TYPES.includes(c.type) && hasClaims(c))
    .sort((a, b) => byString(a.key, b.key));
  const firstSeedIndex = (k: string) => {
    const explaining = (ix.into.get(k) ?? []).filter((r) => r.type === "SCIENTIFICALLY_EXPLAINED_BY" && seedsOnPath.includes(r.source)).map((r) => seedsOnPath.indexOf(r.source));
    return explaining.length > 0 ? Math.min(...explaining) : Number.POSITIVE_INFINITY;
  };
  let anchorKey: string | null = null;
  const extra: BundleRelationship[] = [];
  const onPathCandidates = candidates.filter((c) => onPath.has(c.key));
  if (onPathCandidates.length > 0) {
    anchorKey = [...onPathCandidates].sort((a, b) => firstSeedIndex(a.key) - firstSeedIndex(b.key) || byString(a.key, b.key))[0]!.key;
  } else {
    const explainedBySeed = candidates
      .map((c) => ({ c, edges: (ix.into.get(c.key) ?? []).filter((r) => r.type === "SCIENTIFICALLY_EXPLAINED_BY" && seedsOnPath.includes(r.source)) }))
      .filter((x) => x.edges.length > 0)
      .sort((a, b) => firstSeedIndex(a.c.key) - firstSeedIndex(b.c.key) || byString(a.c.key, b.c.key));
    if (explainedBySeed[0]) {
      anchorKey = explainedBySeed[0].c.key;
      extra.push(...explainedBySeed[0].edges);
    } else {
      const pathStageIdx = seedsOnPath.map(stageOrder).filter((i) => i < steps.length);
      let best: { key: string; edge: BundleRelationship; dist: number } | null = null;
      for (const c of candidates) {
        for (const r of ix.into.get(c.key) ?? []) {
          if (r.type !== "SCIENTIFICALLY_EXPLAINED_BY") continue;
          const i = steps.indexOf(r.source);
          if (i === -1 || pathStageIdx.length === 0) continue;
          const dist = Math.min(...pathStageIdx.map((p) => Math.abs(p - i)));
          if (!best || dist < best.dist || (dist === best.dist && byString(c.key, best.key) < 0)) best = { key: c.key, edge: r, dist };
        }
      }
      if (best) {
        anchorKey = best.key;
        extra.push(best.edge);
      }
    }
  }
  if (!anchorKey) return null;
  for (const e of extra) {
    edgeIds.add(e.id);
    onPath.add(e.source);
    onPath.add(e.target);
  }
  const rels = ix.bundle.relationships.filter((r) => edgeIds.has(r.id)).sort((a, b) => byString(a.id, b.id));
  return { type: "colour-mechanism", anchorKey, nodeKeys: [...onPath].sort(byString), edgeIds: rels.map((r) => r.id) };
}

/** The graph content of every available diagram type for a tradition (no layout). */
export function extractDiagramGraphs(bundle: KnowledgeBundle, traditionSlug: string): DiagramGraph[] {
  const t = bundle.traditions.find((x) => x.slug === traditionSlug);
  if (!t) return [];
  const ix = indexBundle(bundle);
  const seq = processSequenceGraph(ix, t.id);
  const mat = materialsGraph(ix, t.id, seq?.anchorKey ?? null);
  const col = colourGraph(ix, t.id);
  return [seq, mat, col].filter((g): g is DiagramGraph => g !== null);
}

// ---------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------

const PAD = 8;
/** Average glyph advance of Inter as a share of the font size, with a safety margin. */
const ADVANCE = 0.56;
const BOX_PAD_X = 8;
const BOX_PAD_Y = 6;

function wrap(text: string, maxChars: number): string[] {
  // Words longer than a line break after their hyphens ("Iron-" / "Catalysed"); nothing else is cut.
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (w.length > maxChars && w.includes("-") ? w.split(/(?<=-)/) : [w]));
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line) line = w;
    else if (line.endsWith("-") && line.length + w.length <= maxChars) line += w;
    else if (!line.endsWith("-") && line.length + 1 + w.length <= maxChars) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const maxCharsFor = (w: number, font: number) => Math.max(6, Math.floor((w - 2 * BOX_PAD_X) / (font * ADVANCE)));
const textWidth = (s: string, font: number) => s.length * font * ADVANCE;
const boxHeight = (lines: number, lh: number) => lines * lh + 2 * BOX_PAD_Y;
const r1 = (n: number) => Math.round(n * 10) / 10;

interface Sized {
  font: number;
  lh: number;
  label: number;
}
const SIZES: readonly Sized[] = [
  { font: 13, lh: 16, label: 11 },
  { font: 12, lh: 15, label: 11 },
  { font: 11, lh: 14, label: 10 },
];

type Layout = Pick<StructureDiagram, "nodes" | "edges" | "bands" | "fontSize" | "lineHeight" | "labelSize">;

interface Ctx {
  ix: Index;
  graph: DiagramGraph;
  anchorId: string;
  traditionId: string;
}

const nodeOf = (cx: Ctx, key: string, x: number, y: number, w: number, h: number, lines: string[]): DiagramNode => {
  const c = cx.ix.conceptByKey.get(key)!;
  return { id: c.id, key, title: c.title, type: c.type, current: c.id === cx.anchorId, x: r1(x), y: r1(y), w: r1(w), h: r1(h), lines };
};

function layoutProcess(cx: Ctx): Layout {
  const n = cx.graph.nodeKeys.length;
  const cols = n <= 15 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const gapX = cols === 3 ? 64 : 52;
  const w = (DIAGRAM_WIDTH - 2 * PAD - (cols - 1) * gapX) / cols;
  // Each row is as tall as its tallest label, so one long stage title does not inflate every row.
  let chosen: { s: Sized; lines: string[][]; rowH: number[]; gapY: number } | null = null;
  for (const s of SIZES) {
    const lines = cx.graph.nodeKeys.map((k) => wrap(titleCase(cx.ix.conceptByKey.get(k)!.title), maxCharsFor(w, s.font)));
    const rowH = Array.from({ length: rows }, (_, r) => boxHeight(Math.max(...lines.slice(r * cols, r * cols + cols).map((l) => l.length)), s.lh));
    const free = DIAGRAM_HEIGHT - 2 * PAD - rowH.reduce((a, b) => a + b, 0);
    const gapY = rows > 1 ? free / (rows - 1) : 0;
    chosen = { s, lines, rowH, gapY };
    if (rows === 1 || gapY >= 22) break;
  }
  const { s, lines, rowH } = chosen!;
  const gapY = rows > 1 ? Math.min(48, chosen!.gapY) : 0;
  const used = rowH.reduce((a, b) => a + b, 0) + gapY * (rows - 1);
  const top = (DIAGRAM_HEIGHT - used) / 2;
  const rowY = rowH.map((_, r) => top + rowH.slice(0, r).reduce((a, b) => a + b, 0) + r * gapY);
  const pos = (i: number) => {
    const r = Math.floor(i / cols);
    return { x: PAD + (i % cols) * (w + gapX), y: rowY[r]!, h: rowH[r]! };
  };
  const nodes = cx.graph.nodeKeys.map((k, i) => {
    const p = pos(i);
    return nodeOf(cx, k, p.x, p.y, w, p.h, lines[i]!);
  });
  const indexOfKey = new Map(cx.graph.nodeKeys.map((k, i) => [k, i]));
  const edges = cx.graph.edgeIds.map((id): DiagramEdge => {
    const r = cx.ix.bundle.relationships.find((x) => x.id === id)!;
    const i = indexOfKey.get(r.source)!;
    const j = indexOfKey.get(r.target)!;
    const a = pos(i);
    const b = pos(j);
    const label = cx.ix.labelOf(r.type);
    const base = { relationshipId: r.id, type: r.type, label, source: cx.ix.conceptByKey.get(r.source)!.id, target: cx.ix.conceptByKey.get(r.target)!.id };
    if (Math.floor(i / cols) === Math.floor(j / cols) && j === i + 1) {
      const y = a.y + a.h / 2;
      return { ...base, d: `M${r1(a.x + w)} ${r1(y)} H${r1(b.x)}`, labelAt: { x: r1(a.x + w + gapX / 2), y: r1(y - 5), anchor: "middle" } };
    }
    if (j === i + 1) {
      // Row wrap: down from the end of a row, across, and down into the start of the next.
      const midY = a.y + a.h + gapY / 2;
      const sx = a.x + w / 2;
      const tx = b.x + w / 2;
      return { ...base, d: `M${r1(sx)} ${r1(a.y + a.h)} V${r1(midY)} H${r1(tx)} V${r1(b.y)}`, labelAt: { x: r1((sx + tx) / 2), y: r1(midY + 3.5), anchor: "middle" } };
    }
    // Not adjacent in the chain order (a discontinuous chain): a straight connector.
    const sx = a.x + w / 2;
    const sy = a.y + a.h;
    const tx = b.x + w / 2;
    const ty = b.y;
    return { ...base, d: `M${r1(sx)} ${r1(sy)} L${r1(tx)} ${r1(ty)}`, labelAt: { x: r1((sx + tx) / 2), y: r1((sy + ty) / 2), anchor: "middle" } };
  });
  return { nodes, edges, bands: [], fontSize: s.font, lineHeight: s.lh, labelSize: s.label };
}

/** Stacks boxes of their own heights in [top, bottom], evenly spaced, centred when there is room. */
function stack(heights: number[], top: number, bottom: number): number[] {
  const total = heights.reduce((a, b) => a + b, 0);
  const free = bottom - top - total;
  const gap = heights.length > 1 ? Math.min(28, free / (heights.length - 1)) : 0;
  const used = total + gap * (heights.length - 1);
  let y = top + (bottom - top - used) / 2;
  return heights.map((h) => {
    const at = y;
    y += h + gap;
    return at;
  });
}

function layoutMaterials(cx: Ctx): Layout {
  const [stageKey, ...items] = cx.graph.nodeKeys as [string, ...string[]];
  const stageW = 184;
  const gapX = 128;
  const itemW = DIAGRAM_WIDTH - 2 * PAD - stageW - gapX;
  let out: Layout | null = null;
  for (const s of SIZES) {
    const stageLines = wrap(titleCase(cx.ix.conceptByKey.get(stageKey)!.title), maxCharsFor(stageW, s.font));
    const itemLines = items.map((k) => wrap(titleCase(cx.ix.conceptByKey.get(k)!.title), maxCharsFor(itemW, s.font)));
    const heights = itemLines.map((l) => boxHeight(l.length, s.lh));
    const fits = heights.reduce((a, b) => a + b, 0) + (heights.length - 1) * 8 <= DIAGRAM_HEIGHT - 2 * PAD;
    const ys = stack(heights, PAD, DIAGRAM_HEIGHT - PAD);
    const sh = boxHeight(stageLines.length, s.lh);
    const sy = (DIAGRAM_HEIGHT - sh) / 2;
    const itemX = PAD + stageW + gapX;
    const nodes = [nodeOf(cx, stageKey, PAD, sy, stageW, sh, stageLines), ...items.map((k, i) => nodeOf(cx, k, itemX, ys[i]!, itemW, heights[i]!, itemLines[i]!))];
    const byKey = new Map(nodes.map((n) => [n.key, n]));
    const edges = cx.graph.edgeIds.map((id): DiagramEdge => {
      const r = cx.ix.bundle.relationships.find((x) => x.id === id)!;
      const t = byKey.get(r.target)!;
      const sx = PAD + stageW;
      const scy = sy + sh / 2;
      const ty = t.y + t.h / 2;
      return {
        relationshipId: r.id,
        type: r.type,
        label: cx.ix.labelOf(r.type),
        source: byKey.get(r.source)!.id,
        target: t.id,
        d: `M${r1(sx)} ${r1(scy)} L${r1(itemX)} ${r1(ty)}`,
        labelAt: { x: r1(itemX - 6), y: r1(ty - 5), anchor: "end" },
      };
    });
    out = { nodes, edges, bands: [], fontSize: s.font, lineHeight: s.lh, labelSize: s.label };
    if (fits) break;
  }
  return out!;
}

function layoutColour(cx: Ctx): Layout {
  const concept = (k: string) => cx.ix.conceptByKey.get(k)!;
  const rels = cx.graph.edgeIds.map((id) => cx.ix.bundle.relationships.find((x) => x.id === id)!);
  // Columns by depth along the drawn edges: seeds (stages, materials) first, outcomes last, and
  // every explanation or mechanism one column after the deepest concept that leads to it, so
  // every edge points rightwards.
  const depth = new Map<string, number>(cx.graph.nodeKeys.map((k) => [k, SEED_TYPES.includes(concept(k).type) ? 0 : 1]));
  for (let pass = 0; pass < cx.graph.nodeKeys.length; pass++) {
    let changed = false;
    for (const r of rels) {
      if (concept(r.target).type === "outcome") continue;
      const d = depth.get(r.source)! + 1;
      if (d > depth.get(r.target)!) {
        depth.set(r.target, d);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const last = Math.max(0, ...cx.graph.nodeKeys.filter((k) => concept(k).type !== "outcome").map((k) => depth.get(k)!)) + 1;
  for (const k of cx.graph.nodeKeys) if (concept(k).type === "outcome") depth.set(k, last);
  const used = [...new Set(depth.values())].sort((a, b) => a - b);
  const colIndex = new Map(used.map((c, i) => [c, i]));
  const colOfKey = (k: string) => colIndex.get(depth.get(k)!)!;
  const columns: string[][] = used.map(() => []);
  for (const k of cx.graph.nodeKeys) columns[colOfKey(k)]!.push(k);

  // Column 0 in process order; later columns by the mean position of their predecessors.
  const { steps } = processChain(cx.ix, cx.traditionId);
  const order = new Map<string, number>();
  const stageOrder = (k: string) => {
    const i = steps.indexOf(k);
    return i === -1 ? steps.length : i;
  };
  columns[0]!.sort((a, b) => stageOrder(a) - stageOrder(b) || byString(a, b));
  columns[0]!.forEach((k, i) => order.set(k, i));
  for (let c = 1; c < columns.length; c++) {
    const bary = (k: string) => {
      const preds = rels.filter((r) => r.target === k && order.has(r.source)).map((r) => order.get(r.source)!);
      return preds.length ? preds.reduce((a, b) => a + b, 0) / preds.length : Number.POSITIVE_INFINITY;
    };
    columns[c]!.sort((a, b) => bary(a) - bary(b) || byString(a, b));
    columns[c]!.forEach((k, i) => order.set(k, i + 0.001 * c));
  }

  const cols = columns.length;
  const gapX = cols >= 4 ? 40 : 48;
  const w = (DIAGRAM_WIDTH - 2 * PAD - (cols - 1) * gapX) / cols;
  const bandH = 20;
  let out: Layout | null = null;
  for (const s of SIZES) {
    const lines = new Map(cx.graph.nodeKeys.map((k) => [k, wrap(titleCase(concept(k).title), maxCharsFor(w, s.font))]));
    const nodes: DiagramNode[] = [];
    let fits = true;
    columns.forEach((col, ci) => {
      const heights = col.map((k) => boxHeight(lines.get(k)!.length, s.lh));
      if (heights.reduce((a, b) => a + b, 0) + (heights.length - 1) * 6 > DIAGRAM_HEIGHT - 2 * PAD - bandH) fits = false;
      const ys = stack(heights, PAD + bandH, DIAGRAM_HEIGHT - PAD);
      col.forEach((k, i) => nodes.push(nodeOf(cx, k, PAD + ci * (w + gapX), ys[i]!, w, heights[i]!, lines.get(k)!)));
    });
    const byKey = new Map(nodes.map((n) => [n.key, n]));
    const edges = rels.map((r): DiagramEdge => {
      const a = byKey.get(r.source)!;
      const b = byKey.get(r.target)!;
      return {
        relationshipId: r.id,
        type: r.type,
        label: cx.ix.labelOf(r.type),
        source: a.id,
        target: b.id,
        d: `M${r1(a.x + a.w)} ${r1(a.y + a.h / 2)} L${r1(b.x)} ${r1(b.y + b.h / 2)}`,
        labelAt: null,
      };
    });
    // Band labels: the registry label of the edges leaving each column (every edge in the band
    // carries it); neighbouring bands with the same label are printed once, centred across them.
    const raw: { label: string; from: number; to: number }[] = [];
    for (let ci = 0; ci < cols - 1; ci++) {
      const leaving = rels.filter((r) => colOfKey(r.source) === ci);
      const labels = [...new Set(leaving.map((r) => cx.ix.labelOf(r.type)))];
      if (labels.length === 0) continue;
      const label = labels.join(" / ");
      const prev = raw[raw.length - 1];
      if (prev && prev.label === label && prev.to === ci - 1) prev.to = ci;
      else raw.push({ label, from: ci, to: ci });
    }
    const gapCentre = (ci: number) => PAD + ci * (w + gapX) + w + gapX / 2;
    const bands = raw.map((b) => ({ label: b.label, x: r1((gapCentre(b.from) + gapCentre(b.to)) / 2), y: PAD + 12 }));
    out = { nodes, edges, bands, fontSize: s.font, lineHeight: s.lh, labelSize: s.label };
    if (fits) break;
  }
  return out!;
}

// ---------------------------------------------------------------------------------------
// Text equivalent and caption
// ---------------------------------------------------------------------------------------

const listJoin = (items: string[], conj = "and") => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`);

function altOf(cx: Ctx, nodes: DiagramNode[]): string {
  const title = (k: string) => titleCase(cx.ix.conceptByKey.get(k)!.title);
  const rels = cx.graph.edgeIds.map((id) => cx.ix.bundle.relationships.find((x) => x.id === id)!);
  if (cx.graph.type === "process-sequence") {
    return `Stages in order: ${cx.graph.nodeKeys.map(title).join("; ")}. Each stage ${cx.ix.labelOf("PRECEDES")} the next.`;
  }
  // Edges grouped by source and type, in node reading order.
  const order = new Map(nodes.map((n, i) => [n.key, i]));
  const groups = new Map<string, { source: string; label: string; targets: string[] }>();
  for (const r of [...rels].sort((a, b) => (order.get(a.source)! - order.get(b.source)!) || (order.get(a.target)! - order.get(b.target)!))) {
    const g = `${r.source}|${r.type}`;
    const entry = groups.get(g) ?? { source: r.source, label: cx.ix.labelOf(r.type), targets: [] };
    entry.targets.push(title(r.target));
    groups.set(g, entry);
  }
  return [...groups.values()].map((g) => `${title(g.source)} ${g.label} ${listJoin(g.targets)}.`).join(" ");
}

function captionOf(cx: Ctx, traditionName: string): string {
  const title = (k: string) => titleCase(cx.ix.conceptByKey.get(k)!.title);
  const keys = cx.graph.nodeKeys;
  const anchor = title(cx.graph.anchorKey);
  switch (cx.graph.type) {
    case "process-sequence":
      return `Process sequence of ${traditionName}: ${keys.length} stages, from ${title(keys[0]!)} to ${title(keys[keys.length - 1]!)}. See statement 1.`;
    case "materials-tools":
      return `Materials and tools of ${anchor}, in ${traditionName}: the ${keys.length - 1} it ${listJoin([...new Set(cx.graph.edgeIds.map((id) => cx.ix.labelOf(cx.ix.bundle.relationships.find((r) => r.id === id)!.type)))], "or")}. See statement 1.`;
    case "colour-mechanism": {
      const outcomes = keys.filter((k) => cx.ix.conceptByKey.get(k)!.type === "outcome").map(title);
      return `Colour mechanism in ${traditionName}: ${listJoin(outcomes)}, with ${anchor}. See statement 1.`;
    }
  }
}

// ---------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------

/** Every available structure diagram of a tradition, laid out. Pure and deterministic. */
export function buildStructureDiagrams(bundle: KnowledgeBundle, traditionSlug: string): StructureDiagram[] {
  const t = bundle.traditions.find((x) => x.slug === traditionSlug);
  if (!t) return [];
  const ix = indexBundle(bundle);
  return extractDiagramGraphs(bundle, traditionSlug).map((graph) => {
    const anchor = ix.conceptByKey.get(graph.anchorKey)!;
    const cx: Ctx = { ix, graph, anchorId: anchor.id, traditionId: t.id };
    const layout = graph.type === "process-sequence" ? layoutProcess(cx) : graph.type === "materials-tools" ? layoutMaterials(cx) : layoutColour(cx);
    return {
      id: `${graph.type}:${traditionSlug}`,
      type: graph.type,
      traditionSlug,
      traditionName: t.name,
      section: DIAGRAM_SECTION[graph.type],
      anchor: { conceptId: anchor.id, conceptKey: anchor.key, claimIndex: 0 },
      width: DIAGRAM_WIDTH,
      height: DIAGRAM_HEIGHT,
      ...layout,
      alt: altOf(cx, layout.nodes),
      caption: captionOf(cx, t.name),
    };
  });
}

/**
 * Balance across traditions (12.3 rule 9): a diagram type is kept only when every tradition in
 * `slugs` has it, so each gets the same types in the same sections (k(section) = the minimum).
 */
export function balanceDiagramSets(sets: ReadonlyMap<string, readonly StructureDiagram[]>, slugs: readonly string[]): Map<string, StructureDiagram[]> {
  const typesOf = (slug: string) => new Set((sets.get(slug) ?? []).map((d) => d.type));
  const common = STRUCTURE_DIAGRAM_TYPES.filter((type) => slugs.length > 0 && slugs.every((s) => typesOf(s).has(type)));
  return new Map(slugs.map((s) => [s, (sets.get(s) ?? []).filter((d) => common.includes(d.type))]));
}

/** Text width estimate used by the layout (exported for tests of label fit). */
export function estimateTextWidth(text: string, fontSize: number): number {
  return textWidth(text, fontSize);
}
