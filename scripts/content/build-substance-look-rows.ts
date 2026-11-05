import { readFileSync, writeFileSync } from "node:fs";

interface SheetRow {
  readonly key: string;
  readonly stages: readonly string[];
  readonly label: string;
  readonly partOfTemplateLabel?: string | null;
  readonly form: string;
  readonly renderHex: string;
  readonly renderBasis: string;
  readonly status: string;
  readonly transparency: string;
  readonly surface: string;
  readonly vesselSuggestion: string | null;
  readonly frothHex?: string | null;
  readonly spread?: readonly { readonly hex: string; readonly share: number }[];
}

export const LOOK_ROWS_FILE = "src/features/process/domain/substance-look-rows.ts";

export function lookRowsSource(rows: readonly SheetRow[]): string {
  const compact = rows.map((row) => ({
    key: row.key,
    stages: row.stages,
    label: row.label,
    partOfTemplateLabel: row.partOfTemplateLabel ?? null,
    form: row.form,
    renderHex: row.renderHex,
    renderBasis: row.renderBasis,
    status: row.status,
    transparency: row.transparency,
    surface: row.surface,
    vesselSuggestion: row.vesselSuggestion,
    frothHex: row.frothHex ?? null,
    spread: (row.spread ?? []).map(({ hex, share }) => ({ hex, share })),
  }));
  return `import type { SubstanceLookRow } from "./substance-look";\n\nexport const SUBSTANCE_LOOK_ROWS: readonly SubstanceLookRow[] = ${JSON.stringify(compact, null, 2)};\n`;
}

function main(): void {
  const rows = JSON.parse(readFileSync("docs/research/substance-looks.json", "utf8")) as SheetRow[];
  writeFileSync(LOOK_ROWS_FILE, lookRowsSource(rows));
  console.log(`${rows.length} look rows written to ${LOOK_ROWS_FILE}`);
}

if (process.argv[1]?.endsWith("build-substance-look-rows.ts")) main();
