/**
 * Server-side validation of an editor payload against the item's concept set and vocabulary.
 * The client runs the same reducer, so a payload that fails here was not produced by the
 * editor; it is refused rather than repaired.
 */
import { edgeDirected, edgeIdentity, mapPayloadSchema, type MapPayload } from "@/components/assessment/map-state";

import { AssessmentError } from "./common";
import type { ConceptSet } from "./concept-set";

export function validateMapPayload(input: unknown, set: ConceptSet, opts: { rater: boolean }): MapPayload {
  const parsed = mapPayloadSchema.safeParse(input);
  if (!parsed.success) throw new AssessmentError("invalid", `Invalid map: ${parsed.error.issues[0]?.message ?? "malformed"}`);
  const payload = parsed.data;

  const expected = new Map(set.concepts.map((c) => [c.nodeKey, c]));
  if (payload.nodes.length !== expected.size || new Set(payload.nodes.map((n) => n.key)).size !== expected.size) {
    throw new AssessmentError("invalid", "The map must contain exactly the concepts of the task.");
  }
  const nodes = payload.nodes.map((n) => {
    const c = expected.get(n.key);
    if (!c || c.conceptId !== n.conceptId) throw new AssessmentError("invalid", "The map must contain exactly the concepts of the task.");
    // Labels always come from the concept set, never from the client.
    return { ...n, label: c.label };
  });

  const rules = { relationshipTypes: set.relationshipTypes, directedLinks: set.directedLinks };
  const typed = set.relationshipTypes.length > 0;
  const seen = new Set<string>();
  const keys = new Set<string>();
  for (const e of payload.edges) {
    if (!expected.has(e.source) || !expected.has(e.target)) throw new AssessmentError("invalid", "A relationship refers to an unknown concept.");
    if (typed ? !set.relationshipTypes.some((t) => t.code === e.relationshipType) : e.relationshipType !== null) {
      throw new AssessmentError("invalid", "A relationship uses a type the task does not allow.");
    }
    if (e.directed !== edgeDirected(e.relationshipType, rules)) throw new AssessmentError("invalid", "A relationship has the wrong direction setting for its type.");
    if (!opts.rater && e.required !== undefined) throw new AssessmentError("invalid", "Participant maps cannot mark expected relationships.");
    const dup = edgeIdentity(e);
    if (seen.has(dup) || keys.has(e.key)) throw new AssessmentError("invalid", "The map contains a duplicate relationship.");
    seen.add(dup);
    keys.add(e.key);
  }
  return { nodes, edges: payload.edges, editLog: payload.editLog };
}
