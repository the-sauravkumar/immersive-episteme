/**
 * Curator notes / editorial prose (Tiptap JSON). Never learner-facing: the snapshot builder
 * always writes `body: null` (src/features/knowledge/graph/snapshot.ts buildBundle), so these
 * notes cannot reach a learning condition; learner text is generated from claims only.
 *
 *  - `sanitizeDoc`: keeps an allow-list of node and mark types and http(s)/mailto links, drops
 *    everything else (attributes included), and caps depth/size. Stored as structured JSON.
 *  - `renderDocHtml`: serialises the allow-listed JSON to HTML with escaping, then runs
 *    DOMPurify (isomorphic-dompurify) over the result before it is ever rendered.
 */
import DOMPurify from "isomorphic-dompurify";

import type { TiptapDoc, TiptapNode } from "@/lib/validation/primitives";

const BLOCKS = new Set(["paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "horizontalRule", "hardBreak", "text"]);
const MARKS = new Set(["bold", "italic", "underline", "strike", "code", "link"]);
const MAX_DEPTH = 12;
const MAX_NODES = 5000;

function safeHref(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^(https?:\/\/|mailto:)/i.test(s) && s.length <= 2000 ? s : null;
}

export function sanitizeDoc(input: unknown): TiptapDoc {
  let count = 0;
  const walk = (n: unknown, depth: number): TiptapNode | null => {
    if (!n || typeof n !== "object" || depth > MAX_DEPTH || ++count > MAX_NODES) return null;
    const node = n as Record<string, unknown>;
    const type = node.type;
    if (typeof type !== "string" || !BLOCKS.has(type)) return null;
    if (type === "text") {
      if (typeof node.text !== "string" || node.text.length === 0) return null;
      const marks = Array.isArray(node.marks)
        ? (node.marks as Record<string, unknown>[])
            .filter((m) => m && typeof m.type === "string" && MARKS.has(m.type))
            .map((m) => {
              if (m.type !== "link") return { type: m.type as string };
              const href = safeHref((m.attrs as Record<string, unknown> | undefined)?.href);
              return href ? { type: "link", attrs: { href } } : null;
            })
            .filter((m): m is NonNullable<typeof m> => m !== null)
        : [];
      return { type: "text", text: node.text.slice(0, 20_000), ...(marks.length ? { marks } : {}) };
    }
    const out: TiptapNode = { type };
    if (type === "heading") {
      const level = Number((node.attrs as Record<string, unknown> | undefined)?.level);
      out.attrs = { level: level >= 2 && level <= 4 ? level : 3 };
    }
    if (Array.isArray(node.content)) {
      const content = node.content.map((c) => walk(c, depth + 1)).filter((c): c is TiptapNode => c !== null);
      if (content.length) out.content = content;
    }
    return out;
  };
  const doc = input as Record<string, unknown> | null;
  const content = doc && doc.type === "doc" && Array.isArray(doc.content) ? doc.content.map((c) => walk(c, 1)).filter((c): c is TiptapNode => c !== null) : [];
  return { type: "doc", content };
}

/** True when the document has no text at all. */
export function isEmptyDoc(doc: TiptapDoc | null | undefined): boolean {
  if (!doc) return true;
  const hasText = (n: TiptapNode): boolean => (n.type === "text" && !!n.text?.trim()) || (n.content ?? []).some(hasText);
  return !doc.content.some(hasText);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TAG: Record<string, string> = {
  paragraph: "p",
  bulletList: "ul",
  orderedList: "ol",
  listItem: "li",
  blockquote: "blockquote",
};

function renderNode(n: TiptapNode): string {
  if (n.type === "text") {
    let html = esc(n.text ?? "");
    for (const m of n.marks ?? []) {
      if (m.type === "bold") html = `<strong>${html}</strong>`;
      else if (m.type === "italic") html = `<em>${html}</em>`;
      else if (m.type === "underline") html = `<u>${html}</u>`;
      else if (m.type === "strike") html = `<s>${html}</s>`;
      else if (m.type === "code") html = `<code>${html}</code>`;
      else if (m.type === "link") {
        const href = safeHref(m.attrs?.href);
        if (href) html = `<a href="${esc(href)}" rel="noopener noreferrer nofollow" target="_blank">${html}</a>`;
      }
    }
    return html;
  }
  const inner = (n.content ?? []).map(renderNode).join("");
  if (n.type === "hardBreak") return "<br>";
  if (n.type === "horizontalRule") return "<hr>";
  if (n.type === "heading") {
    const level = Number(n.attrs?.level) || 3;
    return `<h${level}>${inner}</h${level}>`;
  }
  const tag = TAG[n.type];
  return tag ? `<${tag}>${inner}</${tag}>` : inner;
}

const PURIFY = {
  ALLOWED_TAGS: ["p", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "strong", "em", "u", "s", "code", "a", "br", "hr"],
  ALLOWED_ATTR: ["href", "rel", "target"],
  ALLOW_DATA_ATTR: false,
};

/** Sanitised HTML for a stored notes document (empty string for none). */
export function renderDocHtml(doc: unknown): string {
  const clean = sanitizeDoc(doc);
  return DOMPurify.sanitize(clean.content.map(renderNode).join(""), PURIFY);
}
