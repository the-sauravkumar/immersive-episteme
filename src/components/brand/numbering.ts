function assertOrdinal(n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`A label number must be a positive integer, got ${n}`);
  return n;
}

export function claimNumber(index: number): string {
  return String(assertOrdinal(index + 1));
}

export function figureLabel(n: number): string {
  return `Fig. ${assertOrdinal(n)}`;
}

export function plateLabel(n: number): string {
  return `Plate ${assertOrdinal(n)}`;
}

export function chartFigureLabel(n: number): string {
  return `Figure ${assertOrdinal(n)}`;
}

export function tableLabel(n: number): string {
  return `Table ${assertOrdinal(n)}`;
}

export function countOf(noun: string, current: number, total: number): string {
  return `${noun} ${assertOrdinal(current)} of ${assertOrdinal(total)}`;
}
