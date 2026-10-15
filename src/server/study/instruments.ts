/**
 * Questionnaire instrument definitions (study decision D7, docs/research/study-decisions.md),
 * seeded as draft `questionnaire` assessments with their items.
 *
 * Rules (docs/research/citation-policy.md; MP:593 "Do not invent a supposedly validated
 * instrument"):
 *  - An item is seeded WITH wording only when that wording was found verbatim on the stated page
 *    of an archived source (`verify_quotes.py`). Every item stores its source, page, source item
 *    code and ORIGINAL wording in `assessment_items.config.provenance`, and whether the source
 *    is primary or *secondary* (a paper reprinting another paper's instrument).
 *  - Displayed variants are recorded next to the original, never instead of it: D7's neutral
 *    term ("the learning environment" for "the simulation" / "the virtual environment"), and the
 *    SUS "awkward" for "cumbersome" (Brooke 2013, p. 35).
 *  - Response scales come from the sources with their endpoint labels. Where no label is verified
 *    the label is a platform choice and says so (`responseScale.anchorsSource`).
 *  - Any item still PENDING makes the instrument unshowable: the questionnaire page refuses the
 *    whole step and names the reason for the researchers.
 *  - `is_validated_instrument` stays false (rewording and changed formats break the original
 *    validation, D7 risks) and no validation statistics are stored.
 * Version 1 of cognitive-load, sus, ssq and umux-lite had pending wording; version 2 carries the
 * verified wording. Earlier versions are never edited.
 */
import type { Pool, PoolClient } from "pg";

import type { LearningCondition } from "@/lib/permissions/learning";
import { titleCase } from "@/lib/text/title-case";

type Q = Pick<Pool | PoolClient, "query">;

const PETERSEN =
  "Petersen, G. B., Petkakis, G., & Makransky, G. (2022). A study of how immersion and interactivity drive VR learning. Computers & Education, 179, 104429. https://doi.org/10.1016/j.compedu.2021.104429";
const ANDERSEN =
  "Andersen, M. S., & Makransky, G. (2021). The validation and further development of the Multidimensional Cognitive Load Scale for Physical and Online Lectures (MCLS-POL). Frontiers in Psychology, 12, 642084. https://doi.org/10.3389/fpsyg.2021.642084";
const LEPPINK =
  "Leppink, J., Paas, F., Van der Vleuten, C. P. M., Van Gog, T., & Van Merriënboer, J. J. G. (2013). Development of an instrument for measuring different types of cognitive load. Behavior Research Methods, 45(4), 1058–1072";
const SCHREPP = "Schrepp, M., Kollmorgen, J., & Thomaschewski, J. (2023). A comparison of SUS, UMUX-LITE, and UEQ-S. Journal of User Experience, 18(2), 86–104";
const BANGOR = "Bangor, A., Kortum, P., & Miller, J. (2009). Determining what individual SUS scores mean: Adding an adjective rating scale. Journal of Usability Studies, 4(3), 114–123";
const BROOKE13 = "Brooke, J. (2013). SUS: A retrospective. Journal of Usability Studies, 8(2), 29–40";
const KENNEDY =
  "Kennedy, R. S., Lane, N. E., Berbaum, K. S., & Lilienthal, M. G. (1993). Simulator Sickness Questionnaire: An enhanced method for quantifying simulator sickness. The International Journal of Aviation Psychology, 3(3), 203–220. https://doi.org/10.1207/s15327108ijap0303_3";
const EUDAVE = "Eudave, L., & Martínez, M. (2025). To VR or not to VR: Assessing cybersickness in navigational tasks at different levels of immersion. Frontiers in Virtual Reality, 6, 1518735. https://doi.org/10.3389/frvir.2025.1518735";

/** The one neutral term replacing "simulation" / "virtual environment" in both conditions (D7). */
export const NEUTRAL_TERM = "the learning environment";

export function neutralise(original: string): string {
  return original
    .replace(/the simulation/g, NEUTRAL_TERM)
    .replace(/the virtual environment/g, NEUTRAL_TERM)
    .replace(/The virtual environment/g, "The learning environment");
}

/** SUS item 8: "awkward" for "cumbersome" (Brooke 2013, p. 35, PDF p. 7). */
export function awkward(original: string): string {
  return original.replace("cumbersome", "awkward");
}

export type Substitution = "neutral_term" | "awkward" | null;

export interface VerifiedItem {
  key: string;
  /** Item code or number in the source (e.g. ECL_I_1, SUS 8). */
  sourceCode: string;
  original: string;
  source: string;
  locator: string;
  /** A paper reprinting another paper's item (the original is not archived). */
  secondary: boolean;
  substitution: Substitution;
}

export interface PendingItem {
  key: string;
  source: string;
  reason: string;
}

export interface ResponseScale {
  points: number;
  /** First value: 0 or 1. */
  min: 0 | 1;
  anchors: Record<string, string>;
  formatSource: string;
  anchorsSource: string;
  anchorsVerified: boolean;
}

export interface InstrumentDefinition {
  code: string;
  version: number;
  /** Title (Title Case). */
  name: string;
  purpose: "cognitive_load" | "usability" | "presence" | "simulator_sickness";
  decision: string;
  selectionStatus: "adopted" | "backup";
  /** Limited to these conditions whatever the study config says (presence names the virtual environment). */
  conditions?: LearningCondition[];
  /** Shown above the items; `instructionsSource` says where it comes from. */
  instructions: string | null;
  instructionsSource: string | null;
  responseScale: ResponseScale;
  items: VerifiedItem[];
  pending: PendingItem[];
  citation: string;
}

export function displayedText(item: VerifiedItem): string {
  return item.substitution === "neutral_term" ? neutralise(item.original) : item.substitution === "awkward" ? awkward(item.original) : item.original;
}

/**
 * Cognitive load (D7a). Response format: option (a), Leppink's 0–10 for all 14 items, because it
 * is the only one of the two formats with verified endpoint labels (p. 1070, PDF p. 13); the
 * 5-point Likert format of Petersen et al. (p. 15) has none in the archived sources.
 */
const LEPPINK_SCALE: ResponseScale = {
  points: 11,
  min: 0,
  anchors: { "0": "not at all the case", "10": "completely the case" },
  formatSource: `${LEPPINK}, p. 1070 (PDF p. 13): "Please respond to each of the questions on the following scale (0 meaning not at all the case and 10 meaning completely the case)." Applied to all 14 items (D7: one response format). Recorded mismatch: Petersen et al. (2022) measured their items, among them the interaction and environment items, "on a five-point Likert scale" (p. 15, PDF p. 15).`,
  anchorsSource: `${LEPPINK}, p. 1070 (PDF p. 13)`,
  anchorsVerified: true,
};

/** Five points without verified labels (presence): platform labels, recorded as such. */
const FIVE_POINT_PLATFORM: ResponseScale = {
  points: 5,
  min: 1,
  anchors: { "1": "Strongly disagree", "5": "Strongly agree" },
  formatSource: `${PETERSEN}, p. 15 (PDF p. 15): "all items used in this study, except knowledge items, were measured on a five-point Likert scale."`,
  anchorsSource: "Platform choice, not from the source: no verified endpoint labels for this scale exist in the archived sources. Researchers to confirm.",
  anchorsVerified: false,
};

const p14 = "p. 14 (PDF p. 14)";
const ecl = (key: string, sourceCode: string, original: string): VerifiedItem => ({ key, sourceCode, original, source: PETERSEN, locator: p14, secondary: false, substitution: "neutral_term" });
const leppink = (n: number, original: string): VerifiedItem => ({ key: `el-instr.${n}`, sourceCode: `item ${n} (el${n - 3})`, original, source: LEPPINK, locator: "p. 1070 (PDF p. 13)", secondary: false, substitution: null });
const andersen = (n: number, original: string): VerifiedItem => ({ key: `il.${n}`, sourceCode: "IL", original, source: ANDERSEN, locator: "p. 3 (PDF p. 3)", secondary: false, substitution: null });

const SUS_ITEMS = [
  "I think that I would like to use this system frequently.",
  "I found the system unnecessarily complex.",
  "I thought that the system was easy to use.",
  "I think that I would need the support of a technical person to be able to use this system.",
  "I found the various functions in this system were well integrated.",
  "I thought there was too much inconsistency in this system.",
  "I would imagine that most people would learn to use this system very quickly.",
  "I found the system very cumbersome to use.",
  "I felt confident using the system.",
  "I needed to learn a lot of things before I could get going with this system.",
];

const SSQ_SYMPTOMS = [
  "General discomfort",
  "Fatigue",
  "Headache",
  "Eyestrain",
  "Difficulty focusing",
  "Increased salivation",
  "Sweating",
  "Nausea",
  "Difficulty concentrating",
  "Fullness of head",
  "Blurred vision",
  "Dizzy (eyes open)",
  "Dizzy (eyes closed)",
  "Vertigo",
  "Stomach awareness",
  "Burping",
];

export const INSTRUMENT_DEFINITIONS: readonly InstrumentDefinition[] = [
  {
    code: "cognitive-load",
    version: 2,
    name: titleCase("cognitive load scale"),
    purpose: "cognitive_load",
    decision:
      "D7(a): 14 items, Leppink family: 3 intrinsic (MCLS-POL), 3 extraneous from instructions (Leppink et al. 2013 items 4–6), 4 interaction and 4 environment (as printed by Petersen et al. 2022). " +
      "ECL_I_4 is kept: Petersen et al. dropped it in their own analysis (p. 8, PDF p. 8: \"Regarding the extraneous cognitive load interaction scale, the results indicated that the deletion of one item would raise the internal consistency (`ECL_I_4' in Appendix A), so it was omitted\"), D7 does not. " +
      "Response format option (a): Leppink's 0–10 for all items, the only format with verified endpoint labels.",
    selectionStatus: "adopted",
    instructions: "Please respond to each of the questions on the following scale (0 meaning not at all the case and 10 meaning completely the case).",
    instructionsSource: `${LEPPINK}, p. 1070 (PDF p. 13), verbatim`,
    responseScale: LEPPINK_SCALE,
    items: [
      andersen(1, "The topics covered in the activity were very complex."),
      andersen(2, "The activity covered theories that I perceived as very complex."),
      andersen(3, "The activity covered concepts and definitions that I perceived as very complex."),
      leppink(4, "The instructions and/or explanations during the activity were very unclear."),
      leppink(5, "The instructions and/or explanations were, in terms of learning, very ineffective."),
      leppink(6, "The instructions and/or explanations were full of unclear language."),
      ecl("el-int.1", "ECL_I_1", "The interaction technique used in the simulation was very unclear."),
      ecl("el-int.2", "ECL_I_2", "The interaction technique used in the simulation was, in terms of learning, very ineffective."),
      ecl("el-int.3", "ECL_I_3", "The interaction technique used in the simulation made it harder to learn."),
      ecl("el-int.4", "ECL_I_4", "The interaction technique used in the simulation was difficult to master."),
      ecl("el-env.1", "ECL_E_1", "The elements in the virtual environment made the learning very unclear."),
      ecl("el-env.2", "ECL_E_2", "The virtual environment was, in terms of learning, very ineffective."),
      ecl("el-env.3", "ECL_E_3", "The virtual environment was full of irrelevant content."),
      ecl("el-env.4", "ECL_E_4", "It was difficult to find the relevant learning information in the virtual environment."),
    ],
    pending: [],
    citation: `${ANDERSEN}; ${LEPPINK}; ${PETERSEN}`,
  },
  {
    code: "mps-physical-presence",
    version: 1,
    name: titleCase("physical presence scale"),
    purpose: "presence",
    decision: "D7(c): the MPS physical-presence subscale (5 items), 3D group only, analysed within that group. Every item names the virtual environment, so the original wording is shown (no substitution).",
    selectionStatus: "adopted",
    conditions: ["immersive"],
    instructions: null,
    instructionsSource: null,
    responseScale: FIVE_POINT_PLATFORM,
    items: [
      ["p.1", "P_1", "The virtual environment seemed real to me."],
      ["p.2", "P_2", "I had a sense of acting in the virtual environment, rather than operating something from outside."],
      ["p.3", "P_3", "My experience in the virtual environment seemed consistent with my experiences in the real world."],
      ["p.4", "P_4", 'I had a sense of "being there" in the virtual environment.'],
      ["p.5", "P_5", "I was completely captivated by the virtual world."],
    ].map(([key, sourceCode, original]) => ({ key: key!, sourceCode: sourceCode!, original: original!, source: PETERSEN, locator: p14, secondary: true, substitution: null })),
    pending: [],
    citation: `${PETERSEN} (secondary: items from Makransky, Lilleholt & Aaby 2017, not accessible)`,
  },
  {
    code: "sus",
    version: 2,
    name: titleCase("system usability scale"),
    purpose: "usability",
    decision: 'D7(b): SUS, 10 items, 5-point, "awkward" shown in place of "cumbersome" (item 8), the original recorded.',
    selectionStatus: "adopted",
    instructions: null,
    instructionsSource: null,
    responseScale: {
      points: 5,
      min: 1,
      anchors: { "1": "Strongly Disagree", "5": "Strongly Agree" },
      formatSource: `${BANGOR}, p. 115 (PDF p. 2): "The SUS is composed of ten statements, each having a five-point scale that ranges from Strongly Disagree to Strongly Agree."`,
      anchorsSource: `${BANGOR}, p. 115 (PDF p. 2)`,
      anchorsVerified: true,
    },
    items: SUS_ITEMS.map((original, i) => ({
      key: `sus.${i + 1}`,
      sourceCode: `SUS ${i + 1}`,
      original,
      source: `${SCHREPP} (secondary: the original, Brooke 1996, is not archived)`,
      locator: "p. 87 (PDF p. 2)",
      secondary: true,
      substitution: original.includes("cumbersome") ? ("awkward" as const) : null,
    })),
    pending: [],
    citation: `${SCHREPP} (items, secondary); ${BANGOR} (scale labels); ${BROOKE13}, p. 35 (PDF p. 7) ("awkward")`,
  },
  {
    code: "ssq",
    version: 2,
    name: titleCase("simulator sickness questionnaire"),
    purpose: "simulator_sickness",
    decision:
      "D7(d): SSQ before and after learning in both groups, total score only, as a safety screen and covariate. The 16 symptoms are from Kennedy et al. (1993), Table 3, p. 210 (PDF p. 9), primary. " +
      'Severity 0–3: Kennedy et al. p. 212 (PDF p. 11) scores each symptom "(0, 1,2,3)" but labels no point; the endpoint labels are secondary (Eudave & Martínez 2025, p. 5).',
    selectionStatus: "adopted",
    instructions: null,
    instructionsSource: null,
    responseScale: {
      points: 4,
      min: 0,
      anchors: { "0": "not experienced", "3": "severe" },
      formatSource: `${KENNEDY}, p. 212 (PDF p. 11): "each symptom variable score (0, 1,2,3)was multiplied by the appropriate weight"`,
      anchorsSource: `${EUDAVE}, p. 5 (PDF p. 5), secondary: "rate the severity of each symptom on a four-point Likert scale, ranging from 0 (not experienced) to 3 (severe)"`,
      anchorsVerified: true,
    },
    items: SSQ_SYMPTOMS.map((original, i) => ({
      key: `ssq.${i + 1}`,
      sourceCode: original,
      original,
      source: `${KENNEDY} (archived copy: decisions/dl/ssq_kennedy1993)`,
      locator: "p. 210 (PDF p. 9), Table 3",
      secondary: false,
      substitution: null,
    })),
    pending: [],
    citation: `${KENNEDY}; ${EUDAVE} (scale labels, secondary)`,
  },
  {
    code: "umux-lite",
    version: 2,
    name: "UMUX-LITE",
    purpose: "usability",
    decision: "D7: backup if the battery proves too long. Items 2 and 3 of the UMUX as listed by Schrepp et al. (2023), secondary. 7-point format; no verified labels (platform labels, recorded).",
    selectionStatus: "backup",
    instructions: null,
    instructionsSource: null,
    responseScale: {
      points: 7,
      min: 1,
      anchors: { "1": "Strongly disagree", "7": "Strongly agree" },
      formatSource: `${SCHREPP}, p. 88 (PDF p. 3): "Participants can express their disagreement or agreement to these statements on a 7-point response scale."`,
      anchorsSource: "Platform choice, not from the source: no verified endpoint labels for the UMUX-LITE exist in the archived sources. Researchers to confirm.",
      anchorsVerified: false,
    },
    items: [
      ["umux-lite.1", "UMUX 2", "This system's capabilities meet my requirements."],
      ["umux-lite.2", "UMUX 3", "This system is easy to use."],
    ].map(([key, sourceCode, original]) => ({ key: key!, sourceCode: sourceCode!, original: original!, source: `${SCHREPP} (secondary: the original, Lewis 2013, is not archived)`, locator: "p. 88 (PDF p. 3)", secondary: true, substitution: null })),
    pending: [],
    citation: `${SCHREPP} (secondary)`,
  },
];

/** The assessments.config document of a definition. */
export function instrumentConfig(d: InstrumentDefinition): Record<string, unknown> {
  return {
    instrument: {
      name: d.name,
      purpose: d.purpose,
      decision: d.decision,
      selectionStatus: d.selectionStatus,
      conditions: d.conditions ?? null,
      neutralTerm: NEUTRAL_TERM,
      instructionsSource: d.instructionsSource,
      responseScale: d.responseScale,
      pendingItems: d.pending,
    },
  };
}

/**
 * Inserts each definition and its verified items (idempotent on code + version; an existing
 * assessment is never changed, so researcher edits survive). Returns the code@version inserted.
 */
export async function seedInstrumentDefinitions(q: Q): Promise<string[]> {
  const inserted: string[] = [];
  for (const d of INSTRUMENT_DEFINITIONS) {
    const r = await q.query<{ id: string }>(
      `INSERT INTO assessments (code, version, kind, title, description, config, instrument_name, instrument_citation, is_validated_instrument, status, is_demo)
       VALUES ($1, $2, 'questionnaire', $3, $4, $5::jsonb, $6, $7, false, 'draft', false)
       ON CONFLICT (code, version) DO NOTHING RETURNING id`,
      [d.code, d.version, d.name, d.instructions, JSON.stringify(instrumentConfig(d)), d.name, d.citation],
    );
    const id = r.rows[0]?.id;
    if (!id) continue;
    const scale = d.responseScale;
    for (const [i, item] of d.items.entries()) {
      await q.query(
        "INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, config) VALUES ($1, $2, $3, 'likert', $4, $5::jsonb)",
        [
          id,
          item.key,
          i,
          displayedText(item),
          JSON.stringify({
            kind: "likert",
            points: scale.points,
            min: scale.min,
            anchors: scale.anchors,
            provenance: {
              source: item.source,
              locator: item.locator,
              sourceCode: item.sourceCode,
              original: item.original,
              secondary: item.secondary,
              substitution: item.substitution === "neutral_term" ? { kind: "neutral_term", term: NEUTRAL_TERM } : item.substitution === "awkward" ? { kind: "awkward", source: `${BROOKE13}, p. 35 (PDF p. 7)` } : null,
            },
          }),
        ],
      );
    }
    inserted.push(`${d.code}@${d.version}`);
  }
  return inserted;
}

/** Why an assessment cannot be shown (null when it can). Instruments need verified wording for every item. */
export function instrumentBlocker(a: { config: Record<string, unknown>; items: { itemKey: string; config: unknown }[] }): string | null {
  const ins = a.config.instrument as { pendingItems?: { key: string; reason: string }[] } | undefined;
  if (!ins) return null;
  if (ins.pendingItems && ins.pendingItems.length > 0) return `item wording pending verification: ${ins.pendingItems.map((p) => p.key).join(", ")}`;
  const unsourced = a.items.filter((i) => !((i.config as { provenance?: { original?: string } } | null)?.provenance?.original));
  if (unsourced.length > 0) return `items without recorded source wording: ${unsourced.map((i) => i.itemKey).join(", ")}`;
  return null;
}

/** Conditions an instrument is limited to by its definition (null = both). */
export function instrumentConditions(config: Record<string, unknown>): LearningCondition[] | null {
  const c = (config.instrument as { conditions?: LearningCondition[] | null } | undefined)?.conditions;
  return c && c.length > 0 ? c : null;
}
