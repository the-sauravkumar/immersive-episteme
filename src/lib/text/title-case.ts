import { Children, cloneElement, isValidElement, type ReactNode } from "react";

const MINOR_WORDS = new Set([
  "a", "an", "the",
  "and", "but", "or", "nor", "for", "so", "yet",
  "as", "at", "by", "in", "of", "off", "on", "per", "to", "up", "via", "vs", "vs.",
]);

const hasInnerCapital = (w: string) => /[A-Z]/.test(w.slice(1)) || /^\d/.test(w);

function capitaliseWord(w: string): string {
  if (!w || hasInnerCapital(w)) return w;
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
      return token.split("-").map(capitaliseWord).join("-");
    })
    .join("")
    .replace(/([:—–]\s+)(\p{Ll})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function titleCaseNode(node: ReactNode): ReactNode {
  if (typeof node === "string") return titleCase(node);
  if (Array.isArray(node)) return Children.map(node, (child) => titleCaseNode(child));
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
    return cloneElement(node, undefined, titleCaseNode(node.props.children));
  }
  return node;
}
