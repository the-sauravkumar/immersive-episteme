# Fact-check: ajrakh/tradition.json

Date: 2026-10-14. Scope: 191 claims in 80 concepts, 159 relationships (90 of them not BELONGS_TO), 15 sources and 3 media candidates. I checked every claim against the text of the source it cites.

How the sources were re-fetched:
- S1: the GI journal PDF ("1050 - GI - Journal Copy - 19-12-2023.pdf") was downloaded again through the registry's POST `ViewDocument` endpoint and read in full with pdftotext.
- S3–S5: the V&A records were read through the V&A JSON API (api.vam.ac.uk/v2).
- All other pages: fetched with curl and converted to text.

## Sources

| ID | Status | Notes |
|---|---|---|
| S1 GI Journal 188, app. 1050 | ok | Read in full (journal pp. 7–16). Method section order: Saaj → Washing → Kasano → Khariyanu → Kut → Pa → [repeated "rang" madder/alizarin paragraphs] → Gach → Dhori gach → Indigo → Cleaning → Red dyeing → (madder / alizarin / Tapano) → Vichharana → Packaging. Its Dhamadka-river paragraph copies a Khamir oral-history quote (S7), so S1 and S7 are not independent on that point. |
| S2 Registry record 1050 | ok | Status Registered; filed 31-01-2023; classes 24, 25; Journal 188; available 19-12-2023. The certificate-date field is blank, but a "Certificate of Registration – 22-04-2024" document is listed. |
| S3 V&A IS.7:1 to 3-2007 | ok | 2015–16 gallery label: "about 14 stages". The page describes the samples as an educational tool for a "minakari" (double-sided) shawl. |
| S4 V&A 5473A(IS) | ok | Sind, ca. 1855–79. Description has circles, floral medallions and merlons. Label gives the azraq etymology. |
| S5 V&A 8450(IS) | ok | Fatehgarh, c. 1855 (Forbes Watson: "Futtygurh, Bengal"). Red field with circles. |
| S6 Sahapedia (Mushtak Khan) | ok | Author confirmed on the page. |
| S7 Khamir Part 1 | ok | Several quotes cited to S8 are actually on this page (see below). |
| S8 Khamir Part 2 | **misattributed for 6 claims** | The Mohenjo-Daro madder, Partition collapse, "inspired by Brahma/universe", "no figures" and Khavda water/weather passages are on Part 1 (S7). "Some printers serve both" is on Part 3 (S9). All were re-attributed. |
| S9 Khamir Part 3 | ok | |
| S10 Mongabay 2019 | ok | The CETP was still being set up in 2019. |
| S11 Mingei / Frater 2025 | ok | |
| S12 TSA 2016 (Dua) abstract | ok | Abstract only. |
| S13 DNLU SLJ | ok | Not cited by any claim. A note was added. |
| S14 Gaatha shop page | ok (low) | |
| S15 Wikipedia "Ajrak" | ok (low) | |

No source is dead. No reliability rating needed lowering: the low-grade sources were already marked low. All 3 media candidates are on Commons and licensed CC BY-SA 4.0, as stated.

## Claims changed (before → after, reason)

1. **sindh-indus-origins**: "Khamir reports madder-dyed cotton found at a Mohenjo-Daro dyer's workshop" [S7,S8] → "…3000-year-old madder-dyed cotton strands… in Mohenjo-Daro" [S7]. Reason: the passage is not in S8.
2. **dhamadka-centre**: "flowed northwards into the Banni" → "said to flow in the opposite direction, emptying into the Banni rather than flowing south". Reason: S1 never says "northwards". The body also called rangchulis "dyeing places"; it now gives Khamir's meaning, boiling/dyeing pots at the river's edge.
3. **partition-and-trade**: Partition-collapse claim [S7,S8] → [S7]. Reason: the passage is not in S8.
4. **synthetic-dye-shift-and-revival**: "Most block printers now use chemical dyes; some… both" [S9,S8] → reworded to S9's "mid-2010s… serve both… according to demand" [S9].
5. **water-availability**: "A CETP set up through NITRA has an iron filter…" → "In 2019 a CETP was being set up…". Reason: Mongabay says the plant was not yet operating.
6. **soft-water-siting**: "Dyeing methods were the same across Kachchh villages…" [S8] → a Khavda printer's statement [S7]. Reason: wrong page, and the source quotes one village, not all of Kachchh.
7. **cotton-cloth** summary: "mill-bought" → "market-bought". Reason: S1 says "from the market".
8. Local terms with no source were removed: `sajikhar` from neerani (S1 glosses sajikhar as "salt", not as the neerani soda ash), `hirda` (harde), `phitkari` (alum), `gali` (indigo), and `rangchuli` from washing-tanks (Khamir defines rangchuli as boiling pots). The washing-tanks summary was reworded to match.
9. **red-dyeing** → needs_evidence. The "At this stage (rang)…" claim is now attributed to the repeated paragraph that S1 places after pa, not to S1's "Red Dyeing" section. Summary: "simmered… with tamarisk" → "heated with madder roots or alizarin… tamarisk added if colour bleeds". A note was added.
10. **natural-vs-synthetic**: "Some printers work with both…" [S8] → [S9]. Reason: wrong page.
11. **four-colour-cosmology**: universe/evening-sky claim [S8] → an artisan quote on [S7].
12. **geometric-symmetry**: "no figures" claim [S8] → [S7]. In the same concept, "Designs in vogue… (1971 Gazetteer)" → "GI journal's historical section". Reason: the attribution to the Gazetteer is unproven.
13. **border-field-structure**: motif-name claim "(1971 Gazetteer)" → "GI journal's historical section". Reason: the passage mentions the mid-1990s, so it cannot come from the 1971 Gazetteer. A note was added.
14. **neerani-saponification** → needs_evidence, with a note. Reason: only the applicant's GI text supports it, and it gives no chemistry.
15. **Relationship** ENABLES `synthetic-dye-shift → synthetic-alizarin` was reversed to `synthetic-alizarin → synthetic-dye-shift`. Reason: the old direction was the wrong way round; alizarin enabled the shift.
16. **Relationship** USES `vichharnu → washing-tanks` → needs_evidence. Reason: S1 names washing tanks only for the resist-washing stage.
17. Six BELONGS_TO links had their `source_ids` updated to match the claims after the re-attributions above. The source notes for S1, S8 and S13 were updated to record these findings.

Verified unchanged:
- All 3 quotes are verbatim and 25 words or fewer.
- All 13 PRECEDES links (ordinals 1–13) follow the S1 method order.
- The local stage names match S1: saaj, kasano, khariyanu/kiriyana, kut (datla), pa/pah (mavi), gach/guch, dhori gach, kun me burana (fara), rang, tapano, vichharana.
- All SCIENTIFICALLY_EXPLAINED_BY, DEPENDS_ON and REQUIRES links are supported by S1's own explanations: tannin aids mordant adhesion; iron + tannic acid gives black; lime discharges alum; clay and millet resist indigo; sun, moisture and dung bleach whites; warm water may dissolve alum.

## Concepts removed

None. Every concept still has at least one supported claim.

## Relationship padding

69 of the 159 relationships (43%) are BELONGS_TO links from every non-tradition concept to `ajrakh.tradition.kutch-ajrakh`. Their `source_ids` are generated mechanically as the union of each concept's claim sources, so they carry no independent evidence. I kept them, since they are structurally harmless, but anyone comparing relationship counts across traditions should leave them out: the file has 90 substantive relationships.

## Residual risks

- 56 of the 68 process, material and tool claims (82%) rest on S1 alone. S1 is applicant-authored text, contains promotional claims (thermal comfort, "since… many millennia ago") and contradicts itself: black from "ferrous sulfate, molasses, millet flour" versus jaggery + scrap iron + gram flour; tamarisk "galls" versus "flowers"; Dhamadka 50 km from Bhuj versus about 30 km per Gaatha. Its red/indigo order is also ambiguous; this is already an open question.
- S1 duplicates S7 text, and Frater (S11) gives a different block structure: 3 blocks per pattern (rekh plus two fillers) against S1's 4–6 blocks. That conflict is not recorded in the file.
- Gazetteer content is known only as quoted in S1. The Gazetteer annexure on the registry was not read.
- S12 is abstract-only.
- The scientific mechanisms come from the GI's lay explanations; no chemistry source is cited in this file.
