# First-hand verification log

Claims in the dataset reports that were checked directly — source documents
downloaded and measured — rather than taken from agent summaries. Each entry
gives the method so the result can be reproduced.

Overlap tool: `content/review/tools/text-overlap.py A.txt B.txt` (lower-cased
word tokens; n-word shingle overlap). Long shared runs were found with Python
`difflib.SequenceMatcher(autojunk=False)` over the same tokens.
PDF text: `pdftotext -layout` (poppler). HTML text: tags and scripts stripped.

## V1. "Bagru and Sanganeri GI texts are nearly identical" — OVERSTATED, corrected

Documents (both fetched 2026-10-14, browser user-agent required):
- Sanganeri statement of case: https://www.origin-gi.com/wp-content/uploads/2017/01/102-sanganeri-hand-block-printing.pdf
  sha256 `3fcd0bfc38871cfadf524dc0ace1b133730db81bf4a5e74dea258f6bcdc290f0`, 6,939 words
- Bagru statement of case: https://origin-gi.com/wp-content/uploads/2017/01/129-bagru-hand-block-print.pdf
  sha256 `e63d8ebafe1c3fae3d3d9c04486ec7d10ff15dc78c0f6a4a37a41155af93c569`, 6,357 words

Results:
- Whole documents: 13.2% / 14.3% of 5-word sequences shared; 3.0% / 3.3% of 12-word sequences.
- 40 shared runs of ≥ 12 words (643 words). All lie in the method-of-production
  sections (section 9 onward; both use the heading "9.2 Details on each step of
  production process"). Within that span about 34% of each document's words sit in
  shared runs of ≥ 8 words. Shared passages cover bleaching, indigo dyeing,
  washing, block tools and alizarin.

Conclusion: the two applications share a template and about a third of their
method text verbatim. They are not independent on process detail, but "nearly
identical" was wrong. Reports corrected.

## V2. "Bagh's GI reproduces Asia InCH verbatim" — SUPPORTED (direction not established)

Documents:
- GI Journal No. 75, Bagh Prints (logo), application 505, pp. 6–18 (Wayback copy):
  https://web.archive.org/web/20160204105330/http://ipindia.nic.in/girindia/journal/Journal_75.pdf (5,375 words, pp. 6–18)
- Asia InCH, "Hand Block Printing of Bagh, Madhya Pradesh": https://asiainch.org/craft/hand-block-printing-of-bagh-madhya-pradesh/

Results: 42.5% of the GI section's 8-word sequences occur in the Asia InCH page.
42 shared runs of ≥ 12 words total 1,956 words (36% of the GI section); the longest
is 176 words (bhatti and washing).

Conclusion: long verbatim overlap is proven. Which text copied the other is
not shown by the texts themselves, so reports now say "share passages" rather than "copies".

## V3. "Ajrakh's GI copies Khamir on Dhamadka" — SUPPORTED, narrowly

Documents:
- GI Journal copy, application 1050 (IP India registry, POST /GIRPublicSearch/Application/ViewDocument,
  DocumentPath "1050/1050 - GI - Journal Copy - 19-12-2023.pdf"), 5,702 words
- Khamir, "Ajrakh exhibition, Part 1: The Khatris and their community": https://exhibitions-khamir.org/ajrakh/khatris-community

Results: one shared run of 34 words (the Dhamadka-river oral-history passage);
otherwise 0.7% of 5-word sequences are shared.

Conclusion: the claim is limited to that passage and is accurate. Apart from it,
the two sources are independent.

## V4. Dataset statistics recomputed from the files

Computed directly from `content/traditions/*/tradition.json`. Per-concept share of
`needs_evidence`: Sanganeri 12.5%, Ajrakh 15.0%, Bagru 15.4%, Bagh 16.7%,
Machilipatnam Kalamkari 22.4%, Dabu 25.8%. These match the content-dataset.md table.
Counted over concepts plus relationships, the order differs (Ajrakh 9.2% lowest)
because Ajrakh's 69 and Kalamkari's 66 mechanical BELONGS_TO links are all
`under_review`. Substantive relationships (BELONGS_TO-to-tradition excluded):
Sanganeri 79, Bagru 73, Ajrakh 90, Bagh 55, Dabu 58, Kalamkari 67.

## V5. Source archive

All 105 cited URLs were downloaded on 2026-10-14 (browser user-agent, decompression
on) and converted to text (`tools/extract-text.py`). Hashes are in
`source-manifest.tsv`. Special routes:
- Ajrakh S1 (registry page) also carries the GI journal text, fetched through the
  registry's POST `ViewDocument` form.
- arXiv 1412.2842: the abstract page plus the full PDF.
- doi:10.3906/muh-1310-8: the DOI returns 404. The paper was confirmed through Crossref
  (Turk. J. Eng. Environ. Sci. 37:272-285, 2013; Husain, Husain, Arif), and its
  abstract was taken from OpenAlex. Full text not reached.
- iisjoa.org: the site's TLS certificate has expired, so the PDF was fetched without
  certificate checking and its hash recorded.

The source copies are kept outside the repository because of copyright; only the
manifest and hashes are committed.

## V6. Claim-level check: all 1,252 claims

Method: `tools/match-claims.py` finds, for every claim, the best 3-sentence window in
its cited sources by content-word overlap.

| Band | Claims | How it was verified |
|---|---|---|
| weak (< 0.4) | 46 | each read against its source by hand, with targeted searches |
| partial (0.4–0.7) | 411 | each read against its source by hand, with targeted searches |
| strong (≥ 0.7) | 795 | every number checked against the source text (121/125 pass; 4 explained below); random sample of 60 read by hand (seed 20261014): 60/60 supported |

Quotes: 37 claims carry quotes. 30 match verbatim. The other 7 match word for word
once punctuation and OCR noise are ignored (longest matching run 12–19 of 13–21 words).

### Corrections (`tools/fix-batch1.js`, `fix-batch2.js`, `fix-revert.js`)

| Concept / claim | Problem | Fix |
|---|---|---|
| comparisons mordant-systems #4 | "scrap iron" over-generalised | names the source's iron form per tradition |
| comparisons mordant-systems #5 | wrong for Machilipatnam: black forms before the alizarin bath (Craftmark) | split by tradition |
| bagh master-artisans #1 | "the family" trained villagers; source says "the Khatris" | reattributed |
| bagh river-water-effect #1 | documenter's speculation presented as the artisan's | reattributed |
| bagh river-water-chemistry #2 | same misattribution | reattributed |
| bagru historical-records #3 | "ghagra" should use the museum's own term | quotes "for Kagra" |
| bagru tool.wooden-block #0 | block names not all in the cited GI | GI names rekh/dotu; S6 added for gudh/rekh/datta |
| bagru comparison #1 | "or fawn" in neither source | removed |
| ajrakh water-availability #0 | "use 1 lakh L/day"; the source gives a recycling requirement | reworded |
| dabu water-pollution #1 (+ summary) and comparisons water-dependence #5 | "water use is high" not stated | reworded to the source's call for water reuse |
| shared mud-resist-barrier #3, #4 | findings cited by the paper, not its own | "citing earlier studies" |
| sanganeri 18th-century-records #3 | Watt "1903"; both sources say 1902-03 | corrected |

Reverted: two Dabu "riverbank mud" edits. S15 does quote the Aavaran founder: "We
collect mud from the riverbank". The first search showed only 4 of its 12 matches.

The 4 numeric-check exceptions, each confirmed as supported: "100" is written "one
hundred"; "19th-c." is ca. 1855-1879; "17th" is "mid-seventeenth"; Watt's date is
corrected above.

## V7. Learner-facing prose made claims-only

There were 1,482 summary/body sentences. About 1,028 said more than their concept's
claims, and only 104 of those matched a cited source strongly. All 441 concepts now
build `summary`/`body_md` from their own claims (`tools/claims-only-prose.js`). The
earlier prose is archived for curators in `prose-archive.json`. A backup of the
pre-change files is kept outside the repository.

## V8. Relationship check (704 → 696)

Method: `tools/match-rels.py` matches each relationship's explanation and conditions
against its cited sources. Each relationship was then checked as follows:

| Group | Count | How it was verified |
|---|---|---|
| BELONGS_TO the tradition node | 175 | Structural: the concept sits in that tradition's file. No source claim is involved. |
| CAUSES | 4 | Read by hand; all 4 have direct source support. |
| PRECEDES | 68 | Compared with each source's step order: GI step lists for Sanganeri, Bagru, Ajrakh and Bagh, Craftmark's detailed sections for Kalamkari, S18 for Dabu. |
| SCIENTIFICALLY_EXPLAINED_BY | 64 | Each stage's checked claims name what the mechanism explains (40), or the tradition-specific mechanism matches the stage; 3 non-obvious Ajrakh links confirmed in the GI text. |
| No checked claim mentions both ends, no strong source match | 100 | Read by hand with targeted source searches. |
| A checked claim mentions both ends, or the explanation matches the source strongly | 291 | Stratified sample of 40 read by hand (seed 20261015, weighted to directional types): 40/40 supported, 1 overreach fixed. |

### Corrections (`tools/fix-batch3.js`, `fix-batch4.js`)

- Dabu: the source gives no order between "prepare paste" and "wash cloth". That
  PRECEDES link became "resist printing REQUIRES paste preparation", and the cloth
  chain was renumbered in S18's order.
- Bagru step 5 renamed from "dhulai" to "khulai". The GI step list uses Khulai for
  the mordant wash and Dhulai for the final wash.
- Kalamkari: the iron-before-alum PRECEDES link now states Craftmark's internal
  contradiction (numbered list against its printing section).
- Sanganeri: alizarin dyeing PRODUCES white ground. The explanation now says the
  white comes from tapai.
- Removed 8 relationships that no source states. 7 of them already described
  themselves as inferences: rheology ENABLES alum complexation; 2 cross-file
  SIMILAR_TO links; Ajrakh final wash USES tanks; Bagh black SIMILAR_TO iron-tannin
  black; Sanganeri fine florals REQUIRES fine blocks; ageing ENABLES a print visible
  on the reverse. The 8th was Kalamkari pen-to-block shift AFFECTED_BY chintz trade.
  Each is archived with its reason in `removed-relationships.json`.
- Kept: Sanganeri "migration and Jaipur patronage ENABLES printing". Its hedge comes
  from the source itself ("presumably").

## V9. Integrity warnings fixed (24 → 0)

Checked with `scripts/content/validate.ts` (rules in `docs/architecture/knowledge-graph-validation.md`).
Fixes are in `tools/fix-batch5.js`. Every new link or concept restates claims already checked against sources.

- **KG108** (4 comparisons compared nothing). Filled `compares` from each concept's own claims:
  - Ajrakh: Kutch / Barmer / Sindh.
  - Bagru: Bagru / Sanganeri.
  - Dabu: compared with Bagru and Sanganeri. Retitled, because no claim mentioned wax or direct printing.
  - Kalamkari: added a Srikalahasti concept from four source-checked statements (S7 freehand pen and Hindu
    mythology; S13 bamboo-and-cotton pens; S13 river Swarnamukhi; S6 Baloja caste). "Mostly temple cloths"
    was left out because no cited source states it.
- **KG316** (Sanganeri block carving). The ENABLES link (researcher interpretation) became
  "mordant printing REQUIRES block carving", citing S1 (printing by stamping wooden hand blocks) and
  S10 (the carving sequence).
- **KG700** (Bagh bichalna SIMILAR_TO Kalamkari degumming). Removed the causal wording; the facts are unchanged.
- **KG800** (18 orphans). Each is linked to what its own claims are about: open questions BELONGS_TO the
  topic they question; Bagh khara karna USES base fabric; Bagru printing AFFECTED_BY semi-arid seasonality
  (S6: monsoon halts work). Rejected while checking: Bagh over-dyeing USES secondary dyes (over-dyeing
  uses harara, alum and iron sulphate).

Result: 0 errors, 0 warnings, 131 info (KG801 +16: concepts linked only by BELONGS_TO).

## V10. Spatial-compiler warnings fixed; image dimensions added

- **Image aspect (15 warnings).** Added `width`, `height`, `mime` and `dimensions_source` to all
  26 `media_candidates`, from the Wikimedia Commons API (`prop=imageinfo`, batched; recorded
  in each entry). Added the fields to `formatMediaCandidateSchema`, documented them in FORMAT.md,
  and passed them through the spatial content adapter. Measured on the compiled manifest for
  Ajrakh + Sanganeri + Machilipatnam: 15/15 image planes carry the source aspect, and 0 differ
  from it by more than 0.5%. Of 16 images, all appear in the manifest's asset references; one
  concept (sanganeri.tool.printing-table-and-pad) has two images and its wall plane shows the first.
- **Unnumbered Ajrakh history links (2 warnings).** Sindh origins → migration and Dhamadka
  centre → 2001 earthquake now carry ordinal 1, as separate two-step chronologies.
- **Validator rule KG310/KG311 corrected.** It had required unique ordinals per *file*, which
  wrongly rejected independent chains. It now checks each connected chain. Regression
  tests added: a second chain restarting at 1 passes; a gap inside a second chain is still KG311.
- **CLIs** (`validate`, `build-snapshot`, `compile-content`) now reject unknown arguments, so a
  typo can't silently fall back to defaults.

Result: content 0 errors, 0 warnings. Compiler validation passed with 0 warnings
(manifest `sha256:381aad76…`). 746/746 tests, typecheck and lint pass.

## Not yet verified first-hand

- Media-candidate licences.
- Source `title`/`author`/`year` fields beyond the ones touched above.
