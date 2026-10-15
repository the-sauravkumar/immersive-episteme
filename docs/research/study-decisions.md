# Study decisions

Decisions on the open study parameters the concept note leaves to the researchers. The project
lead asked the build team to "TAKE the best decisions possible after you have thorougly
researched for all". Each decision below states what was decided, the evidence for it and the
risks. The researchers can still override any of them before preregistration. Where a
decision departs from the concept note (CN), the departure is flagged.

Every quotation was checked word for word on the stated page of an archived copy of the source
(`verify_quotes.py`; docs/research/citation-policy.md). The verifier was re-run by the lead,
and the key quotes were re-found in the PDFs with `pdftotext`. Results: primary metric 45/45,
instruments 69/69, design 56/56. Power figures marked *derived* are our own calculations, not
statements by any paper (scipy 1.18.1, exact noncentral t; script
`docs/research/tools/ancova_power.py`).

Sources that could not be accessed are not quoted. Where we rely on them, we say so and mark
the claim *secondary*. They are Borm et al. 2007, Wu 2020, Coban 2022, McClure et al. 1999,
Ruiz-Primo & Shavelson 1996, Ifenthaler 2010, Makransky et al. 2017 (Multimodal Presence
Scale), Andersen & Makransky 2021 (*JCAL* scale paper), Lewis 2013, Paas 1992,
Kennedy et al. 1993 (SSQ), Schubert et al. 2001 and Brooke 1996.

## Team, affiliations and ethics approval

**Authors, in citation order** (as supplied by the project lead):

1. Saurav Kumar¹
2. Ankit Kumar¹
3. Priyadarshi Patnaik¹ ²

**Affiliations:**

1. Centre of Excellence for Unified AI-Enabled Craft Ecosystem Platform, Indian Institute of
   Technology Kharagpur, Kharagpur, West Bengal 721302, India
2. Department of Humanities and Social Sciences, Indian Institute of Technology Kharagpur,
   Kharagpur, West Bengal 721302, India

**Contact email:** cxa.craftecosystem@gmail.com

**Ethics approval** (as stated by the project lead):

- **Approving body:** Centre of Excellence for Unified AI-Enabled Craft Ecosystem Platform
- **Approval number:** CXA/ETH/01

**Provenance of these details:**

- Professor Patnaik's details come from his IIT Kharagpur faculty page
  (https://www.iitkgp.ac.in/department/HS/faculty/hs-bapi), which gives:
  - the name "Priyadarshi Patnaik";
  - the designation "Professor";
  - the department "Humanities and Social Sciences";
  - the responsibility "Chairperson, Centre of Excellence for Unified AI-Enabled Craft
    Ecosystem Platform";
  - the address "Kharagpur, Kharagpur, India - 721302", in West Bengal.
- Saurav Kumar and Ankit Kumar each have a profile page on the Centre's site:
  - https://aicraft.iitkgp.ac.in/people/saurav-kumar
  - https://aicraft.iitkgp.ac.in/people/ankit-kumar

  Both list the role "Researcher" and the affiliation "Centre of Excellence for Unified
  AI-Enabled Craft Ecosystem Platform at IIT Kharagpur". Ankit Kumar's page also gives his
  ORCID: 0009-0009-1282-0309.
- The personal emails and phone numbers on these pages are not used. The single contact
  address above is the one participants see.

These values are shown on the About page (team, affiliations, ethics, how to cite) and in the
participant information. They are read from `src/config/institution.ts`.

## Summary

| # | Decision | Status vs CN |
|---|---|---|
| D1 | Traditions: Ajrakh, Sanganeri, Machilipatnam Kalamkari; Bagh in reserve | CN names none |
| D2 | Primary outcome: expert-map coverage (`cmap.recall.dl`) on the post-test map, ANCOVA with the pre-test score as covariate | One of the CN §9, P99 measures; "number of valid relations" demoted to secondary (flagged) |
| D3 | Design: between-group, randomised after the pre-test, stratified by pre-test band | CN default (§8, P94); CN's within-participant alternative (P95) rejected |
| D4 | Sample: 51 analysable per group (recruit 56 per group); 20 per group only as a declared estimation study | Departs from CN §8, P93–P94 (~20 per group) |
| D5 | Learning phase: 30 min, fixed and equal, no early finish; 5–10 min content-free familiarisation first; study scope ≤ 4,500 words of claim text | CN gives no duration |
| D6 | Guidance: hybrid, identical in both pathways, not manipulated; every use logged | CN leaves open (§3, P54–P56) |
| D7 | Instruments: Leppink-family cognitive-load scale (14 items), SUS, MPS physical presence (3D only), SSQ before and after learning | CN asks for "a short UX/cognitive-load questionnaire" (§8, P94) |
| D8 | Order: load, sickness and presence ratings immediately after learning; SUS at the end | Partly departs from CN §8, P94 order (flagged) |
| D9 | Content sign-off: two independent domain experts per tradition; no self-verification; adjudication by a third | Implements CN's verified-content requirement |

## D1. Traditions

**Decision.** The study uses **Ajrakh, Sanganeri and Machilipatnam Kalamkari**, with **Bagh**
in reserve. Bagru and Dabu are excluded from the study. All six remain in the platform.

**Evidence (our dataset; `docs/research/content-dataset.md` §d, `content/review/verification.md`).**

| | Ajrakh | Sanganeri | Machilipatnam | Bagru | Dabu |
|---|---|---|---|---|---|
| Concepts | 80 | 72 | 68 | | |
| Claim words | 3,300 | 3,595 | 2,978 | | |
| Claims resting only on low-reliability sources | 5 | 4 | 0 | 22 | 28 |
| `needs_evidence` share | 15.0% | 12.5% | 22.1% | | 25.8% |

- **Same causal skeleton, different variants.** All three share the myrobalan → alum/iron →
  alizarin chain, so expert reference maps share a core and concept-map scores are comparable.
  Each varies the chain in a distinct, sourced way, which gives real contrasts for the
  comparison layer.
- **Bagru excluded.** Its GI application shares a template with Sanganeri's, and about 34% of
  the method text is verbatim the same (§V1). Showing both would teach one text twice.
- **Dabu excluded.** It has the highest unsupported share (25.8%) and 28 claims that rest only
  on low-reliability sources, and no registered GI text to anchor it.

**Risks.** Ajrakh–Machilipatnam have the fewest direct comparison links (3). Ajrakh must be
trimmed to word parity in the study scope (D5).

## D2. Primary outcome

**Decision.** The primary outcome is expert-map coverage on the post-learning concept map. The
literature calls it the "convergence" score; in our library it is `cmap.recall.dl`:

> matches to *expected* edges of the adjudicated reference map (direction and relation type
> must match) ÷ the number of expected edges.

- The denominator is the same for every participant and occasion. Optional edges are neutral,
  and out-of-scope edges are excluded.
- The analysis is an ANCOVA of the post score with the pre score as covariate.
- Synonym rules and the optional-edge list are frozen in the preregistration before data
  collection.

**Secondary outcomes,** in this order:
1. `cmap.recall.du`, a sensitivity analysis that ignores relation type.
2. `cmap.precision.dl`, with the number of edges drawn and the incorrect count by class, which
   guards against over-linking.
3. `cmap.f1.dl`.
4. `cmap.cross_category.valid_normalised`.
5. The raw valid-relation count, reported only for comparability with CN §9, P99.

Causal-chain depth, edit distance, Jaccard and degree-profile similarity stay exploratory.

**Evidence.**
- **Reliability and validity of convergence.** Ruiz-Primo (2000), *Revista Electrónica de
  Investigación Educativa* 2(1), p. 48 (PDF p. 20): "The convergence score -the proportion of
  valid propositions in the students' map out of the possible propositions in the criterion
  map-seems to better reflect systematic differences in students' connected understanding and
  it is the most effort and time efficient indicator." Same paper, p. 47 (PDF p. 19): "(the
  interrater reliability on convergence score averaged across studies is .96)".
- **Distribution.** Ruiz-Primo, Schultz, Li & Shavelson (1998), CSE Technical Report 492,
  p. 15 (PDF p. 17): "All types of scores, except proposition accuracy and convergence, showed
  negatively skewed distributions". Same report, p. 16 (PDF p. 18): "we conclude that the
  convergence score is the most efficient."
- **Why not a raw count.** Yin, Vanides, Ruiz-Primo, Ayala & Shavelson (2004), CSE Report 624:
  - p. 25 (PDF p. 27): "students might reach the same score in different ways, which a total
    accuracy score cannot differentiate."
  - p. 25 (PDF p. 27): "The second possible solution is to score only "key" propositions."
  - Task format alone changed map size, p. 16 (PDF p. 18): "The average number of propositions
    constructed in the C condition (10.2) was significantly greater than that in S condition
    (7.6)".
- **Why a fixed concept set.** Ruiz-Primo (2000), p. 42 (PDF p. 14): "Convergence score was not
  available for the "No Concepts" condition because no criterion could be established to
  determine the expected number of propositions." The fixed concept set of CN §9, P98 is what
  makes convergence definable.

**Relation to CN.** CN §9, P99: "Possible measures include number of valid relations, incorrect
relations, depth of causal chains, structural similarity to an expert reference map, and
increase in cross-category relationships." Expert-map coverage is a form of the listed
"structural similarity to an expert reference map". Of the listed measures, "number of valid
relations" conflicts with this choice: a raw count grows with map size, so it confounds
understanding with how many links a participant draws. It is therefore kept as a secondary,
comparability measure only.

**Risks.**
- **Over-linking.** Report edges drawn per condition.
- **Reference-map validity.** Ruiz-Primo (2000) p. 39 (PDF p. 11) describes a reference built
  from "relations that appear in at least 80% of the participants' concept maps"; our consensus
  builder's threshold must be set in the preregistration.
- **Retest effect.** Yin et al. (2004) p. 13 (PDF p. 15): "the CC group's mean score increased
  by 2.93 points (p < .05) and the SS group's mean score increased by 2.64 points (p < .05)"
  with no instruction in between. Only the between-group comparison of change is valid.
- **Floor and ceiling** with few expected edges: check in the pilot.

## D3. Design and allocation

**Decision.**
- **Between-group design.** Each participant uses one pathway.
- **Allocation after the pre-test.** Participants are allocated *after* the prior-knowledge
  pre-test, so the pre-test is taken blind to condition.
- **Randomisation.** Seeded permuted blocks of 4, stratified by pre-test band: at or below vs
  above the pilot median of the pre-test `cmap.recall.dl`.
- **Within-participant alternative rejected.** The counterbalanced within-participant design
  (CN §8, P95) is rejected.

**Evidence.**
- **Asymmetric carry-over.** Krokos, Plaisant & Varshney (2019), *Virtual Reality* 23(1),
  PDF p. 9: "When users went from a desktop to a HMD, their performance generally improved.
  However, when the users went from a HMD to a desktop, their performance surprisingly
  decreased." Their first sessions did not differ (PDF p. 9: "not significantly different with
  p = 0.62 > 0.05").
- **A learned strategy cannot be unlearned.** Yang et al. (2021), *IEEE TVCG* 27(12), PDF p. 3:
  "learned a strategy, they cannot "unlearn" it." The spatial organisation is exactly the
  strategy that would carry over.
- **Counterbalancing does not fix it.** Brooks (2012), *Psychological Methods* 17(4), PDF
  pp. 26–27: "Counterbalancing, whether with the sequences proposed here or with other methods,"
  … "will not be able to remove this effect." and "it may be better to use a between-subjects
  or mixed design."
- **Our data.** The traditions are unmatched (D1), and the fixed concept set is shared, so a
  second session's pre-test would not be naive.

**Implementation change.** The study engine currently allocates at enrolment. The step order
becomes consent → pre-test → allocation → device check → familiarisation → learning. Stratified
allocation then reads the stratum from the scored pre-test instead of a researcher-entered field.

## D4. Sample size

**Decision.**
- **Target.** Plan **51 analysable participants per group** (102), to detect d = 0.45 with 80%
  power in an ANCOVA assuming a pre–post correlation ρ = 0.6. Recruit **56 per group** to allow
  for about 10% exclusions (device failures, incomplete sessions).
- **If recruitment is capped at the CN's ~40.** The study is preregistered as an estimation
  study. It reports effect sizes with confidence intervals, and states that it is powered only
  for d ≥ 0.73 (ρ = 0.6).

**Evidence.**
- **Effect-size benchmark.** Zhou, Chen & Wang (2022), *Educational Research Review* 36, p. 11
  (PDF p. 11): "The weighted mean effect size for academic achievement synthesized from 13
  studies was 0.45 (95% CI [0.00, 0.89], k = 13),".
- **ANCOVA gain.** Clifton, Birks & Clifton (2019), *Contemporary Clinical Trials
  Communications* 13, p. 3 (PDF p. 3): "This relationship indicates a variance deflation factor
  (1 - r2) that can be used for sample size calculation." The original derivation (Borm et al.
  2007) is cited there and was not accessible (*secondary*).
- **Plausible ρ.** Yin et al. (2004) report a concept-map score stability of ".766 (n = 49)"
  over 7 weeks (p. 15, PDF p. 17), with "no content-relevant instructional intervention" in
  between (p. 12, PDF p. 14). A pre–post correlation *with* learning in between is expected to
  be lower, hence the planning value of 0.6.

*Derived* (`ancova_power.py`, α = .05 two-sided):

| d | t-test n/group | ANCOVA ρ = .5 | ρ = .6 | ρ = .7 |
|---|---|---|---|---|
| 0.45 | 79 | 60 | **51** | 41 |
| 0.60 | 45 | 34 | 29 | 24 |
| 0.80 | 26 | 20 | 17 | 14 |

- **Power at 20 per group, d = 0.45:** t-test 0.284; ANCOVA 0.360, 0.410 and 0.492 at
  ρ = 0.5, 0.6 and 0.7.
- **Minimum detectable d at 20 per group:** 0.79, 0.73 and 0.65 at ρ = 0.5, 0.6 and 0.7.

**Departure from CN.** CN §8, P93: "Target sample: approximately 40 participants." CN §8, P94:
"approximately 20 participants to each pathway." That is underpowered for the benchmark effect
(DR-016). The pilot (CN §11) estimates ρ, and the plan is recomputed with it before the main
study.

## D5. Learning-phase duration and study scope

**Decision.**
- **Duration.** **30 minutes**, enforced by the server clock, identical in both conditions, with
  no early finish (`exposure.minutes = 30`, `allowEarlyFinish = false`). Time on task is held
  constant, as DR-015 requires.
- **Familiarisation first.** 5–10 minutes of content-free familiarisation with the controls and
  layout of the assigned pathway. It is not counted as learning time and shows no craft content.
- **Study scope.** The learning content is limited to **≤ 4,500 words of claim text**. It is
  selected by rule, not by writing anything new:
  - it includes every concept in the fixed reconstruction concept set and every concept that a
    post-test or transfer item depends on, with the process chains linking them;
  - it is balanced across the three traditions within ±10% of words.

  The scope is the same snapshot scope in both conditions (DR-007), and the list is frozen when
  the assessment items are written. Exposure coverage (the share of in-scope concepts actually
  shown) is reported per condition as a descriptive variable.

**Evidence.**
- **Reading load.** The three traditions hold 9,873 words of claim text (our dataset). Brysbaert
  (2019), *Journal of Memory and Language* 109, p. 1 (PDF p. 1): "the average silent reading
  rate for adults in English is 238 words per minute (wpm) for non-fiction". Reading the whole
  set would take about 41 minutes, with no time for navigation. p. 19 (PDF p. 19): "Reading
  speed in second-language (L2) speakers is considerably slower than in first-language (L1)
  speakers." 4,500 words take about 19 minutes at 238 wpm, which leaves room for navigation,
  re-reading and slower readers.
- **Comparable studies.** Hamilton et al. (2021), *Journal of Computers in Education* 8(1), p. 15
  (PDF p. 15): "the exposure duration was also typically short, ranging from 6 to 30 mins." Same
  page: "lasting on average 13 mins". Yang et al. (2021), PDF p. 5: "participant had up to 30
  minutes for this session."
- **Familiarisation.** Hamilton et al. (2021) p. 23 (PDF p. 23): "participants require extended
  familiarisation trials or free navigation before the start of experimental studies".
- **Sickness.** Saredakis et al. (2020), *Frontiers in Human Neuroscience* 14, p. 12 (PDF p. 12):
  "Both nausea and disorientation SSQ subscale scores in studies for exposure times of <10 min
  were lower than those that were equal to or >10 min." That review covers head-mounted
  displays. For a desktop setup, Martirosov et al. (2022), *Virtual Reality* 26(1), p. 15
  (PDF p. 1), found the "significant increase in nausea score … in semi-immersive group
  (p=0.0018) and fully immersive group (p<0.0001)", not in the PC group. No accessible source
  covers desktop sessions of 30 minutes, so the pilot checks it (D7, SSQ).

## D6. Guidance

**Decision.** Guidance is a **hybrid, identical in both pathways, and not manipulated**:
- **Always-on structural signalling:** 2D section headings and process timeline; 3D zone signage
  and the process path.
- **An on-demand hint** the participant can open.
- **A stall cue** shown when no new concept has been exposed for a set time. The threshold is a
  pilot parameter, provisionally 120 s.

Every hint and cue is logged (`guidance_used`).

**Evidence.**
- Alfieri et al. (2011), *Journal of Educational Psychology* 103(1), p. 1 (PDF p. 1): "unassisted
  discovery does not benefit learners, whereas feedback, worked examples, scaffolding, and
  elicited explanations do."
- Kirschner, Sweller & Clark (2006), *Educational Psychologist* 41(2), p. 75 (PDF p. 2): "The
  advantage of guidance begins to recede only when learners have sufficiently high prior
  knowledge to provide "internal" guidance." Our participants are novices in the craft.
- Poupard et al. (2025), *BJET* 56(1), PDF p. 16: "Most studies reporting a negative effect
  involved novice participants".
- De Bruyne et al. (2026), *Computers & Education* 246, PDF p. 13: "signaling time manipulations
  influence procedural learning but do not show effects on factual or conceptual knowledge."
  Our outcomes are conceptual, so guidance timing is not worth a second experimental factor.
  Their cue delays were task-specific (PDF p. 14: "the range of 14-22 seconds was determined
  pragmatically, based on pilot data and prior task observations"), so our threshold must come
  from our pilot.

**CN characterisations checked.**
- **Han et al. 2023 (CN §3, P36–P38): partly supported.** Signalling reduced cognitive load for
  low-prior-knowledge learners but did not improve learning (p. 08, PDF p. 8: "there was no
  significant difference between the presence of signaling and the interaction effect …"), with
  cells of n = 10 (p. 05, PDF p. 5).
- **De Bruyne et al. (CN §3, P54–P56): partly supported.** The benefit was procedural only.

## D7. Instruments

**Decision.**
- **(a) Cognitive load: a 14-item scale in the Leppink family, for both groups.**
  - Intrinsic load: 3 items in the MCLS-POL wording (Andersen & Makransky 2021, CC BY).
  - Extraneous load from instructions: 3 items (Leppink et al. 2013, items 4–6).
  - Extraneous load from the interface: Andersen & Makransky's 4 interaction and 4 environment
    items, worded as Petersen et al. (2022) print them (CC BY).
  - "Simulation" and "virtual environment" are replaced with one neutral term, the same in both
    conditions. One response format is used throughout, and germane load is not measured.
  - Fallback if the interface items cannot be confirmed against the original: Klepsch,
    Schmitz & Seufert (2017), CC BY, 7-point.
- **(b) Usability:** the SUS (10 items, 5-point), with "awkward" in place of "cumbersome".
- **(c) Presence:** the MPS physical-presence subscale (5 items), **3D group only**, analysed
  within that group.
- **(d) Simulator sickness:** the SSQ before and after learning in both groups, as a safety
  screen and covariate; total score only.

**Evidence.**
- **Leppink scale.** Leppink et al. (2013), *Behavior Research Methods* 45, p. 1061 (PDF p. 4):
  "Cronbach's alpha values of .81 for Items 1, 2, and 3 (expected to measure IL); .75 for
  Items 4, 5, and 6 (expected to measure EL)". p. 1060 (PDF p. 3): "Items 4, 5, and 6 all deal
  with negative characteristics of instructions and explanations". These items cover
  instructions only, not the interface, hence the added interaction and environment items.
- **Interface items.** Andersen & Makransky (2021, MCLS-POL), p. 2 (PDF p. 2), *secondary*:
  "the EL dimension should be split into three subscales measuring distinct forms of EL in
  virtual reality environments." Petersen, Petkakis & Makransky (2022), *Computers & Education*
  179, p. 14 (PDF p. 14), prints the items, e.g. "The interaction technique used in the
  simulation was very unclear." p. 15 (PDF p. 15): "all items used in this study, except
  knowledge items, were measured on a five-point Likert scale."
- **SUS.** Bangor, Kortum & Miller (2009) p. 115 (PDF p. 2): "the SUS was highly reliable
  (alpha = 0.91)". Brooke (2013), *Journal of Usability Studies* 8(2), p. 35 (PDF p. 7):
  "non-native English speakers had trouble understanding one of the statements in SUS that used
  the word "cumbersome" (if replaced with "awkward," this generally clarified the item)". Our
  participants are likely L2 English readers.
- **Presence items.** Petersen et al. (2022) p. 14 (PDF p. 14) prints the physical-presence
  items, e.g. "The virtual environment seemed real to me." Every item names the virtual
  environment, so they have no meaning in the 2D condition.
- **SSQ.** Eudave et al. (2025) p. 9 (PDF p. 9): "we identified a key limitation in the reduced
  reliability of both tools when applied in Desktop conditions". The SSQ is therefore a screen
  and covariate, not an outcome.
- **SSQ scoring.** The total is scored as published: Kennedy, Lane, Berbaum & Lilienthal (1993),
  *International Journal of Aviation Psychology* 3(3), p. 212 (PDF p. 11): the TS score is
  obtained by "summing all the weighted totals and applying the TS conversion formula". In their
  Table 4 each symptom carries unit weights on the Nausea, Oculomotor and Disorientation
  columns, and TS = ([1] + [2] + [3]) × 3.74. The weight matrix and the formula were read from
  the rendered page image, because the scan's OCR text scrambles the table's columns.

**Rejected.**
- **NASA-TLX.** It measures "workload" (Hart 2006, p. 904, PDF p. 1), not a source-attributed
  load.
- **Paas (1992).** Single item, inaccessible. Leppink et al. 2013 p. 1062 (PDF p. 5): it "has
  relatively weak loadings on all three factors".
- **UMUX-LITE.** Kept as the backup if the battery proves too long. Schrepp & Kollmorgen (2023)
  p. 99 (PDF p. 14): "the 10 detailed questions of the SUS provide more information about
  potential problems than the two items of the UMUX-LITE."
- **UEQ-S.** Its hedonic half would reward novelty (p. 99, PDF p. 14: "UEQ-S measures pragmatic
  and hedonic quality and both qualities are equally weighted").
- **A partial IPQ.** The igroup IPQ page, PDF p. 3: "we recommend to always use the full item
  list of the IPQ and not only selected subscales".

**Risks.**
- The interface items come from Petersen's reprint. Their wording and response scale must be
  checked against the original *JCAL* paper before the instrument is frozen.
- Rewording breaks the original validation, and the planned sample cannot re-validate the
  scale. Report reliability (α) from our data.
- The full battery is about 60 items, so there is a fatigue risk. Check completion time in the
  pilot.

**Platform state.** The study engine seeds SUS, UMUX-LITE, UEQ-S and NASA-TLX as drafts with no
item wording, and refuses to show them. Items are entered only after their wording is verified
against the source page.

## D8. Order of measures

**Decision.**
consent → SSQ (pre) → prior-knowledge test and pre-test concept map → allocation (D3) → device
check → familiarisation → **learning (30 min)** → immediately: cognitive-load scale, SSQ (post),
presence (3D only) → post-test → transfer → concept-map reconstruction → SUS → completion.

**Evidence.**
- Hart (2006), p. 907 (PDF p. 4), names "the problem of context effect (i.e., TLX ratings of one
  task may be influenced by significantly different experiences immediately before)". A load
  rating given after the post-test and reconstruction would rate those tasks too.
- Leppink et al. (2013) p. 1061 (PDF p. 4) collected the scale "at the very end of the lecture"
  being rated, i.e. immediately after the instruction.

**Departure from CN.** CN §8, P94 lists "a short UX/cognitive-load questionnaire" last. Load,
sickness and presence move to straight after learning; the SUS (UX) stays last. Flagged as
INS-E15 for the researchers.

## D9. Content sign-off

**Decision.** No craft claim enters a study snapshot until it is verified as follows:
1. **Two independent domain experts per tradition.** Each checks every in-scope claim in the CMS
   against its evidence passages (FORMAT.md "Claim evidence") and the source, and records
   verify or reject with a reason.
2. **Self-verification is impossible by construction.** The CMS refuses verification by anyone
   who authored or edited the item. The build team, including AI agents, never verifies
   content.
3. **Disagreements** are adjudicated by a third expert, whose decision and reason are recorded.
4. **Agreement** between the two experts (Cohen's κ on verify/reject) is reported in the paper.
5. **Release.** Only a release in which every in-scope claim and relationship is verified can be
   published into a study (`REL001`–`REL003`, `SNAP001`–`SNAP004`).

**Rationale.** CN requires verified craft knowledge. All 1,256 claims are currently
`under_review` or `needs_evidence`. Located verbatim evidence for every claim (verification.md
§V11) makes expert checking a reading task rather than a search task.

## Implementation consequences (tracked in the build)

- Study config defaults: `exposure.minutes = 30`, `allowEarlyFinish = false`, stratified block
  allocation (block size 4, strata from pre-test band), and the D8 step order.
- Study scope check: ≤ 4,500 claim words and tradition balance ±10%, reported by the CMS.
- Guidance: the shared hint, the stall cue and `guidance_used` events, the same in both
  pathways.
- Instrument definitions: entered only with verified wording.
- Scoring: `cmap.recall.dl` is marked primary in the analysis export.
