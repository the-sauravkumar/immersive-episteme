/**
 * "1 session" / "4 sessions": a count with its noun in the right number, so console copy never
 * reads "session(s)". English only; pass the plural when it is not the singular plus "s".
 */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
