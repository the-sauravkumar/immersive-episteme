/**
 * Numbering (DESIGN.md 7.6). One place for every numbered label, so the wording never drifts:
 *
 *  - claims are numbered per concept: 1, 2, 3 ...;
 *  - knowledge figures: "Fig. n" per concept view (study, both conditions);
 *  - public photographs: "Plate n";
 *  - dashboard and public charts and diagrams: "Figure n";
 *  - tables: "Table n".
 *
 * Numbers are 1-based and set in lining tabular figures by the components that print them
 * (`tabular-nums`, see NUMERAL_CLASS).
 */

/** Tailwind classes for every number a reader compares (DESIGN.md 5.2 numeral policy). */
export const NUMERAL_CLASS = "tabular-nums lining-nums";

function assertOrdinal(n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`A label number must be a positive integer, got ${n}`);
  return n;
}

/** Claim number in the hang, from a zero-based index. */
export function claimNumber(index: number): string {
  return String(assertOrdinal(index + 1));
}

/** "Fig. 2" (knowledge figures). */
export function figureLabel(n: number): string {
  return `Fig. ${assertOrdinal(n)}`;
}

/** "Plate 1" (public photographs). */
export function plateLabel(n: number): string {
  return `Plate ${assertOrdinal(n)}`;
}

/** "Figure 3" (dashboard charts, public diagrams such as Figure 1). */
export function chartFigureLabel(n: number): string {
  return `Figure ${assertOrdinal(n)}`;
}

/** "Table 1". */
export function tableLabel(n: number): string {
  return `Table ${assertOrdinal(n)}`;
}

/** "Step 2 of 7", "Question 4 of 20": progress counts in study (always tabular). */
export function countOf(noun: string, current: number, total: number): string {
  return `${noun} ${assertOrdinal(current)} of ${assertOrdinal(total)}`;
}
