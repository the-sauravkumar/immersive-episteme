/**
 * Concept-map editor state: a pure reducer plus the raw-graph contract that is stored.
 *
 * Client-safe (no React, no server code). The participant editor and the expert-rater editor
 * share it, and the server validates every save against the same schema
 * (src/server/assessment/participant-maps.ts), so what is stored is exactly what the editor
 * produced: nodes with positions, typed and directed edges, and an append-only, timestamped edit
 * log. A score is never stored instead of the graph.
 */
import { z } from "zod";

import { relationshipTypeCodeSchema } from "@/lib/validation/primitives";

/** Version tag of the stored raw editor state (concept_maps.raw.format). */
export const MAP_FORMAT = "cmap-editor/1";
export const MAX_EDIT_LOG = 5000;

/** One concept of the protocol-defined, fixed concept set. */
export interface MapConcept {
  /** Stable node key within the item (position-derived: c1, c2, ...). */
  nodeKey: string;
  conceptId: string;
  label: string;
}

/** A relationship type the protocol allows, with its registry label and directedness. */
export interface MapRelationshipType {
  code: string;
  label: string;
  /** Registry `directed`: false for symmetric types (SIMILAR_TO, ...). */
  directed: boolean;
}

export const mapNodeSchema = z.object({
  key: z.string().min(1).max(64),
  conceptId: z.uuid(),
  label: z.string().min(1).max(300),
  x: z.number().finite(),
  y: z.number().finite(),
});
export type MapNode = z.infer<typeof mapNodeSchema>;

export const mapEdgeSchema = z
  .object({
    key: z.string().regex(/^e[1-9][0-9]{0,5}$/),
    source: z.string().min(1).max(64),
    target: z.string().min(1).max(64),
    relationshipType: relationshipTypeCodeSchema.nullable(),
    directed: z.boolean(),
    /** Expert-rater maps only: the edge must appear for full credit ("expected"). */
    required: z.boolean().optional(),
  })
  .refine((e) => e.source !== e.target, { message: "A relationship needs two different concepts" });
export type MapEdge = z.infer<typeof mapEdgeSchema>;

export const EDIT_OPS = ["add_edge", "retype_edge", "reverse_edge", "delete_edge", "move_node", "set_required"] as const;
export type EditOp = (typeof EDIT_OPS)[number];

export const editLogEntrySchema = z.strictObject({
  seq: z.number().int().min(0),
  /** Client wall-clock time of the edit (ISO 8601). Raw editing history, not an exposure timing. */
  at: z.iso.datetime({ offset: true }),
  op: z.enum(EDIT_OPS),
  via: z.enum(["canvas", "form"]),
  edgeKey: z.string().max(16).optional(),
  nodeKey: z.string().max(64).optional(),
  source: z.string().max(64).optional(),
  target: z.string().max(64).optional(),
  type: relationshipTypeCodeSchema.nullable().optional(),
  from: relationshipTypeCodeSchema.nullable().optional(),
  to: relationshipTypeCodeSchema.nullable().optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  required: z.boolean().optional(),
});
export type EditLogEntry = z.infer<typeof editLogEntrySchema>;

/** What the editor sends on every save (autosave or final submission). */
export const mapPayloadSchema = z.object({
  nodes: z.array(mapNodeSchema).max(200),
  edges: z.array(mapEdgeSchema).max(1000),
  editLog: z.array(editLogEntrySchema).max(MAX_EDIT_LOG),
});
export type MapPayload = z.infer<typeof mapPayloadSchema>;

export interface MapState extends MapPayload {
  /** Next numeric edge key; keys are never reused, so the edit log stays unambiguous. */
  nextEdge: number;
}

export type MapAction =
  | { type: "add_edge"; source: string; target: string; relationshipType: string | null; via: EditLogEntry["via"]; required?: boolean }
  | { type: "retype_edge"; edgeKey: string; relationshipType: string | null; via: EditLogEntry["via"] }
  | { type: "reverse_edge"; edgeKey: string; via: EditLogEntry["via"] }
  | { type: "delete_edge"; edgeKey: string; via: EditLogEntry["via"] }
  | { type: "move_node"; nodeKey: string; x: number; y: number; via: EditLogEntry["via"] }
  | { type: "set_required"; edgeKey: string; required: boolean; via: EditLogEntry["via"] };

export interface EditorRules {
  relationshipTypes: readonly MapRelationshipType[];
  /** Item-level `directed` (concept_map config). False makes every link undirected. */
  directedLinks: boolean;
}

/** Directedness of an edge of this type under the item's rules. */
export function edgeDirected(type: string | null, rules: EditorRules): boolean {
  if (!rules.directedLinks) return false;
  if (type === null) return true;
  return rules.relationshipTypes.find((t) => t.code === type)?.directed ?? true;
}

/** Deterministic initial layout: concepts on a circle, in protocol order. */
export function initialNodes(concepts: readonly MapConcept[], radius = 220): MapNode[] {
  const n = Math.max(concepts.length, 1);
  return concepts.map((c, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      key: c.nodeKey,
      conceptId: c.conceptId,
      label: c.label,
      x: Math.round(radius + radius * Math.cos(angle)),
      y: Math.round(radius + radius * Math.sin(angle)),
    };
  });
}

export function emptyState(concepts: readonly MapConcept[]): MapState {
  return { nodes: initialNodes(concepts), edges: [], editLog: [], nextEdge: 1 };
}

/** Restores editor state from a stored payload. */
export function stateFromPayload(payload: MapPayload): MapState {
  const max = payload.edges.reduce((m, e) => Math.max(m, Number(e.key.slice(1))), 0);
  const logMax = payload.editLog.reduce((m, l) => (l.edgeKey ? Math.max(m, Number(l.edgeKey.slice(1)) || 0) : m), 0);
  return { ...payload, nextEdge: Math.max(max, logMax) + 1 };
}

/** Why an edge cannot be added, or null. */
export function addEdgeProblem(state: MapPayload, source: string, target: string, relationshipType: string | null, rules: EditorRules): string | null {
  if (!source || !target) return "Choose two concepts.";
  if (source === target) return "A relationship needs two different concepts.";
  if (!state.nodes.some((n) => n.key === source) || !state.nodes.some((n) => n.key === target)) return "Unknown concept.";
  if (rules.relationshipTypes.length > 0 && (relationshipType === null || !rules.relationshipTypes.some((t) => t.code === relationshipType))) {
    return "Choose a relationship type.";
  }
  const id = edgeIdentity({ source, target, relationshipType, directed: edgeDirected(relationshipType, rules) });
  return state.edges.some((e) => edgeIdentity(e) === id) ? "This relationship already exists." : null;
}

/** Identity of a relationship: endpoints (sorted when undirected) plus type. */
export function edgeIdentity(e: Pick<MapEdge, "source" | "target" | "relationshipType" | "directed">): string {
  const [a, b] = e.directed ? [e.source, e.target] : [e.source, e.target].sort();
  return `${a}|${b}|${e.relationshipType ?? ""}`;
}

/**
 * Applies one edit. Invalid edits return the state unchanged (the UI explains why beforehand).
 * `now` is injected so tests are deterministic.
 */
export function reduceMap(state: MapState, action: MapAction, rules: EditorRules, now: () => string = () => new Date().toISOString()): MapState {
  const log = (entry: Omit<EditLogEntry, "seq" | "at">): EditLogEntry[] =>
    state.editLog.length >= MAX_EDIT_LOG ? state.editLog : [...state.editLog, { seq: state.editLog.length, at: now(), ...entry }];
  const edge = "edgeKey" in action ? state.edges.find((e) => e.key === action.edgeKey) : undefined;

  switch (action.type) {
    case "add_edge": {
      if (addEdgeProblem(state, action.source, action.target, action.relationshipType, rules)) return state;
      const key = `e${state.nextEdge}`;
      const directed = edgeDirected(action.relationshipType, rules);
      const e: MapEdge = { key, source: action.source, target: action.target, relationshipType: action.relationshipType, directed };
      if (action.required !== undefined) e.required = action.required;
      return {
        ...state,
        edges: [...state.edges, e],
        nextEdge: state.nextEdge + 1,
        editLog: log({ op: "add_edge", via: action.via, edgeKey: key, source: e.source, target: e.target, type: e.relationshipType, ...(action.required !== undefined ? { required: action.required } : {}) }),
      };
    }
    case "retype_edge": {
      if (!edge || edge.relationshipType === action.relationshipType) return state;
      if (rules.relationshipTypes.length > 0 && !rules.relationshipTypes.some((t) => t.code === action.relationshipType)) return state;
      const directed = edgeDirected(action.relationshipType, rules);
      const id = edgeIdentity({ ...edge, relationshipType: action.relationshipType, directed });
      if (state.edges.some((e) => e.key !== edge.key && edgeIdentity(e) === id)) return state;
      return {
        ...state,
        edges: state.edges.map((e) => (e.key === edge.key ? { ...e, relationshipType: action.relationshipType, directed } : e)),
        editLog: log({ op: "retype_edge", via: action.via, edgeKey: edge.key, from: edge.relationshipType, to: action.relationshipType }),
      };
    }
    case "reverse_edge": {
      if (!edge || !edge.directed) return state;
      const id = edgeIdentity({ ...edge, source: edge.target, target: edge.source });
      if (state.edges.some((e) => e.key !== edge.key && edgeIdentity(e) === id)) return state;
      return {
        ...state,
        edges: state.edges.map((e) => (e.key === edge.key ? { ...e, source: edge.target, target: edge.source } : e)),
        editLog: log({ op: "reverse_edge", via: action.via, edgeKey: edge.key, source: edge.target, target: edge.source }),
      };
    }
    case "delete_edge": {
      if (!edge) return state;
      return {
        ...state,
        edges: state.edges.filter((e) => e.key !== edge.key),
        editLog: log({ op: "delete_edge", via: action.via, edgeKey: edge.key }),
      };
    }
    case "set_required": {
      if (!edge || edge.required === action.required) return state;
      return {
        ...state,
        edges: state.edges.map((e) => (e.key === edge.key ? { ...e, required: action.required } : e)),
        editLog: log({ op: "set_required", via: action.via, edgeKey: edge.key, required: action.required }),
      };
    }
    case "move_node": {
      const node = state.nodes.find((n) => n.key === action.nodeKey);
      if (!node || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return state;
      const x = Math.round(action.x);
      const y = Math.round(action.y);
      if (node.x === x && node.y === y) return state;
      return {
        ...state,
        nodes: state.nodes.map((n) => (n.key === node.key ? { ...n, x, y } : n)),
        editLog: log({ op: "move_node", via: action.via, nodeKey: node.key, x, y }),
      };
    }
  }
}

export function toPayload(state: MapState): MapPayload {
  return { nodes: state.nodes, edges: state.edges, editLog: state.editLog };
}

/** Human-readable sentence for an edge, used for screen-reader labels and lists. */
export function describeEdge(edge: Pick<MapEdge, "source" | "target" | "relationshipType" | "directed">, labelOf: (nodeKey: string) => string, typeLabel: (code: string | null) => string): string {
  const s = labelOf(edge.source);
  const t = labelOf(edge.target);
  const verb = typeLabel(edge.relationshipType);
  return edge.directed ? `${s} ${verb} ${t}` : `${s} ${verb} ${t} (both ways)`;
}

/** True when `next` keeps every entry of `prev` unchanged (the edit log is append-only). */
export function extendsLog(prev: readonly EditLogEntry[], next: readonly EditLogEntry[]): boolean {
  if (next.length < prev.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (canonical(prev[i]) !== canonical(next[i])) return false;
  }
  return next.every((e, i) => e.seq === i);
}

/** Key-order-independent JSON (jsonb reorders object keys on storage). */
function canonical(entry: EditLogEntry | undefined): string {
  if (!entry) return "";
  const rec = entry as Record<string, unknown>;
  return JSON.stringify(
    Object.keys(rec)
      .filter((k) => rec[k] !== undefined)
      .sort()
      .map((k) => [k, rec[k]]),
  );
}
