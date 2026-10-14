/**
 * JSON-LD export of a knowledge bundle: schema.org `DefinedTermSet`/`DefinedTerm` for
 * traditions and concepts, `CreativeWork` for sources, and relationships reified as
 * `ie:Relationship` nodes so their explanation, conditions, ordinal, provenance and review
 * state survive. The `ie:` vocabulary is a URN namespace, not a resolvable web vocabulary.
 */
import type { KnowledgeBundle } from "@/features/knowledge/contracts";

export const IE_VOCAB = "urn:immersive-episteme:vocab#";

export function bundleToJsonLd(bundle: KnowledgeBundle): Record<string, unknown> {
  const conceptIri = (key: string) => `urn:immersive-episteme:concept:${key}`;
  const sourceIri = (id: string) => `urn:uuid:${id}`;
  const traditionIri = (slug: string) => `urn:immersive-episteme:tradition:${slug}`;
  const traditionSlugById = new Map(bundle.traditions.map((t) => [t.id, t.slug]));

  const graph: Record<string, unknown>[] = [];
  graph.push({
    "@id": `urn:immersive-episteme:snapshot:${bundle.versionLabel}`,
    "@type": "Dataset",
    name: `Immersive Episteme knowledge bundle ${bundle.versionLabel}`,
    dateCreated: bundle.generatedAt,
    "ie:includesUnverified": bundle.includesUnverified,
    "ie:isDemo": bundle.isDemo,
    "ie:schemaVersion": bundle.schemaVersion,
  });
  for (const t of bundle.traditions) {
    graph.push({
      "@id": traditionIri(t.slug),
      "@type": "DefinedTermSet",
      name: t.name,
      alternateName: t.altNames,
      description: t.summary,
      "ie:verificationState": t.verificationState,
      ...(t.region.lat != null && t.region.lon != null
        ? { spatialCoverage: { "@type": "Place", name: t.region.place, geo: { "@type": "GeoCoordinates", latitude: t.region.lat, longitude: t.region.lon } } }
        : {}),
    });
  }
  for (const s of bundle.sources) {
    graph.push({
      "@id": sourceIri(s.id),
      "@type": "CreativeWork",
      name: s.title,
      author: s.author,
      publisher: s.publisher,
      datePublished: s.year != null ? String(s.year) : null,
      url: s.url,
      "ie:provenanceKind": s.kind,
      "ie:reliability": s.reliability,
    });
  }
  for (const c of bundle.concepts) {
    const traditionSlug = c.traditionId ? traditionSlugById.get(c.traditionId) : undefined;
    graph.push({
      "@id": conceptIri(c.key),
      "@type": "DefinedTerm",
      termCode: c.key,
      name: c.title,
      description: c.summary,
      alternateName: c.localTerms,
      ...(traditionSlug ? { inDefinedTermSet: { "@id": traditionIri(traditionSlug) } } : {}),
      "ie:conceptType": c.type,
      "ie:category": c.category,
      "ie:provenanceKind": c.provenanceKind,
      "ie:verificationState": c.verificationState,
      "ie:compares": c.compares.map((k) => ({ "@id": conceptIri(k) })),
      "ie:claim": c.claims.map((cl) => ({
        "@id": `urn:uuid:${cl.id}`,
        "@type": "ie:Claim",
        text: cl.text,
        "ie:quote": cl.quote,
        citation: cl.sources.map((s) => ({ "@id": sourceIri(s.sourceId) })),
      })),
    });
  }
  for (const r of bundle.relationships) {
    graph.push({
      "@id": `urn:uuid:${r.id}`,
      "@type": "ie:Relationship",
      "ie:relationshipType": { "@id": `ie:${r.type}` },
      "ie:source": { "@id": conceptIri(r.source) },
      "ie:target": { "@id": conceptIri(r.target) },
      "ie:explanation": r.explanation,
      "ie:conditions": r.conditions,
      "ie:ordinal": r.ordinal,
      "ie:provenanceKind": r.provenanceKind,
      "ie:verificationState": r.verificationState,
      citation: r.sources.map((s) => ({ "@id": sourceIri(s.sourceId) })),
    });
  }
  for (const t of bundle.relationshipTypes) {
    graph.push({
      "@id": `ie:${t.code}`,
      "@type": "ie:RelationshipType",
      name: t.label,
      "ie:inverseLabel": t.inverseLabel,
      "ie:semantics": t.semantics,
      "ie:directed": t.directed,
      "ie:ordered": t.ordered,
      "ie:allowsCycles": t.allowsCycles,
    });
  }
  return { "@context": { "@vocab": "https://schema.org/", ie: IE_VOCAB }, "@graph": graph };
}
