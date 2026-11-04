export interface TitleParts {
  readonly prefix: string;
  readonly before: string;
  readonly bracket: string | null;
  readonly after: string;
  readonly name: string;
  readonly localName: string | null;
}

const NUMBER_PREFIX = /^\d+\.\s+/;
const ONE_BRACKET = /^([^()]*)\(([^()]*)\)([^()]*)$/;

const squeeze = (text: string): string => text.replace(/\s+/g, " ").trim();
const isTerm = (text: string, terms: readonly string[]): boolean =>
  terms.some((term) => term.toLowerCase() === text.trim().toLowerCase());

export function splitTitle(title: string, localTerms: readonly string[]): TitleParts {
  const prefix = NUMBER_PREFIX.exec(title)?.[0] ?? "";
  const body = title.slice(prefix.length);
  const match = ONE_BRACKET.exec(body);
  if (!match) return { prefix, before: body, bracket: null, after: "", name: squeeze(body), localName: null };

  const before = match[1]!;
  const bracket = match[2]!;
  const after = match[3]!;
  const parts = { prefix, before, bracket, after };

  if (isTerm(bracket, localTerms)) return { ...parts, name: squeeze(`${before}${after}`), localName: bracket.trim() };
  if (isTerm(before, localTerms) && !bracket.includes(",")) return { ...parts, name: squeeze(`${bracket}${after}`), localName: before.trim() };
  return { ...parts, name: squeeze(`${before}${after}`), localName: null };
}

export function restoreTitle(parts: TitleParts): string {
  if (parts.bracket === null) return `${parts.prefix}${parts.before}`;
  return `${parts.prefix}${parts.before}(${parts.bracket})${parts.after}`;
}

export function isShortFormOf(shortForm: string, name: string): boolean {
  return ` ${name.toLowerCase().replace(/[:,]/g, " ")} `.includes(` ${shortForm.toLowerCase()} `);
}

export function joinShortForms(shortForms: readonly string[]): string {
  const distinct = [...new Set(shortForms)];
  if (distinct.length < 2) return distinct.join("");
  return `${distinct.slice(0, -1).join(", ")} And ${distinct.at(-1)}`;
}
