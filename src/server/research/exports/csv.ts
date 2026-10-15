/**
 * RFC 4180 CSV (comma, CRLF, double-quote escaping). Objects and arrays are written as JSON
 * text in one cell; null and undefined are empty cells. `parseCsv` reads the same dialect back
 * (used by the export round-trip validation).
 */
export type Row = Record<string, unknown>;

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
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

/** The CSV text a value becomes, for round-trip comparison. */
export function csvText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
