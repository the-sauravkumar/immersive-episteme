# Fact-check: bagru/tradition.json

Date: 2026-10-14. Scope: 175 claims in 65 concepts, 78 relationships and 13 sources. I checked every claim against the source it cites. Source texts were re-fetched as follows:
- GI dossier, Kathju & Kashyap and Raj: text extracted with pdftotext.
- Gaatha: fetched with both curl and WebFetch.
- All other web pages: WebFetch.

## Sources

| ID | Status | Notes |
|---|---|---|
| S1 GI dossier (origin-gi.com 129-…pdf) | ok | Supports all S1 claims. Its step list has 11 steps and no Tapai. |
| S2 IP India record 183 | ok | Filed 10-08-2009; Journal 37; Cert. 150 dated 11-05-2011; valid to 09-08-2029. |
| S3 Kathju & Kashyap 2025 | reliability overstated | Downgraded from high to medium: the PDF does not say whether the journal is peer reviewed, and the note claiming "Peer-reviewed" was removed. Content ok: 17 units; 94% not used; industrial park; GI 2011. The host's TLS certificate has expired. |
| S4 Raj 2012 (fibre2fashion) | ok | Note corrected: the author's affiliation is not stated, so "design-institute author" was removed. |
| S5 Gaatha Bagru | ok | |
| S6 The Kind Craft | misattributed title/notes | The real title is "Profile: Bagru Textiles' Indian Blockprints" (3 Apr 2017). The page does not describe interviews with a family, so the note was fixed. |
| S7 Kaisori (19 Mar 2021) | partly misattributed | The page has **no** syahi fermentation timing and **no** mention of a cream or ochre ground. See the claims below. |
| S8 Wikipedia "Bagru print" | ok (low) | Says "In 2024… granted GI"; also "over 400 years". |
| S9 Museums of India, Titanwala | ok | The publisher is the Sahapedia platform; the publisher field was corrected. |
| S10 Penn Museum 88-16-37 | ok | Record says "Kagra", purple ground with small red flowers, block about 8 × 10 cm. |
| S11 Global InCH listing | ok | The publisher name was corrected to "International Journal of Living Heritage". Page dated Sept 2019. |
| S12 Global InCH bibliography | ok (record only) | The record page shows only J.P. Mohanty as author. It cannot support content claims. |
| S13 Commons file (Honolulu 3967.1) | ok | CC0. |

No source is dead.

## Claims changed (before → after, reason)

1. **tradition C3**
   - Before: "Syahi-Begar … combining red, black and a cream/ochre ground" [S1, S7].
   - After: "Traditional Bagru prints are two-colour, red and black, on an off-white ground; a retailer blog describes this Bagru style as Syahi-Begar."
   - Reason: S7 does not mention cream or ochre.
2. **design_principle.red-black-palette C1** [S7]
   - Before: "combine red, black and yellow ochre or cream".
   - After: "Syahi-begar prints use black (syahi) and red (begar)."
   - Reason: same as item 1.
3. **outcome.syahi-begar-print C1** [S7]
   - Changed the same way as item 2.
4. **chhipa-community C0**
   - Removed S12 from source_ids. The bibliographic record does not contain the migration content, which is quoted only in S1.
5. **tool.wooden-block C2 and body**
   - Removed "to soften/season the grain". Gaatha gives only the 10-15 day oil soak.
6. **tool.indigo-vat C2**
   - Before: "Natural indigo is fermented in a V-shaped pit called a naand".
   - After: "A V-shaped well dug in the ground, called a 'naand', is used for dyeing."
   - Reason: Gaatha's wording.
   - Also added a note that Gaatha uses 'maat' for a clay container for synthetic indigo.
7. **historical-records body**
   - Before: "export demand revived activity".
   - After: the village "was busy supplying the export trade".
   - Reason: "revived" overstates what the Mohanty quote in S1 says.

## Claims removed

- **environmental_condition.semi-arid-seasonality C3**: "Syahi takes about 15-20 days to ferment in summer but around six weeks in winter" [S7]. The claim is not in S7, and no other source has it.

## Partly supported → needs_evidence (with a note added)

- **material.dabu-paste**: sources conflict over what 'bidhan' means. S1 uses it for lime, S4 for a natural gum ('Bedhan'), and S6 for wheat powder. The body was changed so it no longer equates bidhan with insect-spoiled wheat.
- **tool.mogri-mallet**: the GI dossier's 'mogri' is a mallet, but Gaatha's 'mogari' is a cylindrical roller that is beaten with a 'kotan'.

## Relationships

- **Removed:** `semi-arid-seasonality AFFECTED_BY syahi-iron-black` [S7], which was supported only by the claim removed above.
- **CAUSES without direct evidence:** `final-washing CAUSES groundwater-and-effluent` was changed to `groundwater-and-effluent AFFECTED_BY final-washing` and set to needs_evidence. No source measures final-washing effluent as the cause.
- **Reversed directions** (the earlier file had the source and target swapped):
  - now `red-black-palette AFFECTED_BY community-clientele`
  - now `tradition AFFECTED_BY market-change-and-imitation`
  - now `tradition AFFECTED_BY groundwater-and-effluent`
- **Set to needs_evidence:**
  - `peela-karna-harda ENABLES off-white-ground`. S5 says the harda tint washes out, which contradicts S4.
  - `hari-sarana-scouring SCIENTIFICALLY_EXPLAINED_BY shared…sun-bleaching`. This is an inference: the source describes the practice, not the mechanism.
- **Checked:** PRECEDES ordinals 1–10 match the GI step order: Hari Sarana → Peela Karna → Chapai → Sukhai → Khulai → Rangai → Dhabu Datai → Neel Rangai → Haldi Naspal Putai → Fitkari Rangai → Dhulai.

## Other edits

- Added 'khulai', the GI step-list name, to the local_terms of dhulai-mordant-wash.

## Quotes

All three quotes are verbatim and 25 words or fewer:
- S5: Namdeo descent
- S6: drips
- S6: water table

## Concepts removed

None.

## Validation

- The JSON parses.
- All 77 relationship keys resolve, within the file or in `shared/craft-science.json`.
- All source_ids exist.
- Nothing is marked `verified`.

## Residual risks

- S1 is an OCR'd applicant document. Its methods text is almost word-for-word the same as the Sanganeri GI text, so stages and mechanisms rest on one boilerplate source and are not independently confirmed.
- Block-name conventions conflict: S7 swaps datta and rekh. The open question about this remains.
- S4 has internal confusions: "Sawai Madhopur (Alwar)", and it says the river name lends its name to "Sanganeri".
- S12 (the Mohanty & Mohanty monograph) is still unread.
- The age figures (300, 400, 450 or 470 years) remain unresolved.
- I did not check the media_candidates licences. One of them, the Incredible India video, already carries a warning to verify.
