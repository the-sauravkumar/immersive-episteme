import { describe, expect, it } from "vitest";

import { loadContentFiles } from "../../../src/features/knowledge/graph/loader";
import { parseSourceManifest } from "../../../src/features/knowledge/graph/source-manifest";
import type { KnowledgeGraphModel } from "../../../src/features/knowledge/graph/types";
import {
  createContext,
  validateCycles,
  validateDuplicates,
  validateEntities,
  validateGraph,
  validateOrphans,
  validateProcessSequences,
  validateProse,
  validateProvenance,
  validateRelationships,
  validateSemantics,
  type ValidationOptions,
  type Validator,
} from "../../../src/features/knowledge/graph/validate";
import { alphaFile, claim, codes, comparisonsFile, concept, files, load, rel } from "./fixtures";

const A = "alpha.process_stage";
const run = (v: Validator, model: KnowledgeGraphModel, options: ValidationOptions = {}) => v(createContext(model, options));
const errorsOf = (model: KnowledgeGraphModel, options: ValidationOptions = {}) =>
  validateGraph(model, { coverageTargets: false, ...options }).filter((i) => i.severity === "error");

type Json = Record<string, unknown>;
const relsOf = (f: Json) => f.relationships as Json[];
const conceptsOf = (f: Json) => f.concepts as Json[];

describe("baseline fixture", () => {
  it("loads and has no warnings or errors", () => {
    const model = load(alphaFile(), comparisonsFile());
    const issues = validateGraph(model, { coverageTargets: false });
    expect(issues.filter((i) => i.severity !== "info")).toEqual([]);
  });

  it("resolves a qualified source id to the origin file's source", () => {
    const model = load(alphaFile(), comparisonsFile());
    const cmp = model.concepts.find((c) => c.key === "comparisons.comparison.alpha-stages")!;
    expect(cmp.claims[0]!.sourceRefs).toEqual(["alpha#S1"]);
    expect(model.sources.map((s) => s.ref).sort()).toEqual(["alpha#S1", "alpha#S2"]);
  });
});

describe("loader (FORMAT contract)", () => {
  it("rejects a file that breaks the contract (KG100) and unreadable JSON (KG101)", () => {
    const bad = alphaFile();
    conceptsOf(bad)[1]!.verification_state = "verified"; // interchange files may never carry verified
    const { issues } = loadContentFiles([...files(bad), { path: "content/broken.json", text: "{ nope" }]);
    expect(codes(issues)).toEqual(["KG100", "KG101"]);
  });

  it("flags duplicate slugs (KG102) and qualified-source copies that differ (KG410)", () => {
    const cmp = comparisonsFile();
    (cmp.sources as Json[])[0]!.url = "https://example.org/other";
    const { issues } = loadContentFiles([...files(alphaFile(), cmp), { path: "content/traditions/alpha2/tradition.json", data: alphaFile() }]);
    expect(codes(issues)).toEqual(["KG102", "KG410"]);
  });
});

describe("entity validation (1xx)", () => {
  it("passes a clean model", () => {
    expect(run(validateEntities, load(alphaFile(), comparisonsFile()))).toEqual([]);
  });

  it("detects duplicate keys, namespace mismatch, demo markers, comparison arity and unknown compares", () => {
    const model = load(alphaFile(), comparisonsFile());
    model.concepts.push({ ...model.concepts[1]!, packageSlug: "comparisons" }); // KG103 + KG104
    model.concepts[2]!.title = "Demo: stage two"; // KG105
    const cmp = model.concepts.find((c) => c.type === "comparison")!;
    cmp.compares = ["alpha.process_stage.missing"]; // KG108 + KG109
    model.packages[0]!.mediaCandidates.push({ url: "https://example.org/m", title: "m", licence: null, author: null, depicts: "alpha.tool.nope", width: null, height: null, mime: null, dimensionsSource: null }); // KG110
    expect(codes(run(validateEntities, model))).toEqual(["KG103", "KG104", "KG105", "KG108", "KG109", "KG110"]);
  });

  it("requires exactly one tradition concept per tradition file (KG107)", () => {
    const f = alphaFile();
    f.concepts = conceptsOf(f).slice(1);
    f.relationships = relsOf(f).filter((r) => r.type !== "BELONGS_TO");
    expect(codes(run(validateEntities, load(f)))).toEqual(["KG107"]);
  });
});

describe("relationship validation (2xx)", () => {
  it("passes a clean model", () => {
    expect(run(validateRelationships, load(alphaFile()))).toEqual([]);
  });

  it("rejects unknown types, missing endpoints, self-loops, duplicates, reverse undirected pairs and stray ordinals", () => {
    const model = load(alphaFile());
    const base = model.relationships[2]!; // stage-one USES material-a
    model.relationships.push(
      { ...base, type: "RELATES_SOMEHOW" }, // KG200
      { ...base, target: "alpha.material.ghost" }, // KG201
      { ...base, target: base.source }, // KG202
      { ...base, packageSlug: "comparisons" }, // KG203
      { ...base, type: "SIMILAR_TO", source: `${A}.stage-two`, target: `${A}.stage-three` },
      { ...base, type: "SIMILAR_TO", source: `${A}.stage-three`, target: `${A}.stage-two` }, // KG204
      { ...base, type: "USES", target: "alpha.tool.tool-b", ordinal: 4 }, // KG205
    );
    expect(codes(run(validateRelationships, model))).toEqual(["KG200", "KG201", "KG202", "KG203", "KG204", "KG205"]);
  });

  it("rejects an accepted relationship whose endpoint is not accepted (KG206)", () => {
    const model = load(alphaFile());
    model.relationships[0]!.verificationState = "verified";
    expect(codes(run(validateRelationships, model))).toEqual(["KG206"]);
    for (const c of model.concepts) c.verificationState = "verified";
    expect(run(validateRelationships, model)).toEqual([]);
  });
});

describe("cycle checks (3xx)", () => {
  it("passes an acyclic model", () => {
    expect(run(validateCycles, load(alphaFile()))).toEqual([]);
  });

  it("rejects cycles in acyclic types (BELONGS_TO, DEPENDS_ON)", () => {
    const f = alphaFile();
    relsOf(f).push(rel("alpha.tradition.alpha", "BELONGS_TO", `${A}.stage-one`));
    relsOf(f).push(rel(`${A}.stage-two`, "DEPENDS_ON", `${A}.stage-one`), rel(`${A}.stage-one`, "DEPENDS_ON", `${A}.stage-two`));
    const issues = run(validateCycles, load(f));
    expect(issues.filter((i) => i.code === "KG300")).toHaveLength(2);
    expect(codes(issues)).toEqual(["KG300"]); // the DEPENDS_ON cycle is not re-reported as KG303
  });

  it("rejects an unmarked PRECEDES cycle but accepts one closed by a marked loop", () => {
    const unmarked = alphaFile();
    relsOf(unmarked).push(rel(`${A}.stage-three`, "PRECEDES", `${A}.stage-one`));
    expect(codes(run(validateCycles, load(unmarked)))).toEqual(["KG301"]);

    const marked = alphaFile();
    relsOf(marked).push(rel(`${A}.stage-three`, "PRECEDES", `${A}.stage-two`, { conditions: "Loop for a second pass." }));
    const issues = run(validateCycles, load(marked));
    expect(codes(issues)).toEqual(["KG302"]);
    expect(issues[0]!.severity).toBe("info");
  });

  it("rejects a mixed REQUIRES/DEPENDS_ON dependency cycle (KG303)", () => {
    const f = alphaFile();
    relsOf(f).push(rel(`${A}.stage-two`, "DEPENDS_ON", `${A}.stage-one`), rel(`${A}.stage-one`, "REQUIRES", `${A}.stage-two`));
    expect(codes(run(validateCycles, load(f)))).toEqual(["KG303"]);
  });
});

describe("process dependency validation (31x)", () => {
  it("passes a contiguous chain", () => {
    expect(run(validateProcessSequences, load(alphaFile()))).toEqual([]);
  });

  it("rejects duplicate and missing ordinals", () => {
    const dup = alphaFile();
    relsOf(dup)[1]!.ordinal = 1;
    expect(codes(run(validateProcessSequences, load(dup)))).toEqual(["KG310"]);

    const gap = alphaFile();
    relsOf(gap)[1]!.ordinal = 3;
    expect(codes(run(validateProcessSequences, load(gap)))).toEqual(["KG311"]);
  });

  it("numbers each independent chain on its own (a second chain may restart at 1)", () => {
    const f = alphaFile();
    relsOf(f).push(rel(`${A}.history-early`, "PRECEDES", `${A}.history-late`, { ordinal: 1 }));
    expect(run(validateProcessSequences, load(f))).toEqual([]);
  });

  it("still rejects a gap inside a second, independent chain", () => {
    const f = alphaFile();
    relsOf(f).push(
      rel(`${A}.history-early`, "PRECEDES", `${A}.history-mid`, { ordinal: 1 }),
      rel(`${A}.history-mid`, "PRECEDES", `${A}.history-late`, { ordinal: 3 }),
    );
    expect(codes(run(validateProcessSequences, load(f)))).toEqual(["KG311"]);
  });

  it("warns when consecutive ordinals do not join (KG312)", () => {
    const f = alphaFile();
    relsOf(f)[1]!.source = `${A}.stage-three`;
    relsOf(f)[1]!.target = `${A}.stage-two`;
    expect(codes(run(validateProcessSequences, load(f)))).toEqual(["KG312"]);
  });

  it("rejects a fork without conditions, accepts one with conditions on every branch", () => {
    const f = alphaFile();
    relsOf(f).push(rel(`${A}.stage-one`, "PRECEDES", `${A}.stage-three`, { ordinal: 3 }));
    expect(codes(run(validateProcessSequences, load(f)))).toContain("KG313");

    const g = alphaFile();
    relsOf(g)[0]!.conditions = "When branch A applies.";
    relsOf(g).push(rel(`${A}.stage-one`, "PRECEDES", `${A}.stage-three`, { ordinal: 3, conditions: "When branch B applies." }));
    expect(codes(run(validateProcessSequences, load(g)))).not.toContain("KG313");
  });

  it("reports unordinalled and non-stage PRECEDES (info) and unsequenced stages (warning)", () => {
    const f = alphaFile();
    conceptsOf(f).push(concept(`${A}.stage-four`, "process_stages", "Stage four"));
    relsOf(f).push(rel("alpha.material.material-a", "PRECEDES", "alpha.tool.tool-b"));
    const issues = run(validateProcessSequences, load(f));
    expect(codes(issues)).toEqual(["KG314", "KG315", "KG316"]);
    expect(issues.find((i) => i.code === "KG316")!.severity).toBe("warning");
  });
});

describe("provenance (4xx)", () => {
  it("passes a fully sourced model", () => {
    expect(run(validateProvenance, load(alphaFile(), comparisonsFile())).filter((i) => i.severity !== "info")).toEqual([]);
  });

  it("rejects missing claims and unresolved or absent sources", () => {
    const model = load(alphaFile());
    model.concepts[1]!.claims = []; // KG400
    model.concepts[2]!.claims[0]!.sourceRefs = []; // KG401
    model.concepts[3]!.claims[0]!.sourceRefs = ["alpha#S9"]; // KG402
    model.relationships[0]!.sourceRefs = []; // KG403
    model.relationships[1]!.sourceRefs = ["alpha#S9"]; // KG404
    model.packages[0]!.gi!.sourceRefs = ["alpha#S9"]; // KG411
    expect(codes(run(validateProvenance, model).filter((i) => i.severity === "error"))).toEqual(["KG400", "KG401", "KG402", "KG403", "KG404", "KG411"]);
  });

  it("requires direct evidence for CAUSES", () => {
    const weak = alphaFile();
    relsOf(weak).push(rel("alpha.material.material-a", "CAUSES", `${A}.stage-three`, { provenance_kind: "hypothesis" }));
    expect(codes(run(validateProvenance, load(weak)))).toContain("KG405");

    const low = alphaFile();
    relsOf(low).push(rel("alpha.material.material-a", "CAUSES", `${A}.stage-three`, { source_ids: ["S2"] }));
    const lowIssues = codes(run(validateProvenance, load(low)));
    expect(lowIssues).toContain("KG406");
    expect(lowIssues).not.toContain("KG405");

    const ok = alphaFile();
    relsOf(ok).push(rel("alpha.material.material-a", "CAUSES", `${A}.stage-three`));
    expect(codes(run(validateProvenance, load(ok)))).toEqual([]);
  });

  it("notes low-reliability-only claims, uncited sources and sources missing from the manifest", () => {
    const f = alphaFile();
    (f.sources as Json[]).push({ id: "S3", kind: "unverified", title: "Unused", url: "https://example.org/s3", reliability: "low" });
    conceptsOf(f)[4] = concept("alpha.material.material-a", "materials", "Material A", [claim("Material A is documented.", ["S2"])]);
    const manifest = parseSourceManifest(`cache_id\thttp_status\tsha256\turl\nx\t200\t${"a".repeat(64)}\thttps://example.org/s1\n`);
    const issues = run(validateProvenance, load(f), { sourceManifest: manifest });
    expect(codes(issues)).toEqual(["KG407", "KG408", "KG409"]);
  });
});

describe("duplicates (5xx)", () => {
  it("passes distinct titles", () => {
    expect(run(validateDuplicates, load(alphaFile()))).toEqual([]);
  });

  it("rejects same title+type in a file and warns on near-duplicates and repeated claims", () => {
    const f = alphaFile();
    conceptsOf(f).push(
      concept(`${A}.stage-one-again`, "process_stages", "Stage One!"), // exact after normalisation
      concept("alpha.material.mixture-one", "materials", "Material alpha mixture"),
      concept("alpha.material.mixture-two", "materials", "Material alpha mixtures"), // near duplicate
      concept("alpha.tool.tool-c", "tools", "Tool C", [claim("Same text."), claim("Same  text")]),
    );
    const issues = run(validateDuplicates, load(f));
    expect(codes(issues)).toEqual(["KG500", "KG501", "KG502"]);
    expect(issues.find((i) => i.code === "KG500")!.severity).toBe("error");
  });

  it("does not compare titles across types", () => {
    const f = alphaFile();
    conceptsOf(f).push(concept("alpha.tool.stage-one", "tools", "Stage one"));
    expect(run(validateDuplicates, load(f))).toEqual([]);
  });
});

describe("claims-only prose (6xx)", () => {
  it("passes generated prose", () => {
    expect(run(validateProse, load(alphaFile()))).toEqual([]);
  });

  it("rejects free prose under the claims-only policy and warns without the policy", () => {
    const model = load(alphaFile());
    model.concepts[1]!.summary = "Something the claims do not say.";
    model.concepts[2]!.bodyMd = "Free paragraph.";
    model.concepts[3]!.prosePolicy = null;
    model.concepts[3]!.summary = "Unchecked prose.";
    expect(codes(run(validateProse, model))).toEqual(["KG600", "KG601", "KG602"]);
  });
});

describe("never-collapse semantics (7xx)", () => {
  it("warns when a causal link is explained associatively or a comparison causally", () => {
    const f = alphaFile();
    relsOf(f).push(
      rel("alpha.material.material-a", "ENABLES", `${A}.stage-three`, { explanation: "Material A is associated with stage three." }),
      rel("alpha.tool.tool-b", "SIMILAR_TO", "alpha.material.material-a", { explanation: "Tool B causes the same effect." }),
    );
    const issues = run(validateSemantics, load(f)).filter((i) => i.code === "KG700");
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
  });

  it("notes a pair linked by several semantics classes (KG701) and is quiet otherwise", () => {
    expect(run(validateSemantics, load(alphaFile()))).toEqual([]);
    const f = alphaFile();
    relsOf(f).push(rel(`${A}.stage-one`, "DEPENDS_ON", "alpha.material.material-a"));
    expect(codes(run(validateSemantics, load(f)))).toEqual(["KG701"]);
  });
});

describe("orphans and coverage (8xx)", () => {
  it("finds orphans and BELONGS_TO-only concepts; compares counts as a link", () => {
    const f = alphaFile();
    conceptsOf(f).push(concept("alpha.outcome.lonely", "production_outcomes", "Lonely"), concept("alpha.outcome.filed", "production_outcomes", "Filed"));
    relsOf(f).push(rel("alpha.outcome.filed", "BELONGS_TO", "alpha.tradition.alpha"));
    const issues = run(validateOrphans, load(f, comparisonsFile()), { coverageTargets: false });
    expect(issues.map((i) => `${i.code} ${i.entity}`)).toEqual(["KG800 alpha.outcome.lonely", "KG801 alpha.outcome.filed"]);
  });

  it("reports FORMAT depth targets as info", () => {
    const issues = run(validateOrphans, load(alphaFile()));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.code === "KG802" && i.severity === "info")).toBe(true);
  });
});

describe("validateGraph", () => {
  it("is deterministic and finds no errors in the fixture", () => {
    const model = load(alphaFile(), comparisonsFile());
    expect(errorsOf(model)).toEqual([]);
    expect(validateGraph(model)).toEqual(validateGraph(load(comparisonsFile(), alphaFile())));
  });
});
