import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import { clothStatePath } from "@/features/process/domain/asset-catalogue";
import type { StageTemplate, TraditionKey } from "@/features/process/domain/stage-template";
import { compileSpatialManifest, deterministicUuid, type CompileResult } from "@/features/spatial/compiler";
import type { DoorTraditionView, DoorView, ParityInput } from "@/server/research/parity/engine";

import { syntheticGraph, syntheticInput } from "../spatial/fixtures";

export const SOURCE_A = deterministicUuid("source", "demo-source-a");
export const SOURCE_B = deterministicUuid("source", "demo-source-b");

export function demoBundle(): KnowledgeBundle {
  const g = syntheticGraph();
  return {
    schemaVersion: 1,
    versionLabel: g.versionLabel,
    isDemo: true,
    includesUnverified: false,
    generatedAt: "2026-01-01T00:00:00.000Z",
    categories: g.categories.map((c) => ({ ...c })),
    relationshipTypes: g.relationshipTypes.map((t) => ({ ...t, inverseLabel: null })),
    traditions: g.traditions.map((t) => ({
      ...t,
      altNames: [],
      summary: null,
      region: { place: null, district: null, state: null, country: null, lat: null, lon: null },
      gi: null,
      verificationState: "verified" as const,
    })),
    sources: [SOURCE_A, SOURCE_B].map((id, i) => ({
      id,
      kind: "historical_documentation" as const,
      title: `Demo: source ${i + 1}`,
      author: null,
      publisher: null,
      year: null,
      url: null,
      accessedOn: null,
      reliability: null,
      verificationState: "verified" as const,
    })),
    concepts: g.concepts.map((c) => ({
      id: c.id,
      key: c.key,
      slug: c.key.replace(/[._]/g, "-"),
      type: c.type,
      category: c.category,
      traditionId: c.traditionId,
      title: c.title,
      summary: c.summary,
      body: null,
      bodyMd: null,
      localTerms: [],
      compares: [...c.compares],
      provenanceKind: "historical_documentation" as const,
      verificationState: "verified" as const,
      // Every concept cites source A; the shared mechanism alone cites source B.
      claims: [
        {
          id: deterministicUuid("claim", c.key),
          text: `Demo claim about ${c.key}.`,
          quote: null,
          sources: [{ sourceId: c.key.startsWith("demo-shared") ? SOURCE_B : SOURCE_A, locator: null, evidence: [] }],
        },
      ],
      assetIds: [],
    })),
    relationships: g.relationships.map((r) => ({
      ...r,
      explanation: `Demo: explanation of ${r.source} ${r.type} ${r.target}.`,
      conditions: null,
      strength: null,
      provenanceKind: "historical_documentation" as const,
      verificationState: "verified" as const,
      sources: [],
    })),
  };
}

let compiled: CompileResult | null = null;
export function demoManifest(): CompileResult {
  // The manifest is compiled from the bundle itself, as the platform compiles from a snapshot payload.
  compiled ??= compileSpatialManifest(syntheticInput(demoBundle()));
  return compiled;
}

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const TRADITIONS: TraditionKey[] = ["ajrakh", "sanganeri"];

export function fixtureTemplate(tradition: TraditionKey): StageTemplate {
  return {
    tradition,
    traditionName: `Sample Text ${tradition}`,
    rawClothStateId: `${tradition}-raw`,
    products: [{ id: `${tradition}-product`, file: `/walkthrough/products/${tradition}.jpg`, name: "Sample Text", holder: "Sample Text" }],
    stages: [1, 2].map((number) => ({
      number,
      key: `${tradition}-s${number}`,
      sourceStageKeys: [`${tradition}.process_stage.s${number}`],
      name: `Sample Text Stage ${number}`,
      localName: null,
      kind: "table" as const,
      caption: { text: `Sample Text caption ${number}`, sources: [{ sourceId: "S1", title: "Sample Text", locator: "p. 1", quote: "Sample Text" }] },
      items: [{ key: `${tradition}-tool-${number}`, role: "tool" as const, label: `Sample Text Tool ${tradition} ${number}`, localName: null, modelId: number === 1 ? "bucket" : "mallet" }],
      clothStateId: `${tradition}-c${number}`,
    })),
  };
}

export function doorTradition(template: StageTemplate): DoorTraditionView {
  return {
    tradition: template.tradition,
    stages: template.stages.map((stage) => ({ number: stage.number, key: stage.key, name: stage.name, caption: stage.caption.text, sources: stage.caption.sources, items: stage.items, clothStateId: stage.clothStateId, clothFile: clothStatePath(stage.clothStateId) })),
    products: template.products.map((product) => ({ id: product.id, file: product.file })),
  };
}

export function passingInput(): ParityInput {
  const templates = TRADITIONS.map(fixtureTemplate);
  const doors: DoorView[] = (["2d", "immersive"] as const).map((door) => ({ door, reachable: true, traditions: templates.map(doorTradition) }));
  const files = doors.flatMap((door) => door.traditions.flatMap((tradition) => [...tradition.stages.map((stage) => stage.clothFile), ...tradition.products.map((product) => product.file)]));
  return clone({
    study: {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "parity-fixture",
      protocolVersion: "p1",
      design: "between",
      isDemo: false,
      config: {
        traditionSlugs: TRADITIONS,
        exposure: { mode: "self_paced", minutes: 30, allowEarlyFinish: true, requireEveryStage: true },
        guidance: { policy: "none", cueEnabled: false },
        steps: ["pre_test", "learning", "post_test"],
      },
      snapshotId: "00000000-0000-4000-8000-0000000000aa",
      manifestId: null,
      conditions: [
        { id: "c2d", code: "conventional", label: "2D", interface: "conventional_2d", config: {} },
        { id: "c3d", code: "immersive", label: "3D", interface: "immersive_3d", config: {} },
      ],
      battery: [
        { assessmentId: "a-pre", code: "pre-test", version: 1, kind: "pretest", phase: "pre", position: 0, status: "locked", required: true },
        { assessmentId: "a-post", code: "post-test", version: 1, kind: "posttest", phase: "post", position: 0, status: "locked", required: true },
      ],
    },
    snapshot: { id: "00000000-0000-4000-8000-0000000000aa", versionLabel: "fixture", status: "published", kind: "release", isDemo: false },
    templates,
    doors,
    fileHashes: Object.fromEntries(files.map((file) => [file, `hash-${file}`])),
    sessionBudgets: [],
  });
}
