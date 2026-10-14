# Fact-check: sanganeri/tradition.json

Date: 2026-10-14. Scope: 197 claims in 72 concepts, 90 relationships and 15 sources. I checked every claim against the source it cites. Source texts were re-fetched as follows:
- GI PDF, IP India list, Jain & Hada and Kathju & Kashyap: text extracted with pdftotext.
- V&A records: read through api.vam.ac.uk.
- Husain et al.: abstract read through OpenAlex.
- Impart and Gaatha: fetched with curl (WebFetch got a 403 from Impart).
- All other web pages: WebFetch.

## Sources

| ID | Status | Notes |
|---|---|---|
| S1 GI statement of case (origin-gi.com PDF) | ok | The scanned text layer is readable. It supports all S1 claims, including the order of the 12 steps. |
| S2 IP India GI list | ok | S.No. 119, App. 147, listed under "FROM APRIL 2009 - MARCH 2010". |
| S3 NABARD | ok | Gives the GI year as 2009 and says "almost 500 years". |
| S4 Kathju & Kashyap 2025 | ok, with caveat | N=32 Sanganer; 50% aware; 96.9% not used. The host's TLS certificate has expired. The PDF does not say whether the journal is peer reviewed (reliability stays medium). |
| S5 V&A O77745 | ok | Teak blocks; Pethapur; indigo, madder, turmeric green; Mughal offset rows; Great Exhibition 1851. |
| S6 V&A O147901 | ok | Red and green on white; Jaipur royal patronage; chhapas or buntis. |
| S7 V&A O481223 (IS.517-1883) | ok | The 1883 register text matches. |
| S8 Gaatha "Syahi Begar" (30 Apr 2015) | misattributed kind | Was `practitioner_testimony`, changed to `researcher_interpretation`. It is an unsigned narrative article by an organisation, not testimony. Its content supports the claims. |
| S9 Impart "Sanganeri" (21 Apr 2022) | ok | WebFetch got a 403, so I fetched it with curl. All claims are supported. |
| S10 Jain & Hada 2012 (fibre2fashion PDF) | ok | |
| S11 Husain et al. 2013, DOI 10.3906/muh-1310-8 | ok (abstract only) | |
| S12 India Water Portal (Bhaduri, 2015) | ok | |
| S13 Incredible India | ok (low) | Rana Sanga; "river Saraswati" radiance; GI 2010. |
| S14 AIACA Craftkatha | ok (low) | Notes corrected: the page says "natural and azo-free dyes", not "azo-free pigments". |
| S15 Wikipedia "Sanganer" | ok (low) | Coordinates and GI 2010 confirmed. |

No source is dead.

## Claims changed (before → after, reason)

1. **founding-of-sanganer C0**
   - Before: "founded by the Kachhwaha prince Sangaji, son of Prithviraj of Amber" [S1, S8].
   - After: the Sangaji and early-16th-century part stays on S1 and S8; the "son of Prithviraj" detail is now attributed to the GI application only.
   - Reason: S8 does not name Prithviraj.
2. **open_question.founder-of-sanganer C0**
   - Before: cited [S1, S8].
   - After: cites [S1] only, plus a new separate claim for what S8 actually says (Sangaji, Kachhwaha, early 16th c.).
   - Reason: same as item 1.
3. **material.cotton-mulmul C2**
   - Before: "Mulmul cotton was historically preferred and silk reserved for royalty…"
   - After: "a decade before the 2012 study mostly mulmul cotton was used and silk only for royalty…"
   - Reason: S10 says "before a decade", not "historically".
4. **outcome.print-visible-on-reverse**
   - Before: the summary said "Because dye is fixed through the fibre…", and the body said Jain & Hada credit "precise block impressions on fine cloth".
   - After: the summary now says this is a GI specification, and the body credits the precision of the block impressions only.
   - Reason: no source gives the fibre-fixation reason, and S10 does not link the effect to fine cloth.
5. **open_question.origin-date C0**
   - Before: "No record of Sanganer printing exists before 1703".
   - After: "No record of a Sanganer printing unit is traced before the early 18th century (earliest cited: dastur-al-amal 1703)…"
   - Reason: S10 does not mention 1703. I also added a note that S10 itself concludes printing existed much earlier.

## Relationships

- **Removed:** `material.cotton-mulmul ENABLES outcome.print-visible-on-reverse` [S10]. S10 does not link mulmul to visibility on the reverse.
- **Set to needs_evidence:**
  - `process_stage.ageing ENABLES outcome.print-visible-on-reverse`. This is an inferred link, which its own condition already admitted.
  - `design_principle.fine-floral-on-white REQUIRES tool.bunta-wooden-block`. This is also inferred; I added a condition saying so.
- **Checked:** PRECEDES ordinals 1–11 match the GI's step order: Hari Sarana → Peela Karna → Chapai → Sukhai → Khulai → Rangai → Tapai → Dhabu Datai → Neel Rangai → Haldi Naspal Putai → Fitkari Rangai → Dhulai.
- **Checked:** The only CAUSES link is `screen-printing-shift CAUSES gi-registration`. It is directly supported: S1 says "Fake (screen printed) Sanganeri Textiles… Therefore, this application is submitted".

## Quotes

Both quotes are verbatim (allowing for OCR) and 25 words or fewer:
- S1 "…by using a Stamp or Wooden Block's and no other device."
- S1 "There is no written recipe with the indigo dyer…"

## Concepts removed

None. Every concept still has at least one supported claim.

## Validation

- The JSON parses.
- All 89 relationship keys resolve, either within the file or in `shared/craft-science.json`.
- All source_ids exist.
- Nothing is marked `verified`.

## Residual risks

- S1 is a scanned, OCR'd applicant document. Its local terms are garbled, for example 'tonbri' versus 'tamda' and 'Dhatsi' versus 'Khulai'.
- Much of the process section rests on S1 alone. S1 is an interested party, and it shares a template and about a third of its method text verbatim with the Bagru GI dossier (see verification.md, V1), so the two are not independent corroboration.
- For S11, only the abstract has been read.
- S1 calls step 1 'Hari Sarana', which is the same term as Bagru. The file uses Gaatha's 'teluni', which is correctly attributed to S8.
- Small taxonomic spellings were not normalised: S1 writes "Rubia tinctoria", and the file uses "Rubia tinctorum".
- I did not check the media_candidates licences.
