/**
 * DEMO dataset. Everything here is a placeholder for interface and pipeline testing:
 *  - every row has is_demo = true, a "Demo:" title and a "demo" slug/key/label prefix;
 *  - provenance is always "unverified" and nothing is verified or published as knowledge;
 *  - the traditions are "Demo tradition A/B/C" — no real tradition names, places or facts.
 * The database makes demo rows impossible to use in a non-demo snapshot or study (composite
 * is_demo foreign keys + migration 0003 triggers).
 *
 * Coverage: every concept type, every relationship semantics class (and every registry
 * type), an ordered process sequence per tradition, cross-tradition comparisons, a published
 * demo snapshot, and one draft demo study with an assessment battery skeleton.
 *
 * Idempotent: if the demo packages already exist the seed does nothing.
 */
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  knowledgeBundleSchema,
  slugFromConceptKey,
  type KnowledgeBundle,
} from "../../src/features/knowledge/contracts";
import { itemConfigSchema } from "../../src/features/research/contracts";
import { studyConfigSchema } from "../../src/features/study/contracts";
import type { ConceptType, KnowledgeCategoryCode, VerificationState } from "../../src/lib/validation/enums";
import {
  assessmentItems,
  assessments,
  conceptClaimSources,
  conceptClaims,
  concepts,
  contentPackages,
  contentSnapshots,
  knowledgeCategories,
  referenceMapEdges,
  referenceMaps,
  relationshipSources,
  relationshipTypes,
  relationships,
  snapshotItems,
  sources,
  studies,
  studyAssessments,
  studyConditions,
  traditionSources,
  traditions,
} from "../schema";
import { itemSha256 } from "./_util";

export const DEMO_SNAPSHOT_LABEL = "demo-snapshot-v1";
export const DEMO_STUDY_SLUG = "demo-study";
const PLACEHOLDER = "Placeholder for interface testing. Not real craft knowledge.";

type ConceptSpec = {
  key: string;
  type: ConceptType;
  category: KnowledgeCategoryCode;
  title: string;
  tradition: string | null; // tradition slug
  pkg: string; // package slug
  state?: VerificationState;
  localTerms?: string[];
  compares?: string[];
};
type RelSpec = { source: string; target: string; type: string; ordinal?: number; pkg: string };

const TRADITIONS = ["a", "b", "c"] as const;
const tSlug = (t: string) => `demo-tradition-${t}`;
const ns = (t: string) => `demo-${t}`;
const T = (t: string) => t.toUpperCase();

function buildSpecs(): { concepts: ConceptSpec[]; rels: RelSpec[] } {
  const cs: ConceptSpec[] = [];
  const rs: RelSpec[] = [];
  for (const t of TRADITIONS) {
    const n = ns(t);
    const pkg = tSlug(t);
    const c = (name: string, type: ConceptType, category: KnowledgeCategoryCode, title: string, extra: Partial<ConceptSpec> = {}) => {
      const key = `${n}.${type}.${name}`;
      cs.push({ key, type, category, title: `Demo: ${title}`, tradition: pkg, pkg, ...extra });
      return key;
    };
    const tradition = c(`tradition-${t}`, "tradition", "tradition_identity", `Tradition ${T(t)}`);
    const history = c("history-note", "historical_context", "geography_history", `History note ${T(t)}`);
    const m1 = c("material-1", "material", "materials", `Material ${T(t)}1`, { localTerms: [`demo-term-${t}1`] });
    const m2 = c("material-2", "material", "materials", `Material ${T(t)}2`);
    const tool = c("tool-1", "tool", "tools", `Tool ${T(t)}1`);
    const stages = [1, 2, 3, 4].map((i) => c(`stage-${i}`, "process_stage", "process_stages", `Process stage ${T(t)}${i}`));
    const decision = c("decision-1", "artisan_decision", "tacit_decisions", `Artisan decision ${T(t)}1`);
    const principle = c("principle-1", "design_principle", "design_principles", `Design principle ${T(t)}1`);
    const outcome = c("outcome-1", "outcome", "production_outcomes", `Outcome ${T(t)}1`);
    const condition = c("condition-1", "environmental_condition", "environmental_conditions", `Environmental condition ${T(t)}1`);
    const explanation = c("explanation-1", "explanation", "artisan_knowledge", `Practitioner explanation ${T(t)}1`);
    c("question-1", "open_question", "open_questions", `Open question ${T(t)}1`, { state: "needs_evidence" });

    const r = (source: string, type: string, target: string, ordinal?: number) =>
      rs.push({ source, target, type, pkg, ...(ordinal ? { ordinal } : {}) });
    for (const k of [history, m1, m2, tool, ...stages, decision, principle, outcome, condition, explanation]) {
      r(k, "BELONGS_TO", tradition);
    }
    const [s1, s2, s3, s4] = stages as [string, string, string, string];
    r(s1, "USES", m1);
    r(s2, "USES", tool);
    r(s3, "REQUIRES", m2);
    r(s1, "PRECEDES", s2, 1);
    r(s2, "PRECEDES", s3, 2);
    r(s3, "PRECEDES", s4, 3);
    r(s4, "DEPENDS_ON", s2);
    r(s4, "PRODUCES", outcome);
    r(outcome, "AFFECTED_BY", condition);
    r(decision, "ENABLES", outcome);
    r(explanation, "PRACTITIONER_EXPLAINS", s3);
    r(explanation, "EXPLAINS", outcome);
    r(s3, "SCIENTIFICALLY_EXPLAINED_BY", "demo-shared.scientific_mechanism.mechanism-1");
    r(principle, "ASSOCIATED_WITH", outcome);
  }
  // Shared science (no tradition).
  for (const i of [1, 2]) {
    cs.push({
      key: `demo-shared.scientific_mechanism.mechanism-${i}`,
      type: "scientific_mechanism",
      category: "scientific_mechanisms",
      title: `Demo: Scientific mechanism ${i}`,
      tradition: null,
      pkg: "demo-shared",
    });
  }
  rs.push({ source: "demo-shared.scientific_mechanism.mechanism-2", target: "demo-shared.scientific_mechanism.mechanism-1", type: "CAUSES", pkg: "demo-shared" });
  // Cross-tradition comparisons.
  const mats = TRADITIONS.map((t) => `${ns(t)}.material.material-1`);
  cs.push({
    key: "demo-comparisons.comparison.material-comparison",
    type: "comparison",
    category: "cross_tradition_comparisons",
    title: "Demo: Comparison of materials A1, B1 and C1",
    tradition: null,
    pkg: "demo-comparisons",
    compares: mats,
  });
  rs.push({ source: mats[0]!, target: mats[1]!, type: "SIMILAR_TO", pkg: "demo-comparisons" });
  rs.push({ source: mats[0]!, target: mats[2]!, type: "CONTRASTS_WITH", pkg: "demo-comparisons" });
  rs.push({ source: "demo-a.process_stage.stage-1", target: "demo-b.process_stage.stage-1", type: "SIMILAR_TO", pkg: "demo-comparisons" });
  return { concepts: cs, rels: rs };
}

export async function seedDemo(db: NodePgDatabase): Promise<void> {
  const existing = await db
    .select({ id: contentPackages.id })
    .from(contentPackages)
    .where(eq(contentPackages.slug, tSlug("a")));
  if (existing.length > 0) return;

  await db.transaction(async (tx) => {
    // --- packages, traditions, sources -------------------------------------------------
    const pkgSpecs = [
      ...TRADITIONS.map((t) => ({ slug: tSlug(t), kind: "tradition", name: `Demo: Tradition ${T(t)} package` })),
      { slug: "demo-shared", kind: "shared", name: "Demo: Shared science package" },
      { slug: "demo-comparisons", kind: "comparisons", name: "Demo: Comparisons package" },
    ];
    const pkgRows = await tx
      .insert(contentPackages)
      .values(pkgSpecs.map((p) => ({ ...p, isDemo: true, summary: PLACEHOLDER })))
      .returning({ id: contentPackages.id, slug: contentPackages.slug });
    const pkgId = new Map(pkgRows.map((p) => [p.slug, p.id]));

    const srcRows = await tx
      .insert(sources)
      .values(
        pkgSpecs.map((p) => ({
          packageId: pkgId.get(p.slug)!,
          localKey: "S1",
          kind: "unverified" as const,
          title: `Demo: Placeholder source for ${p.slug}`,
          notes: "Not a real source. Exists only so demo claims have something to cite.",
          verificationState: "draft" as const,
          isDemo: true,
        })),
      )
      .returning({ id: sources.id, packageId: sources.packageId });
    const sourceByPkg = new Map(srcRows.map((s) => [s.packageId!, s.id]));
    const srcFor = (pkg: string) => sourceByPkg.get(pkgId.get(pkg)!)!;

    const tradRows = await tx
      .insert(traditions)
      .values(
        TRADITIONS.map((t) => ({
          packageId: pkgId.get(tSlug(t))!,
          slug: tSlug(t),
          name: `Demo: Tradition ${T(t)}`,
          altNames: [`Demo tradition ${T(t)}`],
          summary: PLACEHOLDER,
          regionPlace: `Demo region ${T(t)}`,
          regionCountry: "Demo country",
          verificationState: "under_review" as const,
          isDemo: true,
        })),
      )
      .returning({ id: traditions.id, slug: traditions.slug });
    const tradId = new Map(tradRows.map((r) => [r.slug, r.id]));
    await tx.insert(traditionSources).values(
      tradRows.map((r) => ({ traditionId: r.id, sourceId: srcFor(r.slug), purpose: "summary", isDemo: true })),
    );

    // --- concepts and claims ------------------------------------------------------------
    const { concepts: cSpecs, rels: rSpecs } = buildSpecs();
    const conceptRows = await tx
      .insert(concepts)
      .values(
        cSpecs.map((c) => ({
          key: c.key,
          slug: slugFromConceptKey(c.key),
          type: c.type,
          categoryCode: c.category,
          traditionId: c.tradition ? tradId.get(c.tradition)! : null,
          packageId: pkgId.get(c.pkg)!,
          title: c.title,
          summary: PLACEHOLDER,
          bodyMd: `${PLACEHOLDER} Replace with curated, source-cited content.`,
          body: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: PLACEHOLDER }] }],
          },
          localTerms: c.localTerms ?? [],
          compares: c.compares ?? [],
          provenanceKind: "unverified" as const,
          verificationState: c.state ?? ("under_review" as const),
          isDemo: true,
        })),
      )
      .returning({ id: concepts.id, key: concepts.key });
    const conceptId = new Map(conceptRows.map((r) => [r.key, r.id]));
    const pkgOfConcept = new Map(cSpecs.map((c) => [c.key, c.pkg]));

    const claimRows = await tx
      .insert(conceptClaims)
      .values(
        conceptRows.map((c) => ({
          conceptId: c.id,
          position: 0,
          text: "Demo: placeholder statement used to exercise claim and citation display.",
          isDemo: true,
        })),
      )
      .returning({ id: conceptClaims.id, conceptId: conceptClaims.conceptId });
    const keyOfConcept = new Map(conceptRows.map((r) => [r.id, r.key]));
    await tx.insert(conceptClaimSources).values(
      claimRows.map((cl) => ({
        claimId: cl.id,
        sourceId: srcFor(pkgOfConcept.get(keyOfConcept.get(cl.conceptId)!)!),
        locator: "demo",
        isDemo: true,
      })),
    );

    // --- relationships ------------------------------------------------------------------
    const relRows = await tx
      .insert(relationships)
      .values(
        rSpecs.map((r) => ({
          sourceConceptId: conceptId.get(r.source)!,
          targetConceptId: conceptId.get(r.target)!,
          typeCode: r.type,
          packageId: pkgId.get(r.pkg)!,
          explanation: `Demo: placeholder ${r.type} link for testing.`,
          ordinal: r.ordinal ?? null,
          provenanceKind: "unverified" as const,
          verificationState: "under_review" as const,
          isDemo: true,
        })),
      )
      .returning({ id: relationships.id, packageId: relationships.packageId });
    await tx.insert(relationshipSources).values(
      relRows.map((r) => ({ relationshipId: r.id, sourceId: sourceByPkg.get(r.packageId!)!, locator: "demo", isDemo: true })),
    );

    // --- snapshot (published, demo, includes unverified) --------------------------------
    const bundle = await buildBundleFromDb(tx, DEMO_SNAPSHOT_LABEL);
    const [snap] = await tx
      .insert(contentSnapshots)
      .values({
        versionLabel: DEMO_SNAPSHOT_LABEL,
        title: "Demo: Snapshot v1 (all demo traditions)",
        description: "Demo bundle for development. Contains only unverified placeholder content.",
        payload: bundle,
        includesUnverified: true,
        isDemo: true,
      })
      .returning({ id: contentSnapshots.id });
    await tx.insert(snapshotItems).values(snapshotItemsFor(snap!.id, bundle, true));
    await tx
      .update(contentSnapshots)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(contentSnapshots.id, snap!.id));

    // --- assessment battery skeleton ----------------------------------------------------
    const battery = [
      { code: "demo-pretest", kind: "pretest", title: "Demo: Prior-knowledge test" },
      { code: "demo-reconstruction", kind: "reconstruction", title: "Demo: Relational knowledge reconstruction" },
      { code: "demo-posttest", kind: "posttest", title: "Demo: Post-test" },
      { code: "demo-transfer", kind: "transfer", title: "Demo: Transfer task" },
      { code: "demo-questionnaire", kind: "questionnaire", title: "Demo: Experience questionnaire (placeholder, not a validated instrument)" },
    ] as const;
    const aRows = await tx
      .insert(assessments)
      .values(battery.map((a) => ({ ...a, version: 1, description: PLACEHOLDER, isDemo: true })))
      .returning({ id: assessments.id, code: assessments.code });
    const aId = new Map(aRows.map((a) => [a.code, a.id]));

    const reconstructionKeys = [1, 2, 3, 4].map((i) => `demo-a.process_stage.stage-${i}`).concat(["demo-a.material.material-1", "demo-a.outcome.outcome-1"]);
    const choice = (id: string) => ({ id, label: `Demo option ${id.toUpperCase()}` });
    const items = [
      { a: "demo-pretest", itemKey: "pre.q1", kind: "single_choice", prompt: "Demo: placeholder multiple-choice item. Replace with a researcher-authored item.", config: { kind: "single_choice", options: [choice("a"), choice("b"), choice("c")] } },
      { a: "demo-pretest", itemKey: "pre.q2", kind: "short_text", prompt: "Demo: placeholder short-answer item.", config: { kind: "short_text" } },
      { a: "demo-reconstruction", itemKey: "map", kind: "concept_map", prompt: "Demo: arrange and link the concepts you learned about.", config: { kind: "concept_map", conceptKeys: reconstructionKeys, relationshipTypes: ["PRECEDES", "USES", "PRODUCES"], directed: true } },
      { a: "demo-posttest", itemKey: "post.q1", kind: "single_choice", prompt: "Demo: placeholder post-test item.", config: { kind: "single_choice", options: [choice("a"), choice("b")] } },
      { a: "demo-transfer", itemKey: "transfer.q1", kind: "long_text", prompt: "Demo: placeholder transfer prompt.", config: { kind: "long_text" } },
      { a: "demo-questionnaire", itemKey: "ux.q1", kind: "likert", prompt: "Demo: placeholder rating item.", config: { kind: "likert", points: 5, anchors: { "1": "Demo low", "5": "Demo high" } } },
    ] as const;
    await tx.insert(assessmentItems).values(
      items.map((it, i) => ({
        assessmentId: aId.get(it.a)!,
        itemKey: it.itemKey,
        position: i,
        kind: it.kind,
        prompt: it.prompt,
        config: itemConfigSchema.parse(it.config),
      })),
    );

    // Draft demo reference map for the reconstruction item (the A process chain).
    const [refMap] = await tx
      .insert(referenceMaps)
      .values({
        assessmentId: aId.get("demo-reconstruction")!,
        snapshotId: snap!.id,
        version: 1,
        title: "Demo: Reference map for tradition A",
        description: PLACEHOLDER,
        nodes: reconstructionKeys.map((k) => ({ conceptId: conceptId.get(k)!, label: k })),
        isDemo: true,
      })
      .returning({ id: referenceMaps.id });
    await tx.insert(referenceMapEdges).values(
      [1, 2, 3].map((i) => ({
        referenceMapId: refMap!.id,
        sourceConceptId: conceptId.get(`demo-a.process_stage.stage-${i}`)!,
        targetConceptId: conceptId.get(`demo-a.process_stage.stage-${i + 1}`)!,
        relationshipTypeCode: "PRECEDES",
        required: true,
      })),
    );

    // --- demo study (draft; activate after a spatial manifest exists) ------------------
    const [study] = await tx
      .insert(studies)
      .values({
        slug: DEMO_STUDY_SLUG,
        title: "Demo: Study skeleton (2D vs 3D)",
        description: "Demo study for development. Never used for data collection.",
        protocolVersion: "demo-0.1",
        snapshotId: snap!.id,
        design: "between",
        config: studyConfigSchema.parse({ traditionSlugs: TRADITIONS.map(tSlug) }),
        allowUnverifiedContent: true,
        isDemo: true,
      })
      .returning({ id: studies.id });
    await tx.insert(studyConditions).values([
      { studyId: study!.id, code: "conventional", label: "Demo: Conventional 2D", interface: "conventional_2d", position: 0 },
      { studyId: study!.id, code: "immersive", label: "Demo: Immersive 3D", interface: "immersive_3d", position: 1 },
    ]);
    await tx.insert(studyAssessments).values([
      { studyId: study!.id, assessmentId: aId.get("demo-pretest")!, phase: "pre", position: 0 },
      { studyId: study!.id, assessmentId: aId.get("demo-reconstruction")!, phase: "pre", position: 1 },
      { studyId: study!.id, assessmentId: aId.get("demo-posttest")!, phase: "post", position: 0 },
      { studyId: study!.id, assessmentId: aId.get("demo-reconstruction")!, phase: "post", position: 1 },
      { studyId: study!.id, assessmentId: aId.get("demo-transfer")!, phase: "post", position: 2 },
      { studyId: study!.id, assessmentId: aId.get("demo-questionnaire")!, phase: "post", position: 3 },
    ]);
  });
}

type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

/**
 * Builds a knowledge bundle (contract v1) from the demo rows currently in the database and
 * validates it. A real snapshot builder (CMS) follows the same shape for selected traditions.
 */
export async function buildBundleFromDb(tx: Tx, versionLabel: string): Promise<KnowledgeBundle> {
  // Sequential on purpose: one transaction = one connection (pg 9 drops query pipelining).
  const cats = await tx.select().from(knowledgeCategories);
  const types = await tx.select().from(relationshipTypes);
  const trads = await tx.select().from(traditions).where(eq(traditions.isDemo, true));
  const srcs = await tx.select().from(sources).where(eq(sources.isDemo, true));
  const cons = await tx.select().from(concepts).where(eq(concepts.isDemo, true));
  const claims = await tx.select().from(conceptClaims).where(eq(conceptClaims.isDemo, true));
  const claimSrcs = await tx.select().from(conceptClaimSources).where(eq(conceptClaimSources.isDemo, true));
  const rels = await tx.select().from(relationships).where(eq(relationships.isDemo, true));
  const relSrcs = await tx.select().from(relationshipSources).where(eq(relationshipSources.isDemo, true));
  const tradSrcs = await tx.select().from(traditionSources).where(eq(traditionSources.isDemo, true));
  const keyById = new Map(cons.map((c) => [c.id, c.key]));
  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  const bundle: KnowledgeBundle = {
    schemaVersion: 1,
    versionLabel,
    isDemo: true,
    includesUnverified: true,
    generatedAt: new Date().toISOString(),
    categories: cats.sort(byPosition).map((c) => ({ code: c.code as KnowledgeBundle["categories"][number]["code"], label: c.label, templateGroup: c.templateGroup, position: c.position })),
    relationshipTypes: types
      .sort((a, b) => byString(a.code, b.code))
      .map((t) => ({ code: t.code, label: t.label, inverseLabel: t.inverseLabel, semantics: t.semantics, directed: t.directed, ordered: t.ordered, allowsCycles: t.allowsCycles })),
    traditions: trads
      .sort((a, b) => byString(a.slug, b.slug))
      .map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        altNames: t.altNames,
        summary: t.summary,
        region: { place: t.regionPlace, district: t.regionDistrict, state: t.regionState, country: t.regionCountry, lat: t.latitude, lon: t.longitude },
        gi:
          t.giRegistered === null
            ? null
            : { registered: t.giRegistered, applicationNo: t.giApplicationNo, year: t.giYear, sourceIds: tradSrcs.filter((s) => s.traditionId === t.id && s.purpose === "gi").map((s) => s.sourceId) },
        verificationState: t.verificationState,
      })),
    sources: srcs
      .sort((a, b) => byString(a.id, b.id))
      .map((s) => ({ id: s.id, kind: s.kind, title: s.title, author: s.author, publisher: s.publisher, year: s.year, url: s.url, accessedOn: s.accessedOn, reliability: s.reliability, verificationState: s.verificationState })),
    concepts: cons
      .sort((a, b) => byString(a.key, b.key))
      .map((c) => ({
        id: c.id,
        key: c.key,
        slug: c.slug,
        type: c.type,
        category: c.categoryCode as KnowledgeBundle["concepts"][number]["category"],
        traditionId: c.traditionId,
        title: c.title,
        summary: c.summary,
        body: (c.body as KnowledgeBundle["concepts"][number]["body"]) ?? null,
        bodyMd: c.bodyMd,
        localTerms: c.localTerms,
        compares: c.compares,
        provenanceKind: c.provenanceKind,
        verificationState: c.verificationState,
        claims: claims
          .filter((cl) => cl.conceptId === c.id)
          .sort(byPosition)
          .map((cl) => ({
            id: cl.id,
            text: cl.text,
            quote: cl.quote,
            sources: claimSrcs.filter((s) => s.claimId === cl.id).map((s) => ({ sourceId: s.sourceId, locator: s.locator })),
          })),
        assetIds: [],
      })),
    relationships: rels
      .sort((a, b) => byString(a.id, b.id))
      .map((r) => ({
        id: r.id,
        source: keyById.get(r.sourceConceptId)!,
        target: keyById.get(r.targetConceptId)!,
        type: r.typeCode,
        explanation: r.explanation,
        conditions: r.conditions,
        strength: r.strength,
        ordinal: r.ordinal,
        provenanceKind: r.provenanceKind,
        verificationState: r.verificationState,
        sources: relSrcs.filter((s) => s.relationshipId === r.id).map((s) => ({ sourceId: s.sourceId, quote: s.quote, locator: s.locator })),
      })),
  };
  return knowledgeBundleSchema.parse(bundle);
}

/**
 * snapshot_items rows for every entity of a bundle. `itemSha256` here is provisional: on
 * publication the database replaces it with the sha256 of the entity's payload slice
 * (migration 0005, ie_check_snapshot_for_publish), so the stored hash always matches the payload.
 */
export function snapshotItemsFor(snapshotId: string, b: KnowledgeBundle, isDemo: boolean) {
  const row = (itemKind: (typeof snapshotItems.$inferInsert)["itemKind"], entityRef: string, entityKey: string | null, value: unknown) => ({
    snapshotId,
    itemKind,
    entityRef,
    entityKey,
    itemSha256: itemSha256(value),
    isDemo,
  });
  return [
    ...b.categories.map((c) => row("category", c.code, c.code, c)),
    ...b.relationshipTypes.map((t) => row("relationship_type", t.code, t.code, t)),
    ...b.traditions.map((t) => row("tradition", t.id, t.slug, t)),
    ...b.sources.map((s) => row("source", s.id, null, s)),
    ...b.concepts.map((c) => row("concept", c.id, c.key, c)),
    ...b.concepts.flatMap((c) => c.claims.map((cl) => row("claim", cl.id, c.key, cl))),
    ...b.relationships.map((r) => row("relationship", r.id, `${r.source}|${r.type}|${r.target}`, r)),
  ];
}
