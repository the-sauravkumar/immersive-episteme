/**
 * Small synthetic FORMAT v1 packages for the knowledge-graph tests. Placeholder vocabulary
 * only ("Stage one", "Material A"): no craft facts.
 */
import { loadContentFiles, type ContentFileInput } from "../../../src/features/knowledge/graph/loader";
import type { KnowledgeGraphModel } from "../../../src/features/knowledge/graph/types";

type Json = Record<string, unknown>;

export function claim(text: string, source_ids: string[] = ["S1"]): Json {
  return { text, source_ids };
}

/** A concept whose summary/body_md follow the claims-only policy. */
export function concept(key: string, category: string, title: string, claims: Json[] = [claim(`${title} is documented.`)], extra: Json = {}): Json {
  const texts = claims.map((c) => String(c.text).trim());
  return {
    key,
    type: key.split(".")[1],
    category,
    title,
    summary: texts[0] ?? "",
    body_md: texts.map((t, i) => `${t} [${(claims[i]!.source_ids as string[]).join(", ")}]`).join("\n\n"),
    local_terms: [],
    provenance_kind: "historical_documentation",
    verification_state: "under_review",
    claims,
    prose_policy: "claims-only",
    ...extra,
  };
}

export function rel(source: string, type: string, target: string, extra: Json = {}): Json {
  return {
    source,
    target,
    type,
    explanation: `${type} placeholder link.`,
    conditions: null,
    ordinal: null,
    provenance_kind: "historical_documentation",
    verification_state: "under_review",
    source_ids: ["S1"],
    ...extra,
  };
}

export function source(id: string, extra: Json = {}): Json {
  return {
    id,
    kind: "historical_documentation",
    title: `Placeholder source ${id}`,
    url: `https://example.org/${id.toLowerCase().replace(":", "-")}`,
    reliability: "high",
    ...extra,
  };
}

/** Tradition "alpha": a 3-stage PRECEDES chain, a material, a tool, all linked. */
export function alphaFile(): Json {
  const ns = "alpha";
  return {
    format_version: 1,
    slug: ns,
    name: "Alpha placeholder tradition",
    alt_names: [],
    region: { place: "Placeholder", country: "Nowhere", lat: 10, lon: 20 },
    gi: { registered: false, application_no: null, year: null, source_ids: ["S1"] },
    summary: "Placeholder tradition used in tests.",
    sources: [source("S1"), source("S2", { reliability: "low" })],
    concepts: [
      concept(`${ns}.tradition.alpha`, "tradition_identity", "Alpha"),
      concept(`${ns}.process_stage.stage-one`, "process_stages", "Stage one"),
      concept(`${ns}.process_stage.stage-two`, "process_stages", "Stage two"),
      concept(`${ns}.process_stage.stage-three`, "process_stages", "Stage three"),
      concept(`${ns}.material.material-a`, "materials", "Material A"),
      concept(`${ns}.tool.tool-b`, "tools", "Tool B", [claim("Tool B is documented.", ["S1", "S2"])]),
    ],
    relationships: [
      rel(`${ns}.process_stage.stage-one`, "PRECEDES", `${ns}.process_stage.stage-two`, { ordinal: 1 }),
      rel(`${ns}.process_stage.stage-two`, "PRECEDES", `${ns}.process_stage.stage-three`, { ordinal: 2 }),
      rel(`${ns}.process_stage.stage-one`, "USES", `${ns}.material.material-a`),
      rel(`${ns}.process_stage.stage-two`, "USES", `${ns}.tool.tool-b`),
      rel(`${ns}.process_stage.stage-one`, "BELONGS_TO", `${ns}.tradition.alpha`),
      rel(`${ns}.process_stage.stage-two`, "BELONGS_TO", `${ns}.tradition.alpha`),
      rel(`${ns}.process_stage.stage-three`, "BELONGS_TO", `${ns}.tradition.alpha`),
      rel(`${ns}.material.material-a`, "BELONGS_TO", `${ns}.tradition.alpha`),
    ],
    media_candidates: [],
  };
}

/** Comparisons file borrowing alpha's S1 as `alpha:S1`. */
export function comparisonsFile(): Json {
  return {
    format_version: 1,
    slug: "comparisons",
    name: "Comparisons",
    alt_names: [],
    region: null,
    gi: null,
    summary: null,
    sources: [source("alpha:S1", { url: "https://example.org/s1", title: "Placeholder source S1" })],
    concepts: [
      concept("comparisons.comparison.alpha-stages", "cross_tradition_comparisons", "Alpha stages compared", [claim("Stages compared.", ["alpha:S1"])], {
        compares: ["alpha.process_stage.stage-one", "alpha.process_stage.stage-two"],
      }),
    ],
    relationships: [],
    media_candidates: [],
  };
}

export function files(...data: Json[]): ContentFileInput[] {
  return data.map((d) => ({
    path: d.slug === "comparisons" ? "content/comparisons.json" : `content/traditions/${String(d.slug)}/tradition.json`,
    data: d,
  }));
}

export function load(...data: Json[]): KnowledgeGraphModel {
  const { model, issues } = loadContentFiles(files(...data));
  if (issues.length > 0) throw new Error(`fixture failed to load: ${issues.map((i) => i.message).join("; ")}`);
  return model;
}

export function codes(issues: readonly { code: string }[]): string[] {
  return [...new Set(issues.map((i) => i.code))].sort();
}

/** Deterministic Fisher–Yates shuffle (mulberry32). */
export function shuffled<T>(xs: readonly T[], seed: number): T[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
