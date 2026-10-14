/**
 * Title normalisation and trigram similarity, modelled on PostgreSQL pg_trgm (the database
 * indexes concept titles with gin_trgm_ops): each word is padded with two leading spaces and
 * one trailing space, and similarity is |A ∩ B| / |A ∪ B| over the trigram sets.
 */

/** Lower-case, strip diacritics and punctuation, collapse whitespace. */
export function normaliseTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function trigrams(text: string): Set<string> {
  const out = new Set<string>();
  const normalised = normaliseTitle(text);
  if (!normalised) return out;
  for (const word of normalised.split(" ")) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return normaliseTitle(a) === normaliseTitle(b) ? 1 : 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const union = ta.size + tb.size - shared;
  return union === 0 ? 0 : shared / union;
}
