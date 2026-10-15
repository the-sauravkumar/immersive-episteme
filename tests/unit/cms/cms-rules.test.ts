/**
 * Unit: CMS rules that do not need a database — rich-text sanitising (curator notes), the review
 * transition table against the permission matrix, subgraph views, snapshot diffs and the
 * staff-only graph editor route.
 */
import { describe, expect, it } from "vitest";

import { canAny } from "@/lib/permissions/can";
import { consoleRoute } from "@/lib/permissions/console-routes";
import { STAFF_ROLES, type Role } from "@/lib/permissions/roles";
import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import { diffBundles } from "@/server/cms/diff";
import { deriveLearnerText } from "@/server/cms/knowledge";
import { renderDocHtml, sanitizeDoc } from "@/server/cms/rich-text";
import { subgraph } from "@/server/cms/subgraph";
import { classifyTransition, TRANSITION_PERMISSION } from "@/server/cms/workflow";

const subject = (role: Role) => ({ roles: [role] });

describe("curator notes (rich text)", () => {
  it("keeps allow-listed structure and drops everything else", () => {
    const doc = sanitizeDoc({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { onclick: "x" }, content: [{ type: "text", text: "<b>hi</b>", marks: [{ type: "bold" }, { type: "textStyle", attrs: { color: "red" } }] }] },
        { type: "iframe", attrs: { src: "https://evil.example" } },
        { type: "paragraph", content: [{ type: "text", text: "link", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "H" }] },
      ],
    });
    expect(doc.content.map((n) => n.type)).toEqual(["paragraph", "paragraph", "heading"]);
    expect(doc.content[0]!.attrs).toBeUndefined();
    expect(doc.content[0]!.content![0]!.marks).toEqual([{ type: "bold" }]);
    expect(doc.content[1]!.content![0]!.marks).toBeUndefined();
    expect(doc.content[2]!.attrs).toEqual({ level: 3 });
  });

  it("renders escaped, DOMPurify-sanitised HTML", () => {
    const html = renderDocHtml({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "<img src=x onerror=alert(1)>" }] },
        { type: "paragraph", content: [{ type: "text", text: "ok", marks: [{ type: "link", attrs: { href: "https://example.org/a\"b" } }] }] },
      ],
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain('href="https://example.org/a&quot;b"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });
});

describe("claims-only learner text", () => {
  it("summary = first claim; body = claims with their source ids", () => {
    expect(deriveLearnerText([{ text: " A. ", sourceKeys: ["S1"] }, { text: "B.", sourceKeys: ["S1", "C2"] }])).toEqual({ summary: "A.", bodyMd: "A. [S1]\n\nB. [S1, C2]" });
  });
});

describe("review transitions vs the permission matrix", () => {
  const allowed = (role: Role, from: Parameters<typeof classifyTransition>[0], to: Parameters<typeof classifyTransition>[1]) => {
    const kind = classifyTransition(from, to);
    return kind !== null && canAny(subject(role), TRANSITION_PERMISSION[kind]);
  };

  it("editors submit but never verify, reject or archive", () => {
    expect(allowed("content_editor", "draft", "under_review")).toBe(true);
    expect(allowed("content_editor", "under_review", "verified")).toBe(false);
    expect(allowed("content_editor", "under_review", "rejected")).toBe(false);
    expect(allowed("content_editor", "verified", "archived")).toBe(false);
  });

  it("only curators and the PI verify; researchers review without verifying; admins do neither", () => {
    const verifiers = STAFF_ROLES.filter((r) => allowed(r, "under_review", "verified"));
    expect(verifiers.sort()).toEqual(["curator", "principal_investigator"]);
    expect(allowed("researcher", "under_review", "needs_evidence")).toBe(true);
    expect(allowed("platform_admin", "under_review", "needs_evidence")).toBe(false);
  });

  it("'published' is never a manual transition", () => {
    expect(classifyTransition("verified", "published")).toBeNull();
  });

  it("only roles with content.publish open the release page; the graph editor needs graph.edit, which participants and the public never hold", () => {
    expect(consoleRoute("/cms/datasets").anyOf).toEqual(["content.publish"]);
    expect(consoleRoute("/cms/relations").anyOf).toEqual(["graph.edit"]);
    for (const r of ["participant", "public"] as const) expect(canAny(subject(r), ["graph.edit", "content.read"])).toBe(false);
    expect(canAny(subject("content_editor"), ["content.publish"])).toBe(false);
  });
});

describe("subgraph views", () => {
  const n = (id: string, tradition: string) => ({ id, key: `${tradition}.material.${id}`, title: id, type: "material", tradition, state: "under_review" as const });
  const e = (id: string, source: string, target: string, type = "USES") => ({ id, source, target, type, ordinal: null, state: "under_review" as const });
  const nodes = [n("a", "x"), n("b", "x"), n("c", "y"), n("d", "y")];
  const edges = [e("1", "a", "b"), e("2", "b", "c", "SIMILAR_TO"), e("3", "c", "d")];

  it("filters by tradition and type", () => {
    expect(subgraph(nodes, edges, { tradition: "x" }).edges.map((x) => x.id)).toEqual(["1"]);
    expect(subgraph(nodes, edges, { types: ["SIMILAR_TO"] }).edges.map((x) => x.id)).toEqual(["2"]);
  });

  it("focus + depth follows edges in both directions across traditions", () => {
    expect(subgraph(nodes, edges, { focus: "b", depth: 1 }).nodes.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
    expect(subgraph(nodes, edges, { focus: "a", depth: 3 }).nodes).toHaveLength(4);
  });
});

describe("snapshot diff", () => {
  const bundle = (claims: string[], title = "Indigo"): KnowledgeBundle =>
    ({
      schemaVersion: 1, versionLabel: "v", isDemo: false, includesUnverified: false, generatedAt: "2026-10-14T00:00:00.000Z",
      categories: [], relationshipTypes: [], traditions: [], sources: [], relationships: [],
      concepts: [{ id: "00000000-0000-4000-8000-000000000001", key: "x.material.indigo", slug: "x-material-indigo", type: "material", category: "materials", traditionId: null, title, summary: claims[0] ?? "", body: null, bodyMd: null, localTerms: [], compares: [], provenanceKind: "hypothesis", verificationState: "published", claims: claims.map((text, i) => ({ id: `00000000-0000-4000-8000-00000000010${i}`, text, quote: null, sources: [] })), assetIds: [] }],
    }) as KnowledgeBundle;

  it("reports added claims and changed fields, ignoring claim ids", () => {
    const d = diffBundles(bundle(["A"]), bundle(["A", "B"], "Indigo dye"));
    expect(d.claims.added.map((c) => c.key)).toEqual(["x.material.indigo#2"]);
    expect(d.claims.unchanged).toBe(1);
    expect(d.concepts.changed[0]!.fields).toEqual(["title"]);
  });
});
