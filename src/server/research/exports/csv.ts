/**
 * RFC 4180 CSV (comma, CRLF, double-quote escaping). Objects and arrays are written as JSON
 * text in one cell; null and undefined are empty cells. `parseCsv` reads the same dialect back
 * (used by the export round-trip validation).
 *
 * Spreadsheet formula injection: participants control some cells (telemetry `target` and
 * `roomOrPageId`, free-text answers), and a spreadsheet evaluates a cell that starts with
 * = + - @ TAB or CR even when it is quoted. Such a text cell is written with a leading `'`
 * (OWASP "CSV injection"), so it opens as text. Numbers, and text that is a plain number
 * ("-1.5"), are written unchanged. `parseCsv` does NOT strip the `'` (a stored value that really
 * starts with `'` would become ambiguous); the export data dictionary tells analysts to remove
 * it. The JSON bundle is unaffected.
 */
export type Row = Record<string, unknown>;

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

/** `s` (the text of `v`) with a leading `'` when a spreadsheet would read it as a formula. */
export function neutraliseFormula(s: string, v: unknown = s): string {
  if (typeof v === "number" || typeof v === "bigint") return s;
  return FORMULA_START.test(s) && !PLAIN_NUMBER.test(s) ? `'${s}` : s;
}

function cell(v: unknown): string {
  const s = csvText(v);
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: readonly Row[], columns: readonly string[]): string {
  const lines = [columns.map(cell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i++;
    } else if (ch === ",") {
      record.push(field);
      field = "";
      i++;
    } else if (ch === "\r" && text[i + 1] === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      i += 2;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }
  const [columns = [], ...body] = records;
  return { columns, rows: body.map((r) => Object.fromEntries(columns.map((c, j) => [c, r[j] ?? ""]))) };
}

/** The CSV text a value becomes (before quoting), for round-trip comparison. */
export function csvText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return neutraliseFormula(typeof v === "object" ? JSON.stringify(v) : String(v), v);
}
