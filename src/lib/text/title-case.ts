/**
 * Title Case for every heading and title in the interface (project lead: "captialize every first
 * letter of words of headings and titles").
 *
 * Every word starts with a capital letter, including each part of a hyphenated word
 * ("Iron-Tannin Black"). Short function words stay lowercase in the middle of a title
 * ("Expert Map of the Process"), following common Title Case, but are capitalised as the first or
 * last word. Words already holding a capital after the first letter (acronyms and names such as
 * "GI", "SUS", "2D", "McDonald", "iPad") are left as written, and so is anything after an
 * apostrophe ("Artisan's"). Pure function: the 2D pages and the 3D museum call the same helper,
 * so a title reads identically in both conditions.
 */
import { Children, cloneElement, isValidElement, type ReactNode } from "react";

const MINOR_WORDS = new Set([
  "a", "an", "the",
  "and", "but", "or", "nor", "for", "so", "yet",
  "as", "at", "by", "in", "of", "off", "on", "per", "to", "up", "via", "vs", "vs.",
]);

const hasInnerCapital = (w: string) => /[A-Z]/.test(w.slice(1)) || /^\d/.test(w);

function capitaliseWord(w: string): string {
  if (!w || hasInnerCapital(w)) return w;
  // First letter of the word (skipping leading punctuation such as quotes or brackets).
  return w.replace(/^([^\p{L}]*)(\p{L})/u, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

export function titleCase(input: string): string {
  const words = input.split(/(\s+)/);
  const last = words.length - 1 - [...words].reverse().findIndex((w) => w.trim() !== "");
  let seenWord = false;
  return words
    .map((token, i) => {
      if (token.trim() === "") return token;
      const first = !seenWord;
      seenWord = true;
      const bare = token.toLowerCase().replace(/[^\p{L}.]/gu, "");
      if (!first && i !== last && MINOR_WORDS.has(bare) && token === token.toLowerCase()) return token;
      // A colon or dash starts a new title segment: its next word is capitalised too.
      return token.split("-").map(capitaliseWord).join("-");
    })
    .join("")
    .replace(/([:—–]\s+)(\p{Ll})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Applies `titleCase` to the text inside a heading's React children: plain strings, arrays and
 * the text of nested elements (e.g. `<CardTitle><h2>{title}</h2></CardTitle>`). Elements are
 * cloned, never re-created, so their props and refs are kept.
 */
export function titleCaseNode(node: ReactNode): ReactNode {
  if (typeof node === "string") return titleCase(node);
  if (Array.isArray(node)) return Children.map(node, (child) => titleCaseNode(child));
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
    return cloneElement(node, undefined, titleCaseNode(node.props.children));
  }
  return node;
}
