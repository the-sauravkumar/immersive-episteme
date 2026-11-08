"use client";

import "@xyflow/react/dist/style.css";

import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { titleCase } from "@/lib/text/title-case";
import type { GraphEdge, GraphNode } from "@/server/cms/queries";

import { RelationshipForm, type ConceptChoice, type TypeChoice } from "./relationship-form";

const STATE_LABEL: Record<string, string> = {
  draft: "draft",
  under_review: "under review",
  verified: "verified",
  published: "published",
  needs_evidence: "needs evidence",
  rejected: "rejected",
  archived: "archived",
};

const SEMANTIC_STYLE: Record<string, { stroke: string; dash?: string }> = {
  causal: { stroke: "var(--lime)" },
  sequential: { stroke: "var(--turmeric)" },
  compositional: { stroke: "var(--lime-dim)", dash: "1 0" },
  explanatory: { stroke: "var(--turmeric)", dash: "6 3" },
  comparative: { stroke: "var(--lime-dim)", dash: "2 3" },
  associative: { stroke: "var(--lime-dim)", dash: "8 4" },
};

type ConceptNodeData = { title: string; type: string; state: string; focus: boolean };

function ConceptNode({ data }: NodeProps<Node<ConceptNodeData>>) {
  return (
    <div className={`max-w-52 bg-vat px-3 py-2 font-sans text-[0.875rem] leading-5 ${data.focus ? "border-2 border-turmeric" : "border border-lime-dim"}`}>
      <Handle type="target" position={Position.Left} />
      <p className="font-semibold text-lime">{data.title}</p>
      <p className="text-lime-dim">
        {data.type.replace(/_/g, " ")}, {STATE_LABEL[data.state] ?? data.state}
      </p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { concept: ConceptNode };

const TYPE_ORDER = ["tradition", "historical_context", "material", "tool", "process_stage", "artisan_decision", "design_principle", "environmental_condition", "scientific_mechanism", "explanation", "outcome", "comparison", "open_question"];

function layout(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const byType = new Map<string, GraphNode[]>();
  for (const n of nodes) byType.set(n.type, [...(byType.get(n.type) ?? []), n]);
  const types = [...byType.keys()].sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
  const pos = new Map<string, { x: number; y: number }>();
  types.forEach((t, col) => {
    byType
      .get(t)!
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .forEach((n, row) => pos.set(n.id, { x: col * 260, y: row * 90 }));
  });
  return pos;
}

export function GraphWorkspace({
  nodes,
  edges,
  focusId,
  selectedEdgeId,
  semanticsByType,
  concepts,
  types,
  sources,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focusId: string | null;
  selectedEdgeId: string | null;
  semanticsByType: Record<string, string>;
  concepts: ConceptChoice[];
  types: TypeChoice[];
  sources: { id: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");

  const flowNodes = useMemo<Node<ConceptNodeData>[]>(() => {
    const pos = layout(nodes);
    return nodes.map((n) => ({
      id: n.id,
      type: "concept",
      position: pos.get(n.id)!,
      data: { title: n.title, type: n.type, state: n.state, focus: n.id === focusId },
      ariaLabel: `${n.title} (${n.type.replace(/_/g, " ")}, ${STATE_LABEL[n.state] ?? n.state})`,
    }));
  }, [nodes, focusId]);

  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
        const style = SEMANTIC_STYLE[semanticsByType[e.type] ?? "associative"] ?? SEMANTIC_STYLE.associative!;
        const selected = e.id === selectedEdgeId;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: `${e.type}${e.ordinal !== null ? ` #${e.ordinal}` : ""}${e.state === "draft" ? " (draft)" : ""}`,
          labelStyle: { fontSize: 13, fill: "var(--lime-dim)" },
          labelBgStyle: { fill: "var(--vat)" },
          markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke },
          style: { stroke: style.stroke, strokeDasharray: style.dash, strokeWidth: selected ? 3 : 1.5 },
          ariaLabel: `${e.type} relationship, ${STATE_LABEL[e.state] ?? e.state}`,
          selected,
        };
      }),
    [edges, semanticsByType, selectedEdgeId],
  );

  const openEdge = (id: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("edge", id);
    router.push(`${pathname}?${sp.toString()}#edge`);
  };

  const onConnect = (c: Connection) => {
    setSource(c.source);
    setTarget(c.target);
    document.getElementById("new-relationship")?.scrollIntoView({ block: "start" });
  };

  return (
    <div className="flex flex-col gap-6">
      <div
        className="h-[32rem] overflow-hidden border border-lime-dim bg-vat [&_.react-flow\_\_attribution]:bg-vat! [&_.react-flow\_\_attribution]:p-0! [&_.react-flow\_\_attribution_a]:inline-flex! [&_.react-flow\_\_attribution_a]:min-h-11! [&_.react-flow\_\_attribution_a]:items-center! [&_.react-flow\_\_attribution_a]:px-3! [&_.react-flow\_\_attribution_a]:text-lime-dim!"
        role="region"
        aria-label="Relationship graph canvas (visual aid; use the forms and table below for keyboard access)"
      >
        {nodes.length === 0 ? (
          <p className="t-b p-4 text-lime-dim">No concepts match the filters.</p>
        ) : (
          <ReactFlow
            key={`${nodes.length}:${edges.length}:${focusId ?? ""}:${selectedEdgeId ?? ""}:${edges.map((e) => e.state).join("")}`}
            defaultNodes={flowNodes}
            defaultEdges={flowEdges}
            nodeTypes={nodeTypes}
            onConnect={onConnect}
            onEdgeClick={(_, e) => openEdge(e.id)}
            nodesDraggable
            nodesFocusable={false}
            edgesFocusable={false}
            fitView
            minZoom={0.1}
            attributionPosition="bottom-right"
          >
            <Background color="var(--line)" />
            <Controls
              showInteractive={false}
              position="top-left"
              className="border border-lime-dim shadow-none! [&_.react-flow\_\_controls-button]:size-11! [&_.react-flow\_\_controls-button]:border-line! [&_.react-flow\_\_controls-button]:bg-vat! [&_.react-flow\_\_controls-button]:text-lime! [&_.react-flow\_\_controls-button:hover]:bg-vat-2! [&_.react-flow\_\_controls-button_svg]:fill-current!"
            />
          </ReactFlow>
        )}
      </div>
      <section id="new-relationship" aria-labelledby="new-relationship-title" className="flex flex-col gap-4 border border-line bg-vat p-4 xs:p-6">
        <h2 id="new-relationship-title" className="t-label text-lime">
          {titleCase("New relationship")}
        </h2>
        <p className="t-b max-w-[40rem] text-lime-dim">Created as a draft. Drag between two concepts on the canvas to fill in the endpoints, or choose them here.</p>
        <RelationshipForm concepts={concepts} types={types} sources={sources} source={source} target={target} onSourceChange={setSource} onTargetChange={setTarget} />
      </section>
    </div>
  );
}
