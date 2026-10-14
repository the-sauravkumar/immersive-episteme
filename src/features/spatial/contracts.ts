/**
 * Spatial-compiler boundary contracts: mapping-rule-set configuration, the compiled manifest
 * envelope stored in spatial_manifests.manifest, the element index rows (spatial_elements /
 * spatial_element_encodings) and audited manual overrides.
 *
 *   manifest = compile(snapshot, rule set (+ overrides), compilerVersion, seed)
 *
 * The compiler owns the detailed geometry of each element; this contract fixes only what
 * the database, the research console and telemetry rely on: stable element ids, element
 * kind, the concept/relationship/rule each element traces back to, and the validation report.
 * Which relationship type maps to which spatial encoding is open question Q-R17.
 */
import { z } from "zod";

import { CONCEPT_TYPES, RELATIONSHIP_SEMANTICS, SPATIAL_ELEMENT_KINDS } from "@/lib/validation/enums";
import { relationshipTypeCodeSchema, sha256Schema, uuidSchema } from "@/lib/validation/primitives";

export const spatialElementKindSchema = z.enum(SPATIAL_ELEMENT_KINDS);
export const elementIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,127}$/, "Stable element ids are lowercase");
export const ruleIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,63}$/);

/** How a relationship is expressed in space. */
export const SPATIAL_ENCODINGS = [
  "containment",
  "adjacency",
  "sequence_path",
  "threshold",
  "explicit_link",
  "juxtaposition",
  "layer",
] as const;
export const spatialEncodingSchema = z.enum(SPATIAL_ENCODINGS);

export const mappingRuleSchema = z.object({
  id: ruleIdSchema,
  description: z.string().max(2000),
  /** Selector: which concepts / relationships the rule applies to. */
  match: z
    .object({
      conceptTypes: z.array(z.enum(CONCEPT_TYPES)).optional(),
      relationshipTypes: z.array(relationshipTypeCodeSchema).optional(),
      semantics: z.array(z.enum(RELATIONSHIP_SEMANTICS)).optional(),
    })
    .refine((m) => !!(m.conceptTypes?.length || m.relationshipTypes?.length || m.semantics?.length), {
      message: "A rule must match something",
    }),
  emit: z.object({
    kind: spatialElementKindSchema.optional(),
    encoding: spatialEncodingSchema.optional(),
    params: z.record(z.string(), z.unknown()).default({}),
  }),
  priority: z.number().int().default(0),
});
export type MappingRule = z.infer<typeof mappingRuleSchema>;

/** mapping_rule_sets.config */
export const mappingRuleSetConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    rules: z.array(mappingRuleSchema).min(1),
    layout: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((c, ctx) => {
    const ids = new Set<string>();
    c.rules.forEach((r, i) => {
      if (ids.has(r.id)) ctx.addIssue({ code: "custom", path: ["rules", i, "id"], message: "Duplicate rule id" });
      ids.add(r.id);
    });
  });
export type MappingRuleSetConfig = z.infer<typeof mappingRuleSetConfigSchema>;

export const manifestElementSchema = z
  .object({
    id: elementIdSchema,
    kind: spatialElementKindSchema,
    parentId: elementIdSchema.nullable().default(null),
    conceptId: uuidSchema.nullable().default(null),
    ruleId: ruleIdSchema,
    label: z.string().max(300).nullable().default(null),
    encodes: z
      .array(z.object({ relationshipId: uuidSchema, ruleId: ruleIdSchema, encoding: spatialEncodingSchema }))
      .default([]),
  })
  .loose();
export type ManifestElement = z.infer<typeof manifestElementSchema>;

/** spatial_manifests.manifest envelope. */
export const spatialManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    snapshotVersion: z.string().min(1),
    ruleSet: z.object({ id: uuidSchema, name: z.string(), version: z.number().int().positive(), configSha256: sha256Schema }),
    compilerVersion: z.string().min(1),
    seed: z.string().min(1),
    elements: z.array(manifestElementSchema),
  })
  .superRefine((m, ctx) => {
    const ids = new Set<string>();
    m.elements.forEach((e, i) => {
      if (ids.has(e.id)) ctx.addIssue({ code: "custom", path: ["elements", i, "id"], message: `Duplicate element id ${e.id}` });
      ids.add(e.id);
    });
    m.elements.forEach((e, i) => {
      if (e.parentId && !ids.has(e.parentId)) {
        ctx.addIssue({ code: "custom", path: ["elements", i, "parentId"], message: "Unknown parent element" });
      }
    });
  });
export type SpatialManifest = z.infer<typeof spatialManifestSchema>;

/** spatial_manifests.validation */
export const manifestValidationSchema = z.object({
  passed: z.boolean(),
  checks: z.array(
    z.object({ id: z.string(), label: z.string(), passed: z.boolean(), details: z.unknown().optional() }),
  ),
  coverage: z
    .object({
      concepts: z.object({ total: z.number().int(), placed: z.number().int() }),
      relationships: z.object({ total: z.number().int(), encoded: z.number().int() }),
    })
    .optional(),
});

export const manualOverrideInputSchema = z.object({
  ruleSetId: uuidSchema,
  targetElementId: elementIdSchema,
  targetConceptId: uuidSchema.nullish(),
  field: z.string().regex(/^(\/[^/]+)+$/, "Use a JSON pointer such as /position"),
  value: z.unknown(),
  reason: z.string().trim().min(3).max(2000),
});
export type ManualOverrideInput = z.infer<typeof manualOverrideInputSchema>;
