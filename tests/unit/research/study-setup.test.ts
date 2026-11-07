import { describe, expect, it } from "vitest";

import { studyConfigSchema } from "@/features/study/contracts";
import { staleMetricsAdvice } from "@/features/research/stale-metrics";
import { runParityChecks } from "@/server/research/parity/engine";
import { consentFromForm, exposureFromForm, questionnaireInstruments, questionnairesFromForm } from "@/server/research/study-form";
import { consentChangeIssue, DEFAULT_QUESTIONNAIRES, DEFAULT_STEPS, instrumentsFor, NEW_STUDY_CONFIG, parseStudyProtocol, protocolIssues } from "@/server/study/config";

import { passingInput } from "./fixtures";

function form(fields: Record<string, string>): FormData {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.set(k, v);
  return d;
}

describe("consent authoring in the research console", () => {
  it("reads the information sheet and the versioned consent text, with Windows line ends made plain", () => {
    const r = consentFromForm(form({ consentVersion: " 1.0 ", consentText: "I agree.\r\nI may stop at any time.", participantInformation: "About the study.\r\n" }));
    expect(r).toEqual({ ok: true, consent: { version: "1.0", text: "I agree.\nI may stop at any time." }, participantInformation: "About the study." });
    expect(studyConfigSchema.parse({ consent: r.ok ? r.consent : undefined }).consent).toEqual({ version: "1.0", text: "I agree.\nI may stop at any time." });
  });

  it("refuses a version without text and text without a version", () => {
    expect(consentFromForm(form({ consentVersion: "1.0", consentText: " " }))).toMatchObject({ ok: false });
    expect(consentFromForm(form({ consentVersion: "", consentText: "I agree." }))).toMatchObject({ ok: false });
    expect(consentFromForm(form({}))).toEqual({ ok: true, consent: undefined, participantInformation: undefined });
  });

  it("asks for a new consent version when the consent text or the information sheet changes", () => {
    const before = { consent: { version: "1.0", text: "I agree." }, participantInformation: "Sheet." };
    expect(consentChangeIssue(before, before)).toBeNull();
    expect(consentChangeIssue(before, { ...before, consent: { version: "1.0", text: "I agree to all." } })).toMatch(/consent text changed/);
    expect(consentChangeIssue(before, { ...before, participantInformation: "New sheet." })).toMatch(/information sheet changed/);
    expect(consentChangeIssue(before, { consent: { version: "1.1", text: "I agree to all." }, participantInformation: "New sheet." })).toBeNull();
    expect(consentChangeIssue(null, before)).toBeNull();
    expect(consentChangeIssue({}, before)).toBeNull();
  });

  it("makes a console-created study fail parity until both texts are set, and pass once they are", () => {
    const input = passingInput();
    const config = input.study.config as Record<string, unknown>;
    delete config.consent;
    delete config.participantInformation;
    expect(runParityChecks(input).passed).toBe(false);
    const r = consentFromForm(form({ consentVersion: "1.0", consentText: "I agree.", participantInformation: "About the study." }));
    if (!r.ok) throw new Error(r.error);
    Object.assign(config, { consent: r.consent, participantInformation: r.participantInformation });
    expect(runParityChecks(input).passed).toBe(true);
  });
});

describe("pacing in the research console", () => {
  it("always writes self-paced learning with a cap, early finish after every stage, whatever the form posts", () => {
    const e = exposureFromForm({ mode: "fixed_time", minutes: 20, allowEarlyFinish: false, requireEveryStage: false }, form({ exposureMode: "fixed_time", exposureMinutes: "25", allowEarlyFinish: "" }));
    expect(e).toEqual({ mode: "self_paced", minutes: 25, allowEarlyFinish: true, requireEveryStage: true });
    const input = passingInput();
    (input.study.config as Record<string, unknown>).exposure = e;
    expect(runParityChecks(input).checks.find((c) => c.id === "e.exposure")!.passed).toBe(true);
  });
});

describe("questionnaire instruments in the research console", () => {
  const assessments = [
    { code: "background", version: 1, kind: "questionnaire", title: "Background" },
    { code: "cognitive-load", version: 1, kind: "questionnaire", title: "Cognitive load" },
    { code: "cognitive-load", version: 2, kind: "questionnaire", title: "Cognitive load" },
    { code: "umux-lite", version: 2, kind: "questionnaire", title: "UMUX-LITE" },
    { code: "test-pre", version: 1, kind: "pretest", title: "Pre-test" },
  ];

  it("lists every questionnaire instrument with where the study gives it", () => {
    const rows = questionnaireInstruments(assessments, DEFAULT_QUESTIONNAIRES);
    expect(rows.map((r) => r.code)).toEqual(["background", "common-questions", "mps-physical-presence", "ssq", "sus", "cognitive-load", "umux-lite"]);
    expect(rows.find((r) => r.code === "mps-physical-presence")).toMatchObject({ slot: "postLearning", audience: "immersive", order: 2 });
    expect(rows.find((r) => r.code === "cognitive-load")).toMatchObject({ slot: null, versions: [2, 1] });
  });

  it("lets a researcher add the cognitive-load scale after learning and UMUX-LITE at the end", () => {
    const d = form({
      questionnaireCodes: "background,common-questions,mps-physical-presence,cognitive-load,umux-lite,sus",
      "questionnaireStep:background": "pre",
      "questionnaireStep:common-questions": "postLearning",
      "questionnaireOrder:common-questions": "1",
      "questionnaireStep:cognitive-load": "postLearning",
      "questionnaireOrder:cognitive-load": "2",
      "questionnaireVersion:cognitive-load": "2",
      "questionnaireStep:mps-physical-presence": "postLearning",
      "questionnaireOrder:mps-physical-presence": "3",
      "questionnaireFor:mps-physical-presence": "immersive",
      "questionnaireStep:umux-lite": "end",
      "questionnaireStep:sus": "",
    });
    const q = questionnairesFromForm(d)!;
    expect(q).toEqual({
      pre: ["background"],
      postLearning: ["common-questions", { code: "cognitive-load", version: 2 }, { code: "mps-physical-presence", conditions: ["immersive"] }],
      end: ["umux-lite"],
    });
    const protocol = parseStudyProtocol({ ...NEW_STUDY_CONFIG, questionnaires: q });
    expect(instrumentsFor(protocol, "questionnaire_post_learning", "2d")).toEqual([{ code: "common-questions" }, { code: "cognitive-load", version: 2 }]);
    expect(instrumentsFor(protocol, "questionnaire_end", "immersive")).toEqual([{ code: "umux-lite" }]);
  });

  it("keeps the stored questionnaires when the form carries none", () => {
    expect(questionnairesFromForm(form({ title: "x" }))).toBeNull();
  });

  it("refuses an instrument before allocation that is limited to one condition", () => {
    const cfg = studyConfigSchema.parse({ ...NEW_STUDY_CONFIG, questionnaires: { pre: [{ code: "background", conditions: ["immersive"] }], postLearning: [], end: [] } });
    expect(protocolIssues(cfg, cfg.steps ?? DEFAULT_STEPS)).toContain("questionnaires.pre: background is given before allocation, so it cannot be limited to one condition");
  });
});

describe("stale metrics advice on the exports page", () => {
  it("sends only roles that can recompute to the Recompute button", () => {
    expect(staleMetricsAdvice(2, true)).toBe("2 sessions have missing or stale derived metrics. Recompute them on the Analytics page first, or the re-import check will report them.");
    expect(staleMetricsAdvice(1, false)).toMatch(/^1 session has missing or stale derived metrics\. Your role cannot recompute them: ask a researcher or the principal investigator/);
  });
});
