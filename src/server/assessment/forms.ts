import type { RubricLevel } from "./definitions";

type Fail = { ok: false; error: string };

const text = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const num = (fd: FormData, k: string): number | undefined => {
  const v = text(fd, k);
  return v === "" ? undefined : Number(v);
};
const lines = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

function pairs(s: string): Array<[string, string]> | null {
  const out: Array<[string, string]> = [];
  for (const l of lines(s)) {
    const i = l.indexOf(":");
    if (i <= 0) return null;
    out.push([l.slice(0, i).trim(), l.slice(i + 1).trim()]);
  }
  return out;
}

function testItemFields(fd: FormData): { ok: true; fields: Record<string, unknown> } | Fail {
  const path = text(fd, "imagePath");
  const alt = text(fd, "imageAlt");
  if (path && !alt) return { ok: false, error: "Describe the image in its alt text." };
  if (alt && !path) return { ok: false, error: "Give the image path, or clear the alt text." };
  const account = text(fd, "account").replace(/\r\n?/g, "\n");
  const tradition = text(fd, "targetTradition");
  const stageKey = text(fd, "targetStage");
  const objectKey = text(fd, "targetObject");
  if ((stageKey || objectKey) && !tradition) return { ok: false, error: "Name the tradition the item targets before its stage or object." };
  return {
    ok: true,
    fields: {
      ...(path ? { image: { path, alt } } : {}),
      ...(account ? { account } : {}),
      sampleText: fd.get("sampleText") === "on",
      ...(tradition ? { target: { tradition, ...(stageKey ? { stageKey } : {}), ...(objectKey ? { objectKey } : {}) } } : {}),
    },
  };
}

const idList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export type ItemFormResult =
  | { ok: true; item: { id?: string; itemKey: string; position: number; kind: string; prompt: string; config: Record<string, unknown>; answerKey?: unknown } }
  | Fail;

export function itemFromForm(fd: FormData): ItemFormResult {
  const kind = text(fd, "kind");
  const base = {
    ...(text(fd, "id") ? { id: text(fd, "id") } : {}),
    itemKey: text(fd, "itemKey"),
    position: Number(text(fd, "position") || "0"),
    kind,
    prompt: text(fd, "prompt"),
  };
  let config: Record<string, unknown>;
  let answerKey: unknown;
  switch (kind) {
    case "single_choice":
    case "multiple_choice":
    case "ranking":
    case "matching": {
      const opts = pairs(text(fd, "options"));
      if (!opts) return { ok: false, error: "Write one option per line as 'id: label'." };
      config = { kind, options: opts.map(([id, label]) => ({ id, label })) };
      if (kind !== "ranking") config.shuffle = fd.get("shuffle") === "on";
      if (kind === "multiple_choice" && num(fd, "maxSelections") !== undefined) config.maxSelections = num(fd, "maxSelections");
      if (kind !== "multiple_choice") {
        const extra = testItemFields(fd);
        if (!extra.ok) return extra;
        Object.assign(config, extra.fields);
      }
      const key = text(fd, "answerKey");
      if (key && kind === "single_choice") answerKey = { optionId: key };
      if (key && kind === "multiple_choice") answerKey = { optionIds: idList(key) };
      if (key && kind === "ranking") answerKey = { order: idList(key) };
      if (kind === "matching") {
        const images = matchingImages(text(fd, "pairs"));
        if (!images) return { ok: false, error: "Write one image per line as 'id | /path/to/image.jpg | alt text'." };
        config.pairs = images;
        const matches = pairs(text(fd, "matches"));
        if (!matches) return { ok: false, error: "Write one answer per line as 'image id: option id'." };
        if (matches.length) answerKey = { matches: Object.fromEntries(matches) };
      }
      break;
    }
    case "sketch":
      config = { kind };
      for (const k of ["maxStrokes", "maxBytes"] as const) if (num(fd, k) !== undefined) config[k] = num(fd, k);
      break;
    case "short_text":
    case "long_text":
      config = { kind, ...(num(fd, "maxLength") !== undefined ? { maxLength: num(fd, "maxLength") } : {}) };
      break;
    case "likert": {
      const anchors = pairs(text(fd, "anchors"));
      if (!anchors) return { ok: false, error: "Write one anchor per line as 'point: label'." };
      config = { kind, points: num(fd, "points"), anchors: Object.fromEntries(anchors) };
      break;
    }
    case "numeric": {
      config = { kind };
      for (const k of ["min", "max", "step"] as const) if (num(fd, k) !== undefined) config[k] = num(fd, k);
      const value = num(fd, "answerValue");
      if (value !== undefined) answerKey = { value, tolerance: num(fd, "answerTolerance") ?? 0 };
      break;
    }
    case "concept_map":
      config = {
        kind,
        conceptKeys: lines(text(fd, "conceptKeys")),
        relationshipTypes: fd.getAll("relationshipTypes").filter((x): x is string => typeof x === "string"),
        directed: fd.get("directed") === "on",
        allowFreeNodes: false,
      };
      break;
    default:
      return { ok: false, error: "Choose an item kind." };
  }
  return { ok: true, item: { ...base, config, ...(answerKey !== undefined ? { answerKey } : {}) } };
}

function matchingImages(s: string): Array<{ id: string; image: { path: string; alt: string } }> | null {
  const out: Array<{ id: string; image: { path: string; alt: string } }> = [];
  for (const l of lines(s)) {
    const [id, path, ...alt] = l.split("|").map((p) => p.trim());
    if (!id || !path || alt.join(" | ").trim() === "") return null;
    out.push({ id, image: { path, alt: alt.join(" | ") } });
  }
  return out;
}

export function rubricLevelsFromText(s: string): { ok: true; levels: RubricLevel[] } | Fail {
  const levels: RubricLevel[] = [];
  for (const l of lines(s)) {
    const parts = l.split("|").map((p) => p.trim());
    const value = Number(parts[0]);
    if (parts.length < 3 || parts[0] === "" || !Number.isFinite(value) || !parts[1] || !parts[2]) {
      return { ok: false, error: "Write one level per line as 'value | label | descriptor'." };
    }
    levels.push({ value, label: parts[1], descriptor: parts.slice(2).join(" | ") });
  }
  return { ok: true, levels };
}
