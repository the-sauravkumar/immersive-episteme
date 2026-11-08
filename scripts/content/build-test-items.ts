import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { StageTemplate } from "../../src/features/process/domain/stage-template";
import { buildTestBattery, type UnseenStage, type UnseenTradition } from "../../src/features/study/test-items";

const CONTENT = join(process.cwd(), "content");
const OUTPUT = join(process.cwd(), "db", "seeds", "study-test-items.generated.json");
const UNSEEN_TRADITIONS = ["bagru", "dabu"] as const;
const TOOL_TYPES = new Set(["tool", "material"]);

interface TraditionFile {
  name: string;
  concepts: { key: string; type: string; title: string; summary: string; verification_state: string }[];
  relationships: { type: string; source: string; target: string; verification_state: string }[];
}

const isChecked = (entry: { verification_state: string }) => entry.verification_state === "verified";

const readTradition = (key: string): TraditionFile => JSON.parse(readFileSync(join(CONTENT, "traditions", key, "tradition.json"), "utf8")) as TraditionFile;

function unseenFrom(key: string, file: TraditionFile): UnseenTradition {
  const byKey = new Map(file.concepts.map((concept) => [concept.key, concept]));
  const stageConcepts = file.concepts.filter((concept) => concept.type === "process_stage");
  const toolLinks = file.relationships.filter((link) => link.type === "USES" && byKey.get(link.source)?.type === "process_stage" && TOOL_TYPES.has(byKey.get(link.target)?.type ?? ""));
  const stages: UnseenStage[] = stageConcepts.map((concept) => ({
    key: concept.key,
    title: concept.title.replace(/^\d+\.\s*/, ""),
    summary: concept.summary,
    tools: toolLinks.filter((link) => link.source === concept.key).map((link) => byKey.get(link.target)!.title),
  }));
  const stageKeys = new Set(stages.map((stage) => stage.key));
  const precedeLinks = file.relationships.filter((link) => link.type === "PRECEDES" && stageKeys.has(link.source) && stageKeys.has(link.target));
  const checked = [...stageConcepts, ...toolLinks, ...toolLinks.map((link) => byKey.get(link.target)!), ...precedeLinks].every(isChecked);
  return { key, name: file.name, stages, precedes: precedeLinks.map((link) => [link.source, link.target] as const), checked };
}

function main(): void {
  const dir = join(CONTENT, "study");
  const names = readdirSync(dir).filter((name) => name.endsWith(".template.json")).sort();
  if (names.length === 0) throw new Error(`No stage templates in ${dir}`);
  const templates = names.map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as StageTemplate);
  const knownConceptKeys = new Set(templates.flatMap((template) => readTradition(template.tradition).concepts.map((concept) => concept.key)));
  const unseen = UNSEEN_TRADITIONS.map((key) => unseenFrom(key, readTradition(key)));
  const battery = buildTestBattery({ templates, unseen, knownConceptKeys });
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(battery, null, 2)}\n`);
  for (const assessment of battery) process.stdout.write(`${assessment.code} ${assessment.phase} ${assessment.items.length} items\n`);
}

main();
