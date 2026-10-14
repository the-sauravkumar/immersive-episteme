# Fact-check log: shared/craft-science.json

Date: 2026-10-14. Adversarial review of the shared craft-science file. All 14 original sources were re-fetched. PDFs were downloaded and text-extracted with pdftotext, and HTML pages were fetched and stripped. Every claim was checked against the fetched text. Nothing is marked `verified`.

## Scope and outcome

- **Claims checked:** 77 original claims, 25 relationships and 6 quotes.
- **Claims changed:** 11 claim texts reworded to match their sources.
- **Claims added:** 13 new claims, from three new sources.
- **Claims removed:** none.
- **Totals now:** 90 claims, 25 relationships, 17 sources.
- **Concept keys:** no key was renamed or deleted. All 7 `shared.scientific_mechanism.*` keys used by tradition files resolve. Validation passed: JSON parses, every `source_id` resolves, every relationship endpoint resolves, every source is used, and every quote is verbatim and 25 words or fewer.

## Sources: re-fetch results

| ID | Re-fetched | Bibliographic check | Issues found and fixed |
|---|---|---|---|
| S1 Tiedemann & Yang 1995, JAIC 34(3):195-206 | yes | correct | The acid-extraction mechanism is hedged ("probably") in the source but was stated as fact. Hedged now. The study is on hair (protein) fibres. |
| S2 Wertz 2017, Glasgow PhD | yes (197 MB PDF) | correct | The 27Al six-fold coordination was measured on *oiled-and-alumed* calico and replica Turkey red, not generic "re-created cotton dyeings". Reworded. |
| S3 Redzic et al. 2024, Science for Conservation 63 | yes | correct | The "iron-catalysed ... weak and brittle" sentence is introduction text citing earlier work, not a result of this study. The study measured pH (4.08 vs 6.85) but had **no aged undyed tensile control**, so on its own it cannot isolate the iron as the cause of strength loss. Notes corrected. |
| S4 Aino et al. 2018, Front. Microbiol. 9:2196 | yes | correct | Verified: pH > 10.3-10.5 with lime hydrate, sodium dithionite, brief air oxidation. |
| S5 Botteri, Miljković, Glogar 2022, Molecules 27:4547 | yes | author diacritic fixed | "Tannin-rich extract behaved as a mordant" is the authors' interpretation, not a measurement. Reworded. Pomegranate peel tannin content is 28%. |
| S6 Mojsov 2014, IJMIE 4(1) | yes | correct | Reliability medium is appropriate. |
| S7 Akter et al. 2023, Heliyon 9:e14175 | yes | correct | Quote verbatim. |
| S8 Salem, Thompson, Uttamlal 2022, Herit. Sci. 10:195 | yes | correct | Supports bleaching damage only. It does not study sunlight. |
| S9 Wang et al. 2024, Molecules 29:5547 | yes | correct | Sun-drying degradation refers to drying the *fruit*, not the cloth. Clarified. |
| S10 Rosenfield 2016, Met Perspectives | yes (15 Nov 2016) | **misattributed role**: "(Associate Conservator)" does not appear on the page | Role removed. The iron-acetate purple and fibre loss refer to the **13th-14th-c. Met fragment**, not a generic "Indian block print". Claims reworded. |
| S11 V&A T.1-1920 process samples | yes (V&A API) | correct (made c.1919, acquired 1920) | Verified: chay gives red with alum and black with iron, wax resist, washed and bleached between colours. |
| S12 Raman, Winterthur "Charting Chintz" | yes | year approximate (page shows 2020-2026) | Reconstruction follows the Beaulieu manuscript (French, 18th c.). Verified: sun lamps substituted for sunlight, and the page calls sunlight a fixed constraint of bleaching. |
| S13 Mitra 1992, Down To Earth | yes (15 Dec 1992) | correct | "Iron acetate for large black areas" refers specifically to **contemporary Masulipatnam**. Reworded. |
| S14 Craft Revival Trust 2009, Google Arts & Culture | yes | correct | Archive caption, so `kind` changed practitioner_testimony → historical_documentation. |

No source was dead. One author role was misattributed (S10).

## New sources (each fetched before adding)

- **S15** Schaeffer, Baker, Blyth-Hill & van der Reyden 1992. "Effects of Aqueous Light Bleaching on the Subsequent Aging of Paper". JAIC 31(3):289-311. Gives the light-bleaching mechanism: a chromophore absorbs light, forms a peroxide or radical, and is oxidised to a colourless product. The method can use sunlight. This is paper, not cotton, so it is used as an analogue only.
- **S16** Wilson, Carr & Hacke 2012. "Production and validation of model iron-tannate dyed textiles…". Chemistry Central Journal 6:44. The study has **undyed controls**: dyed cotton lost tensile strength faster than undyed cotton. It gives surface pH 2.65-3.91 for dyed cloth against 5.36-7.46 for undyed, and attributes the damage to acid hydrolysis and metal-catalysed oxidation. It also explains the iron(III)-tannate colour as Fe(III)-O charge transfer, and states that cellulose binds tannic acid and metal ions.
- **S17** Khatun, Dutta & Tarafdar 2014. arXiv:1412.2842, published in EPJ E 2015, doi 10.1140/epje/i2015-15083-6. I fetched the arXiv preprint; the published version was not read. It covers desiccation cracking of clay films: a critical cracking thickness, and crack spacing of about the film thickness. This is a physical analogue for Dabu crackle, measured on bentonite on glass.

Searches for a physico-chemical study of **Dabu or clay resist pastes**, such as mineralogy, XRD or porosity, found **nothing**: only craft, retail and kit pages. That gap remains open.

## Mechanism-by-mechanism verdict

| Mechanism | Key problems found | Change | State | Confidence |
|---|---|---|---|---|
| Al³⁺ mordant complexation | "Tannin plays a similar bridging role in Indian practice" was unsourced. NMR context was misstated. | Reframed as an inference. Turkey red and oil context made explicit. | under_review | Medium. The Al-cellulose anchoring is unresolved. |
| Alizarin lake | Summary implied an iron-alizarin "lake" as fact. Acid-extraction step was not hedged. | Iron colour moved to unresolved. Hedges added. | under_review | Medium-high for the Al-Ca lake; low for the iron colour. |
| Fe-tannin black + iron rot (CAUSES) | The CAUSES link rested on S3, which lacks an undyed tensile control. "Measured tensile loss" was over-attributed to S3. | Added S16 with undyed controls. Explanation rewritten. Conditions note the iron salt + tannic acid model and accelerated ageing. CAUSES kept. | under_review | High for the chemistry; medium for transfer to iron acetate and myrobalan. |
| Indigo reduction / leuco form | "Repeated dips deepen the shade" was unsourced. | Removed from the body and the outcome. | under_review | High. Indian-vat specifics are undocumented. |
| Tannin-metal binding (pre-mordanting) | "Behaved as a mordant" overstated S5. | Hedged. Added cellulose-tannin and metal binding from S16. | under_review | Medium. Wertz says "probably". No study of myrobalan on cotton. |
| Mud resist | "Wheat waste" ingredient was unsourced. | Removed. Added a clay-cracking analogue (S17) and stated the gap. | **needs_evidence** (kept) | Low-medium. Descriptive only. |
| Sun bleaching | No mechanism source. | Added S15 (light-bleaching photochemistry, paper analogue) and the S12 sunlight-constraint claim. | **needs_evidence** (kept) | Low-medium. Analogy only. |
| Rheology analogy | "Stays put afterwards" overclaimed thixotropic recovery. "Mordant pastes include gums" was unsourced. | Both removed. The rheology → alum ENABLES link set to needs_evidence. | under_review | Medium, as an analogy only. |

## Other edits

- Removed unsourced `local_terms`. Neither this file nor its sources gives any of these: phitkari, kasim, syahi, neel, nil, dabu mitti, harda, hirda, gond, chuna, mitti, manjistha, surangi, kadukai. Kept: Al, munjeet, chay, harde, dabu. Tradition files may re-add terms with their own sources.
- File summary updated to flag analogue-based mechanisms.
