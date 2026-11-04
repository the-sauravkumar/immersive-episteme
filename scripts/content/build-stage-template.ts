import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildStageTemplate } from "@/features/process/domain/build-template";
import type { ConceptRecord, TraditionRecord } from "@/features/process/domain/knowledge-record";
import type { MergePlan } from "@/features/process/domain/merge-plan";
import type { ProductImage, TraditionKey } from "@/features/process/domain/stage-template";
import { adjacencyErrors, captionErrors, orderErrors, structuralErrors } from "@/features/process/domain/validate-template";
import { titleCase } from "@/lib/text/title-case";

const MODEL_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/printing table/, "printing-table"],
  [/chisel/, "mallet"],
  [/brush/, "spoon"],
  [/paddle|mallet/, "mallet"],
  [/vat/, "dye-vat"],
  [/washing tank/, "wash-tank"],
  [/copper|boiling vessel/, "boiling-vessel"],
  [/tray|pad\b/, "printing-tray"],
  [/block/, "carved-block"],
  [/cloth|fabric|cotton/, "cloth-bale"],
  [/sawdust|dusting/, "powder-bowl"],
  [/dung|root|galls|flowers|additives|indian madder/, "lump-basket"],
  [/paste|gum|resist|starch|syahi|gach|dabu/, "paste-bowl"],
  [/kasim|neerani|indigo|alizarin|milk|yellow|dye bath/, "liquid-pot"],
  [/harde|harda|myrobalan|alum/, "powder-bowl"],
];

function modelIdFor(concept: ConceptRecord): string {
  const title = concept.title.toLowerCase();
  const rule = MODEL_RULES.find(([pattern]) => pattern.test(title));
  if (!rule) throw new Error(`No model rule for ${concept.key}: ${concept.title}`);
  return rule[1];
}

const headingCase = (text: string): string =>
  titleCase(text).replace(/(^|\s|\/)(\p{Ll})/gu, (_match, boundary: string, letter: string) => boundary + letter.toUpperCase());

interface ProductRow {
  readonly file: string;
  readonly product?: { readonly tradition: TraditionKey; readonly id: string; readonly name: string; readonly holder: string; readonly widthPx: number; readonly heightPx: number };
}

function productsFor(tradition: TraditionKey): readonly ProductImage[] {
  const manifest = JSON.parse(readFileSync("public/walkthrough/manifest.images.json", "utf8")) as { rows: readonly ProductRow[] };
  return manifest.rows.flatMap((row) =>
    row.product && row.product.tradition === tradition
      ? [{ id: row.product.id, file: row.file, name: row.product.name, holder: row.product.holder, widthPx: row.product.widthPx, heightPx: row.product.heightPx }]
      : [],
  );
}

function main(): void {
  const plan = JSON.parse(readFileSync("content/study/merge-plan.json", "utf8")) as MergePlan;
  let failed = false;
  for (const entry of plan.traditions) {
    const record = JSON.parse(readFileSync(join("content/traditions", entry.tradition, "tradition.json"), "utf8")) as TraditionRecord;
    const result = buildStageTemplate(record, entry, productsFor(entry.tradition), { headingCase, modelIdFor });
    const errors = [
      ...structuralErrors(result.template),
      ...orderErrors(result.template, record),
      ...adjacencyErrors(result.template, record),
      ...captionErrors(result.template, record),
    ];
    for (const error of errors) console.error(`${entry.tradition}: ${error}`);
    failed ||= errors.length > 0;
    writeFileSync(join("content/study", `${entry.tradition}.template.json`), `${JSON.stringify(result.template, null, 2)}\n`);
    console.log(`${entry.tradition}: ${result.template.stages.length} stages, ${result.template.products.length} products`);
    for (const stage of result.template.stages) console.log(`  ${stage.number} ${stage.kind} | ${stage.name}${stage.localName ? ` (${stage.localName})` : ""} | ${stage.items.length} items | ${stage.caption.text.length} chars`);
    console.log(`  no items: ${result.stagesWithoutItems.join(", ") || "none"}`);
    for (const excluded of result.excludedItems) console.log(`  excluded ${excluded.concept} from ${excluded.stage}: ${excluded.reason}`);
  }
  if (failed) process.exit(1);
}

main();
