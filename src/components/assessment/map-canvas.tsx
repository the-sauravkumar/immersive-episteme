"use client";

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

const HANDLE = "!size-3 !rounded-none !border !border-solid after:absolute after:-inset-x-[1.40625rem] after:content-['']";

function ConceptNode({ data, selected }: NodeProps<Node<ConceptNodeData>>) {
  return (
    <div
      className={cn(
        "flex min-h-14 max-w-48 min-w-24 items-center justify-center border bg-vat px-3 py-3 text-center font-sans t-s font-medium text-lime",
        selected ? "border-turmeric" : "border-lime",
      )}
    >
      <Handle type="target" position={Position.Top} className={cn(HANDLE, "!border-lime !bg-vat after:-top-[2.5625rem] after:-bottom-1")} />
      {data.label}
      <Handle type="source" position={Position.Bottom} className={cn(HANDLE, "!border-turmeric !bg-turmeric after:-top-1 after:-bottom-[2.5625rem]")} />
    </div>
  );
}

const CANVAS_TOKENS = {
  "--xy-background-color": "var(--vat)",
  "--xy-background-pattern-color": "var(--line)",
  "--xy-edge-stroke": "var(--lime-dim)",
  "--xy-edge-stroke-width": "1.5",
  "--xy-edge-stroke-selected": "var(--turmeric)",
  "--xy-connectionline-stroke": "var(--turmeric)",
  "--xy-connectionline-stroke-width": "1.5",
  "--xy-attribution-background-color": "var(--vat)",
} as CSSProperties;

const CONTROLS =
  "border border-lime-dim bg-vat [&>button]:size-11! [&>button]:border-r [&>button]:border-line [&>button]:bg-vat [&>button]:p-3! [&>button]:text-lime [&>button:hover]:bg-vat-2 [&>button:last-child]:border-r-0 [&_svg]:max-h-4! [&_svg]:max-w-4! [&_svg]:fill-current";

const FIT_VIEW = { padding: { top: "24px", x: "24px", bottom: "72px" }, minZoom: 0.8 } as const;

const EDGE_LABEL_STYLE: CSSProperties = { fill: "var(--lime)", fontFamily: "var(--body)", fontSize: 13, fontWeight: 500 };
const EDGE_LABEL_BG: CSSProperties = { fill: "var(--vat)" };

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
  attribution?: boolean;
}) {
  const labelOf = (key: string) => state.nodes.find((n) => n.key === key)?.label ?? key;
  const typeLabel = (code: string | null) => (code === null ? "is linked to" : (rules.relationshipTypes.find((t) => t.code === code)?.label ?? code));
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
          ...(e.directed ? { markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "var(--lime-dim)" } } : {}),
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
        dispatch({ type: "move_node", nodeKey: c.id, x: c.position.x, y: c.position.y, via: pointerDrag.current ? "canvas" : "form" });
      }
    }
  }

  return (
    <div
      className="h-[32rem] w-full overflow-hidden border border-lime-dim bg-vat"
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
