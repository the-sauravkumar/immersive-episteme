import { Children, cloneElement, isValidElement, type ReactNode } from "react";

const hasInnerCapital = (w: string) => /[A-Z]/.test(w.slice(1)) || /^\d/.test(w);

function capitaliseWord(w: string): string {
  if (!w || hasInnerCapital(w)) return w;
  return w.replace(/^([^\p{L}]*)(\p{L})/u, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

export function titleCase(input: string): string {
  return input
    .split(/(\s+)/)
    .map((token) => (token.trim() === "" ? token : token.split("-").map(capitaliseWord).join("-")))
    .join("");
}

export function titleCaseNode(node: ReactNode): ReactNode {
  if (typeof node === "string") return titleCase(node);
  if (Array.isArray(node)) return Children.map(node, (child) => titleCaseNode(child));
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
    return cloneElement(node, undefined, titleCaseNode(node.props.children));
  }
  return node;
}
