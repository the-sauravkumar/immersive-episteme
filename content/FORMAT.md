# Curated tradition dataset — interchange format (v1)

One folder per tradition: `content/traditions/<slug>/tradition.json`, plus a
shared `content/shared/craft-science.json` and `content/comparisons.json`.
The platform importer (built later) maps these into the knowledge schema.

## Provenance rules (non-negotiable)

- Every concept and relationship carries `claims[]`, each claim citing one or
  more `source_ids`. No claim without a source. If you cannot source it, leave it out
  or record it as an `open_question` concept.
- Sources must be real, publicly accessible, and actually read (fetched). Prefer:
  GI registry / Geographical Indications Journal, government handloom & handicraft
  documents, peer-reviewed papers, university design-documentation (e.g. D'source
  IDC IIT Bombay, NID), museum collections (V&A, Met, Anokhi Museum, Calico Museum),
  established craft organisations (Craft Revival Trust, Gaatha, Dastkar).
  Blogs/e-commerce only as a last resort, marked `reliability: "low"`.
- `verification_state` is always `"under_review"` (or `"needs_evidence"` when sources
  are weak/conflicting). Never `"verified"` — only a human curator can verify.
- Do not record personal data about private individuals. Communities (e.g. Chhipa,
  Khatri) and publicly honoured master artisans named in published sources are fine.
- Paraphrase; quotes ≤ 25 words.

## tradition.json

```json
{
  "format_version": 1,
  "slug": "bagru",
  "name": "Bagru hand block printing",
  "alt_names": ["..."],
  "region": { "place": "...", "district": "...", "state": "...", "country": "India", "lat": 0, "lon": 0 },
  "gi": { "registered": true, "application_no": "...", "year": 0, "source_ids": ["S1"] },
  "summary": "2–4 sentences, sourced via claims of the tradition concept.",
  "sources": [
    { "id": "S1", "kind": "historical_documentation|scientific_evidence|practitioner_testimony|researcher_interpretation|hypothesis|unverified",
      "title": "...", "author": "...", "publisher": "...", "year": 0, "url": "https://...",
      "accessed": "2026-10-14", "reliability": "high|medium|low", "notes": "what it supports" }
  ],
  "concepts": [
    { "key": "bagru.material.dabu-mud", "type": "tradition|material|tool|process_stage|artisan_decision|design_principle|outcome|scientific_mechanism|environmental_condition|historical_context|comparison|explanation|open_question",
      "category": "tradition_identity|geography_history|artisan_knowledge|tacit_decisions|materials|tools|process_stages|design_principles|production_outcomes|scientific_mechanisms|environmental_conditions|cross_tradition_comparisons|supporting_evidence|open_questions",
      "title": "...", "summary": "1–2 sentences", "body_md": "short paragraph(s), plain markdown",
      "local_terms": ["hindi/local name if sourced"],
      "provenance_kind": "same enum as source.kind",
      "verification_state": "under_review|needs_evidence",
      "claims": [ { "text": "...", "source_ids": ["S1"], "quote": "optional ≤25 words",
                    "evidence": [ { "source_id": "S1", "locator": "PDF p. 4", "quote": "verbatim passage",
                                    "note": "optional: what a curator must check by hand" } ] } ] }
  ],
  "relationships": [
    { "source": "concept key", "target": "concept key",
      "type": "BELONGS_TO|USES|PRECEDES|DEPENDS_ON|PRODUCES|AFFECTED_BY|EXPLAINS|CONTRASTS_WITH|SIMILAR_TO|REQUIRES|ENABLES|CAUSES|PRACTITIONER_EXPLAINS|SCIENTIFICALLY_EXPLAINED_BY",
      "explanation": "why this relation holds", "conditions": "qualifications or null",
      "ordinal": null, "provenance_kind": "...", "verification_state": "under_review",
      "source_ids": ["S1"],
      "evidence": [ { "source_id": "S1", "locator": "PDF p. 4", "quote": "verbatim passage, at most 25 words" } ] }
  ],
  "media_candidates": [
    { "url": "file page URL (e.g. Wikimedia Commons)", "title": "...", "licence": "CC BY-SA 4.0 etc.",
      "author": "...", "depicts": "concept key",
      "width": 4000, "height": 3000, "mime": "image/jpeg",
      "dimensions_source": "Wikimedia Commons API imageinfo (date)" }
  ]
}
```

## Claim evidence

Each claim carries `evidence[]`: for every source it cites, at least one verbatim passage
from that source with a locator (`PDF p. N` for PDFs, `§ "<nearest heading>"` for web pages,
with `(occurrence k of n)` when a heading repeats on the page). `source_id` must be one of the
claim's `source_ids`. A passage supports the claim; it does not by itself verify it — claims
stay `under_review` until a curator checks them. `note` marks a passage that could not be
extracted cleanly and must be checked against the original. See
docs/research/citation-policy.md and content/review/verification.md §V11.

## Relationship evidence

A relationship may carry `evidence[]` (optional; files without it stay valid): for a cited
source, ONE verbatim passage from that source with a locator, written as for claim evidence.
`source_id` must be one of the relationship's `source_ids`, and each source has at most one
entry, because the database keeps one locator and one quote per relationship citation
(`relationship_sources`). The quote is at most 25 words and the locator at most 200 characters;
there is no `note` field. The importer writes the locator and quote into that citation. A
relationship can only be verified, and a release only published, when every one of its
citations has both (the CMS citation check and release rule REL002), so a relationship that
should reach a release needs an entry for every source it keeps. As with claims, a passage
supports the relationship; it does not verify it. A passage never adds a fact: when the source
says less than the explanation, narrow the explanation to what the source says, never widen it. The graph validator refuses a passage
from a source the relationship does not cite (KG412).

## Learner-facing text is built from claims only

`summary` and `body_md` are generated from the concept's own `claims`
(`prose_policy: "claims-only"`): the summary is the first claim, and the body is
every claim followed by its source ids. Free prose is not allowed in these fields,
because it cannot be checked sentence by sentence. To add text, add a claim with a
source. Earlier free prose is archived for curators in `review/prose-archive.json`.

## comparisons.json

Same structure with `slug: "comparisons"`, `region: null`, `gi: null`. Its
`comparison` concepts add a `compares: ["<concept key>", ...]` list naming the
tradition concepts being compared. Its sources are re-declared copies of the
tradition files' sources, with ids namespaced as `<slug>:<id>` (e.g. `ajrakh:S7`).
Its relationships (`SIMILAR_TO` / `CONTRASTS_WITH`) link concepts across files.

Conventions:
- Concept keys: `<slug>.<type>.<kebab-name>`; shared science uses `shared.<type>.<name>`.
- Process stages are linked in order with `PRECEDES` and `ordinal` 1..n.
- `CAUSES` only with direct evidence; otherwise `ENABLES` / `AFFECTED_BY`.
- Never collapse causal, sequential and associative links into one generic link.
- Each tradition should reach comparable depth: aim for ≥ 8 process stages,
  ≥ 6 materials, ≥ 4 tools, ≥ 3 artisan decisions, ≥ 3 scientific mechanisms
  (may link to shared ones), ≥ 2 environmental conditions, ≥ 3 design principles,
  ≥ 2 outcomes, ≥ 1 open question — but only where sources support it.
