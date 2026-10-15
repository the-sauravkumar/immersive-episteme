/**
 * Arabic-script runs inside Latin text (DESIGN.md 5.1, section 15 "the Sindhi/Persian quote renders
 * right-to-left with lang and dir"). Local terms are romanised, but a few verbatim quotes carry the
 * original spelling, e.g. "The word Ajrak ( Sindhi : اجرڪ ) derives from the Persian word ajar
 * ( Persian : اجر )". Each Arabic-script run is returned separately so the renderer can wrap it in
 * `<span lang dir="rtl">`; the text itself is never changed (P5 compares it byte for byte).
 *
 * The language is the one the text declares just before the run ("Sindhi :", "Persian :",
 * "Arabic :", "Urdu :"); a run with no declaration takes "sd", the DESIGN.md 5.1 default for this
 * dataset. Pure and deterministic, so both conditions render the same spans.
 */

const LETTER = "\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF";
/** One or more Arabic-script words, with the spaces between them. */
const RUN = new RegExp(`[${LETTER}]+(?:\\s+[${LETTER}]+)*`, "g");
const DECLARED = /\b(Sindhi|Persian|Farsi|Arabic|Urdu)\s*:\s*$/i;
const LANG: Record<string, string> = { sindhi: "sd", persian: "fa", farsi: "fa", arabic: "ar", urdu: "ur" };

export type ScriptRun = { text: string; rtl: false } | { text: string; rtl: true; lang: string };

export function scriptRuns(text: string): ScriptRun[] {
  const out: ScriptRun[] = [];
  let last = 0;
  for (const m of text.matchAll(RUN)) {
    const at = m.index;
    if (at > last) out.push({ text: text.slice(last, at), rtl: false });
    const declared = DECLARED.exec(text.slice(Math.max(0, at - 24), at));
    out.push({ text: m[0], rtl: true, lang: declared ? LANG[declared[1]!.toLowerCase()]! : "sd" });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), rtl: false });
  return out;
}
