# Methods notes (draft material for the paper)

Draft text for the methods and system-design sections. Every number is traceable to
the file in brackets. Update these notes when a number changes.

## 1. Knowledge corpus construction

**Scope.** Six Indian hand-block-printing traditions were documented: Sanganeri, Bagru,
Ajrakh, Bagh, Dabu (mud-resist) and Machilipatnam Kalamkari. A shared layer covers the
craft science common to them (mordant chemistry, alizarin lake formation, iron–tannin
black, indigo vat reduction, mud resist, tannin pre-mordanting, sun bleaching), plus a
file of cross-tradition comparisons. One craft type was chosen so that materials, tools and
process stages share a vocabulary, which makes cross-tradition relations and
concept-map scoring comparable (DR-004).

**Representation.** Each tradition is a typed knowledge graph: concepts of 13 types
(tradition, material, tool, process stage, artisan decision, design principle, outcome,
scientific mechanism, environmental condition, historical context, comparison,
explanation, open question) in 14 knowledge categories, connected by typed, directed
relationships (e.g. PRECEDES with ordinals, USES, DEPENDS_ON, REQUIRES, CAUSES,
SCIENTIFICALLY_EXPLAINED_BY, SIMILAR_TO, CONTRASTS_WITH) [content/FORMAT.md]. Every
concept holds atomic **claims**, and each claim cites one or more sources with kind
(practitioner testimony, historical documentation, scientific evidence, researcher
interpretation, hypothesis, unverified) and reliability (high, medium, low).

**Size.** 442 concepts, 1,256 claims and 715 relationships, citing 112 source entries
(105 unique URLs) [`scripts/content/validate.ts` output]. No item is marked verified:
366 concepts are *under review* and 76 *need evidence*. Verification was originally reserved for
domain curators; the route actually used for the study release is in §2, "Verification route
for the study release".

**Curation procedure.** (1) Per-tradition drafting from public sources: GI registry and
GI journals, museum collection records, peer-reviewed literature and craft-documentation
archives. (2) An independent adversarial fact-check that re-fetched every source. (3)
First-hand verification by the platform team (§2).

## 2. Verification of the corpus

**Source archive.** All 105 cited URLs were downloaded, converted to text and hashed
(SHA-256). Sources behind forms or with broken DOIs were retrieved through the registry's
document endpoint or bibliographic APIs (Crossref, OpenAlex)
[content/review/verification.md §V5; content/review/source-manifest.tsv].

**Claim check.** Each of 1,252 claims (the count at the time of the check) was matched to
the best three-sentence window of its cited source by content-word overlap. Claims in the
weak (< 0.4, n = 46) and partial (0.4–0.7, n = 411) bands were read by hand against the
source text, with targeted searches. Claims in the strong band (≥ 0.7, n = 795) passed a
numeric-consistency test (every number in the claim present in the source: 121/125, the
4 exceptions explained) and a reproducible random sample of 60 read by hand
(60/60 supported). 14 claims and 1 summary were corrected, including attributions,
over-generalisations and unsupported specifics [§V6].

**Independence of sources.** Text overlap between documents was measured with n-gram
shingling. The Bagru and Sanganeri GI applications share a template and about 34% of
their method text verbatim (13% of 5-word sequences overall). Bagh's GI text shares long
verbatim passages with an Asia InCH record (36% of the GI section in shared runs of
12+ words). Ajrakh's GI text and a Khamir exhibition page share a single 34-word
passage [§V1–V3]. These measures informed the proposed study subset (DR-004).

**Relationships.** All 704 relationships were checked: causal links (4) and process order
(68) by hand against the sources' step orders; scientific-explanation links (64) against
stage claims; the rest by hand (100) or by co-mention evidence plus a stratified sample
(40/40 supported). 8 relationships that were inferences rather than source statements
were removed [§V8; content/review/removed-relationships.json].

**Learner-facing text.** Concept summaries and bodies are generated only from the
concept's verified claims, with source ids. This ensures that every sentence presented
to participants, in either condition, is a cited claim [§V7; DR-007].

**Integrity.** An automated validator (stable rule codes) checks entities, relationship
types, cycles, process ordinals per chain, provenance, duplicates and orphans. The
final corpus has 0 errors and 0 warnings [§V9–V10;
docs/architecture/knowledge-graph-validation.md].

**Verification route for the study release** (DR-059). No independent
domain curator was available. The project lead therefore authorised verification on mechanical
evidence and took responsibility for it. The paper must describe the route as follows.

- **Mechanical source check.** An AI assistant (Claude) checked every concept, claim, quote and
  relationship of the three study traditions.
  - **Source copies:** archived copies of the cited sources whose SHA-256 equals the source
    manifest [content/review/source-manifest.tsv].
  - **Quote matching:** a quote passes only if it is verbatim at its stated locator:
    - for PDFs, on the stated page alone (per-page text extraction);
    - for web pages, after the stated section heading.
  - **Normalisation:** whitespace, quotation marks, dashes, ligatures, soft hyphens and line-end
    hyphenation only.
  - **Claim width:** each claim was also read against its quotes. A claim that says more than its
    quotes was graded "fixable" when the missing words are verbatim in the same cited source, and
    "fail" otherwise. Every proposed fix passage was itself re-found mechanically at its locator.
- **Results per tradition** [per-tradition check reports; to be archived with the release
  evidence before these numbers are cited]:

  | Tradition | Quotes verbatim at locator | Concepts (pass / fixable / fail) | Relationships holding |
  |---|---|---|---|
  | Ajrakh | 260/265 (the 5 misses are formatting faults: 3 dropped list bullets, 1 quote-mark glyph, 1 non-heading locator) | 37 / 36 / 7 | 156/162 |
  | Machilipatnam Kalamkari | 253/253 | 27 / 39 / 2 | 131/133 |
  | Sanganeri | 296/298 (2 OCR bullet-glyph mismatches) | 41 / 28 / 3 | 83/87 |

- **What may enter the release.**
  - **Accepted:** only "pass" content, and content fixed by adding verbatim text from the same
    source or by narrowing a claim to its source. No fix adds a craft fact or widens a claim.
  - **Withdrawn:** failing content, and fixable content that has not been fixed.
  - **Relationships:** each citation gets a page/locator and a verbatim quote of at most 25 words.
    These are recorded in the content files (content/FORMAT.md, "Relationship evidence"), and the
    platform refuses to verify a relationship, or to publish a release, without them.
- **Who verifies.** Each acceptance is recorded under the project lead's own curator account,
  through the same service functions the CMS uses. Each record carries the reason "authorised by
  the project lead; based on Claude's mechanical source check" and a link to the check sheet.
  Edits are made under an account named as an AI assistant operated by the lead.
- **What this route is not.** It is not an independent expert review:
  - the platform's separation of duties guarantees only that the verifying account did not
    author the text;
  - the judgement that each claim is supported rests on the AI-performed check and on the lead's
    acceptance of it.
- **Scope.** Bagh, Bagru and Dabu, and the cross-tradition comparisons that span all six
  traditions, were taken out of the release pipeline: withdrawn or archived, reversibly and
  without deletion. The release holds the three study traditions and the shared craft-science
  layer. A pre-execution simulation counted 244 concepts and 421 relationships with 0 graph
  errors; re-measure at execution.

## 3. Knowledge-to-space transformation

The 3D museum is generated by a deterministic compiler from the knowledge graph
[docs/architecture/spatial-compiler.md]. Mapping rules are explicit data: tradition →
wing; knowledge category → room with a labelled wall run; PRECEDES chains → ordered
walkable paths; DEPENDS_ON/REQUIRES → threshold cues; association → neighbouring
exhibits; cross-tradition comparison → a shared comparison hall; causal relations →
explanation sequences triggered on selection, never proximity alone; scientific and
practitioner explanations → progressive-disclosure layers. Every generated element
records the source concepts and relationships, the rule applied, the exposing interaction
and a written rationale. The same graph, configuration, seed and compiler version give a
byte-identical manifest (SHA-256).

For the three proposed study traditions (Ajrakh, Sanganeri, Machilipatnam Kalamkari), the
compiled museum has 6 zones, 24 rooms, 210 exhibits plus 44 process stations, 29 doorways
and 9 paths. All 254 concepts and 421 relationships are placed, and validation (30 checks,
including reachability, collider overlap, coplanar-surface and image-aspect checks)
passes with 0 warnings [compile-content output; §V10].

## 4. Reproducibility

Every participant session will be bound to an immutable knowledge snapshot (content
hash), a spatial manifest (hash, compiler version, seed), assessment versions and the
application build. Concept-map scores store metric name, metric version and parameters
[docs/research/concept-map-scoring.md]. The 3D rendering quality tier is locked per
study session and logged as a covariate [DR-013].

## 5. Limitations to report

- Process detail for several traditions rests mainly on GI applications written by the
  applicants themselves.
- No scientific study of Dabu mud-resist pastes was found; the mud-resist and
  sun-bleaching mechanisms are supported only by analogue studies.
- The study release was verified on an AI-performed mechanical source check accepted by the
  project lead, not by an independent domain expert (§2, "Verification route for the study
  release"; DR-059).
- 18 links in the study graph have no supporting passage in their cited sources and are kept as
  needs_evidence, so that the three wings stay structurally equal: 17 in the three study
  traditions and the shared craft-science layer, 1 in comparisons (outside the release). The
  order of some process stages therefore rests partly on the curators' reading of a source's
  stage order, pending the PI's ruling (DR-060; content/review/unsupported-relationships.json).
- Bagh, Bagru and Dabu were documented but are outside the study release; they were not
  source-checked to the same standard.
