# Fact-check log: machilipatnam-kalamkari

- File: `content/traditions/machilipatnam-kalamkari/tradition.json`
- Date: 2026-10-14
- Method: all 16 cited URLs were re-fetched. The PDFs (Craftmark, Ghosh, IJTK) were downloaded and extracted with pdftotext. Quotes were checked verbatim with curl+grep. Fixes were applied with a node script. Nothing is marked `verified`.
- Totals: 171 claims checked across 67 concepts, plus all 133 relationships. 10 claims rewritten, 8 sourced claims added (corroboration), 0 removed. 8 relationships changed (PRECEDES sources added, one set to needs_evidence). 0 concepts removed.

## Sources checked

| ID | Status | Notes |
|---|---|---|
| S1 GI Registry app. 90 | ok | Applicant VHKPA, Pedana (Brahmapuram Railway Gate); filed 16-04-2007; classes 24, 25, 27; Supplementary 1 (24-03-2008); cert. 71 dated 10-07-2008; valid to 15-04-2027; Registered. |
| S2 SpicyIP 2013 | ok | Author added (Aparajita Lath, 25 Aug 2013). GI area, AU/396/GI/19/12, freehand or block, recipes and stages in registration. |
| S3 Krishna district ODOP | ok | 13 km; two styles; Mughal/Golconda; GI 2013; karkhanas; products; 7-step process (alkaline scour → myrobalan 30–45 min → black outline → alum red → dry 1 day → flowing-water wash → mordants). |
| S4 Craftmark PDF | ok, undated, unattributed | Every attributed claim was found in the extracted text. Its 11-stage list differs in order from its narrated process; the narrated order is used. Captions show the background printed with alum and the outline/stem-fill with iron. Prices are given "as per August 2004". |
| S5 Asia InCH | ok, title corrected | Actual title "Hand Block – Printing/ Kalamkari of Machilipatnam, Andhra Pradesh". The wax-resist/indigo/kalam passage is a general kalamkari description. Claims were reworded to say so. |
| S6 Ghosh 2018, Chitrolekha | ok | Golconda patronage, 1924, 1952, Sethna, chintz/sitz/pintado, Balojas, teak blocks, iron/jaggery black, GI 2013 all found. The technique section is generic kalamkari. "Unripe fruit" and "synthetic blue" appear in the Kalahasti paragraph. |
| S7 IJTK 23(7) 2024 | ok, **reliability downgraded high → medium** | Machilipatnam is only a background passage citing web sources. |
| S8 V&A IS.1765-1883 | ok | 1879; Persian inscription naming Sayyid Muhammad Mahdi; "printed imitation"; MMS shipping letters; burnished. |
| S9 V&A 657-1890 | ok | "printed by Iranian craftsmen in Masulipatam, Madras, India for the Iranian market". |
| S10 V&A IS.121-1950 | ok | Alum = red, iron = black; indigo needs no mordant → wax resist; green = yellow over indigo. |
| S11 V&A IM.50-1919 | ok | Imports to Britain/Netherlands; "favourable combination of chemicals in the local soil, water and dye-plants". |
| S12 V&A blog 2015 (Reddy) | ok | Author field corrected (guest author Renuka Reddy, posted by A. Fotheringham). Milk-fat quote verbatim; chay/madder statement found. |
| S13 Sahapedia, Sengupta | ok | All three quotes verbatim (Kalia Canal, gaja, "alum solution is not used here for the red colour"). |
| S14 Sahapedia interview | ok | Quote verbatim; cross-section, serigraphy, rangrez, Mangalagiri, "can't be done in a day or two". |
| S15 The News Minute 2018 | ok | 24 Jul 2018. Buried mud jar for 21 days, GI "in 2012", pollution of ponds and canals, Collector notices all confirmed. Step order matches S4. |
| S16 Wikipedia "Pedana kalamkari" | ok (low) | No maintenance banner. Supports only the alt name "Machilipatnam style". |

No dead or misattributed URLs. Metadata errors were fixed: S2 author, S5 title, S12 author.

## Claims changed

| Concept | Before | After | Reason |
|---|---|---|---|
| historical_context.golconda-masulipatnam-port | S13 "trading textiles for clothing, prayer mats…" | "textiles were meant for clothes, prayer mats, bedspreads, tapestries and hangings" | S13 gives these as uses, not as trade goods |
| material.alizarin-and-red-roots | chay/madder stated as fact {S12} | attributed to practitioner | Practitioner blog |
| material.indigo (×2) | "Indigo dye is no longer used" {S6}; "applied after wax resist in the Andhra block-printing process" {S5} | both marked as general kalamkari accounts | Neither source is Pedana-specific |
| material.beeswax-resist | wax applied with kalam {S5} | marked as general description | Same reason |
| material.rice-starch | "Starch is applied for a second colour layer" {S15} | "starch applied for stiffness, followed by a second colour layer and alum" | S15 wording |
| tool.teak-printing-blocks | "very detailed and elaborate designs carved by specialist artisans" {S5} | "blocks used are made by specialist artisans" | Overstated |
| tool.date-palm-brush-and-kalam | kalam of iron loop {S5} | marked as general description | Context |
| design_principle.persian-floral-motifs | "border patterns frame a repetitive floral field" | "border patterns and a repetitive floral field displaced the early designs" | S5 wording |
| design_principle.black-outline-colour-fill | "Kasim outlines while alum fills it out; outline, stem-fill, background in sequence" {S4} | captions: background in alum, outline and stem-fill in iron; text: background first, then outline and motifs | Misread of S4 (stem-fill is iron, and the order was reversed) |
| process_stage.mordant-printing-kasim (body) | "iron reacts with tannin to give black immediately" | "immediately" dropped | Not in S4 |
| open_question.myrobalan-part-and-milk-step | — | note: Ghosh's unripe-fruit remark concerns Kalahasti | Context |

## Process-stage corroboration (S4 = Craftmark)

| # | Stage | Sources | Single-sourced? |
|---|---|---|---|
| 1 | block-carving | S4, S3, S13 | no |
| 2 | scouring-dung-bleaching | S4, S3 (alkaline boil instead), S15, S6 | no |
| 3 | myrobalan-treatment | S4, S3, S15, S5, S6 | no |
| 4 | mordant-printing-kasim | S4, S3, + S5 added | no |
| 5 | mordant-printing-karam | S4, S3, + S5 added (S13 contradicts) | no, but contested |
| 6 | curing-drying | S4, S3, + S6 added | no |
| 7 | degumming-wash | S4, S3, + S15 added | no |
| 8 | alizarin-boiling | S4, S6, + S15, S5 added | no |
| 9 | post-dye-sun-drying | S4 only | **yes**, set to needs_evidence |
| 10 | second-printing | S4, + S15, S5 added | no |
| 11 | alum-fixing-dip | S4, S15 | no |
| 12 | soaping-finishing | S4, S15 | no |

Other single-S4 content: the kasim recipe quantities, alum boiling ratio, printing-pad tray, workbench dimensions, date-palm brush, bath-additive colour table, pink ground, and the artisan decisions print-order-by-background, boiling-time-for-shade and avoid-iron-with-alum.

PRECEDES order matches S4's narrated sequence and is consistent with S3 (stages 2–7) and S15 (2–3, 7–8, 10–12). Corroborating source IDs were added to 8 PRECEDES links. The kasim→karam link was set to needs_evidence because S4 contradicts itself ("iron precedes alum" vs "background [alum] first").

Other relationships: R120 CAUSES (screen-printed imitation → effluent pollution) is directly supported by S15 ("Washing of screen-printed Kalamkari in the ponds is polluting the water"). DEPENDS_ON (R90, R94), REQUIRES (R100–R102) and all SCIENTIFICALLY_EXPLAINED_BY links are supported by S4, with S6/S10 where cited. All shared.* keys resolve.

## Concepts removed
None.

## Residual risks
- Process depth depends heavily on the undated, unattributed Craftmark PDF (c. 2004, drawing on Varadarajan 1982 and a Census volume). It may describe practice from 20+ years ago. The district page (S3) already describes alkaline scouring rather than dung.
- Alum for red is contested (S13 says it is not used at Machilipatnam), as are copper vs iron vessels.
- S6, S5 and S12 are partly generic kalamkari or Coromandel-chintz sources, applied to Pedana by inference.
- The GI date conflict (2008 registry vs 2012/2013 secondary) is kept as an open question. The registry is authoritative.
