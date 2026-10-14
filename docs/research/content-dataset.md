# Content dataset: six block-printing traditions

Status: draft for researcher review, 2026-10-14. Nothing in the dataset is `verified`.
Files: `content/traditions/<slug>/tradition.json` (6), `content/shared/craft-science.json`,
`content/comparisons.json`. Format: `content/FORMAT.md`. Fact-check logs: `content/review/*.md`.

## (a) What the dataset is and how it was built

The dataset is a source-cited knowledge graph for six Indian hand-block-printing traditions:
Kutch Ajrakh, Bagh, Bagru, Dabu (Akola), Machilipatnam Kalamkari and Sanganeri. It also
has a shared craft-science layer (24 concepts, 17 sources) and a cross-tradition comparison
file. It answers digest §2 (which six traditions) and supplies the §3 knowledge categories
and the §4 relationship types.

**Provenance policy** (FORMAT.md):
- Every concept and relationship carries claims, and every claim cites a fetched public source.
- Each source carries a `kind` (documentation, scientific evidence, testimony, interpretation, unverified) and a `reliability` rating.
- States are only `under_review` or `needs_evidence`. Only a human curator can set `verified`.
- No personal data about private individuals.
- Quotes are 25 words or fewer.

**Build pipeline:**
1. **Research agents.** One agent per tradition, plus one for shared science. Each fetched its sources and wrote the JSON against the FORMAT.md depth template.
2. **Adversarial fact-check.** Every cited URL was re-fetched. PDFs were read with pdftotext and the V&A records through its API. Every claim was compared with the source text. Misattributions were re-sourced or removed, overstated reliability ratings were lowered, unsupported `CAUSES` links were weakened, and partly supported items were set to `needs_evidence`. One AI-flagged Wikipedia source (Dabu S9) was deleted. Three analogue sources were added to the shared layer. The logs are in `content/review/`.
3. **Integrity checks.** The JSON parses. Every relationship endpoint resolves across files. Every `source_id` exists. Every concept has claims. No item is `verified`. Quote length was checked, and PRECEDES ordinals were checked against each source's stage order.

**comparisons.json** (this pass) adds 11 `comparison` concepts and 82 cross-tradition links
(70 SIMILAR_TO, 12 CONTRASTS_WITH):
- Every link joins concepts in two different tradition files, and every state is `under_review`.
- Every claim restates a claim already in a tradition file. It cites that file's source, re-declared as `<slug>:<id>`; the 51 entries are copied byte-for-byte and checked by script.
- No new facts were added.
- Each comparison concept lists the concepts it compares in a `compares` array. This is an extension that FORMAT.md does not yet document.

Validation:
- Result: 0 errors.
- Every endpoint is supported by a cited source from its own file.
- One warning is intended: in the Chhipa/Khatri contrast, Bagh S1 supports the `conditions` text rather than an endpoint.

## (b) Per-tradition profile

"Substantive relationships" excludes the BELONGS_TO links to the tradition node. Those links are
mechanically generated; Ajrakh has 69 and Machilipatnam 66.

| | Ajrakh | Bagh | Bagru | Dabu | Machilipatnam K. | Sanganeri |
|---|---|---|---|---|---|---|
| Concepts (total) | 80 | 60 | 65 | 62 | 67 | 72 |
| process stage / material / tool | 14 / 15 / 6 | 10 / 12 / 5 | 11 / 12 / 7 | 11 / 12 / 5 | 12 / 12 / 6 | 13 / 13 / 8 |
| artisan decision / design / outcome | 9 / 6 / 4 | 5 / 5 / 3 | 5 / 5 / 3 | 5 / 5 / 3 | 6 / 4 / 3 | 6 / 4 / 5 |
| mechanism¹ / environment / history | 4 / 5 / 10 | 3 / 5 / 7 | 5 / 4 / 6 | 4 / 3 / 8 | 5 / 4 / 6 | 4 / 3 / 9 |
| open question / comparison | 5 / 1 | 4 / 0 | 5 / 1 | 4 / 1 | 7 / 1 | 6 / 0 |
| Substantive relationships | 90 | 55 | 73 | 58 | 67 | 79 |
| of which PRECEDES | 15 | 9 | 10 | 11 | 11 | 11 |
| explanatory/causal² | 44 | 28 | 37 | 27 | 33 | 33 |
| shared mechanisms linked (of 9) | 7 | 5 | 7 | 5 | 6 | 7 |
| Sources high / medium / low | 5 / 7 / 3 | 2 / 8 / 3 | 3 / 7 / 3 | 6 / 10 / 7 | 6 / 9 / 1 | 6 / 6 / 3 |
| needs_evidence: concepts | 15% | 17% | 15% | **26%** | 22% | 13% |
| needs_evidence: substantive relationships | 8% | 20% | 10% | 21% | 9% | 11% |
| Fact-check confidence³ | medium | medium-low | medium | low-medium | medium | medium |
| Links in comparisons.json | 30 | 22 | 41 | 18 | 20 | 33 |

¹ Mechanism counts include Machilipatnam's `explanation` concept and Sanganeri's 4 `explanation` concepts.

² Explanatory/causal relationships are CAUSES, ENABLES, PRODUCES, DEPENDS_ON, REQUIRES, AFFECTED_BY, EXPLAINS, SCIENTIFICALLY_EXPLAINED_BY and PRACTITIONER_EXPLAINS.

³ Confidence is a judgement from the fact-check logs, not a computed score.

**Single-source dependencies.** The table gives the share of core concepts (stage, material, tool and decision) whose claims rest on one source.

| Tradition | Single-source core concepts | Dominant source and caveat |
|---|---|---|
| Ajrakh | 31/44, all on S1 (incl. 10/14 stages) | S1 is the applicant-written GI journal text (117 claims). It contradicts itself on black recipes and tamarisk, its red/indigo order is ambiguous, and it copies Khamir's (S7) Dhamadka text. |
| Bagh | 3/32, but 8/32 rest only on S1+S3 | The GI (S1) and Asia InCH (S3) share long verbatim passages (measured: ~36% of the GI text in shared runs of 12+ words, longest 176 words; verification.md V2; which copied which is not established), so "S1, S3" pairs are effectively one source. Quantities come from two informants who disagree. |
| Bagru | 7/35 on S1 (2/11 stages) | S1 is an OCR'd GI dossier sharing a template and much method text with Sanganeri S1 (measured: same template; ~34% of the method-of-production text shared verbatim in runs of 8+ words, ~13% of 5-word sequences across the whole documents (content/review/verification.md, V1)). |
| Dabu | 3/33 | Akola detail rests on two overlapping Gaatha pages (S1, S2) and low-reliability blogs. S2's process describes the tar resist, not mud. Mordant content comes only from a low-reliability Bagru article (S23 = Bagru S4). |
| Machilipatnam | 7/36 (1/12 stages) | Craftmark (S4: 60 claims, undated, c. 2004) carries the recipes and the decisions. Stages are corroborated by S3 and S15. |
| Sanganeri | 17/40 on S1 (6/13 stages) | S1 is an OCR'd applicant GI. Sanganeri has the most independent support otherwise: 3 V&A records, Jain & Hada, and Husain et al. (abstract only). |

## (c) Comparability analysis

**Depth parity.** Five files fall within 60–72 concepts and 55–79 substantive relationships, and all
meet the FORMAT.md template minima. Ajrakh is the outlier at 80 concepts and 90 relationships, and its
extra depth is mostly S1-only process detail. For an experiment, parity should be enforced by curating
each selected tradition to a common per-category count (digest §2 rule 3). Raw counts should not be
relied on.

**Shared relational structure.**
- **Process chain.** Every tradition has an ordered chain of 9–15 stages. All six share scouring → treatment/printing → dyeing → washing.
- **Mordant–dye–outcome chain.** Five traditions share the causal chain myrobalan (tannin) → iron and alum printed → cure → wash → one red bath → red on alum, black on iron. All five link to the shared tannin, alum-complexation, alizarin-lake and iron-tannin mechanisms. This is the best common skeleton for a reference concept map (digest §7: "mordant, dye, reaction, colour outcome").
- **Dabu is the exception.** Its documented chain is resist → cold indigo → oxidation → wash, repeated. Mordant steps appear only via a Bagru source, and the Akola red is now naphthol.
- **Other shared patterns:**
  - water-siting and water-crisis;
  - designs tied to client communities, in 5 files;
  - imitation by screen printing.

**Distinctive structure** (useful for a comparison zone):
- **Ajrakh:** gach is both resist and mordant; indigo comes between mordant printing and the red bath; lime discharges alum; double-sided printing.
- **Sanganeri:** dabu resist plus a post-dye sun-bleaching (tapai) step that gives a white ground.
- **Bagru:** the same chain as Sanganeri without tapai, leaving an off-white ground.
- **Machilipatnam:** indigo printed directly without a mordant or resist; a pinkish ground; plant additives in the red bath.
- **Bagh:** mordant-only (no resist) with long curing; in the Bagh account the black forms in the bath. That contradicts the Ajrakh account and is the open question shared with the shared science layer.
- **Dabu:** a mud-resist-only system with crackle, and grading of resist strength.

**Source independence.**
- **Bagru and Sanganeri.** Their GI applications share a template and about a third of their method text verbatim (measured: same template; ~34% of the method-of-production text shared verbatim in runs of 8+ words, ~13% of 5-word sequences across the whole documents (content/review/verification.md, V1)). 16 of the 82 comparison links join these two files, and many say "shared GI wording; not independent". Choosing both would test one boilerplate source twice.
- **Bagh.** Bagh's GI text and Asia InCH (S3) share long verbatim passages (verification.md V2; direction of copying not established).
- **Ajrakh.** Ajrakh's GI and Khamir (S7) share one 34-word Dhamadka-river oral-history passage; otherwise <1% overlap (verification.md V3).
- **Dabu.** Dabu S23 is the same article as Bagru S4. Dabu S24 is the same Met essay as shared S10.
- **Kathju & Kashyap 2025** covers both Bagru and Sanganer.

**Evidence quality.**
- Best: Sanganeri (lowest needs_evidence share, scientific effluent data, V&A records) and Machilipatnam (V&A, district government page).
- Then Ajrakh (high-reliability GI and V&A, but heavy single-source dependence) and Bagru.
- Weakest: Bagh (2 high-reliability sources, GI text overlapping Asia InCH) and Dabu (7 low-reliability sources, 26% needs_evidence, no GI registration).

**Comparison zone.** A meaningful zone is possible. comparisons.json links every pair of traditions
(2–16 links per pair). The strongest comparable dimensions are:
- myrobalan pre-treatment;
- iron-liquor recipes;
- the one-bath two-mordant red;
- red-bath plant additives;
- the outcome of clearing the ground (white, cream or pink);
- resist type;
- water claims;
- Khatri versus Chhipa histories.

Every comparison is a curatorial synthesis of separately sourced claims. No source makes the
cross-tradition comparison itself, except Bagru S1 on Sanganer.

## (d) Proposed shortlist (for researcher approval, not a decision)

**Recommended: Ajrakh, Sanganeri, Machilipatnam Kalamkari.**
- **Same causal skeleton.** All three share the myrobalan → alum/iron → alizarin chain and 6–7 shared mechanisms each. Participants can therefore build comparable causal chains, and expert reference maps can share a core.
- **Different variants.** Each varies the chain in a distinct, sourced way: resist-plus-mordant with indigo in the middle (Ajrakh), dabu resist plus a sun-bleaching stage (Sanganeri), and direct indigo printing with a pink ground (Machilipatnam). This gives real cross-tradition contrasts rather than duplicates.
- **Independent sources.** No two of the three share GI text. They span three states and three producer organisations: Khatri, Chhipa, and multi-caste karkhanas.
- **Evidence.** They have the strongest evidence among the candidates: 5–6 high-reliability sources each and 13–22% needs_evidence.
- **Caveats.** Ajrakh must be trimmed to parity and its S1-only stages corroborated. Ajrakh–Machilipatnam has the fewest direct comparison links (3); more cross-links rest on the shared layer.

**Alternative: Ajrakh, Bagh, Bagru.**
- This set has the densest direct comparison zone, with 22 links among the three pairs.
- All three share the one-bath red/black system.
- The Ajrakh–Bagh Sindh Khatri lineage set against the Bagru Chhipas is a clean historical axis.
- Weaknesses:
  - Bagh's evidence is the weakest of the mordant traditions (GI text overlapping Asia InCH, and disputed quantities).
  - Bagru's process rests on GI text shared with Sanganer.

**Not recommended as a core tradition: Dabu.** It is the only resist-only tradition, which is valuable
for contrast, but its evidence is weakest:
- the GI is unregistered;
- Akola has largely moved to tar resist;
- mordant steps are undocumented for Akola;
- its mechanism is needs_evidence.

Keep Dabu as a reserve if the study wants a resist-focused contrast. **Do not pick both Bagru and Sanganeri.**

## (e) Known weaknesses: curator checklist before anything is marked verified

1. **Applicant GI texts.** Ajrakh S1, Bagh S1, Bagru S1 and Sanganeri S1 are interested-party documents and carry most process claims. Corroborate the stages with an independent source or a practitioner.
2. **Contradictions recorded but unresolved:**
   - Ajrakh red/indigo stage order; Ajrakh block count (S1 4–6 vs Frater 3, not yet in the file);
   - Machilipatnam alum-for-red (S13 says no) and copper vs iron vessels, and its iron/alum print order;
   - Bagh shade vs sun drying, dhavda identity, and the harra/bahera conflict (not in the file);
   - Bagru bidhan meaning and the mogri tool;
   - Dabu paste recipe and district (Chittorgarh vs Udaipur).
3. **Iron black chemistry.** Whether the black forms from tannin or in the alizarin bath is unresolved (`shared.open_question.iron-anthraquinone-colour-chemistry`). Reference maps must not encode either as fact.
4. **Analogue science.** The mud-resist and sun-bleaching mechanisms rest on analogues (bentonite on glass, paper bleaching). No physico-chemical study of Dabu or Indian pastes was found. The tannin–Al link is "probable". Keep these mechanisms needs_evidence or label them as analogues.
5. **Water-quality claims** in Bagh, Bagru, Sanganeri and Machilipatnam are untested assertions. Do not let them become causal links.
6. **Stale or partial reads:**
   - Machilipatnam Craftmark is c. 2004.
   - Several sources were read as abstracts only: Ajrakh S12, Sanganeri S11, and the arXiv preprint behind shared S17.
   - Ajrakh's Gazetteer content is known only as quoted in S1.
   - The Bagru S12 monograph is unread.
   - Dabu: two references (Hada & Meena 2022, Mehta et al. 2013) could not be obtained.
7. **Dabu S24 (Met Perspectives)** was read from a cached scratchpad copy because of HTTP 429. Re-fetch it. The same URL was fetched live for shared S10.
8. **Dates and ages** (founding, migration, antiquity) conflict in every file. Treat them as contested context only.
9. **comparisons.json:**
   - All 82 links are syntheses. A domain expert should confirm each, and especially the 12 contrasts.
   - Functional similarities across different plants (tamarisk vs Woodfordia) must not be read as identity.
   - Add `compares` to FORMAT.md, or move it into the importer.
10. **Mechanical BELONGS_TO.** These links (Ajrakh 69, Machilipatnam 66) inflate relationship counts. Exclude them from depth profiles.

## (f) Media licence status

- **Ajrakh (3) and Bagh (4):** Wikimedia Commons, CC BY-SA 4.0. Licences were confirmed in the fact-check.
- **Bagru (4):** licences were not checked in the fact-check.
  - Two images are CC0; one is CC BY-SA 4.0.
  - **"Blockprinting in Bagru – India" (.webm)** is tagged CC BY 3.0 on Commons but originates from a broadcaster/tourism channel (Incredible India). Verify the uploader's right to license it before any use.
- **Dabu (2):** the CC BY-SA 4.0 fabric photo, plus a CC0 photo of *Bagru* village reused to depict an Akola tool. That is a location mismatch; replace it or relabel it. Licences were not re-checked in the log.
- **Machilipatnam (4):**
  - CC BY 3.0 ×2, CC BY-SA 4.0, and a **Met rumal (CC0, via Commons)**. Confirm the Met Open Access status on the Met record itself.
  - One Srikalahasti image is for contrast only.
  - Licences were not re-checked in the log.
- **Sanganeri (9):** licences were not checked in the fact-check.
  - CC BY 4.0, CC BY-SA 4.0 ×7, and one Free Art Licence.
  - Seven are Anokhi/Jaipur images that are **not Sanganer-specific**, and the FAL image's location is unconfirmed.
- **Met content read from cache:** the Met Perspectives essay (Dabu S24) is a text source, not a media item. It was read from cache (see e.7). No Met image was fetched from cache.

No media item has been downloaded or cleared for study use. Every candidate needs licence
confirmation on its file page and an attribution record before publication.
