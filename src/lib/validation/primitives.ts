/**
 * Shared Zod primitives. Each mirrors a database CHECK constraint in db/schema/* so that
 * invalid input is rejected at the boundary with a readable message before Postgres would
 * reject it with a constraint name. Pure (zod only): safe for client and server.
 */
import { z } from "zod";

/** kebab-case slug (db: SLUG_RE). */
export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Lowercase hex sha256 (db: SHA256_HEX_RE). */
export const SHA256_REGEX = /^[0-9a-f]{64}$/;
/** Concept key `<namespace>.<type>.<kebab-name>` (content/FORMAT.md; db: concepts_key_ck). */
export const CONCEPT_KEY_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*\.[a-z_]+\.[a-z0-9]+(-[a-z0-9]+)*$/;
/** Relationship type code, e.g. PRECEDES (db: relationship_types_code_ck). */
export const RELATIONSHIP_TYPE_CODE_REGEX = /^[A-Z][A-Z0-9_]*$/;

export const DEMO_TITLE_PREFIX = "Demo:";
export const MAX_QUOTE_WORDS = 25;

export const uuidSchema = z.uuid();
export const slugSchema = z.string().min(1).max(120).regex(SLUG_REGEX, "Use lowercase kebab-case");
export const sha256Schema = z.string().regex(SHA256_REGEX, "Expected a lowercase hex sha256");
export const conceptKeySchema = z
  .string()
  .max(200)
  .regex(CONCEPT_KEY_REGEX, "Concept keys look like <namespace>.<type>.<kebab-name>");
export const relationshipTypeCodeSchema = z
  .string()
  .max(64)
  .regex(RELATIONSHIP_TYPE_CODE_REGEX, "Relationship type codes are UPPER_SNAKE_CASE");
export const httpUrlSchema = z.url({ protocol: /^https?$/ });
export const nonBlank = (max = 10_000) =>
  z
    .string()
    .max(max)
    .refine((s) => s.trim().length > 0, "Must not be blank");

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/** Verbatim quote, at most 25 words (FORMAT.md; db: *_quote_ck). */
export const quoteSchema = z
  .string()
  .refine((q) => wordCount(q) <= MAX_QUOTE_WORDS, `Quotes are limited to ${MAX_QUOTE_WORDS} words`);

/** Tiptap / ProseMirror JSON document (db: concepts_body_ck). Node contents are open. */
export type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
};
export const tiptapNodeSchema: z.ZodType<TiptapNode> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(tiptapNodeSchema).optional(),
    marks: z
      .array(z.object({ type: z.string().min(1), attrs: z.record(z.string(), z.unknown()).optional() }))
      .optional(),
    text: z.string().optional(),
  }),
);
export const tiptapDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(tiptapNodeSchema).default([]),
});
export type TiptapDoc = z.infer<typeof tiptapDocSchema>;

/** Plain JSON object (jsonb columns constrained to objects). */
export const jsonObjectSchema = z.record(z.string(), z.unknown());

/**
 * Demo rule shared by every demo-capable entity: demo rows carry is_demo = true, a
 * "Demo:"-prefixed title and a key/slug starting with "demo"; real rows never do.
 */
export function demoConsistencyIssue(input: {
  isDemo: boolean;
  title?: string;
  slugOrKey?: string;
}): string | null {
  const { isDemo, title, slugOrKey } = input;
  if (slugOrKey !== undefined && isDemo !== slugOrKey.startsWith("demo")) {
    return isDemo
      ? "Demo records need a slug/key starting with 'demo'"
      : "Only demo records may use a slug/key starting with 'demo'";
  }
  if (isDemo && title !== undefined && !title.startsWith(DEMO_TITLE_PREFIX)) {
    return `Demo records need a title starting with '${DEMO_TITLE_PREFIX}'`;
  }
  return null;
}
