# Fact-check log: dabu (Dabu mud-resist block printing)

- File: `content/traditions/dabu/tradition.json`
- Date: 2026-10-14
- Method: every cited URL was re-fetched (WebFetch, with curl+grep for exact wording). Each claim was compared against the source text. Fixes were applied with a node script that keeps the JSON structure. Nothing is marked `verified`.
- Totals: 164 claims checked across 62 concepts, plus all 80 relationships. 5 claims removed, 10 rewritten, 2 re-sourced (S9 dropped), 12 sourced claims added, 6 relationships changed. 0 concepts removed.

## Sources checked

| ID | Status | Notes |
|---|---|---|
| S1 Gaatha 2013 | ok | Dated 15 Sep 2013, no author. Supports dabaana, paste, Rani Rathorji/Beduch, 200 people, Kishangarh/Udaipur, legend, 8th-c Central Asia specimen, naphthol, tar, motifs, Fetiya, "self sufficient system", "stars in an indigo sky". Does **not** mention *chhapna* (S2 does). |
| S2 Gaatha craft archive | ok | All claims found, including *chhapna*, 14 blocks, phetiya 8–12 m, zigzag border, kadhai-like boilers, cold indigo green→blue, tar fumes, groundwater. Gives both Chittorgarh and Udaipur district. Also explains naphthol/diazo coupling (now used). |
| S3 CRT / Google A&C, Deesa 2009 | ok | Silt, gum, lime, molasses, water; "several days to get the mixture right"; strained; sawdust; sun-dried until hard; dip-dyed; repeated per colour. |
| S4 CRT / Google A&C, Bagru 2009 | ok | Beden dusting; women at home or in karkhanas. |
| S5 GI Registry app. 845 | ok | Udhyam Protsahan Sansthan, 04-03-2022, Class 24, Pre Examination, no certificate. |
| S6 Global InCH ?p=1200 | ok | Places Akola in Udaipur district. Phetia/nangna; lime/mud/sand resists; bedja-gum + oil hot resist with ash. |
| S7 Global InCH ?p=169745 | ok | Bagru; wash/sun-dry; gum, mud, waste wheat chaff; huge tables. |
| S8 Global InCH ?p=177964 | ok | Deesa/Ahmedabad/Jamnagar; mud + baval gum; washed for each new colour. |
| S9 Wikipedia "Dabu printing" | **removed** | Carries a Nov 2025 LLM-content warning. Citations are mismatched: the kali mitti and harda statements cite a nursing self-medication paper. Every claim resting on it alone was removed or re-sourced, and the source entry was deleted. |
| S10 Wikipedia "Akola, Chittorgarh" | ok (low) | Tehsil, district, coordinates and 52 km all match. The alt name "Chhipo ka Akola" is tagged [citation needed]. |
| S11 Penn Museum 88-16-37 | ok | Bagru, mid–late 19th c, "Mud Resist", "Mordant Dyed", kagra, pinkish resist areas. |
| S12 Pratt indigo workshop | ok | Quote verbatim: "the vat is cold and submersion is quick, which prevents the clay from washing off". |
| S13 Pratt clay-resist | ok | Dry completely, puckering, re-dip. Does not mention cracking. |
| S14 Tiedemann & Yang 1995, JAIC 34(3):195–206 | ok | Six-member chelate rings with aluminium; lakes resist extraction. |
| S15 Deccan Chronicle 2018 (Ramdev) | ok | 26 Oct 2018. Does not use "chuna" (says calcium hydroxide) and does not contain *dabaana* (not cited for it). The 2009 group was founded by Alka Sharma. Notes corrected. |
| S16 Kaisori 2020 | ok (low) | All attributed claims found, including "Hada", 200-year legacy and soil-brown/neela. |
| S17 Enroute Indian History 2023 | ok (low), 2 misreads | Recipes, dry-pond clay, muslin/mardia, block woods, secret recipes and cracking all found. **Not found:** "freshly prepared before every printing" and "gond added to strengthen". |
| S18 Bindu Gopal Rao 2019 | ok | Step order matches the PRECEDES chain (mud prep → wash → fast-dye print → resist + sawdust → sun → dye → dry → wash → repeat). Spelling is "Dabana". Veining, silk/crepe/georgette and table types all found. Does **not** say "before independence". |
| S19 Utsavpedia 2017 | ok (low) | Origin, 675 AD, process order, double/triple dabu, decline before independence, distinct from Bagru/Sanganeri. |
| S20 AIACA Craft Katha | ok | Undated (footer 2025). "Khatris", "fermented mud paste", "Light crackle effect visible in resist areas", GI 2023 claim. |
| S21 Maiwa | ok (low), wording | Says "a cold-water resist" and separately "mud-resist". The community-pattern sentence is not explicitly tied to Jaipur/Bagru. Claim reworded. |
| S22 PeepulTree / Live History India 2024 | ok (low) | 6 Nov 2024. Chuna, gond, clay; sawdust; double/triple; 8th century. |
| **S23 (new)** fibre2fashion, S. Raj (~2012) | added, low | Bagru article PDF, text extracted with pdftotext. Cow-dung/soda-ash/sesame-oil scouring; harda tannin mordants the iron black; alum-water fix of dabu cloth; dabu recipe and the Kaligar/Dolidar/Gawarbali types. |
| **S24 (new)** Met Perspectives, Y. Rosenfield 2016 | added, high | Dabu is "the most common resist used for indigo today", and crack lines form where dye penetrated cracks in the resist. Its dung and harde passages concern Ajrakh, not Dabu, so it is not used for those. Note: direct fetches returned HTTP 429. The text was read from a copy of the same URL saved earlier in this session's scratchpad (title confirmed). Re-fetch when the rate limit clears. |

Sources not reachable: the Springer chapter Hada & Meena 2022 (behind auth) and Mehta et al. 2013 (ZENITH). These are the references Wikipedia gave for dung scouring and alum/iron mordants.

## Claims changed

| Concept | Before | After | Reason |
|---|---|---|---|
| tradition | Akola origin {S19,S9} | {S19} | S9 removed |
| historical_context.akola-cluster | Rani Rathorji "a few hundred years ago" {S1,S2} | "hundreds of years ago" | S2 wording; S1 gives no date. Added a note that "Chhipo ka Akola" is [citation needed]. |
| historical_context.decline-and-revival | nearly died out before independence… later revived {S19,S18} | split: S19 = before independence/machine prints; S18 = designer says revived | S18 gives no date |
| material.mud-black-clay | black clay (kali mitti) {S9,S17,S20} | {S17,S20,S23} | S9 removed; S23 corroborates black clay |
| material.natural-gum-gond | gond added "to strengthen the kalidar paste" | gond solution added in kalidar recipe | Purpose not in S17 |
| material.myrobalan-and-mordants | harda + alum/iron mordants for alizarin reds and iron-harda blacks {S9} | two Bagru-specific S23 claims (harda tannin mordants iron black; alum rinse fixes dabu cloth); kept needs_evidence | Claim rested only on AI-flagged Wikipedia |
| process_stage.fabric-washing | 24 h dung soak {S9} | Bagru dung/soda ash/sesame oil scour {S23} + note | Wikipedia-only claim |
| process_stage.paste-preparation | "freshly prepared before every printing" {S17} | removed; added S23 "mashed, left overnight, strained" | Not in S17 |
| artisan_decision.paste-consistency | same "fresh" claim; summary said "made fresh" | removed; summary corrected | Not in S17 |
| artisan_decision.number-of-dips-and-cycles | "with dyeing in different colours" {S18} | "done more than once to achieve the desired colour and effect" | S18 wording |
| design_principle.community-specific-patterns | "Around Jaipur/Bagru…" {S21} | Maiwa: patterns tied to weaves of set width and length by community | Location not stated as such |
| outcome.crackle-veining | "seep… giving an attractive look" {S17}; "uneven cracks and veined patterns" {S18} | "Dyes may enter where the mud cracks"; "uneven cracks; veining a highlight"; + S24 crack-line claim | Wording |
| scientific_mechanism.crack-dye-penetration | as above | same rewrites + S24; body updated | Wording |
| comparison.mud-resist-vs-wax-and-direct-print | "Dabu employs mud resist whereas batik uses wax" {S9} | removed; concept retitled "Dabu versus Bagru and Sanganeri direct prints" | Wikipedia-only |
| open_question.paste-recipe | "Beden… is the dusting powder, not a paste ingredient" {S4} | "At Bagru beden is used as the dusting powder"; + S23 lists bedhan as a paste ingredient | S4 does not say "not a paste ingredient" |
| scientific_mechanism.naphthol-red-development | body said chemistry undocumented | added S2 claim on naphthol + diazotized salt coupling | S2 does document it |

Also: removed the unsourced local term "pathiya" (printing table); corrected "raakh" to "rakh" (S2 spelling); added S23 corroboration to wheat-chaff and paste-variants; added S2 zigzag-border claim (it was in the summary but uncited); added S24 claim to the clay-resist/indigo mechanism.

Relationships: R50 (fabric-washing USES harda) {S9}→{S23}, needs_evidence, Bagru condition. R64 (→alum-mordant-complexation) {S9,S14}→{S23,S14}. R65 (→iron-tannin-black) {S9}→{S23}. R74 (CONTRASTS_WITH) {S9,S19}→{S19}. S24 added to R53 (mud ENABLES crackle) and R68. All CAUSES/PRECEDES/DEPENDS_ON/REQUIRES/SCIENTIFICALLY_EXPLAINED_BY links re-read. R73 CAUSES (tar → hazards) is directly stated in S2. PRECEDES order matches S18 and S19.

## Concepts removed
None. Every concept still has at least one supported claim.

## Residual risks
- The harda/alum/iron and dung-scouring material is documented only for **Bagru**, by a low-reliability trade-portal article (S23). Nothing ties it to Akola. Hada & Meena (2022) and Mehta et al. (2013) should be obtained.
- Much of the Akola detail rests on two Gaatha pages (S1, S2) that are partly the same text, plus low-reliability blogs (S16, S17, S19, S22) that largely echo S1.
- S2's process describes the **tar** resist, not mud. The generalised mud PRECEDES chain is assembled from S3 (Deesa), S18 and S19.
- The district is contested: Chittorgarh (S2, S10) vs Udaipur (S6, S2 intro, S15 "near Udaipur").
- The S24 text was read from a scratchpad copy because the site returned 429. Re-fetch to confirm.
- All antiquity claims (8th c, 675 AD, 500 yr, 200 yr) are unreferenced assertions. They are kept only as contested context.
