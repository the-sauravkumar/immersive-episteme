/**
 * Graph-derived structure diagrams (DR-018; DESIGN.md 9.9, 12.3). Run over the REAL curated
 * content (read-only), built into a review snapshot exactly as the pipeline does:
 *
 *  - a diagram states nothing beyond the graph: every node is a concept of the bundle, labelled
 *    only with its own title; every edge is a relationship of the bundle, of the diagram type's
 *    stated relationship types, between two drawn nodes, labelled with the registry's label;
 *  - the diagram types are equal for the three study traditions, in the same sections;
 *  - balancing keeps a type only when every tradition in scope has it;
 *  - the layout stays inside the 3:2 slot and no two boxes overlap;
 *  - the structure-diagram switch removes every diagram (both conditions read the same switch);
 *  - short citation labels are derived, never cut mid-word.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";
import { readContentDirectory } from "@/features/knowledge/graph/load-content-dir";
import { validateContentFiles } from "@/features/knowledge/graph/report";
import { buildSnapshot } from "@/features/knowledge/graph/snapshot";
import { parseSourceManifest } from "@/features/knowledge/graph/source-manifest";
import {
  balanceDiagramSets,
  buildStructureDiagrams,
  DIAGRAM_EDGE_TYPES,
  DIAGRAM_HEIGHT,
  DIAGRAM_SECTION,
  DIAGRAM_WIDTH,
  STRUCTURE_DIAGRAM_TYPES,
  type StructureDiagram,
} from "@/features/knowledge/read/diagrams";
import { createKnowledgeView, diagramFiguresByConcept, resolveConceptFigures, shortCitationLabel } from "@/features/knowledge/read/view";
import { EPISTEMIC_SECTIONS } from "@/features/learning-2d/template";
import { CANONICAL_TRADITION_SLUGS, compareTraditions, STUDY_TRADITION_SLUGS } from "@/features/learning/labels";
import { learningSettingsOf } from "@/features/learning/settings";
import { studyConfigSchema } from "@/features/study/contracts";
import { titleCase } from "@/lib/text/title-case";

const CONTENT = join(process.cwd(), "content");
const present = existsSync(join(CONTENT, "traditions"));

function realBundle(): KnowledgeBundle {
  const dir = readContentDirectory(CONTENT, process.cwd());
  const manifest = dir.sourceManifest ? parseSourceManifest(dir.sourceManifest.text) : null;
  const { model, report } = validateContentFiles(dir.files, { sourceManifest: manifest });
  const built = buildSnapshot(model, { hasher: nodeSha256, generatedAt: "2026-10-14T00:00:00.000Z", issues: report.issues, kind: "review" });
  if (!built.ok) throw new Error("the review snapshot did not build");
  return built.snapshot.payload;
}

describe.skipIf(!present)("structure diagrams over the real content", () => {
  const bundle = present ? realBundle() : (null as unknown as KnowledgeBundle);
  const conceptById = new Map(bundle?.concepts.map((c) => [c.id, c]) ?? []);
  const relById = new Map(bundle?.relationships.map((r) => [r.id, r]) ?? []);
  const typeLabel = new Map(bundle?.relationshipTypes.map((t) => [t.code, t.label]) ?? []);
  const traditionOf = (slug: string) => bundle.traditions.find((t) => t.slug === slug)!;
  const all = new Map(CANONICAL_TRADITION_SLUGS.map((s) => [s, buildStructureDiagrams(bundle, s)]));

  it("gives the three study traditions the same diagram types, in the same sections", () => {
    const types = STUDY_TRADITION_SLUGS.map((s) => all.get(s)!.map((d) => `${d.type}@${d.section}`));
    expect(types[0]).toEqual(STRUCTURE_DIAGRAM_TYPES.map((t) => `${t}@${DIAGRAM_SECTION[t]}`));
    expect(types[1]).toEqual(types[0]);
    expect(types[2]).toEqual(types[0]);
  });

  for (const slug of CANONICAL_TRADITION_SLUGS) {
    it(`${slug}: states nothing beyond the graph`, () => {
      const t = traditionOf(slug);
      for (const d of all.get(slug)!) {
        const nodeIds = new Set(d.nodes.map((n) => n.id));
        for (const n of d.nodes) {
          const c = conceptById.get(n.id);
          expect(c, `node ${n.key} is a concept`).toBeDefined();
          expect(n.key).toBe(c!.key);
          expect(n.title).toBe(c!.title);
          // The label is exactly the Title Case title, wrapped (nothing added, nothing dropped).
          expect(n.lines.join(" ").replace(/- /g, "-")).toBe(titleCase(c!.title).replace(/\s+/g, " "));
        }
        for (const e of d.edges) {
          const r = relById.get(e.relationshipId);
          expect(r, `edge ${e.relationshipId} is a relationship`).toBeDefined();
          expect(DIAGRAM_EDGE_TYPES[d.type]).toContain(r!.type);
          expect(e.type).toBe(r!.type);
          expect(e.label).toBe(typeLabel.get(r!.type));
          expect(conceptById.get(e.source)!.key).toBe(r!.source);
          expect(conceptById.get(e.target)!.key).toBe(r!.target);
          expect(nodeIds.has(e.source) && nodeIds.has(e.target)).toBe(true);
        }
        // Band labels only repeat edge labels.
        const edgeLabels = new Set(d.edges.map((e) => e.label));
        for (const b of d.bands) for (const part of b.label.split(" / ")) expect(edgeLabels.has(part)).toBe(true);
        // Every node is connected by a drawn edge (no free-floating concepts).
        const touched = new Set(d.edges.flatMap((e) => [e.source, e.target]));
        expect([...nodeIds].every((id) => touched.has(id))).toBe(true);
        // The anchor is a concept of this tradition, in the type's section, with a claim to anchor to.
        const anchor = conceptById.get(d.anchor.conceptId)!;
        expect(anchor.traditionId).toBe(t.id);
        const section = EPISTEMIC_SECTIONS.find((s) => s.id === DIAGRAM_SECTION[d.type])!;
        expect((section.types as readonly string[]).includes(anchor.type)).toBe(true);
        expect(anchor.claims.length).toBeGreaterThan(d.anchor.claimIndex);
        expect(d.nodes.filter((n) => n.current).map((n) => n.id)).toEqual([anchor.id]);
      }
    });

    it(`${slug}: lays out inside the 3:2 slot with no overlapping boxes`, () => {
      for (const d of all.get(slug)!) {
        expect(d.width / d.height).toBe(3 / 2);
        for (const n of d.nodes) {
          expect(n.x).toBeGreaterThanOrEqual(0);
          expect(n.y).toBeGreaterThanOrEqual(0);
          expect(n.x + n.w).toBeLessThanOrEqual(DIAGRAM_WIDTH);
          expect(n.y + n.h).toBeLessThanOrEqual(DIAGRAM_HEIGHT);
        }
        for (const [i, a] of d.nodes.entries())
          for (const b of d.nodes.slice(i + 1)) {
            const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            expect(overlap, `${a.key} overlaps ${b.key}`).toBe(false);
          }
      }
    });
  }

  it("process sequence: the PRECEDES chain of process stages in ordinal order", () => {
    for (const slug of STUDY_TRADITION_SLUGS) {
      const d = all.get(slug)!.find((x) => x.type === "process-sequence")!;
      expect(d.nodes.every((n) => n.type === "process_stage")).toBe(true);
      const ordinals = d.edges.map((e) => relById.get(e.relationshipId)!.ordinal);
      expect(ordinals).toEqual([...ordinals].sort((a, b) => a! - b!));
      expect(d.alt.startsWith("Stages in order:")).toBe(true);
    }
  });

  it("materials and tools: one stage and only its material and tool concepts", () => {
    for (const slug of STUDY_TRADITION_SLUGS) {
      const d = all.get(slug)!.find((x) => x.type === "materials-tools")!;
      const stage = d.nodes.find((n) => n.current)!;
      expect(stage.type).toBe("process_stage");
      expect(d.nodes.filter((n) => !n.current).every((n) => n.type === "material" || n.type === "tool")).toBe(true);
      expect(d.edges.every((e) => e.source === stage.id)).toBe(true);
    }
  });

  it("colour mechanism: every outcome is produced by a drawn scientific mechanism", () => {
    for (const slug of STUDY_TRADITION_SLUGS) {
      const d = all.get(slug)!.find((x) => x.type === "colour-mechanism")!;
      const outcomes = d.nodes.filter((n) => n.type === "outcome");
      expect(outcomes.length).toBeGreaterThan(0);
      for (const o of outcomes) {
        const into = d.edges.filter((e) => e.target === o.id);
        expect(into.length).toBeGreaterThan(0);
        expect(into.every((e) => e.type === "PRODUCES" && conceptById.get(e.source)!.type === "scientific_mechanism")).toBe(true);
      }
    }
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildStructureDiagrams(bundle, "ajrakh"))).toBe(JSON.stringify(all.get("ajrakh")));
  });

  it("balances: a type missing for one tradition in scope is dropped for all", () => {
    const sets = new Map<string, StructureDiagram[]>([...all].map(([k, v]) => [k, v]));
    sets.set("sanganeri", sets.get("sanganeri")!.filter((d) => d.type !== "colour-mechanism"));
    const balanced = balanceDiagramSets(sets, STUDY_TRADITION_SLUGS);
    for (const slug of STUDY_TRADITION_SLUGS) expect(balanced.get(slug)!.map((d) => d.type)).toEqual(["process-sequence", "materials-tools"]);
  });

  it("attaches one figure per anchor concept, balanced across the study traditions, and the switch turns them all off", () => {
    const view = createKnowledgeView(bundle);
    const byConcept = diagramFiguresByConcept(view, { traditionSlugs: [...STUDY_TRADITION_SLUGS], balanceSlugs: [...STUDY_TRADITION_SLUGS] });
    expect([...byConcept.values()].every((list) => list.length === 1)).toBe(true);
    const perTradition = STUDY_TRADITION_SLUGS.map((slug) => [...byConcept.values()].flat().filter((f) => f.diagram.traditionSlug === slug).length);
    expect(perTradition).toEqual([3, 3, 3]);
    for (const list of byConcept.values()) {
      expect(resolveConceptFigures({ diagrams: list, photos: [], structureDiagrams: true })).toHaveLength(1);
      expect(resolveConceptFigures({ diagrams: list, photos: [], structureDiagrams: false })).toEqual([]);
    }
    const f = [...byConcept.values()][0]![0]!;
    expect(f.credit).toBe(`Diagram generated from the project's knowledge graph (snapshot ${bundle.versionLabel})`);
  });
});

describe("the structure-diagram switch in the study contract", () => {
  it("defaults on and reaches both conditions through the shared learning settings", () => {
    expect(learningSettingsOf(studyConfigSchema.parse({})).figures).toEqual({ structureDiagrams: true });
    expect(learningSettingsOf(studyConfigSchema.parse({ figures: { structureDiagrams: false } })).figures).toEqual({ structureDiagrams: false });
  });
});

describe("canonical tradition order (DR-019)", () => {
  it("is alphabetical by display name and fixed", () => {
    const names = [
      { slug: "sanganeri", name: "Sanganeri" },
      { slug: "ajrakh", name: "Ajrakh" },
      { slug: "machilipatnam-kalamkari", name: "Machilipatnam Kalamkari" },
    ];
    expect([...names].sort(compareTraditions).map((t) => t.slug)).toEqual([...STUDY_TRADITION_SLUGS]);
    expect([...CANONICAL_TRADITION_SLUGS]).toEqual([...CANONICAL_TRADITION_SLUGS].sort());
  });
});

describe("shortCitationLabel", () => {
  const base = { title: "A title", locator: null };
  it("uses the first author or publisher short name, the year and the locator", () => {
    expect(shortCitationLabel({ ...base, author: "Victoria and Albert Museum", publisher: "V&A", year: 2007, locator: "p. 2" })).toBe("Victoria and Albert Museum, 2007 · p. 2");
    // The locator's abbreviation stays with its number (no break inside "PDF p. 4").
    expect(shortCitationLabel({ ...base, author: "Khamir", publisher: null, year: 2020, locator: "PDF p. 4" })).toBe("Khamir, 2020 · PDF p. 4");
    expect(shortCitationLabel({ ...base, author: "Gauri Kathju; Radha Kashyap", publisher: null, year: 2025 })).toBe("Gauri Kathju, 2025");
    expect(shortCitationLabel({ ...base, author: "Lath, Aparajita", publisher: null, year: 2013 })).toBe("Lath, 2013");
    expect(shortCitationLabel({ ...base, author: "Khamir (craft resource centre, Kachchh)", publisher: "Khamir", year: null })).toBe("Khamir");
    expect(shortCitationLabel({ ...base, author: null, publisher: "Some Press", year: 0 })).toBe("Some Press");
  });
  it("never cuts a word", () => {
    const label = shortCitationLabel({ title: "t", author: "Office of the Controller General of Patents Designs and Trade Marks of India", publisher: null, year: 2023, locator: "Section 4.2 of the long journal description" });
    const words = "Office of the Controller General of Patents Designs and Trade Marks of India".split(" ");
    const who = label.split(", 2023")[0]!.replace("…", "");
    expect(who.split(" ").every((w) => words.includes(w))).toBe(true);
  });
});
