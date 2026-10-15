"use client";

/**
 * React Flow canvas of the concept-map editor. Concepts are fixed (never added or deleted
 * here); participants arrange them freely (drag, or focus a concept and use the arrow keys) and
 * draw links from a concept's handle to another concept. A drawn link is not created until its
 * relationship type is chosen in the relationship panel. No animation: study pages are not
 * decorative.
 *
 * Apparatus styling (DESIGN.md 11.7: "keeps its canvas but adopts the tokens, 44 px controls and
 * zero motion"): an opaque `--ground` canvas framed by a 1 px `--rule-strong` boundary, faint
 * `--rule` dots, square-cut concept boxes with a 1 px `--ink` outline (the selected one in
 * `--indigo`), `--ink-3` links with labels on `--ground`, and 44 x 44 hit areas for the link
 * handles and the zoom controls (one row, bottom left, kept clear of the fitted map). Every colour comes from the CSS tokens, so high contrast and the
 * console's dark theme apply without code. The library attribution link is hidden for
 * participants: study pages carry no outbound navigation (DESIGN.md 9.16).
 */
import "@xyflow/react/dist/base.css";

import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { useMemo, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

import { describeEdge, type EditorRules, type MapAction, type MapState } from "./map-state";

type ConceptNodeData = { label: string };

/*
 * Link handles: a 12 px square on the box edge, with a hit area that extends AWAY from the box
 * (upwards for the top handle, downwards for the bottom one), so the box itself stays free to
 * drag. Pseudo-elements take part in hit testing, so the library sees the larger target.
 *
 * Size (DESIGN.md 11.7, 44 px controls): the canvas is scaled by the viewport zoom, so the hit
 * area is 55 x 55 flow px, which is 44 x 44 CSS px at the 0.8 floor of the opening fit (FIT_VIEW)
 * and larger at any higher zoom. It is the 10 px content box of the handle (12 px minus its 1 px
 * borders) plus 22.5 px on each side and 45 px away from the box (41 px out, 4 px in). Below 0.8,
 * which only a participant's own zoom-out reaches, the relationship form and list below the map
 * are the 44 px equivalent (WCAG 2.5.5 equivalent-control exception).
 */
const HANDLE = "!size-3 !rounded-none !border !border-solid after:absolute after:-inset-x-[1.40625rem] after:content-['']";

function ConceptNode({ data, selected }: NodeProps<Node<ConceptNodeData>>) {
  return (
    <div
      className={cn(
        "flex min-h-14 max-w-48 min-w-24 items-center justify-center rounded-control border bg-ground px-3 py-3 text-center font-sans text-[0.9375rem] leading-5 font-medium text-ink",
        selected ? "border-indigo shadow-[inset_0_0_0_1px_var(--indigo)]" : "border-ink",
      )}
    >
      <Handle type="target" position={Position.Top} className={cn(HANDLE, "!border-ink !bg-ground after:-top-[2.5625rem] after:-bottom-1")} />
      {data.label}
      <Handle type="source" position={Position.Bottom} className={cn(HANDLE, "!border-indigo !bg-indigo after:-top-1 after:-bottom-[2.5625rem]")} />
    </div>
  );
}

/** React Flow's own colour variables, mapped to the tokens. */
const CANVAS_TOKENS = {
  "--xy-background-color": "var(--ground)",
  "--xy-background-pattern-color": "var(--rule)",
  "--xy-edge-stroke": "var(--ink-3)",
  "--xy-edge-stroke-width": "1.5",
  "--xy-edge-stroke-selected": "var(--indigo)",
  "--xy-connectionline-stroke": "var(--indigo)",
  "--xy-connectionline-stroke-width": "1.5",
  "--xy-attribution-background-color": "var(--ground)",
} as CSSProperties;

/**
 * 44 x 44 zoom controls on `--ground` with a `--rule-strong` boundary, styled through the
 * Controls panel's own className (Tailwind turns `_` in arbitrary selectors into spaces, so the
 * library's `react-flow__*` class names are not targeted directly). React Flow's base.css is
 * unlayered and draws 26 px buttons, so the size overrides are marked important.
 */
const CONTROLS =
  "border border-rule-strong bg-ground [&>button]:size-11! [&>button]:border-r [&>button]:border-rule [&>button]:bg-ground [&>button]:p-3! [&>button]:text-ink [&>button:hover]:bg-sunk [&>button:last-child]:border-r-0 [&_svg]:max-h-4! [&_svg]:max-w-4! [&_svg]:fill-current";

/*
 * The opening view. Fit-to-view alone shrank the 15 px concept labels to about 7 px on a phone
 * and 11.5 px at 1280 px, too small to read on a measured outcome task. The fit is therefore
 * floored at 0.8 (labels at least 12 px on screen); a map wider than the canvas then opens
 * centred and the participant pans or zooms out (the zoom range is unchanged). The bottom padding
 * keeps the one-row zoom controls (44 px, 15 px from the edge) clear of the fitted concepts, and
 * the canvas is 32rem tall (was 28rem) so the default circle layout still fits whole at 0.8. On
 * a phone the map is wider than the canvas at 0.8 and opens centred with the side concepts cut at
 * the edges, so the participant pans; the relationship form below lists every concept by name. Only the viewport changes: positions are
 * in flow coordinates and the task is the same.
 */
const FIT_VIEW = { padding: { top: "24px", x: "24px", bottom: "72px" }, minZoom: 0.8 } as const;

const EDGE_LABEL_STYLE: CSSProperties = { fill: "var(--ink)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500 };
const EDGE_LABEL_BG: CSSProperties = { fill: "var(--ground)" };

const nodeTypes = { concept: ConceptNode };

const NODE_HELP =
  "Press Enter or Space to select this concept, then use the arrow keys to move it. Add relationships with the form below the map.";

export function MapCanvas({
  state,
  rules,
  dispatch,
  readOnly,
  onConnectRequest,
  ariaLabel,
  attribution = true,
}: {
  state: MapState;
  rules: EditorRules;
  dispatch: (action: MapAction) => void;
  readOnly: boolean;
  onConnectRequest: (source: string, target: string) => void;
  ariaLabel: string;
  /** Show the library's attribution link (off for participants: no outbound navigation in study). */
  attribution?: boolean;
}) {
  const labelOf = (key: string) => state.nodes.find((n) => n.key === key)?.label ?? key;
  const typeLabel = (code: string | null) => (code === null ? "is linked to" : (rules.relationshipTypes.find((t) => t.code === code)?.label ?? code));
  // Positions while a pointer drag is in progress (committed to state on drag stop).
  const [dragging, setDragging] = useState<Record<string, { x: number; y: number }>>({});
  const pointerDrag = useRef(false);

  const nodes: Node<ConceptNodeData>[] = state.nodes.map((n) => ({
    id: n.key,
    type: "concept",
    position: dragging[n.key] ?? { x: n.x, y: n.y },
    data: { label: n.label },
    deletable: false,
    draggable: !readOnly,
    connectable: !readOnly,
    ariaLabel: `Concept: ${n.label}. ${state.edges.filter((e) => e.source === n.key || e.target === n.key).length} relationships.`,
  }));

  const edges: Edge[] = useMemo(
    () =>
      state.edges.map((e) => {
        const label = typeLabel(e.relationshipType);
        return {
          id: e.key,
          source: e.source,
          target: e.target,
          label,
          deletable: !readOnly,
          ariaLabel: `Relationship: ${describeEdge(e, labelOf, typeLabel)}`,
          ...(e.directed ? { markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "var(--ink-3)" } } : {}),
          labelStyle: EDGE_LABEL_STYLE,
          labelBgStyle: EDGE_LABEL_BG,
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 2,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labels derive from state + rules
    [state.edges, state.nodes, rules],
  );

  function onNodesChange(changes: NodeChange<Node<ConceptNodeData>>[]) {
    if (readOnly) return;
    for (const c of changes) {
      if (c.type !== "position" || !c.position) continue;
      if (c.dragging) {
        pointerDrag.current = true;
        setDragging((d) => ({ ...d, [c.id]: c.position! }));
      } else {
        // Keyboard move (arrow keys on a focused concept) or the end of a pointer drag.
        dispatch({ type: "move_node", nodeKey: c.id, x: c.position.x, y: c.position.y, via: pointerDrag.current ? "canvas" : "form" });
      }
    }
  }

  return (
    <div
      className="h-[32rem] w-full overflow-hidden rounded-card border border-rule-strong bg-ground"
      style={CANVAS_TOKENS}
      role="group"
      aria-label={ariaLabel}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => {
          pointerDrag.current = false;
          setDragging((d) => {
            const next = { ...d };
            delete next[node.id];
            return next;
          });
          dispatch({ type: "move_node", nodeKey: node.id, x: node.position.x, y: node.position.y, via: "canvas" });
        }}
        onConnect={(c: Connection) => {
          if (!readOnly && c.source && c.target && c.source !== c.target) onConnectRequest(c.source, c.target);
        }}
        onEdgesDelete={(deleted) => {
          for (const e of deleted) dispatch({ type: "delete_edge", edgeKey: e.id, via: "canvas" });
        }}
        connectionMode={ConnectionMode.Loose}
        nodesConnectable={!readOnly}
        nodesDraggable={!readOnly}
        elementsSelectable
        nodesFocusable
        edgesFocusable
        fitView
        fitViewOptions={FIT_VIEW}
        minZoom={0.3}
        maxZoom={2}
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: !attribution }}
        ariaLabelConfig={{
          "node.a11yDescription.default": NODE_HELP,
          "node.a11yDescription.keyboardDisabled": NODE_HELP,
          "edge.a11yDescription.default": "Press Enter or Space to select this relationship, then Delete to remove it. The list below the map has the same controls.",
          "handle.ariaLabel": "Link handle: drag to another concept to draw a relationship",
          "node.a11yDescription.ariaLiveMessage": ({ direction }) => `Moved concept ${direction}.`,
        }}
      >
        <Background gap={24} size={1.5} />
        <Controls showInteractive={false} orientation="horizontal" className={CONTROLS} />
      </ReactFlow>
    </div>
  );
}
