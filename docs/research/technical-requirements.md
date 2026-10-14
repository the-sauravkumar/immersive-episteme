# Technical requirements: concept note and reference papers

This document extracts the technical requirements for Immersive Episteme from the concept note (primary authority for scope) and the ten reference papers supplied with it. It follows `docs/research/citation-policy.md`: every requirement drawn from a paper gives the citation, page number and an exact verbatim quotation.

## How this was produced and verified

- **Concept note:** read in full. It is a Word document without page numbers, so it is cited by section and paragraph id (P1–P194, counting non-empty paragraphs). All 56 concept-note quotations were checked against the extracted paragraph text (verbatim, 0 failures), and their section labels against the document's headings (0 mismatches).
- **Reference papers:** each PDF was extracted page by page. Each paper was read in full and the requirements extracted. Every quotation (788 in total) was then checked mechanically against the stated PDF page: **788/788 verbatim** (normalisation limited to ligatures, curly quotes and dashes, line-end hyphenation and whitespace). Quotes that were line fragments were expanded to the full containing sentence from the same page.
- **Bibliographic data:** confirmed against Crossref, the version of record, for all eleven references with a DOI.
- **Page numbers:** the printed journal page where the PDF shows one, with the PDF page index. Three archived PDFs are pre-print or online-first versions without printed page numbers (Krokos et al., Yang et al., Makransky & Petersen), so only PDF pages are given for them.
- **Effect sizes and power:** calculations marked *derived* were computed by the project team (exact two-sample t-test power via the noncentral t distribution, scipy 1.18.1, α = .05 two-sided). They are not statements by the papers.

## 1. Requirements from the concept note (primary authority)

**CN-01 (Research aim).** Build and evaluate a virtual environment in which a knowledge domain's structure and relationships are translated into spatial organisation and explored through movement and interaction.
- §1, P7: “a virtual environment in which the structure and relationships within a knowledge domain are deliberately translated into spatial organisation and explored through movement and interaction”

**CN-02 (Research aim).** The contribution to deliver and evidence is the knowledge-to-space transformation method and its measured cognitive consequences, not 3D museum technology.
- §4, P69: “The proposed contribution is not the 3D museum technology itself. It lies in the knowledge-to-space transformation method and in measuring its cognitive consequences.”

**CN-03 (Method pipeline).** Implement the five-stage pipeline: classify the domain, model its relationships, transform them into spatial architecture, let users navigate it, and measure reconstruction afterwards.
- §4, P68: “Classify a heterogeneous knowledge domain → model its internal relationships → transform those relationships into spatial architecture → allow users to navigate that architecture → measure whether users reconstruct the domain differently afterwards”
- §2, P15: “Epistemic classification → relational modelling → spatial transformation → guided situated exploration → epistemic reconfiguration”

**CN-04 (Research questions).** The study must answer RQ1–RQ3: relational understanding versus an informationally equivalent interface; acquisition, transfer and cognitive load; and navigation pathways in relation to the constructed knowledge structures.
- §5, P71: “Does an epistemically spatialised craft-learning environment produce stronger relational understanding than an informationally equivalent conventional interface?”
- §5, P72: “How does epistemic spatialisation affect knowledge acquisition, transfer and cognitive load compared with conventional information navigation?”
- §5, P73: “How do users' navigation and interaction pathways within the immersive environment relate to the knowledge structures they construct after learning?”

**CN-05 (Hypothesis).** Test the primary hypothesis: greater improvement in relational knowledge structure for the spatialised environment than for the conventional structured interface.
- §5, P74: “users of the epistemically spatialised environment will show greater improvement in relational knowledge structure than users receiving the same knowledge through a conventional structured interface”

**CN-06 (Knowledge base).** The database may hold all six block-printing traditions; the experimental prototype should use three traditions of comparable information depth.
- §6, P76: “the full database may retain all six traditions, but the experimental prototype should probably use three carefully selected traditions with comparable information depth”

**CN-07 (Knowledge base).** Organise every selected tradition with a common epistemic template: context; materials and tools; process sequence; artisan decisions and tacit knowledge; design and material outcomes; scientific and technological explanations; comparison with other traditions.
- §6, P77: “Each selected tradition can be organised using a common epistemic template”
- §6, P81: “artisan decisions and tacit knowledge”
- §6, P84: “comparison with other traditions”

**CN-08 (Knowledge base).** The scientific layer answers concise causal 'why' questions about pretreatments, mordants and materials, reactions, process order, and environmental and water conditions.
- §6, P85: “The scientific layer will answer concise causal questions such as why a pretreatment is necessary, why a particular mordant or material is used, why X and Y produce Z, why process order matters, and why environmental or water conditions change outcomes.”

**CN-09 (Condition A (2D)).** Provide a well-designed 2D web interface with the same text, images, artisan and process information, science, comparisons and learning prompts, navigated by menus, cards, headings and hyperlinks.
- §7, P88: “A well-designed 2D web interface containing the same text, images, artisan/process information, scientific explanations, comparison content and learning prompts. Users navigate through menus, cards, headings and hyperlinks.”

**CN-10 (Condition B (3D)).** Present the same information transformed spatially: rooms as learning spaces, objects as entry points, and relationships expressed through adjacency, sequence, proximity, pathways and progressive disclosure.
- §7, P90: “Rooms become learning spaces, objects become entry points into knowledge, and meaningful relationships are represented through adjacency, sequence, proximity, pathways and progressive disclosure.”

**CN-11 (Condition B (3D)).** Simplify the museum for the experiment: remove social and live functions and unnecessary controls, minimise the map, hide instructions after onboarding, and disclose information progressively.
- §7, P91: “Social/live functions and unnecessary controls should be removed; the map may be minimised; interface instructions should disappear after onboarding; and information should be progressively disclosed.”

**CN-12 (Equivalence).** The two pathways must be informationally equivalent and differ primarily in spatial organisation.
- §7, P91: “two informationally equivalent knowledge pathways that differ primarily in spatial organisation”

**CN-13 (Study design).** Target about 40 participants in a between-group design of about 20 per pathway; a counterbalanced within-participant design with matched traditions is an alternative, to be decided later.
- §8, P93: “Target sample: approximately 40 participants.”
- §8, P94: “A simple between-group design can allocate approximately 20 participants to each pathway.”
- §8, P95: “The final choice can be made after the prototype content has been prepared. To be decided later.”

**CN-14 (Procedure).** Procedure: short prior-knowledge test, assigned learning task, immediate post-test, relational reconstruction task, and a short UX and cognitive-load questionnaire.
- §8, P94: “All participants complete a short prior-knowledge test, the assigned learning/exploration task, an immediate post-test, a relational reconstruction task, and a short UX/cognitive-load questionnaire.”

**CN-15 (Primary outcome).** Measure relational understanding before and after learning by having participants organise and connect a fixed concept set.
- §9, P98: “Before and after learning, participants can organise or connect a fixed set of concepts such as material, fibre, mordant, dye, water, block, process sequence, environmental condition, reaction and colour outcome.”

**CN-16 (Primary outcome).** Concept-map measures: valid relations, incorrect relations, causal-chain depth, structural similarity to an expert reference map, and increase in cross-category relations.
- §9, P99: “Possible measures include number of valid relations, incorrect relations, depth of causal chains, structural similarity to an expert reference map, and increase in cross-category relationships.”

**CN-17 (Secondary outcomes).** Measure knowledge acquisition (pre and post), transfer to a new 'why?' problem, validated perceived cognitive load separating content difficulty from interface burden, accuracy and completion time, short UX (SUS, UMUX-Lite or UEQ-S), and presence as a brief supplementary measure.
- §9, P101: “Knowledge acquisition: pre/post factual and conceptual questions.”
- §9, P102: “Transfer: ability to solve a new 'why?' problem not directly encountered in the interface.”
- §9, P103: “Cognitive load: short validated perceived-load measure, with attention to separating content difficulty from interface/navigation burden.”
- §9, P104: “Task performance: accuracy and completion time.”
- §9, P105: “Usability/UX: a short measure such as SUS, UMUX-Lite or UEQ-S.”
- §9, P106: “Presence/engagement: a brief supplementary measure rather than the central outcome.”

**CN-18 (Logging).** Log behaviour automatically in the immersive prototype, and mirror the same logging in the 2D interface where possible.
- §10, P108: “The immersive prototype should log user behaviour automatically. The same logging logic should be mirrored where possible in the conventional interface.”

**CN-19 (Logging).** Events to log: room/page entered, entry and exit timestamps, exhibit/object selected, information layer opened, artisan/process/science layer selected, query asked, sequence of interactions, return to earlier object/room, cross-tradition movement, guidance cue used, abandoned or incorrect pathway, task completion time, unique concepts encountered, repeated concepts/links.
- §10, P111: “Room/page entered”
- §10, P113: “Entry and exit timestamps”
- §10, P115: “Exhibit/object selected”
- §10, P117: “Information layer opened”
- §10, P119: “Artisan/process/science layer selected”
- §10, P121: “Query asked”
- §10, P123: “Sequence of interactions”
- §10, P125: “Return to earlier object/room”
- §10, P127: “Cross-tradition movement”
- §10, P129: “Guidance cue used”
- §10, P131: “Abandoned or incorrect pathway”
- §10, P133: “Task completion time”
- §10, P135: “Unique concepts encountered”
- §10, P137: “Repeated concepts/links”

**CN-20 (Analytics).** Derive path length, exploration breadth and depth, revisit rate, cross-domain transitions, science-layer engagement, path entropy and sequence patterns; compare navigation structure with the post-learning concept map.
- §10, P139: “Derived indicators may include path length, exploration breadth, exploration depth, revisit rate, cross-domain transitions, science-layer engagement, path entropy and sequence patterns.”
- §10, P139: “A particularly interesting analysis would compare a participant's navigation structure with the concept map produced after learning.”

**CN-21 (Guidance).** Lightweight guidance (signalling, self-explanation) should stabilise attention while preserving agency; the guidance approach (e.g. exploration first, guidance when required) is an open decision.
- §2, P13: “Lightweight guidance, signalling and self-explanation can help stabilise attention while preserving agency.”
- §3, P56: “Suggests a hybrid design: exploration first, guidance when required. (interesting – we may have to take a call on what approach we will use)”

**CN-22 (Cognitive load).** Keep interface complexity, navigation and choice from adding extraneous load; distinguish content difficulty from interface and navigation burden (a potential confound).
- §2, P14: “interface complexity, navigation and excessive choice may introduce extraneous cognitive load”
- §3, P53: “Reinforces the need to distinguish content difficulty from interface and navigation burden. (Can become confounding variables)”

**CN-23 (Schedule).** Eight-week plan: week 1 freeze RQs, traditions, schema and instruments; weeks 1–3 content and immersive prototype; week 3 2D interface and logging; week 4 expert validation and a pilot with about 5–6 users; weeks 5–6 main study; weeks 6–8 analysis and writing.
- §11, P144: “Freeze research questions, choose three traditions, define the common knowledge schema and prepare study instruments.”
- §11, P148: “Build the informationally equivalent conventional 2D interface and backend logging.”
- §11, P150: “Expert content validation and a small pilot with approximately 5–6 users; revise navigation and task wording.”
- §11, P152: “Main study with approximately 40 participants.”

**CN-24 (Content validation).** Content must undergo expert validation before the pilot.
- §11, P150: “Expert content validation and a small pilot with approximately 5–6 users”

**CN-25 (Reporting standard).** Design the study to the standard expected by BJET or Computers & Education, used as the benchmark.
- §13, P181: “design the study to the standard expected by BJET or Computers & Education – but we may not submit there – it will act as the bench mark”

## 2. Flags on the concept note

### 2.1 Claims and citations that cannot be verified

| Concept-note location | Issue |
|---|---|
| §1, P5 | “Existing research shows that immersive and extended-reality environments can support engagement, presence, recall and learning…”: no citation in the paragraph. The reference-table sources partly support it (see §3, `zhou2022`, `makransky2021`, `petersen2022` checks). |
| §2, P11 | “Recent XR heritage research treats embodied engagement as part of the process through which encoded information becomes user-constructed meaning.”: no citation. Most likely Wang et al. (2026), which is not available (below). **Not verifiable.** |
| §3, P36–P38 Han et al. (2023) | No reference entry and no PDF. **Not verifiable.** |
| §3, P51–P53 Poupard et al. (2025) | No reference entry and no PDF. **Not verifiable.** |
| §3, P54–P56 De Bruyne et al. (2025/26) | No reference entry and no PDF. **Not verifiable.** |
| §3, P63–P65 Jiang & Gou (2026) | No reference entry and no PDF. **Not verifiable.** |
| §3, P57–P59 and §14, P192 Wang et al. (2026) | Reference metadata confirmed on Crossref (Information Processing & Management 63(2), 104445), but no PDF supplied. **Content not verifiable.** |

### 2.2 Reference-list errors (checked against the PDFs and Crossref)

| Reference | Finding |
|---|---|
| §14, P190 AIDEN | No authors given. The authors are Quantin, Plessis & Laroche (2024); the title uses a comma (“AIDEN, a visualization tool…”); it is a conference paper (34th CIRP Design Conference). |
| §14, P191 Hung & Lee | **Author names wrong.** It is Pei-Tzu Hung & Bokyung Lee, not “C.-Y.” and “C.-H.”; volume, issue and pages missing (41(17), 10767–10786). |
| §14, P193 Lu et al. | Authors incomplete (Lu, Hwang & Tu); volume and issue missing (42(4), e70296). |
| §14, P185 Makransky & Petersen | Issue number missing (33(3)). Otherwise correct. |
| §14, P183 and P184 Krokos; Yang | Correct per Crossref. The archived PDFs are online-first and accepted-manuscript versions. |

### 2.3 Concept-note statements that differ from the project's current state

| Concept note | Current state |
|---|---|
| §6, P76: “The project already has artisan knowledge and process knowledge for six block-printing traditions.” | That knowledge was not provided to the platform team. The six-tradition dataset was curated from public sources and verified first-hand (`content/review/verification.md`). |
| §7, P90: “The existing Hand Block Museum can be adapted rather than rebuilt.” | Deliberate deviation by the project lead: built fresh, with the museum used as a read-only design reference (design-process DR-002). |

### 2.4 Decisions the concept note leaves open

- Between-group vs counterbalanced within-participant design (§8, P95: “To be decided later.”).
- Guidance approach (§3, P56: “we may have to take a call on what approach we will use”).
- Which validated cognitive-load measure (§9, P103), and which UX measure among SUS, UMUX-Lite and UEQ-S (§9, P105).
- “Query asked” logging (§10, P121) implies a query or search feature; under equivalence (§7, P91) it must exist in both conditions or in neither.

## 3. Concept-note statements about the reference papers, checked

| Paper | Concept-note statement | Verdict | Evidence (verbatim) | Note |
|---|---|---|---|---|
| Krokos et al. 2019 | §2, P12: “Virtual memory-palace (interesting for Ankit?) research shows advantages for recall and for retrieval of conceptual information.” | **Partly supported** | PDF p. 1: “We found that virtual memory palaces in HMD condition provide a superior memory recall ability compared to the desktop condition.”<br>PDF p. 5: “whereas our study uses faces, with unique and diverse” | The recall half is supported by Krokos et al. (face-name recall at locations, HMD vs desktop). The 'retrieval of conceptual information' half is not supported by this paper: the memorised items were 42 celebrity faces and their names, not conceptual material. That half rests on Yang et al. (2021) only. The 'advantage' Krokos report is for an immersive HMD over a desktop showing the same palace, not for a memory palac |
| Krokos et al. 2019 | §3, P21–P22: “Krokos, Plaisant & Varshney (2019) / Virtual memory palaces; spatial organisation in VR improves recall.” | **Partly supported** | PDF p. 1: “we explore whether using virtual memory palaces in a head-mounted display with head-tracking (HMD condition) would allow a user to better recall information than when using a traditional desktop display with a mouse-based interaction (desktop condition).”<br>PDF p. 8: “HMD condition at 84.05% and the desktop condition at 75.24%.” | The paper shows that the SAME spatial arrangement viewed in a head-tracked stereoscopic HMD gives better recall (mean 84.05% vs 75.24%, +8.8 points; F(1,79)=4.6, p<0.05) than on a mouse-controlled desktop. Spatial organisation was held constant, not manipulated, so the study does not show that spatial organisation (vs a non-spatial presentation) improves recall; that comparison is only reported secondarily from earli |
| Krokos et al. 2019 | §3, P23: “Establishes space as a cognitive scaffold, but the knowledge structure does not generate the architecture.” | **Partly supported** | PDF p. 5: “The two scenes (virtual memory palaces) consist of pre-constructed palace and medieval town environments filled with faces.”<br>PDF p. 5: “were purchased through the 3D modeling distribution Web” | Second clause supported: the scenes were purchased TurboSquid models (an ornate palace and a medieval town) and faces were hand-placed; nothing about the content shaped the layout. First clause is overstated: the study does not test space vs no space; it shows immersive viewing of a spatial scene beats desktop viewing. Evidence that space acts as a scaffold is indirect (about a third of participants reported associat |
| Krokos et al. 2019 | §14, P183: “Krokos, E., Plaisant, C., & Varshney, A. (2019). Virtual memory palaces: immersion aids recall. Virtual Reality, 23, 1–15. https://doi.org/10.1007/s10055-018-03” | **Supported** | PDF p. 1: “https://doi.org/10.1007/s10055-018-0346-3”<br>PDF p. 1: “Received: 21 October 2016 / Accepted: 3 May 2018” | Crossref (version of record): Virtual Reality 23(1), 1–15, 2019; online-first 2018. The archived PDF is the online-first version. *(lead-verified override)* |
| Yang et al. 2021 | §2, P12: “Virtual memory-palace (interesting for Ankit?) research shows advantages for recall and for retrieval of conceptual information.” | **Supported** | PDF p. 2: “Our experiment and for simplicity, but our approach only utilized a variant 133 76 focused on conceptual knowledge (e.g., "the interrelation- of a conventional memory palace.”<br>PDF p. 1: “Our analyses show that using a virtual reality-based memory palace variant greatly increased the amount of knowledge retrieved and retained over the baseline, and it shows a moderate improvement over the other image-based memory palace variant.” | Supported for free recall of conceptual knowledge (main ideas of scientific abstracts, scored as idea units). Qualifications: the advantage is in recall accuracy/precision only; recognition accuracy, recognition confidence and new-idea rate were inconclusive for both mnemonic conditions, and the image-based (non-VR) memory palace variant did not show a clear effect. 'Conceptual' here means the gist of ~200-word abstr |
| Yang et al. 2021 | §3, P24–P25: “Yang et al. (2021) / VR memory-palace variant supports retrieval of knowledge from scholarly articles.” | **Supported** | PDF p. 1: “We used abstracts of scientific publications to represent knowledge in scholarly articles; participants were asked to read, remember, and retrieve knowledge from a set of abstracts.”<br>PDF p. 7: “Recall accuracy increased by 0.058 [0.021, 0.092] for” | Supported as the authors' own claim, with scope limits the CN omits: 'scholarly articles' were operationalised as 12 abstracts from Animal Cognition, four per visit (about 800 words read in total); the study is described as exploratory; N = 26 recruited, 25 analysed (12 IMAGE, 13 VR); the gain over each participant's own control visit was +0.058 recall accuracy (Cohen's d 0.84, 95% CI [0.21, 1.53]) and over the image |
| Yang et al. 2021 | §3, P26: “Extends spatial memory to conceptual material, but remains primarily mnemonic spatialisation.” | **Supported** | PDF p. 5: “the loci in the palace based on three criteria: (1) the”<br>PDF p. 5: “distances between the loci; and (3) the visual appeal of the” | Supported: loci were chosen for physical-space constraints, inter-locus distance and visual appeal in a generic coffee-shop scene, not derived from the knowledge content, and the task is remembering. One nuance the CN should acknowledge: the authors' 'hierarchical memory palace' places each passage at a locus and its main ideas near that locus, which they liken to a spatial concept map. This is a partial structure-to |
| Yang et al. 2021 | §14, P184: “Yang, F., Qian, J., Novotny, J., Badre, D., Jackson, C. D., & Laidlaw, D. H. (2021). A virtual reality memory palace variant aids knowledge retrieval from schol” | **Supported** | PDF p. 1: “This article has been accepted for publication in a future issue of this journal, but has not been fully edited. Content may change prior to final publication.”<br>PDF p. 1: “Content may change prior to final publication. Citation information: DOI 10.1109/TVCG.2020.3009003, IEEE Transactions on Visualization and Computer Graphics N.B.: We provide a manuscript annotating the differences between this and last submissions in supplementary materials.” | Crossref: IEEE TVCG 27(12), 4359–4373, 2021. The archived PDF is the accepted manuscript (2020), hence no printed pages. *(lead-verified override)* |
| Makransky & Petersen 2021 | §2, P14: “d. Cognitive Load Theory and CAMIL: immersion and interactivity can create presence and agency, but interface complexity, navigation and excessive choice may in” | **Partly supported** | PDF p. 1: “The CAMIL identifies presence and agency as the general psychological affordances of learning in IVR, and describes how immersion, control factors, and representational fidelity facilitate these affordances.”<br>PDF p. 10: “Therefore, CAMIL describes a positive relationship between presence and extraneous cognitive load (positive relation, path 13 in Fig. 2). Extraneous CL can also result from high levels of agency (positive relation, path 14 in Fig. 2).” | The first half is supported (CAMIL's technological factors are immersion, control factors and representational fidelity; 'interactivity' corresponds to control factors/interaction). Extraneous load is attributed to presence (larger field of view, having to find content, seductive details) and to agency (autonomy over what to view: this supports 'excessive choice'). 'Interface complexity' is not named as such: CAMIL n |
| Makransky & Petersen 2021 | §3, P27-P28: “Makransky & Petersen (2021) / CAMIL links immersion and interactivity with presence, agency, embodiment and cognitive load.” | **Supported** | PDF p. 1: “The model describes six affective and cognitive factors that can lead to IVR-based learning outcomes including interest, motivation, self-efficacy, embodiment, cognitive load, and self-regulation.”<br>PDF p. 6: “The general affordances of learning in IVR are presence and agency.” | Accurate but selective: CAMIL also includes representational fidelity as a technological factor and interest, intrinsic motivation, self-efficacy and self-regulation as mediating factors, and it predicts four outcome types (factual, conceptual, procedural knowledge and transfer). The paper uses 'interaction'/'control factors' rather than 'interactivity'. |
| Makransky & Petersen 2021 | §3, P29: “Provides the learning mechanism and design constraints, not a knowledge-to-space transformation model.” | **Supported** | PDF p. 4: “CAMIL provides a theory of change that describes how it is not the medium of IVR that causes more or less learning, but rather that the instructional method used in an IVR lesson will be specifically effective if it facilitates the unique affordances of the medium.”<br>PDF p. 15: “few empirical studies have specifically tested the paths outlined in the model.” | CAMIL is a theoretical process model with instructional-design implications (coherence, signalling, pre-training, segmentation, modality, reflection; PDF p. 16). It says nothing about mapping knowledge structures to spatial layouts. Caveats: the 'mechanism' is largely untested (PDF p. 15), and CAMIL is framed for HMD-based IVR, with desktop 3D used only as a comparison (PDF p. 3). |
| Makransky & Petersen 2021 | §14, P185: “Makransky, G., & Petersen, G. B. (2021). The Cognitive Affective Model of Immersive Learning (CAMIL): a theoretical research-based model of learning in immersiv” | **Supported** | PDF p. 1: “Educational Psychology Review https://doi.org/10.1007/s10648-020-09586-2 REVIEW ARTICLE The Cognitive Affective Model of Immersive Learning (CAMIL): a Theoretical Research-Based Model of Learning in Immersive Virtual Reality Guido Makransky 1 & Gustav B.”<br>PDF p. 1: “Petersen1 Accepted: 15 November 2020/ # The Author(s) 2021 Abstract There has been a surge in interest and implementation of immersive virtual reality (IVR)based lessons in education and training recently, which has resulted in many studies on the topic.” | Crossref: Educational Psychology Review 33(3), 937–958, 2021. The concept note omits only the issue number. *(lead-verified override)* |
| Makransky & Petersen 2021 | §1, P5: “Immersion can also increase cognitive load when users must simultaneously understand content, navigate space and learn unfamiliar controls. The value of immersi” | **Partly supported** | PDF p. 10: “This research suggests that learning in IVR leads to higher extraneous CL than learning in less immersive media, and highlights the importance of considering CL when designing IVR learning tools.”<br>PDF p. 15: “If instructional support and learning processes are not emphasized, even the latest technological advancements may have limited instructive value.” | The paragraph has no citation, but its claims match CAMIL: IVR raises extraneous load, and effects depend on instructional method rather than the medium. The specific mechanisms 'navigate space' and 'learn unfamiliar controls' are not stated as load sources in CAMIL. Controls and navigation appear only as usability and prior-experience external factors (PDF pp. 15-17). 'Knowledge organisation' is not discussed. |
| Petersen et al. 2022 | §3, P30-P31: “Petersen, Petkakis & Makransky (2022) / Shows how immersion and interactivity influence VR learning through presence and agency.” | **Partly supported** | p. 11 (PDF p. 11): “Consistent with the predictions, both interactivity and immersion were shown to impact agency, physical presence, and embodied learning positively.”<br>p. 11 (PDF p. 11): “Hence, while interactivity and immersion did not directly affect learning, as mentioned above, there was evidence for indirect links.” | Immersion and interactivity did raise physical presence and agency. However, the routes to learning were indirect and not simply 'through presence and agency'. The positive route ran presence -> situational interest -> learning. Agency's only route ran through embodied learning, which predicted learning NEGATIVELY. There was no direct effect of immersion or interactivity on learning (no significant ANOVA effects on l |
| Petersen et al. 2022 | §3, P32: “Demonstrates that extraneous load can undermine the benefits of immersion.” | **Not supported** | p. 9 (PDF p. 9): “There was no significant effect of immersion on extraneous cognitive load environment.”<br>p. 9 (PDF p. 9): “There were also no significant effects on extraneous cognitive load interaction although the main effect of interactivity was close (p = .059).” | The study does not show extraneous load undermining the benefits of immersion on learning. Immersion had no effect on either extraneous-load subscale. Neither subscale predicted learning (predictions 18 and 19 were not supported; only predictions 14 and 16 were, PDF p. 11). Immersion produced no learning benefit to undermine (PDF p. 10). The closest finding is narrower and exploratory: extraneous load from the intera |
| Petersen et al. 2022 | §14, P186: “Petersen, G. B., Petkakis, G., & Makransky, G. (2022). A study of how immersion and interactivity drive VR learning. Computers & Education, 179, 104429. https:/” | **Supported** | PDF p. 1: “Computers & Education 179 (2022) 104429”<br>PDF p. 1: “Petersen). https://doi.org/10.1016/j.compedu.2021.104429 Received 30 April 2021; Received in revised form 16 December 2021; Accepted 30 December 2021 Available online 4 January 2022 0360-1315/ 2022 The Authors.” | All bibliographic elements match the PDF. |
| Zhou et al. 2022 | §3, P33–P34: “Zhou, Chen & Wang (2022) / Meta-analysis of AR/VR museum learning; positive effects on achievement and perceptions.” | **Supported** | PDF p. 1: “Third, AR and VR have significant positive effects on academic achievement (ES = 0.45) and perceptions (ES = 0.59) in museum learning.”<br>p. 11 (PDF p. 11): “The weighted mean effect size for academic achievement synthesized from 13 studies was 0.45 (95% CI [0.00, 0.89], k = 13),” | The characterisation is accurate as worded. Qualifications the concept note does not mention: (1) the pooled achievement effect has a 95% CI whose lower bound is 0.00, so it is only marginally different from zero; (2) the meta-analysis pools 17 studies that are overwhelmingly AR (only 1 VR vs non-VR comparison), so it is weak evidence about immersive VR specifically; (3) online desktop virtual museums (the closest an |
| Zhou et al. 2022 | §3, P35: “Shows that simply demonstrating that immersive museums support learning is not sufficiently novel.” | **Partly supported** | p. 13 (PDF p. 13): “In this review, only 17 out of the 51 selected articles used a controlled experimental design.”<br>p. 13 (PDF p. 13): “More experimental or quasi-experimental studies with a control group design are needed to investigate the effects (such as the acquisition of knowledge and skills) of using AR and VR technologies in museum learning.” | This is the concept note's own inference, not a claim the paper makes. The paper does establish a pooled positive effect for AR/VR museum learning, which supports the point that a bare 'immersive museum helps learning' study adds little. But the authors themselves describe the evidence base as thin (17 of 51 controlled; small samples; mainly low-immersion AR; 1 VR comparison) and explicitly call for more controlled s |
| Zhou et al. 2022 | §1, P5: “Existing research shows that immersive and extended-reality environments can support engagement, presence, recall and learning, but the effects are not uniforml” | **Partly supported** | p. 11 (PDF p. 11): “Individual effect sizes of the 13 primary studies ranged from - 1.30 to 2.05.”<br>p. 12 (PDF p. 12): “The individual effect sizes of the 12 primary studies ranged from - 0.21 to 2.19.” | P5 does not cite Zhou explicitly, but Zhou is the concept note's evidence for immersive museum learning. Supported: learning (academic achievement) and engagement (coded within 'perceptions'), and 'not uniformly positive' (individual effects range from negative to strongly positive). Not covered by Zhou: presence and recall are not separate outcomes in the meta-analysis; presence is mentioned only descriptively for H |
| Hung & Lee 2025 | §3, P39: “Hung & Lee (2024/25)” | **Supported** | PDF p. 1: “Published online: 23 Dec 2024.”<br>p. 10767 (PDF p. 2): “2025, VOL. 41, NO. 17, 10767-10786” | Published online-first on 23 Dec 2024, in the 2025 issue 41(17). '2024/25' is accurate; the canonical citation year is 2025. |
| Hung & Lee 2025 | §3, P40: “Develops a museum knowledge taxonomy from 737 exhibit commentaries and links knowledge types to XR delivery.” | **Supported** | p. 10767 (PDF p. 2): “This study investigates the potential of eXtended Reality (XR) interactions to enhance knowledge delivery within exhibitions. Analyzing 737 exhibit commentary descriptions from 10 real-world exhibitions, we first provided a foundational knowledge taxonomy that outlines various types of information frequently conveyed along with physical exhibits.”<br>p. 10770 (PDF p. 5): “To collect data, we initially scraped all the commentary descriptions from the exhibitions and compiled them into a single digital document. Ultimately, we gathered 737 sentences describing 191 different exhibits.” | The abstract (PDF p. 2) says "Analyzing 737 exhibit commentary descriptions from 10" [exhibitions]. Wording nuance: these are 737 descriptions of exhibits, not 737 separate commentaries. *(lead-verified override)* |
| Hung & Lee 2025 | §3, P41: “Very close to the classification stage; taxonomy is not systematically transformed into spatial architecture.” | **Partly supported** | p. 10771 (PDF p. 6): “creation. The first two themes contain insights about how”<br>p. 10771 (PDF p. 6): “ence, while the last three themes describe the different types” | The second half is supported. The taxonomy feeds per-exhibit XR docent interactions, mostly situated AR around physical exhibits. It is never turned into an architecture of rooms, adjacency or paths. The paper does gesture at spatial mappings: proxemics-based depth of knowledge, delivering the exhibition theme while visitors walk between rooms, and summoning related exhibits. These are design ideas, not a systematic  |
| Hung & Lee 2025 | §4, P67: “The literature establishes, separately, that knowledge can be classified, complex information can be represented through graphs, information can be spatialised,” | **Partly supported** | p. 10768 (PDF p. 3): “taxonomy of exhibit commentary knowledge, which can serve”<br>p. 10768 (PDF p. 3): “not only as a categorization tool but also as a generative” | Hung & Lee is the table's evidence for 'knowledge can be classified'. They do classify museum commentary knowledge, so the narrow claim holds. But the authors say they did not evaluate whether the taxonomy generalises and that its validity still needs testing, so the classification is a proposal and not an established scheme. |
| Hung & Lee 2025 | §14, P191: “Hung, C.-Y., & Lee, C.-H. (2025). Exploring the next phase of situated and interactive docents for XR exhibitions: from the perspective of knowledge delivery. I” | **Contradicted** | PDF p. 1: “Pei-Tzu Hung & Bokyung Lee (2025) Exploring the Next Phase of”<br>PDF p. 1: “Delivery, International Journal of Human-Computer Interaction, 41:17, 10767-10786, DOI:” | Author names are wrong. The PDF and Crossref give Pei-Tzu Hung & Bokyung Lee, not "Hung, C.-Y., & Lee, C.-H."; volume, issue and pages missing: 41(17), 10767–10786. *(lead-verified override)* |
| Quantin et al. 2024 (AIDEN) | §3, P42-P43: “AIDEN (2024) / Allows immersive navigation of RDF knowledge graphs.” | **Supported** | p. 538 (PDF p. 1): “This paper presents AIDEN (Artificial Intelligence for Data Exploration and Navigation), a system based on virtual reality (VR) to provide an immersive and intuitive application for exploring, analyzing, and modifying RDF knowledge graphs in an interactive three-dimensional environment.”<br>p. 541 (PDF p. 4): “Users navigate via several mechanisms including free-axis flight, node-aimed teleportation, and ground-axis teleportation.” | Accurate. The paper also covers editing (create/update/delete triples via an Edit mode) and voice-generated SPARQL queries, so 'navigation' undersells the scope: AIDEN is a read-and-edit tool for curating historical knowledge graphs, aimed at historians (content experts). |
| Quantin et al. 2024 (AIDEN) | §3, P44: “Very close technically; visualises graph structure directly rather than translating domain relations into experiential architecture.” | **Supported** | p. 540 (PDF p. 3): “The graph is a directed edge-node multigraph laid out with”<br>p. 540 (PDF p. 3): “3D force-directed algorithm [12]. In order to reduce the number” | The layout is a generic 3D force-directed node-link layout; node position carries no domain meaning beyond connectivity, and the authors themselves call it a 'low level representation'. Its even 'immersive view' is the same node-link graph entered by the user, not an architecture. 'Very close technically' is fair for the data pipeline (RDF store, ontology classes, VR rendering), but the paper's purpose is expert data |
| Quantin et al. 2024 (AIDEN) | §4, P67: “The literature establishes, separately, that knowledge can be classified, complex information can be represented through graphs, information can be spatialised,” | **Partly supported** | p. 538 (PDF p. 1): “In the humanities, there is a widening gap between content experts and the data they work with. Knowledge graphs based on ontology standards are powerful tools for data sharing, representation, expression and analysis, but they pose significant challenges in terms of consistency checking, navigation and interaction.”<br>p. 541 (PDF p. 4): “So far, AIDEN testing has been carried out by” | AIDEN (presumably the source for 'complex information can be represented through graphs') demonstrates that graphs can be represented in VR, but 'establishes' is too strong for this source: it is a system description with only informal testing by data-visualisation experts and a planned (not conducted) evaluation. The concept note does not cite it at P67 explicitly; the link is inferred from the §3 table. |
| Quantin et al. 2024 (AIDEN) | §14, P190: “AIDEN: A visualization tool in virtual reality for RDF graph. (2024). Procedia CIRP, 128, 538–542. https://doi.org/10.1016/j.procir.2024.03.034” | **Partly supported** | p. 538 (PDF p. 1): “Available online at www.sciencedirect.com ScienceDirect Procedia CIRP 128 (2024) 538-542 34th CIRP Design Conference AIDEN, a visualization tool in virtual reality for RDF graph Matthieu Quantina, William Plessisa, Florent Larochea* a LS2N, Laboratory of Digital Sciences, Ecole Centrale de Nantes, Nantes University, France * Corresponding author.”<br>p. 538 (PDF p. 1): “AIDEN, a visualization tool in virtual reality for RDF graph” | Volume, pages, year and DOI are correct. Authors are omitted (Quantin, Plessis & Laroche), the title uses a colon instead of the original comma, and the conference (34th CIRP Design Conference) is not named. |
| Wen et al. 2024 | §3, P45–P46: “Wen, Lu & Mohamad Ali (2024) / Attentional guidance in VR laboratories reduces cognitive load and improves performance.” | **Supported** | PDF p. 1: “The results indicated that the students in the VR lab with the attentional guidance mechanism included exhibited lower cognitive load and higher academic performance than the control group.”<br>p. 6 (PDF p. 6): “Cognitive load Experimental group 40 69.08 2.53 33.73 0.00 0.30” | The direction of the finding matches. Caveats the concept note omits: (1) quasi-experimental, intact classes (one class per university), no randomisation and no pre-test, so the causal word 'reduces' rests on a non-randomised comparison; (2) cognitive load was measured only with the NASA-TLX overall workload score, which does not separate intrinsic from extraneous load; (3) the absolute differences are small (cogniti |
| Wen et al. 2024 | §3, P47: “Supports controlled guidance in immersive learning.” | **Partly supported** | p. 4 (PDF p. 4): “The arrow was designed to hang directly above the characters, cameras, and lights”<br>p. 4 (PDF p. 4): “When the object changed, the position of the arrow changed accordingly. 2.3Measurement instruments 2.3.1Cognitive load The NASA-TLX is an important tool for developing new measures and models (Hart 2006).” | Supported in the sense that a system-controlled, always-on visual cue that follows the object currently being manipulated outperformed no cue. Not tested: timing (immediate vs delayed vs on-demand), adaptivity, fading, guidance intensity, or the trade-off with learner agency; the manipulation is simply cue present vs absent. It therefore cannot adjudicate the concept note's open choice between continuous guidance and |
| Wen et al. 2024 | §2, P13: “c. Constructivist and guided-discovery learning: users can construct meaning through exploration, but completely unguided exploration is not necessarily optimal” | **Partly supported** | p. 7 (PDF p. 7): “achieved using a yellow arrow--a hue of yellow that does”<br>p. 6 (PDF p. 6): “guidance mechanism reduced the mental effort and time” | Supports only the 'lightweight signalling directs attention' part: one visual cue reduced reported workload and improved task scores versus no cue in a task with no other help. The paper does not address constructivist or guided-discovery exploration, self-explanation, or agency; agency was not measured. It also does not show that unguided exploration is suboptimal in an exploratory setting: the task was a set proced |
| Wen et al. 2024 | §1, P5: “Immersion can also increase cognitive load when users must simultaneously understand content, navigate space and learn unfamiliar controls.” | **Partly supported** | PDF p. 1: “Learning in virtual reality laboratories (VR labs) has become an important method in experimental teaching but can increase individuals' cognitive load compared with traditional laboratories.”<br>p. 2 (PDF p. 2): “Meanwhile, comparative studies on different types of immersion show that stronger immersion increases cognitive load (Frederiksen et al.” | P5 does not cite Wen explicitly. Wen's introduction supports the claim that immersion and interactivity raise cognitive load, but only as secondary reporting of other studies (Frederiksen et al. 2020; Skulmowski and Rey 2018). Wen's own study did not vary immersion or compare VR with a traditional lab, and does not separate content, navigation and control demands. |
| Song & Evans 2024 | §3, P48-P49: “Song & Evans (2024) / Reconceptualises XR museum objects and meaning through phenomenological analysis.” | **Supported** | p. 01 (PDF p. 1): “This study presents a philosophical reconceptualisation of museums using”<br>p. 01 (PDF p. 1): “"things" play in the museum experience and studies how their function differs” | Accurate in substance. Precisely, the paper reconceptualises museums and XR 'things' through Heidegger's 'thing' and 'fourfold'; the phenomenological analysis is applied to 22 semi-structured expert interviews (curators, XR designers/developers, storytellers) analysed thematically. It contains no visitor data. |
| Song & Evans 2024 | §3, P50: “Supports the idea that digital spatial encounters may alter meaning, but is not a controlled knowledge-restructuring study.” | **Supported** | p. 01 (PDF p. 1): “the meaning of the artefacts within the digital museum space, facilitating new”<br>p. 03 (PDF p. 3): “technologies changes the relationships of cultural objects with the” | Both halves hold. The 'may alter meaning' claim rests on theory (Heidegger/Mitchell) and expert opinion, not on any measurement of visitors' understanding; the authors themselves list subjective bias, small interview sample and no with/without-XR comparison as limitations. It should be cited only as conceptual support, never as evidence that spatial encounters change knowledge structure. |
| Song & Evans 2024 | §14, P189: “Song, Z., & Evans, L. (2024). The museum of digital things: extended reality and museum practices. Frontiers in Virtual Reality, 5, 1396280. https://doi.org/10.” | **Supported** | p. 01 (PDF p. 1): “Granda, University of Cuenca, Ecuador Otto Parra, University of Cuenca, Ecuador *CORRESPONDENCE Leighton Evans, l.evans@swansea.ac.uk RECEIVED 05 March 2024 ACCEPTED 01 July 2024 PUBLISHED 18 July 2024 CITATION Song Z and Evans L (2024), The museum of digital things: extended reality and museum practices. Front. Virtual Real. 5:1396280. doi: 10.3389/frvir.2024.1396280 COPYRIGHT 2024 Song and Evans.”<br>p. 01 (PDF p. 1): “DOI 10.3389/frvir.2024.1396280” | Authors, year, title, journal, volume, article number and DOI all match. |
| Lu et al. 2026 | §3, P60-P61: “Lu et al. (2026) / Self-explanation-guided virtual museum learning supports knowledge construction and regulates open exploration.” | **Supported** | p. 1 of 21 (PDF p. 1): “Results showed that, compared with the control group, the experimental group obtained significantly higher post-test scores in learning achievement, critical thinking tendency, collaboration tendency, and metacognition.”<br>p. 4 of 21 (PDF p. 4): “ing in written form, self-explanation regulates the otherwise” | Both parts of the claim appear in the paper, but the evidence is of different kinds. 'Supports knowledge construction': learning achievement was higher (d = 0.61). That test is 10 multiple-choice items on background knowledge of artefacts, so knowledge construction as such (for example, concept-map structure) was not measured. 'Regulates open exploration' is the authors' design rationale (§3). The only empirical supp |
| Lu et al. 2026 | §3, P62: “Shows the value of epistemic checkpoints without making spatial knowledge structure the main experimental variable.” | **Partly supported** | p. 4 of 21 (PDF p. 4): “checkpoints that prompt the selection of relevant information,”<br>p. 8 of 21 (PDF p. 8): “Both groups used the same learning content and received” | Correct that spatial knowledge structure is not a variable: both groups used the same virtual museum. 'Value of epistemic checkpoints' needs two qualifications. (1) Both conditions had per-scene checkpoints (structured guiding questions with real-time feedback). The manipulated factor was one additional written self-explanation task without feedback, so the checkpoints common to both groups were not shown to add valu |
| Lu et al. 2026 | §2, P13: “c. Constructivist and guided-discovery learning: users can construct meaning through exploration, but completely unguided exploration is not necessarily optimal” | **Partly supported** | p. 4 of 21 (PDF p. 4): “Rather, it operates as a cognitive regulation mechanism that”<br>p. 4 of 21 (PDF p. 4): “Rather, it operates as a cognitive regulation mechanism that constrains exploration, stabilises attention, and supports the transformation of multimodal sensory input into conceptual representations.” | 'Stabilise attention' is supported, almost word for word, as the authors' design rationale; attention itself was not measured. 'Completely unguided exploration is not necessarily optimal' is supported only as a literature claim the paper cites (secondary). 'While preserving agency' is not supported: the paper describes self-explanation as constraining exploration, and agency was never measured. 'Lightweight' does not |
| Lu et al. 2026 | §14, P193: “Lu et al. (2026). Self-explanation-guided virtual museum learning for knowledge co-construction based on the constructivist framework: a randomised control stud” | **Supported** | p. 1 of 21 (PDF p. 1): “Journal of Computer Assisted Learning, 2026; 42:e70296”<br>p. 1 of 21 (PDF p. 1): “https://doi.org/10.1002/jcal.70296” | Correct but incomplete: add the authors (Lu, Y.-C., Hwang, G.-J., & Tu, Y.-F.) and 42(4), e70296. |

## 4. Contradictions and qualifications: concept note vs reference papers

Each row quotes the paper. The concept-note side is quoted in the note. The concept note remains authoritative for scope; these are for the researchers to resolve.

- **KROKOS-R02** (Krokos et al. 2019; concept note §8, P95): Treat carry-over between conditions as a measured risk in any within-participant design: report first-exposure (between-subjects) comparisons separately and test for order effects, because performance after switching from immersive to non-immersive dropped.
  - Paper: PDF p. 9: “from a HMD to a desktop, their performance surprisingly”
  - Conflict: CN P95: 'A counterbalanced within-participant design using matched craft traditions is an alternative because it offers more statistical sensitivity with a sample of 40, but it requires careful matching of content difficulty.' Krokos found an asymmetric order effect (first trials did not differ, p = 0.62; second trials did, p = 0.025), so counterbalancing does not remove carry-over; matching content difficulty alone is not enough. This qualifies rather than contradicts the CN, which leaves the design choice open.
- **KROKOS-R12** (Krokos et al. 2019; concept note §7, P91): Recognise that display and interaction modality were confounded (head tracking vs mouse); our 2D-vs-spatial comparison will likewise confound spatial organisation with interaction modality unless the input technique is matched or its effect is measured.
  - Paper: PDF p. 10: “The modality of interactive exploration of the virtual environment in the two conditions was different (head tracking versus mouse tracking). Thus, differences in the recall performance may be explained by this diverse interaction modality.”
  - Conflict: CN P91: the two pathways should be 'two informationally equivalent knowledge pathways that differ primarily in spatial organisation.' Krokos show that when display/interaction modality differs, a recall difference cannot be attributed to one factor. A 2D menu/card interface vs a navigable 3D museum also differs in interaction modality, so the CN's 'primarily in spatial organisation' needs either matched input (e.g. both on desktop with the same controls) or an explicit acknowledgement of the confound.
- **YANG2021-R01** (Yang et al. 2021; concept note §8, P94–P95): Assign each participant to only one spatial/strategy condition (between-subjects for the treatment), because a spatial strategy learned in one condition cannot be unlearned and would carry into the other.
  - Paper: PDF p. 3: “learned a strategy, they cannot "unlearn" it. To mitigate the”
  - Conflict: Supports the CN's default between-group design (P94: 'A simple between-group design can allocate approximately 20 participants to each pathway') but argues against the CN's alternative (P95: 'A counterbalanced within-participant design using matched craft traditions is an alternative because it offers more statistical sensitivity'). If participants learn the spatial organisation strategy in Pathway B, they may apply it when later using Pathway A, so counterbalancing with matched traditions does not remove the carry-over.
- **YANG2021-R14** (Yang et al. 2021; concept note §7, P91): Expect the spatial-vs-conventional contrast to bundle several factors (display resolution, head-tracked navigation, interaction fidelity); either vary them independently or state that the comparison tests the bundle, since Yang could not tell which factor produced the effect.
  - Paper: PDF p. 11: “Each of our conditions vary in resolution, head tracking for”
  - Conflict: CN P91 aims for 'two informationally equivalent knowledge pathways that differ primarily in spatial organisation.' Yang's comparison (picture+story on a monitor vs walkable VR) also differed in resolution, head-tracked navigation and interaction fidelity (the IMAGE condition deliberately minimised interaction), and the authors cannot attribute the effect. The CN's 2D web interface vs navigable museum will likewise differ in navigation and interaction, so 'primarily in spatial organisation' needs design controls (matched input device, matched interactions such as opening layers) or must be reported as a bundled contrast.
- **MAK-R13** (Makransky & Petersen 2021; concept note §7, P88-P91): Frame and design the comparison as a test of an instructional method (epistemic spatialisation) rather than a media comparison. Hold immersion level, control factors and representational fidelity as constant as possible across pathways, or measure them, so that a difference cannot be attributed to the medium.
  - Paper: PDF p. 14: “Rather than conducting media comparisons that could potentially lead to a body of research that may not show any consistent differences between modalities”
  - Conflict: Qualification, not outright contradiction. Concept note P91: 'The intended comparison is therefore not a 'fancy 3D museum' versus a plain webpage, but two informationally equivalent knowledge pathways that differ primarily in spatial organisation.' Yet Pathway A is 'A well-designed 2D web interface' navigated by 'menus, cards, headings and hyperlinks' (P88) and Pathway B is the 3D Hand Block Museum (P90). These differ in medium (3D navigable environment vs 2D web), control factors and representational fidelity as well as in spatial organisation. CAMIL argues that such media comparisons may show no consistent differences and that effects come from method x media interactions. The design therefore confounds spatial organisation with medium unless the confound is controlled or measured.
- **PET-R01** (Petersen et al. 2022; concept note §7, P88-P91; §8, P94): Avoid an unanalysable media comparison. Either isolate the manipulated feature (here, spatial organisation) while holding immersion and interactivity constant across pathways, or cross the factors as Petersen et al. did (2 x 2: immersion x interactivity). At minimum, document which of immersion, interactivity and spatial organisation differ between Pathway A and B.
  - Paper: PDF p. 1: “VR studies often involve media comparisons that make it difficult to disentangle the relative effects of technological features on learning.”
  - Conflict: Qualification. Concept note P91 says the two pathways 'differ primarily in spatial organisation', but Pathway A is 'A well-designed 2D web interface' with 'menus, cards, headings and hyperlinks' (P88) and Pathway B is a navigable 3D museum (P90). Under Petersen et al.'s definitions they also differ in immersion and in the kind of interactivity (teleport/walk-and-trigger vs hyperlink navigation). Petersen et al. warn that such comparisons make it difficult to disentangle which feature caused an effect.
- **PET-R16** (Petersen et al. 2022; concept note §1, P5; §2, P14; §3, P32): Do not assume that free exploration adds extraneous load. In Petersen et al., free exploration (high interactivity) produced LOWER environment-related extraneous load than passively watching an optimal tour, and immersion had no effect on either extraneous-load subscale. The study should test, not presuppose, that spatial navigation adds burden.
  - Paper: p. 11 (PDF p. 11): “Surprisingly, lower interactivity was associated with higher extraneous cognitive load stemming from the environment;”
  - Conflict: Concept note P5: 'Immersion can also increase cognitive load when users must simultaneously understand content, navigate space and learn unfamiliar controls.' P14: 'interface complexity, navigation and excessive choice may introduce extraneous cognitive load.' P32 attributes to this paper that it 'Demonstrates that extraneous load can undermine the benefits of immersion.' Petersen et al.'s data show no immersion effect on extraneous load, and the opposite direction for interactivity (passive viewing raised environment-related extraneous load). This qualifies the concept note's assumptions and contradicts its characterisation of this paper.
- **PET-R20** (Petersen et al. 2022; concept note §9, P98; §9, P101): Avoid an identical pre- and post-test, or control for testing effects. A pre-test can direct attention to what the learner does not know and inflate post-test scores. This applies to the concept note's identical before/after concept-mapping task and its pre/post knowledge questions. Use parallel forms, or a post-only control or Solomon-type check if feasible.
  - Paper: p. 13 (PDF p. 13): “A pre-test may, for instance, direct attention towards what the learner does not know during subsequent instruction, thereby enhancing performance on the post-test (Hartley, 1973).”
  - Conflict: Concept note P98: 'Before and after learning, participants can organise or connect a fixed set of concepts', and P101: 'pre/post factual and conceptual questions.' Petersen et al. list re-use of the same knowledge test pre and post as a limitation (testing/sensitisation effect). Re-using the same fixed concept set before and after carries the same risk, and it applies to both pathways but may interact with the condition.
- **ZHOU-R03** (Zhou et al. 2022; concept note §8, P93–P94): Sample size must be set by an a-priori power analysis using a realistic effect size. The pooled AR/VR museum effect on achievement is g = 0.45 (95% CI 0.00–0.89); a between-group design must be powered for an effect of this order, not for a large effect.
  - Paper: p. 11 (PDF p. 11): “The weighted mean effect size for academic achievement synthesized from 13 studies was 0.45 (95% CI [0.00, 0.89], k = 13),”
  - Conflict: Concept note: 'Target sample: approximately 40 participants.' (P93) and 'A simple between-group design can allocate approximately 20 participants to each pathway.' (P94). Zhou's pooled achievement effect (g = 0.45) is a benchmark, not a claim about our study; by our own calculation (not in the paper), a two-tailed independent t-test with 20 per group has roughly 25–30% power to detect d = 0.45 at alpha = .05, and about 80 per group would be needed for 80% power. The concept note itself notes the within-participant alternative 'offers more statistical sensitivity with a sample of 40' (P95). This is a qualification for the researchers to resolve, not a contradiction of the paper.
- **AIDEN-R04** (Quantin et al. 2024 (AIDEN); concept note §5, P74; §9, P98): Do not assume 3D/spatial presentation is superior for small knowledge sets: AIDEN's authors judge 2D sufficient below ~100 nodes and easier below 20 nodes. Our concept-map set (~10 concepts) and three-tradition prototype are small, so the hypothesis must be tested, and the 2D pathway must be a genuinely strong interface.
  - Paper: p. 539 (PDF p. 2): “may be enough to supervise the data; beyond 800 nodes,”
  - Conflict: Qualification, not direct contradiction. Concept note P74: 'users of the epistemically spatialised environment will show greater improvement in relational knowledge structure than users receiving the same knowledge through a conventional structured interface.' P98 uses a fixed set of about ten concepts ('material, fibre, mordant, dye, water, block, process sequence, environmental condition, reaction and colour outcome'). AIDEN states 'With less than 100 nodes, 2D applications may be enough' and that for '<20 nodes, a 2D representation is easier to read'. AIDEN's context is expert data supervision, not learning, and the claim is the authors' judgement, not tested data; but it warns that spatial advantage is least likely at small scale.
- **AIDEN-R12** (Quantin et al. 2024 (AIDEN); concept note §7, P91): Provide a togglable mini-map (AIDEN places it on a virtual wristwatch) to maintain spatial awareness, hidden by default to honour map minimisation; log every toggle as a guidance/support event.
  - Paper: p. 541 (PDF p. 4): “spatial awareness within the graph, a real-time togglable mini-”
  - Conflict: Qualification. Concept note P91: 'the map may be minimised'. AIDEN treats a real-time mini-map as a spatial-awareness aid ('to assist users in maintaining spatial awareness within the graph'), citing Hayatpur et al. as positive evaluation (secondary). A togglable, default-hidden map reconciles the two; removing the map entirely would go against this source.
- **WEN-R08** (Wen et al. 2024; concept note §9, P103): The cognitive-load measure must separate content difficulty (intrinsic) from interface/navigation burden (extraneous). A single overall NASA-TLX workload score, as used by Wen et al., does not meet this requirement and must be supplemented or replaced by a differentiated instrument.
  - Paper: p. 6 (PDF p. 6): “Dependent variable: scores; predictors: (constant), overall workload”
  - Conflict: Concept note P103: 'Cognitive load: short validated perceived-load measure, with attention to separating content difficulty from interface/navigation burden.' Wen et al. measured cognitive load only as NASA-TLX overall workload and state that they did not consider intrinsic load from task complexity ('learners' previous learning experience and the complexity of learning tasks produce intrinsic cognitive load'). So Wen's instrument and results cannot be used as precedent for the separation the concept note requires; the concept note's citation of Wen for cognitive-load reduction (P46) refers to total workload only.
- **WEN-R10** (Wen et al. 2024; concept note §8, P93–P94): Plan sample size against effects of the size Wen et al. found. With 40 per group they detected partial eta squared 0.30 for workload and 0.09 for performance; a 20-per-group design has markedly less power for an effect like the performance effect.
  - Paper: p. 4 (PDF p. 4): “ered a group of 40 students. One class was the control group,”
  - Conflict: Concept note P94: 'A simple between-group design can allocate approximately 20 participants to each pathway.' Wen et al. used 40 per group. By our calculation (not in the paper), partial eta squared 0.09 corresponds to d of about 0.63; with 20 per group a two-tailed t-test has roughly 45–50% power for that effect at alpha = .05. This qualifies the between-group N, consistent with the concept note's own remark that a within-participant design 'offers more statistical sensitivity with a sample of 40' (P95).
- **SONG-R09** (Song & Evans 2024; concept note §7, P91): Do not add multi-sensory channels (audio narration, haptics, animation) or extra narrative layers to Pathway B alone; any such channel must be mirrored in Pathway A or documented as a confound, since Song & Evans present multi-sensory, multi-channel presentation as XR's main added value.
  - Paper: p. 07 (PDF p. 7): “indicated that XR technologies augment artefacts from three”
  - Conflict: Concept note P91: 'two informationally equivalent knowledge pathways that differ primarily in spatial organisation.' Song & Evans locate XR's benefit chiefly in multi-channel curation, multi-sensory experience and audience attraction, i.e. exactly the extra channels the concept note's design excludes. So the paper cannot be cited as support for a spatial-organisation-only effect, and if Pathway B includes any extra sensory or narrative channel, the comparison is confounded.
- **LU-R04** (Lu et al. 2026; concept note §2, P13): If self-explanation checkpoints are added, measure their side effects on exploration and agency (exploration breadth, path entropy, and an agency item or scale), because the paper frames self-explanation as constraining exploration and never measured agency. Do not claim that the checkpoints preserve agency without our own data.
  - Paper: p. 4 of 21 (PDF p. 4): “Rather, it operates as a cognitive regulation mechanism that constrains exploration, stabilises attention, and supports the transformation of multimodal sensory input into conceptual representations.”
  - Conflict: Concept note P13: 'Lightweight guidance, signalling and self-explanation can help stabilise attention while preserving agency.' Lu et al. design self-explanation as a mechanism that 'constrains exploration' and 'regulates the otherwise open-ended exploratory nature of VR'. Regulation and constraint are the purpose, not a side effect, and agency was not measured. The paper therefore supports 'stabilise attention' but gives no basis for 'preserving agency', and its rationale points the other way.
- **LU-R08** (Lu et al. 2026; concept note §8, P93-P94): Plan sample size for realistic effects. Lu et al.'s between-group effects were medium (d = 0.56-0.64, n = 28 per group), and the authors call their sample small. With about 20 per group, a two-tailed independent t-test at alpha .05 has only about 45% power for d = 0.6; about 45 per group are needed for 80%. Justify N with an a-priori power analysis, or adopt the within-participant alternative (P95).
  - Paper: p. 8 of 21 (PDF p. 8): “located to either the experimental condition (SE-VML; n=28) or”
  - Conflict: Concept note P93-P94: 'Target sample: approximately 40 participants' and 'A simple between-group design can allocate approximately 20 participants to each pathway.' Lu et al. call n = 56 (28 per group) a small sample. At the effect sizes they found, 20 per group is underpowered. The power figure is our calculation (normal approximation), not a claim in the paper.

**Sample size (derived; not a statement by any paper).** The concept note plans about 20 participants per group (§8, P94). Exact two-sample t-test power at n = 20 per group:
- d = 0.45 (Zhou et al.'s pooled achievement effect): 0.284; 80% power needs 79 per group.
- d = 0.60: 0.456; needs 45 per group.
- d = 0.64 (Lu et al.'s largest effect): 0.505; needs 40 per group.
- d = 0.84 (Yang et al.'s recall effect): 0.735; needs 24 per group.

Unless the expected effect is large, the planned between-group sample is underpowered. Petersen et al. (2022) and Lu et al. (2026) also report sample-size limitations (see their requirement entries).

## 5. Requirements from the reference papers

Grouped by paper. `Relation` gives how each requirement stands against the concept note (supports, extends, conflicts, independent).

### Krokos et al. 2019

Krokos, E., Plaisant, C., & Varshney, A. (2019). Virtual memory palaces: immersion aids recall. *Virtual Reality*, 23(1), 1–15. https://doi.org/10.1007/s10055-018-0346-3

**KROKOS-R01** [study-design; design description; relation: supports; concept note §8, P95]: If a within-participant design is used (CN P95), counterbalance condition order, environment and content set with a Latin-square, and test the nuisance factors (scene, content set, order) statistically before interpreting the condition effect.
- PDF p. 8: “At the end, each participant was tested on the two display conditions, desktop and HMD, on two different scenes, and with two different sets of 21 faces.”
- PDF p. 8: “We confirmed using a four-way mixed ANOVA that there”

**KROKOS-R02** [limitation-risk; finding from this study's own data; relation: conflicts; concept note §8, P95]: Treat carry-over between conditions as a measured risk in any within-participant design: report first-exposure (between-subjects) comparisons separately and test for order effects, because performance after switching from immersive to non-immersive dropped.
- PDF p. 9: “from a HMD to a desktop, their performance surprisingly”
- PDF p. 10: “Virtual Reality We note the interesting results we obtained with the display ordering. When starting with the desktop and then using the HMD, we observed a significant improvement as compared to starting with the HMD and then using the desktop.”
- PDF p. 10: “using the HMD, we observed a significant improvement”

**KROKOS-R03** [study-design; finding from this study's own data; relation: extends; concept note §8, P93–P94]: Use the effect size from this study only as an upper-bound reference for power planning: an 8.8-percentage-point recall gain was detected within-subject with N = 40; a between-group design with ~20 per pathway (CN P94) will have markedly less power for an effect of this size.
- PDF p. 8: “The overall average recall performance of participants in”
- PDF p. 8: “HMD condition at 84.05% and the desktop condition at 75.24%.”
- PDF p. 5: “recruited 40 participants, 30 male and 10 female, from our”

**KROKOS-R04** [measurement-instrument; design description; relation: extends; concept note §9, P99]: For retrieval items, score correct, incorrect (commission error) and skipped (omission) answers separately and collect an item-level confidence rating (1–10, 10 = certain) so that confidence calibration can be analysed per condition.
- PDF p. 7: “to 10, with 10 being certain. If a participant had no answer”
- PDF p. 8: “our user studies made an error in recall (i.e., gave an”
- PDF p. 9: “number of errors given in each display based on the”

**KROKOS-R05** [measurement-instrument; design description; relation: extends; concept note §8, P94]: Decide explicitly where the post-test is administered. Krokos tested recall inside the same virtual scene (numbers replaced the items at their locations); because recall is context-dependent, a post-test given only inside one pathway's medium would bias the between-pathway comparison. Administer the CN's post-test and concept-map task in a neutral medium identical for both pathways, or in each pathway's own medium for both.
- PDF p. 1: “is superior in the same environment in which the learning” *(secondary: reports another study)*
- PDF p. 7: “display with numbers having replaced the faces, as shown”
- PDF p. 4: “study were asked to recall the information while viewing the”

**KROKOS-R06** [spatial-design; design description; relation: extends; concept note §7, P90]: When placing knowledge items in a room, distribute them around the viewer at varying distances, oriented to face the viewer, and check that their apparent (angular) size is balanced across item sets/conditions so that visual salience does not differ between content groups.
- PDF p. 6: “distributed the faces at varying distances from the users'”
- PDF p. 6: “location (see Fig. 2) so that they surrounded and faced the”
- PDF p. 6: “tion of the faces across the two sets/environments was not”

**KROKOS-R07** [spatial-design; design description; relation: extends; concept note §7, P90]: The spatial compiler must produce a deterministic layout: the same content must land in the same positions for every participant in a condition (no per-participant randomisation), to avoid uncontrolled neighbour/background salience effects; the layout seed/version must be recorded with each session.
- PDF p. 6: “The faces in the palace and medieval town were hand”
- PDF p. 10: “object semantic saliency confounds, we decided to preserve”
- PDF p. 10: “the same ordering of faces for all participants that viewed”

**KROKOS-R08** [content-knowledge-modelling; design description; relation: supports; concept note §8, P95]: Match the content sets used in different conditions/traditions on a measurable familiarity or difficulty index and test the match statistically before the study (Krokos matched face sets on Google Trends scores, p = 0.45).
- PDF p. 5: “into two sets of roughly equal familiarity. We quantified the”
- PDF p. 6: “between the two sets of Google trends data: p = 0.45 > 0.05.”

**KROKOS-R09** [interface-design; design description; relation: supports; concept note §10, P123–P124]: Allow self-paced, free-order exploration of the items within a space (ecological validity) rather than forcing a fixed viewing order, and log the order actually followed, since presentation order becomes participant-determined.
- PDF p. 7: “to look in any direction, the order of presentation of faces”
- PDF p. 10: “look around freely, so that the results would achieve greater”

**KROKOS-R10** [technical-implementation; design description; relation: supports; concept note §7, P91]: Use one rendering engine, the same assets and matched rendering parameters (resolution, field of view, lighting) for every display condition, so that only the intended factor differs; Krokos rendered both conditions with identical in-house C++/OpenGL software at 1920×1080 and a 100° FOV with realistic lighting, shadows and textures.
- PDF p. 5: “and HMD was identical and was designed in-house using”
- PDF p. 5: “The software used to render the 3D environments on both the desktop and HMD was identical and was designed in-house using C++ and OpenGL-accelerated rendering. The rendering was designed to replicate a realistic looking environment as closely as possible, incorporating realistic lighting, shadows, and textures.”
- PDF p. 5: “The rendering was designed to replicate a realistic looking environment as closely as possible, incorporating realistic lighting, shadows, and textures.”

**KROKOS-R11** [limitation-risk; author recommendation; relation: extends; concept note §7, P90]: Do not cite Krokos as evidence for navigation-based learning: participants could only rotate the view (no translation), so the effect of moving through rooms and pathways (CN P90, P73) is untested there; our platform's walkthrough must be evaluated on its own.
- PDF p. 6: “Users were allowed to freely rotate their view but not”
- PDF p. 6: “their head and body, but no further navigation was possible.”
- PDF p. 13: “the addition of translation impacts information recall in a”

**KROKOS-R12** [limitation-risk; author recommendation; relation: conflicts; concept note §7, P91]: Recognise that display and interaction modality were confounded (head tracking vs mouse); our 2D-vs-spatial comparison will likewise confound spatial organisation with interaction modality unless the input technique is matched or its effect is measured.
- PDF p. 10: “The modality of interactive exploration of the virtual environment in the two conditions was different (head tracking versus mouse tracking). Thus, differences in the recall performance may be explained by this diverse interaction modality.”

**KROKOS-R13** [accessibility-ux; finding from this study's own data; relation: supports; concept note §7, P91]: Provide an untimed, content-free onboarding in the environment (controls and looking around only) before any learning content appears, and record prior VR/3D experience, because novice HMD users remained not fully accustomed even after acclimatisation.
- PDF p. 6: “They were given as much time as they desired to get comfortable, looking around the scene without numbers or faces.”
- PDF p. 10: “Although we gave the participants enough time to get comfortable in the HMD before we began the study, we observed that many were not fully accustomed to the HMD, even though they performed better in it.”
- PDF p. 10: “fully accustomed to the HMD, even though they performed”

**KROKOS-R14** [spatial-design; finding from this study's own data; relation: supports; concept note §2, P11]: Support egocentric (body-relative) placement cues: arrange knowledge objects so that their position relative to the learner's standing point is distinctive, because participants reported associating items with locations around their own body and valued spatial awareness.
- PDF p. 10: “majority of the users (70%) reported that HMD afforded”
- PDF p. 10: “palace setup by associating the information relative to their”
- PDF p. 10: “spatial context around the body only adds to the benefit of”

**KROKOS-R15** [measurement-instrument; finding from this study's own data; relation: supports; concept note §9, P105–P106]: When collecting condition preference or UX ratings, instruct participants explicitly not to base them on novelty, and treat preference as secondary: 38 of 40 preferred the HMD although almost none had used one before.
- PDF p. 10: “that their decision should not be based on the novelty or”
- PDF p. 10: “the 40 participants stated they preferred the HMD for this”

**KROKOS-R16** [study-design; design description; relation: extends; concept note §8, P94]: Separate encoding and retrieval with a filled delay so that retrieval engages long-term memory; Krokos used fixed 5-min study, a 2-min distractor conversation and 5-min recall per trial, after an untimed pre-familiarisation with all items.
- PDF p. 7: “After the 5-min period, the display went blank and each”
- PDF p. 7: “recall 21 faces after a 2-min break will engage their”
- PDF p. 7: “of all the faces in the scene. Once the participant was”

**KROKOS-R17** [logging-analytics; design description; relation: extends; concept note §10, P125–P126]: Log every answer revision (not only the final answer) during post-tests, with item id, answer, confidence and timestamp, as Krokos recorded changes to previously given answers.
- PDF p. 8: “the number, name, user confidence, and any changes in a”

**KROKOS-R18** [study-design; design description; relation: independent]: Use paired/appropriate tests with multiple-comparison correction (Krokos: paired t-tests with Bonferroni-Holm; chi-square for confidence-level counts) when several outcome measures are compared across conditions.
- PDF p. 8: “a paired t test with Bonferroni-Holm correction resulting in”
- PDF p. 9: “conditions, with p = 0.009 < 0.05 using a Chi-square test,”

**KROKOS-R19** [limitation-risk; author recommendation; relation: independent]: Report the trade-off between experimental control and ecological validity explicitly in the study design (fixed vs free order, fixed vs randomised layout), as Krokos do.
- PDF p. 10: “In general, it is a difficult design decision to balance the”
- PDF p. 10: “goals of experimental control and ecological validity. In”

**KROKOS-R20** [spatial-design; author recommendation; relation: supports; concept note §4, P68–P69]: Treat layout and distribution of content, visual salience of the structure and learner-built arrangements as open design variables (named by the authors as future work); the spatial compiler should expose them as parameters so they can be varied or held constant.
- PDF p. 13: “ments in the architecture of the virtual memory palaces”
- PDF p. 13: “outs and distribution of content that could help with recall.”
- PDF p. 13: “to build their own virtual memory palaces, manipulate and”

### Yang et al. 2021

Yang, F., Qian, J., Novotny, J., Badre, D., Jackson, C. D., & Laidlaw, D. H. (2021). A virtual reality memory palace variant aids knowledge retrieval from scholarly articles. *IEEE TVCG*, 27(12), 4359–4373. https://doi.org/10.1109/TVCG.2020.3009003

**YANG2021-R01** [study-design; design description; relation: conflicts; concept note §8, P94–P95]: Assign each participant to only one spatial/strategy condition (between-subjects for the treatment), because a spatial strategy learned in one condition cannot be unlearned and would carry into the other.
- PDF p. 3: “learned a strategy, they cannot "unlearn" it. To mitigate the”
- PDF p. 3: “A third design decision was to assign one mnemonic”
- PDF p. 3: “spatial cues in the first mnemonic condition and bring”

**YANG2021-R02** [study-design; design description; relation: supports; concept note §8, P94]: Collect a within-person baseline (a control session or pre-test without the treatment) so that between-group comparisons can be adjusted for large individual differences in reading and memory; Yang used a no-strategy control visit 3–4 days before the treatment visit.
- PDF p. 3: “the known large variance in learning, reading, and”
- PDF p. 2: “first took part in the control condition. After 72-96 hours (3-4”

**YANG2021-R03** [limitation-risk; finding from this study's own data; relation: extends; concept note §8, P93–P94]: Plan the sample size in advance (power analysis) rather than by recruitment deadline; Yang's 25 analysed participants (12 vs 13 per group) produced wide confidence intervals, so a CN study with ~20 per pathway should expect similar imprecision for moderate effects.
- PDF p. 6: “number of participants was decided based on a planned”
- PDF p. 6: “already read. We thus had 12 participants from the IMAGE”
- PDF p. 8: “but we were not able to estimate its real size from this”

**YANG2021-R04** [measurement-instrument; design description; relation: extends; concept note §9, P101–P102]: Score free-recall/explanation responses as idea units (propositions): correct, wrong, new (elaboration) and half credit for incomplete units, using two trained raters on the source text and a scorer blind to condition. Use this as the scoring model for the CN's knowledge-acquisition and transfer answers.
- PDF p. 6: “of knowledge retrieved [65], [66]. An idea unit is usually a”
- PDF p. 6: “from a recall could be correct, wrong, or new (elaboration),”
- PDF p. 6: “without knowing the source of recalled passages (i.e., which”

**YANG2021-R05** [measurement-instrument; design description; relation: supports; concept note §9, P99]: Define outcome ratios against the reference content: recall accuracy (correct units / units in source), recall precision, and a new-idea (intrusion) rate to detect false memories. These map onto the CN's concept-map metrics: valid relations vs an expert map, incorrect relations.
- PDF p. 7: “Recall accuracy is the ratio of the number of correct idea”
- PDF p. 7: “New idea rate is the ratio of the number of new idea units”
- PDF p. 7: “The new idea rate measured whether participants To quantify the differences between the two mnemonic con- 628 592 introduced false memories (e.g.,"memories of events that took ditions, we used mixed-effects models, since the experiment 629 593 place within experiments but which do not correspond to had both within- and between-subjects components.”

**YANG2021-R06** [measurement-instrument; finding from this study's own data; relation: extends; concept note §9, P101]: Do not rely on yes/no recognition items as a primary outcome: they showed ceiling-level performance and no effect; prefer recall/reconstruction (e.g., concept maps) and pilot item difficulty to avoid ceilings. If recognition is used, build distractors by reversing a conclusion or changing a number, not by mere rewording.
- PDF p. 7: “considered an easy task [49] in which people usually”
- PDF p. 10: “kind of ceiling effect. In cases where users had high baseline”
- PDF p. 6: “were distractors; they were revisions of the sentences in the”

**YANG2021-R07** [study-design; design description; relation: independent]: Analyse with estimation statistics: bootstrap (BCa) 95% confidence intervals and Cohen's d for differences, and mixed-effects models with condition as fixed effect and participant random intercepts when within- and between-subject components are combined.
- PDF p. 6: “We report the 50% 538 483 perienced and comfortable with reading scientific publica- and 95% adjusted bootstrap percentile (BCa) confidence 539 484 tions.”
- PDF p. 7: “modeled the experimental conditions as a fixed effect and”
- PDF p. 7: “We 630 594 experimentally presented stimuli" [73]). modeled the experimental conditions as a fixed effect and 631 595 To clarify, previous work used the order of recalled items participants as random intercepts. The fixed effect quan- 632 596 as a measure (e.g., [15], [19], [23], [24], [74]).”

**YANG2021-R08** [spatial-design; theoretical claim; relation: supports; concept note §7, P90]: The spatial compiler should support a hierarchical placement rule: each knowledge unit (e.g., a process step or concept card) is anchored at one locus, and its sub-ideas are placed in the space immediately around that locus, forming a spatial concept map.
- PDF p. 4: “is more complex than word lists: each passage is associated”
- PDF p. 4: “is associated with the spatial information near the locus.”
- PDF p. 11: “helps construct a fuzzy cognitive map [83] that represents”

**YANG2021-R09** [spatial-design; design description; relation: extends; concept note §7, P90]: Choose loci with explicit criteria and record them: physical/device constraints, distance between loci, and visual distinctiveness; Yang selected loci from the customer area of the scene on these three criteria.
- PDF p. 5: “the loci in the palace based on three criteria: (1) the”
- PDF p. 5: “straints of the available physical space and devices; (2) the”
- PDF p. 5: “distances between the loci; and (3) the visual appeal of the”

**YANG2021-R10** [spatial-design; author recommendation; relation: extends; concept note §7, P90]: Use an environment type that participants are likely to find familiar, and check familiarity in the post-questionnaire: the benefit may depend on it, and participants unfamiliar with the scene had to learn the spatial cues as an extra task.
- PDF p. 4: “generic coffee shop as their "palace" since the potential”
- PDF p. 10: “but they might not have been able to utilize spatial cues”
- PDF p. 10: “effectively because they had to finish an extra task of”

**YANG2021-R11** [learning-design; author recommendation; relation: supports; concept note §2, P13]: Give participants an explicit spatial strategy and a predefined route through the loci (guided rather than free exploration), with a short training and comprehension quiz that must be passed before the learning session.
- PDF p. 12: “participants a clear strategy to use--we guided participants”
- PDF p. 12: “to build a hierarchical memory palace and move along a”
- PDF p. 5: “to answer all three quiz questions correctly before they”

**YANG2021-R12** [interface-design; design description; relation: supports; concept note §7, P91]: Show one text unit at a time in both pathways (in VR because of resolution/FOV limits; on desktop by blurring all but the passage under the cursor), and provide a ray/laser pointer in 3D as the analogue of the mouse cursor.
- PDF p. 4: “used. We had each participant read one passage at a time”
- PDF p. 4: “due to the limited resolution and field-of-view (Figs. 2bc).”
- PDF p. 4: “We implemented a laser pointer in virtual reality (Fig. 2c),”

**YANG2021-R13** [interface-design; design description; relation: supports; concept note §7, P91]: Guarantee informational equivalence at the rendering level: render the text in the spatial pathway from the same source/formatting as the 2D pathway (Yang used screenshots of the on-screen text as VR textures), and restrict manipulable objects to the content so the layout stays fixed.
- PDF p. 4: “passage objects in VR were screenshots of the text on”
- PDF p. 4: “the screen in IMAGE to eliminate formatting factors [57]”
- PDF p. 4: “allowed in virtual reality so that we could control the loci”

**YANG2021-R14** [limitation-risk; author recommendation; relation: conflicts; concept note §7, P91]: Expect the spatial-vs-conventional contrast to bundle several factors (display resolution, head-tracked navigation, interaction fidelity); either vary them independently or state that the comparison tests the bundle, since Yang could not tell which factor produced the effect.
- PDF p. 11: “Each of our conditions vary in resolution, head tracking for”
- PDF p. 11: “navigation, and the level of interaction fidelity. While these”
- PDF p. 11: “is an open question which combination of factors causes”

**YANG2021-R15** [interface-design; theoretical claim; relation: supports; concept note §1, P7]: Allow learners to physically/virtually move between loci and to move and resize content panels; the authors propose physical navigation and these rich interactions as likely contributors to the VR advantage.
- PDF p. 5: “access passages in order, move and scale passages, and”
- PDF p. 11: “in a virtual reality environment. Being able to resize, move,”
- PDF p. 11: “ideas and build information flow. Physical navigation may”

**YANG2021-R16** [technical-implementation; design description; relation: independent]: If a room-scale HMD is used, specify the tracked area and hardware: Yang used an HTC Vive (2017) in a 6.5 m × 2.7 m area with fixed base-station positions; record the device and play-area size per session.
- PDF p. 5: “Apparatus We used an HTC Vive (2017 model) [60] and”
- PDF p. 5: “All participants received the same HMD, and the locations”

**YANG2021-R17** [technical-implementation; design description; relation: independent]: Render the learning environment with life-size, near-photorealistic assets using baked lighting (global illumination, normal maps, reflection, refraction, ambient occlusion baked into textures) to keep the scene realistic at real-time frame rates.
- PDF p. 5: “with a coffee shop, we used life-size 3D models and a”
- PDF p. 5: “nearly photorealistic rendering quality (only in the main”
- PDF p. 5: “Participants then read four passages and flection, refraction, and ambient occlusion; all were pre- 429 372 associated each passage to a given locus (see Fig.”

**YANG2021-R18** [logging-analytics; finding from this study's own data; relation: extends; concept note §10, P108, P139]: Log continuous 6-DoF pose of the head and each controller and derive cumulative distance moved, speed and dwell positions, and also log view targets (what the user is looking at), which Yang could not recover. Validate logging before the main study, because one participant's data may have been lost to a logging issue.
- PDF p. 9: “We therefore one controller more than the other, possibly indicating a 752 727 analyzed participants' movements in VR for each device dominant hand. 753 728 (i.e., headset, the left and right controllers). Last, we investigated the correlation between cumula- 754 729 We show the density of each device's position in tive distance moved, speed, and recall accuracy (Fig.”
- PDF p. 9: “cumulative distance moved and distance moved per minute”
- PDF p. 9: “to recover the view targets in the experiment. We therefore”
- PDF p. 9: “These observations only support that these two their recall accuracy varied. We may have had a data logging 744 720 groups of participants are comparable.”

**YANG2021-R19** [logging-analytics; finding from this study's own data; relation: extends; concept note §10, P139]: Do not assume that more movement means more learning: in Yang's data, distance moved and speed were not strongly correlated with recall. Analyse movement metrics against outcomes, as the CN plans in P139, rather than using them as proxies for engagement.
- PDF p. 9: “We did not observe a strong correlation”
- PDF p. 9: “selves near four positions, which were the loci given in the”

**YANG2021-R20** [accessibility-ux; finding from this study's own data; relation: supports; concept note §2, P14]: Mitigate VR-specific burdens that may add extraneous load: overwhelming or distracting environment, jitter, heavy tethered headset, no visible clock (an in-world timer is preferable to experimenter interruptions), and ambient noise.
- PDF p. 10: “For example, the virtual reality word lists because of the additional support that meaningful 869 813 environment was overwhelming or distracting (2/13). material receives from long-term memory [16], which may 870 814 T5: Some participants (2/13) reported hardware issues such also explain some of the ineffectiveness.”
- PDF p. 12: “heavy (about 1.2 lbs without cables) and limited by cables;”
- PDF p. 12: “reality setup lacked a real world clock; the time reminder”

**YANG2021-R21** [accessibility-ux; finding from this study's own data; relation: extends; concept note §9, P105]: Expect heterogeneous responses to the spatial pathway (about half found VR useful, half had difficulties) and capture them with a post-session open-ended questionnaire analysed thematically by two independent coders.
- PDF p. 10: “comments; half of the participants found it useful, while the”
- PDF p. 9: “the three conditions, two authors encoded all the comments”

**YANG2021-R22** [measurement-instrument; author recommendation; relation: extends; concept note §8, P94]: Measure individual-difference covariates (verbal ability, visuospatial ability, topic interest, prior strategy use) with standardised tests BEFORE the session rather than post-hoc self-ratings, and record whether participants already use their own mnemonic strategies.
- PDF p. 11: “post-experiment subjective ratings. Using standard”
- PDF p. 8: “The effects Fig.7a), including participants' gender, age, interest in the 687 of other measures and comparisons remained inconclusive.”
- PDF p. 9: “T1: Most participants (16/25) used their own strategy in the”

**YANG2021-R23** [content-knowledge-modelling; design description; relation: supports; concept note §6, P76]: Equate content units on length and readability (e.g., Flesch-Kincaid grade) and choose a topic unfamiliar but accessible to participants; Yang's 12 abstracts were matched on length and averaged FK grade 13.56.
- PDF p. 6: “set contained 12 abstracts of similar length, each describing”
- PDF p. 6: “These passages had an average to assess the effects of using virtual reality techniques to 510 453 Flesch-Kincaid grade level [63] of 13.56 ( = 2.07, from [64]), facilitate a memory palace variant for this process of re- 511 454 meaning that they could be read by an average college trieving scientific knowledge.”
- PDF p. 5: “since this topic is likely to be unfamiliar”

**YANG2021-R24** [study-design; design description; relation: supports; concept note §9, P104]: Fix and enforce time limits for learning and testing identically across pathways (Yang: up to 30 min to read, up to 30 min to recall), and log time-on-task, since some participants used time more efficiently on the second visit.
- PDF p. 5: “passages together. They had up to 30 minutes to read”
- PDF p. 5: “participant had up to 30 minutes for this session.”
- PDF p. 10: “some participants got more efficient at using the 30 minute”

**YANG2021-R25** [limitation-risk; author recommendation; relation: extends; concept note §8, P94]: Control for novelty, self-selection and experimenter-contact biases: VR-interested people may self-select, the non-VR group may be disappointed, and VR participants had more contact with the experimenter (help with equipment). Standardise experimenter interaction across pathways and report these biases.
- PDF p. 12: “participants who have a good memory or are interested”
- PDF p. 12: “The 1050 participants assigned to IMAGE may be disappointed by 1051 not using virtual reality. Alternatively, participants using 1052 virtual reality might be more engaged in the experiment.”
- PDF p. 12: “with the experimenter in VR (e.g., by helping them put on”

**YANG2021-R26** [learning-design; theoretical claim; relation: supports; concept note §4, P68–P69]: Use spatial and visual cues to concretise abstract concepts (map abstract content to vivid objects at loci), and extract and visualise the ideas in a passage in space rather than only displaying text panels. The authors name the latter as future work, and it is the CN's knowledge-to-space step.
- PDF p. 11: “ing virtual reality techniques helps concretize the abstract”
- PDF p. 11: “concepts and map them to the vivid visual and spatial cues”
- PDF p. 11: “like Google ARCore [80] and load the models in virtual”
- PDF p. 11: “from passages in virtual reality, similar to visualizing the”

**YANG2021-R27** [spatial-design; author recommendation; relation: extends; concept note §7, P90]: Offer (or at least study) personalisation of the spatial setting: participants asked for different locations or scenes (nature, home), and the authors suggest personalised spatial cues and more efficient loci as future work. For the controlled study, keep one normalised layout and note that normalisation may weaken effects.
- PDF p. 1: “Anecdotal feedback from participants suggested that personalizing a memory palace variant would be appreciated.”
- PDF p. 12: “method might be enhanced by building personalized spatial”
- PDF p. 10: “We also show how our experiment and results improving comparability between conditions, and increas- 903 846 are connected to other studies combining memory palace ing statistical power.”

### Makransky & Petersen 2021

Makransky, G., & Petersen, G. B. (2021). The Cognitive Affective Model of Immersive Learning (CAMIL). *Educational Psychology Review*, 33(3), 937–958. https://doi.org/10.1007/s10648-020-09586-2

**MAK-R01** [measurement-instrument; theoretical claim; relation: extends; concept note §9, P106]: Measure presence and agency as the core psychological affordances (process variables) in both pathways, not only an overall engagement score. If presence is measured, decide explicitly which of CAMIL's three dimensions (physical, social, self-presence) applies; physical presence is the relevant one for a museum without social actors.
- PDF p. 6: “The general affordances of learning in IVR are presence and agency.”
- PDF p. 7: “the CAMIL distinguishes between three different dimensions of presence including physical, social, and self-presence”

**MAK-R02** [measurement-instrument; author recommendation; relation: extends; concept note §9, P103-P106]: Where the questionnaire budget allows, include measures of the CAMIL mediators (situational interest, intrinsic motivation, self-efficacy, embodiment, cognitive load, self-regulation) and the external factors. CAMIL itself names no instrument in its text; its reference list cites the Multimodal Presence Scale (Makransky, Lilleholt & Aaby 2017) as a presence measure.
- PDF p. 17: “we hope that researchers will include measures of the variables included in the CAMIL, as well as the external factors, when conducting research on the use of IVR for learning.”
- PDF p. 19: “Development and validation of the multimodal presence scale for virtual reality environments”

**MAK-R03** [measurement-instrument; author recommendation; relation: supports; concept note §9, P101-P102]: Build the knowledge tests on an explicit knowledge taxonomy that scores factual, conceptual and (if applicable) procedural knowledge and transfer separately, instead of a single declarative score. Concept-map relational items count as conceptual knowledge ('classifications and categories, principles ..., models, and structures').
- PDF p. 15: “Future research should use knowledge taxonomies to differentiate between different learning outcomes”
- PDF p. 12: “Conceptual knowledge can include classifications and categories, principles and generalizations, and theories, models, and structures.”
- PDF p. 11: “The types of learning outcomes predicted by the CAMIL include factual, conceptual, and procedural knowledge, and transfer of knowledge”

**MAK-R04** [limitation-risk; review/meta-analysis finding; relation: extends; concept note §9, P101]: Do not expect the spatial/immersive pathway to beat the 2D pathway on factual recall. Pre-register factual items as a secondary outcome where a null or reversed effect is plausible, and keep the primary hypothesis on relational/conceptual structure.
- PDF p. 12: “These results suggest that IVR is not necessarily the ideal medium for teaching factual knowledge”
- PDF p. 12: “Parong and Mayer (2018) found that an immersive VR lesson was less effective than a PowerPoint lesson for acquiring factual knowledge, but they found no significant difference in conceptual knowledge acquisition.” *(secondary: reports another study)*

**MAK-R05** [limitation-risk; theoretical claim; relation: extends; concept note §9, P102]: Design the transfer task ('why?' problem) so it is not situated in a specific room or object of the museum. The test must require applying the knowledge outside the spatial context in which it was learned, and the risk of context-bound learning should be reported.
- PDF p. 15: “immersive lessons are also typically situated, which could make it difficult to transfer knowledge to a different situation.”

**MAK-R06** [cognitive-load; theoretical claim; relation: supports; concept note §7, P91]: Minimise extraneous load from searching the 3D scene. Relevant knowledge objects must be easy to find in the field of view, and seductive or decorative details that do not carry knowledge must be removed or visually subordinated.
- PDF p. 10: “this can also increase extraneous cognitive load because learners have to find relevant content, specifically when the content includes seductive details that are not necessary for learning”
- PDF p. 13: “more complex visual representations and details, which represent better representational fidelity and can lead to higher presence, may also lead to virtual environments that result in higher extraneous CL and less learning.”

**MAK-R07** [cognitive-load; theoretical claim; relation: supports; concept note §2, P14; §7, P91]: Constrain choice in the spatial pathway: offer bounded, meaningful options (e.g. ordered rooms, progressive disclosure) rather than unrestricted autonomy over what to view and interact with. Agency raises extraneous load and does not automatically increase learning.
- PDF p. 14: “Similarly, more agency does not necessarily mean more learning when it can lead to more extraneous CL.”
- PDF p. 10: “which allowed for more agency by giving learners autonomy to view the content of their choices and to interact with features in an interactive immersive laboratory simulation, was not optimal or conducive to learning because this might have led to extraneous CL” *(secondary: reports another study)*

**MAK-R08** [interface-design; author recommendation; relation: supports; concept note §7, P91]: Apply the coherence principle. Remove material and functions that invite hedonic, non-instructional activity (social/live features, unnecessary controls, decorative interactions) from both experimental pathways.
- PDF p. 16: “the coherence principle (Mayer and Fiorella 2014; e.g., leave out irrelevant material that leads to hedonic activities but does not support learning)”
- PDF p. 11: “Hedonic information systems focus on the fun aspect of using the system and are designed to provide self-fulfilling rather than instrumental value to the user, thereby encouraging prolonged rather than productive use.”

**MAK-R09** [guidance-signalling; author recommendation; relation: supports; concept note §2, P13; §3, P37-P38]: Signal relevant features (e.g. highlighting the knowledge object or relation currently relevant) without breaking presence: use diegetic or in-world cues rather than intrusive overlay panels where possible.
- PDF p. 16: “the signaling principle (Mayer and Fiorella 2014; e.g., help learners focus their attention on relevant features in a way that does not diminish their presence)”

**MAK-R10** [learning-design; author recommendation; relation: supports; concept note §7, P90-P91]: Manage essential processing. Provide pre-training (onboarding to controls and key concepts) and learner-paced segments (progressive disclosure per room/layer). Decide whether to use the modality principle (spoken instead of printed words), applied identically in both pathways to preserve informational equivalence.
- PDF p. 16: “including the pre-training (Meyer et al. 2019), segmentation (present multimedia messages in learner-paced segments; Parong and Mayer 2018), or modality principles (use spoken rather than printed words in a multimedia message”

**MAK-R11** [learning-design; author recommendation; relation: supports; concept note §2, P13; §3, P61-P62]: Build explicit reflection/self-explanation checkpoints into or immediately after the exploration, e.g. a summarising or explaining prompt after each room or segment. Without them, highly engaging environments can undermine self-regulated learning.
- PDF p. 11: “introducing reflection activities that prompt metacognition and deeper learning within, or after, IVR is critical”
- PDF p. 11: “self-regulated learning can suffer when immersive lessons do not provide natural reflection opportunities”
- PDF p. 16: “Reflection activities can take the shape of explaining the content of a lesson to an avatar peer in VR, or to a real peer after an IVR lesson (Klingenberg et al. 2020), or summarizing after segments of an IVR lesson”

**MAK-R12** [study-design; theoretical claim; relation: supports; concept note §8, P94]: Measure prior knowledge before exposure and use it as a covariate or moderator. CAMIL argues that learners without prior knowledge may experience presence and agency as entertainment without integrating the information.
- PDF p. 4: “having high prior knowledge enables the affordances of presence and agency to be conducive to learning by allowing learners to interpret their experiences in the IVR lesson in a meaningful way.” *(secondary: reports another study)*
- PDF p. 4: “learners who have no prior knowledge to anchor these experiences on may experience entertainment value stemming from high presence and agency, without properly selecting, organizing, and integrating the information into long term memory.” *(secondary: reports another study)*

**MAK-R13** [study-design; author recommendation; relation: conflicts; concept note §7, P88-P91]: Frame and design the comparison as a test of an instructional method (epistemic spatialisation) rather than a media comparison. Hold immersion level, control factors and representational fidelity as constant as possible across pathways, or measure them, so that a difference cannot be attributed to the medium.
- PDF p. 14: “Rather than conducting media comparisons that could potentially lead to a body of research that may not show any consistent differences between modalities”
- PDF p. 14: “This view prioritizes research which investigates interactions between media and instructional methods.”

**MAK-R14** [measurement-instrument; author recommendation; relation: extends; concept note §8, P94]: Record each participant's prior experience with VR/3D environments and games, and control for it (covariate or stratification). Novelty effects inflate effort and attention only transiently.
- PDF p. 15: “level of prior experience with IVR is an important external factor to control for”
- PDF p. 15: “the effect of novelty is only transient and may never take the place of instructional support.”
- PDF p. 17: “Prior experience and familiarity with IVR is also an essential factor to consider as this makes it possible to investigate novelty effects.”

**MAK-R15** [accessibility-ux; theoretical claim; relation: extends; concept note §9, P105; §11, P150]: Measure usability and screen for cybersickness, spatial ability and working memory as external factors. Fix navigation errors found in the pilot, because low usability (e.g. errors in navigating) breaks presence and reduces agency.
- PDF p. 16: “These encompass usability, social factors, and a range of individual differences variables, including age, tendency to experience cyber sickness, working memory, personality, predisposition towards absorption, and spatial ability.”
- PDF p. 16: “Low usability, e.g., by virtue of errors in navigating, may also result in breaks in presence. Likewise, low usability may impair the users' sense of agency through limiting their control.”
- PDF p. 16: “Cyber sickness is also a factor known to occur for some users of HMDs (Munafo et al. 2017), and can diminish learning from IVR by shifting the learners' focus.” *(secondary: reports another study)*

**MAK-R16** [technical-implementation; author recommendation; relation: independent]: To raise presence and agency, the spatial pathway should provide smooth view changes (stable high frame rate, no stutter), a realistic but uncluttered display, and a high degree and immediacy of control (low input latency). Record the display type (HMD vs desktop) as a fixed study parameter.
- PDF p. 15: “designing the environment for use with an HMD, ensuring a realistic display of the environment and smoothness of view changes, and affording a high degree and immediacy of control.”
- PDF p. 7: “Control factors encompass variables such as degree of control, immediacy of control, and mode of control”

**MAK-R17** [limitation-risk; design description; relation: extends; concept note §2, P14; §7, P90]: When citing CAMIL for a desktop or web-based 3D museum, state that CAMIL's paths are theorised for HMD-based IVR and that desktop 3D is 'low immersion' in its terms. Do not claim that CAMIL predictions apply unchanged unless an HMD is used.
- PDF p. 3: “in this paper, we focus on immersive learning experiences that are accessed through an HMD (which we refer to as IVR)”
- PDF p. 3: “Simulations or 3D worlds accessed through a desktop computer or tablet are referred to as low immersion or desktop VR in the literature and will only be used as comparisons to IVR in this paper.”

**MAK-R18** [spatial-design; theoretical claim; relation: supports; concept note §2, P11; §7, P90]: Make bodily and navigational actions meaningful for the learning outcome. Movement between rooms or objects, and manipulation of objects, should correspond to the knowledge relation being learned (e.g. walking a process sequence), not be arbitrary travel.
- PDF p. 13: “there is evidence that learning increases when bodily interactions and visual features of a particular concept are coordinated” *(secondary: reports another study)*
- PDF p. 13: “That is, when physical activities are meaningful for the learning outcome, such as manipulating an object to understand its physical dimensions.”

**MAK-R19** [interface-design; theoretical claim; relation: supports; concept note §2, P13]: Give learners real control over their actions and environment parameters (choose what to open, where to go). A fixed, non-interactive narrative tour yields low agency, so guidance should not collapse exploration into a fixed narrative.
- PDF p. 7: “low agency would result from immersive virtual environments where interaction is not possible and where the user follows a fixed narrative.”
- PDF p. 8: “control factors (positive relation, path 3 in Fig. 2; e.g., being able to control the body representation and modify the environment and its objects) are regarded as the most important predictor of agency in the CAMIL.”

**MAK-R20** [logging-analytics; theoretical claim; relation: extends; concept note §10, P109-P139]: Do not interpret long dwell times or extensive exploration in the logs as learning by default. Analyse them against outcome measures, because engaging environments can produce 'prolonged rather than productive use'. Log information-seeking events (layer opens, queries) as behavioural correlates of situational interest.
- PDF p. 11: “Hedonic information systems focus on the fun aspect of using the system and are designed to provide self-fulfilling rather than instrumental value to the user, thereby encouraging prolonged rather than productive use.”
- PDF p. 8: “Situational interest may elicit short-term, situational knowledge-seeking behavior”

**MAK-R21** [cognitive-load; theoretical claim; relation: supports; concept note §9, P103; §3, P53]: Design for the dual goal stated by CAMIL: reduce unnecessary (extraneous) processing caused by interface and navigation while keeping cognitive engagement high. Cognitive-load measurement must therefore separate extraneous load from content-related load.
- PDF p. 14: “The goal of instructional design is to optimize learning by reducing the degree of unnecessary processing (extraneous CL) produced by the learning task, while simultaneously increasing cognitive engagement”
- PDF p. 14: “extraneous CL negatively influences the learning of factual, conceptual, and procedural knowledge, as well as the transfer of this knowledge”

**MAK-R22** [limitation-risk; author recommendation; relation: extends; concept note §3, P29]: Treat CAMIL paths as hypotheses, not established effects, when using them to justify design choices or interpret results. The authors state that the model is largely untested.
- PDF p. 15: “few empirical studies have specifically tested the paths outlined in the model.”

### Petersen et al. 2022

Petersen, G. B., Petkakis, G., & Makransky, G. (2022). A study of how immersion and interactivity drive VR learning. *Computers & Education*, 179, 104429. https://doi.org/10.1016/j.compedu.2021.104429

**PET-R01** [study-design; author recommendation; relation: conflicts; concept note §7, P88-P91; §8, P94]: Avoid an unanalysable media comparison. Either isolate the manipulated feature (here, spatial organisation) while holding immersion and interactivity constant across pathways, or cross the factors as Petersen et al. did (2 x 2: immersion x interactivity). At minimum, document which of immersion, interactivity and spatial organisation differ between Pathway A and B.
- PDF p. 1: “VR studies often involve media comparisons that make it difficult to disentangle the relative effects of technological features on learning.”
- p. 3 (PDF p. 3): “video (low immersion/low interactivity), PC (low immersion/high interactivity), VR-video (high immersion/low interactivity), and VR (high immersion/high interactivity).”

**PET-R02** [study-design; finding from this study's own data; relation: extends; concept note §8, P93-P95]: Run and report an a-priori or sensitivity power analysis (e.g. G*Power, power 0.80, alpha .05). For reference, Petersen et al.'s 153 participants in four cells (~38 per cell) could detect only effects of f = 0.23 or larger (medium); a 2-group design with ~20 per group (concept note P94) will detect only substantially larger effects, so report the minimum detectable effect.
- p. 6 (PDF p. 6): “With a power level of 0.80, a sensitivity analysis conducted using the G*Power software (Faul, Erdfelder, Lang, & Buchner, 2007) suggested that the study design amounted to”
- p. 6 (PDF p. 6): “With a power level of 0.80, a sensitivity analysis conducted using the G*Power software (Faul, Erdfelder, Lang, & Buchner, 2007) suggested that the study design amounted to minimum detectable effects of f = 0.23 (p2 = 0.05) for main and interaction effects.”
- p. 6 (PDF p. 6): “Participants were then randomly allocated to one of four different conditions: VR (39), VR-video (39), PC (40), or video (35).”

**PET-R03** [study-design; design description; relation: supports; concept note §8, P94]: Randomly allocate participants to pathways after consent. Keep participants blind to the existence of other conditions (separate rooms/sessions), and forbid note-taking and talking between participants during exposure.
- p. 6 (PDF p. 6): “This made students blind to the fact that there were different conditions.”
- p. 6 (PDF p. 6): “Participants were not allowed to take notes or interact with each other during the experiment.”

**PET-R04** [technical-implementation; design description; relation: supports; concept note §7, P90]: A virtual museum is an established, validated format for declarative learning studies. Petersen et al. built a Unity 2020 exhibition hall toured in sequence (introduction, then three topic sections), with narration, virtual screens showing visuals, ambient sound and animated 3D models. The platform can follow this pattern (rooms = topic sections, exhibits trigger presentations).
- p. 6 (PDF p. 6): “A virtual museum exhibition about viruses was developed in Unity 2020 and used as learning material.”
- p. 6 (PDF p. 6): “Virtual screens were positioned around the exhibition hall to supplement the narrations with appropriate visuals during each presentation”
- p. 7 (PDF p. 7): “The museum format was chosen due to its natural connection with providing declarative knowledge (the object of study)”

**PET-R05** [interface-design; design description; relation: extends; concept note §7, P90]: Define 'interactivity' operationally and identically in documentation: high interactivity = learner controls pace and order (teleport/walk freely and initiate exhibit presentations); low interactivity = watching a pre-recorded optimal tour. Object pick-up was not part of the manipulation.
- p. 7 (PDF p. 7): “In the first version, users were able to teleport around the museum and actively initiate the exhibition presentations (that is, a high level of interactivity was provided).”
- p. 7 (PDF p. 7): “whereby the learner controls the pace and/or order of a learning episode.”
- p. 7 (PDF p. 7): “It was not possible to pick up artefacts in the interactive version: Learners could walk around and instigate presentations (as in many real-life museums).”

**PET-R06** [technical-implementation; design description; relation: independent]: Record and report the exact hardware per condition (headset model and input device, or laptop and mouse, and audio via headphones), since the device defines the immersion level.
- p. 7 (PDF p. 7): “For the VR condition (high immersion/high interactivity), Oculus Quest headsets with controllers were employed.”
- p. 7 (PDF p. 7): “For the PC condition (low immersion/high interactivity), Dell Latitude 7490 laptops with a computer mouse were used.”
- p. 7 (PDF p. 7): “Participants used headphones in the PC, VR and VR-video conditions.”

**PET-R07** [logging-analytics; finding from this study's own data; relation: supports; concept note §10, P108; P113-P114; P133-P134]: Log time-on-task automatically in every condition. Petersen et al. could not report exposure time for the free-exploration groups, which left time-on-task uncontrolled between self-paced and fixed-length conditions.
- p. 7 (PDF p. 7): “The video recording of an optimal run through the application was 10 minutes long.”
- p. 7 (PDF p. 7): “We do not have data for the VR and PC groups, but they spent approximately ten to 15 min in the virtual environment due to being able to explore the environment freely.”

**PET-R08** [measurement-instrument; design description; relation: supports; concept note §9, P103]: To separate interface/navigation burden from other load, use the multidimensional cognitive load scale for virtual environments (Andersen & Makransky 2021). Its extraneous-load subscales are 'interaction' (4 items, e.g. 'The interaction technique used in the simulation was very unclear') and 'environment' (4 items), on a five-point Likert scale. Adapt wording ('simulation') for the 2D pathway.
- p. 8 (PDF p. 8): “The extraneous cognitive load interaction scale consisted of four items from Andersen and Makransky (2021; e.g., The interaction technique used in the simulation was very unclear).”
- p. 8 (PDF p. 8): “The extraneous cognitive load environment scale consisted of four items from Andersen and Makransky (2021; e.g., The elements in the virtual environment made the learning very unclear).”
- p. 15 (PDF p. 15): “The validation and further development of a multidimensional cognitive load scale for virtual environments.”
- p. 15 (PDF p. 15): “all items used in this study, except knowledge items, were measured on a five-point Likert scale.”

**PET-R09** [measurement-instrument; finding from this study's own data; relation: extends; concept note §9, P103; §10, P131-P132]: Pilot the cognitive-load items before relying on them. Petersen et al. dropped the navigation-relevant items: 'difficult to master' (interaction) and 'difficult to find the relevant learning information' (environment, factor loading 0.58). Navigation/way-finding burden may therefore need its own validated item or behavioural indicator, such as logged abandoned paths.
- p. 8 (PDF p. 8): “one item was shown during confirmatory factor analysis to have a low standardized factor loading (0.58;”
- p. 14 (PDF p. 14): “It was difficult to find the relevant learning information in the virtual environment.”
- p. 14 (PDF p. 14): “The interaction technique used in the simulation was difficult to master.”

**PET-R10** [measurement-instrument; design description; relation: supports; concept note §9, P106]: If presence and agency are measured (concept note P106), use the short scales Petersen et al. used: physical presence (5 items, Multimodal Presence Scale, Makransky, Lilleholt & Aaby 2017) and agency (3 items adapted from the Sense of Agency Rating Scale, SOARS, Polito, Barnier & Woody 2013). Both showed high reliability (alpha 0.89 and 0.90).
- p. 8 (PDF p. 8): “The agency scale consisted of three items adapted from Polito, Barnier, and Woody (2013; e.g., During the lesson, my experiences and actions were under my control).”
- p. 8 (PDF p. 8): “The physical presence scale consisted of five items from Makransky, Lilleholt, and Aaby (2017; e.g., The virtual environment seemed real to me).”
- p. 16 (PDF p. 16): “Developing the Sense of Agency Rating Scale (SOARS): An empirical measure of agency disruption in hypnosis.”
- p. 16 (PDF p. 16): “Development and validation of the multimodal presence scale for virtual reality environments”

**PET-R11** [measurement-instrument; finding from this study's own data; relation: extends; concept note §9, P106]: Measure situational interest (6 items, Knogler et al. 2015) as the engagement measure. In Petersen et al. it was the variable that carried the positive path from presence to learning. Optional affective scales: intrinsic motivation (5 items adapted from Makransky & Petersen 2019), self-efficacy (4 items adapted from Meyer et al. 2019 and the MSLQ, Pintrich et al. 1991) and embodied learning (3 items, Skulmowski & Rey 2018).
- p. 8 (PDF p. 8): “The situational interest scale consisted of six items from Knogler et al. (2015;”
- p. 7 (PDF p. 7): “The intrinsic motivation scale consisted of five items adapted from Makransky and Petersen (2019;”
- p. 7 (PDF p. 7): “The self-efficacy scale consisted of four items adapted from Meyer et al. (2019) and Pintrich, Smith, Garcia, and McKeachie (1991;”
- p. 8 (PDF p. 8): “The embodied learning scale consisted of three items based on Skulmowski and Rey (2018;”
- p. 12 (PDF p. 12): “learning was positively predicted by the degree of situational interest experienced by the participants.”

**PET-R12** [measurement-instrument; design description; relation: extends; concept note §9, P101]: Build the knowledge test from the content actually presented, with expert review (Petersen et al.: 9 four-option multiple-choice declarative items). Evaluate it edumetrically (average pre-to-post item increase; Petersen et al. retained items with increases over 0.2). Add conceptual and transfer items, since a purely declarative test cannot capture relational understanding.
- p. 7 (PDF p. 7): “The knowledge test was based on the narration used during the virtual lesson and consisted of nine multiple choice questions with four possible answers”
- p. 7 (PDF p. 7): “All knowledge items assessed declarative memory (Ten Berge & Van Hezewijk, 1999)”
- p. 8 (PDF p. 8): “The knowledge test was edumetric, meaning that it was designed to measure the knowledge gain of individuals”
- p. 8 (PDF p. 8): “The results indicated that all items had average pre-to post-test increases over 0.2 on a possible range of - 1 to 1.”

**PET-R13** [measurement-instrument; finding from this study's own data; relation: extends; concept note §11, P150]: Report scale reliability (Cronbach's alpha; 0.80-0.90 = very good per DeVellis 2012), and handle missing data by FIML or an equivalent principled method. Validate the questionnaire data-capture pipeline end-to-end before the main study: Petersen et al. lost 21 participants' self-efficacy scores to a measurement error.
- p. 8 (PDF p. 8): “alpha levels between 0.80 and 0.90 were considered indicative of very good scale reliability.”
- p. 8 (PDF p. 8): “maximum likelihood approach was used to deal with missing values (this was true for the self-efficacy scores of 21 participants due to a measurement error).”

**PET-R14** [study-design; design description; relation: extends; concept note §8, P94]: Check group equivalence at baseline (demographics with chi-square/Fisher's exact tests; pre-test scales with one-way ANOVA) and report it. Analyse outcomes with factorial ANOVA (two-way for a crossed design) and report effect sizes (Cohen's d for simple effects).
- p. 9 (PDF p. 9): “Fisher's exact test were conducted to assess the equivalence of conditions on demographic variables.”
- p. 9 (PDF p. 9): “One-way ANOVAs were therefore performed to verify equivalence of conditions on these measures.”
- p. 9 (PDF p. 9): “the effect of interactivity on agency is larger when immersion is low (d = 2.08) compared to high (d = 0.71).”

**PET-R15** [interface-design; finding from this study's own data; relation: supports; concept note §7, P90; §2, P13]: If the spatial pathway runs on desktop (low immersion), self-directed navigation and active triggering of exhibits are especially important for agency and the sense of embodied learning. Do not replace it with an automated tour, because interactivity's effect on agency was largest under low immersion (d = 2.08 vs 0.71).
- p. 11 (PDF p. 11): “having a high level of interactivity is more important for achieving a sense of agency and embodied learning when the lesson has a low level of immersion.”
- p. 9 (PDF p. 9): “the effect of interactivity on agency is larger when immersion is low (d = 2.08) compared to high (d = 0.71).”

**PET-R16** [cognitive-load; finding from this study's own data; relation: conflicts; concept note §1, P5; §2, P14; §3, P32]: Do not assume that free exploration adds extraneous load. In Petersen et al., free exploration (high interactivity) produced LOWER environment-related extraneous load than passively watching an optimal tour, and immersion had no effect on either extraneous-load subscale. The study should test, not presuppose, that spatial navigation adds burden.
- p. 11 (PDF p. 11): “Surprisingly, lower interactivity was associated with higher extraneous cognitive load stemming from the environment;”
- p. 11 (PDF p. 11): “This finding goes against Moreno and Mayer's (2007) notion that free exploration of complex multimodal environments could generate heavy cognitive load.”
- p. 9 (PDF p. 9): “There was no significant effect of immersion on extraneous cognitive load environment.”

**PET-R17** [interface-design; finding from this study's own data; relation: supports; concept note §7, P91]: Keep the interaction technique (locomotion, selection, layer opening) simple and learnable, and include onboarding practice. Extraneous load from the interaction technique was associated with reduced physical presence, interpreted as attention shifting to the technical setup.
- p. 12 (PDF p. 12): “physical presence was negatively influenced by extraneous cognitive load stemming from the interaction”
- p. 12 (PDF p. 12): “difficulties with the interaction technique led to breaks in presence by leading the participants' attention towards the technological setup instead of the virtual learning content”

**PET-R18** [limitation-risk; finding from this study's own data; relation: extends; concept note §5, P72; §12, P161]: Plan for a possible null effect on knowledge gain. Petersen et al. found no main or interaction effect of immersion or interactivity on declarative learning, and the low-immersion/low-interactivity video group had the highest mean gain. The paper's contribution should not depend solely on a knowledge-gain difference (cf. concept note P161 on mixed results).
- p. 10 (PDF p. 10): “Finally, the analysis did not reveal any significant effects on learning. Thus, hypothesis 9 was not confirmed.”
- p. 10 (PDF p. 10): “Learning 4.26 (1.72) 3.48 (1.55) 3.56 (1.89) 3.62 (1.82) p = .356 p = .210 p = .143”

**PET-R19** [spatial-design; finding from this study's own data; relation: supports; concept note §1, P7; §7, P90]: Make navigation and bodily actions structurally or analogically related to the knowledge content (e.g. moving along a process sequence, adjacency encoding causal links). When actions were unrelated to declarative content, the sense of embodied learning predicted learning negatively.
- p. 12 (PDF p. 12): “Lindgren and Johnson-Glenberg (2013) contend that for effective learning to take place, actions must be structurally or analogically related to the learning content.” *(secondary: reports another study)*
- p. 12 (PDF p. 12): “In the present study, it was not possible to perform actions explicitly related to the learning content, which is why the experience of actively using one's body for learning might have done more harm than good.”
- p. 11 (PDF p. 11): “It should be noted that embodied learning impacted knowledge gain negatively contrary to what was expected”

**PET-R20** [limitation-risk; author recommendation; relation: conflicts; concept note §9, P98; §9, P101]: Avoid an identical pre- and post-test, or control for testing effects. A pre-test can direct attention to what the learner does not know and inflate post-test scores. This applies to the concept note's identical before/after concept-mapping task and its pre/post knowledge questions. Use parallel forms, or a post-only control or Solomon-type check if feasible.
- p. 13 (PDF p. 13): “A pre-test may, for instance, direct attention towards what the learner does not know during subsequent instruction, thereby enhancing performance on the post-test (Hartley, 1973).”

**PET-R21** [measurement-instrument; author recommendation; relation: extends; concept note §8, P94]: Measure, or at least screen, individual differences that may moderate effects: cybersickness, spatial ability and personality. Petersen et al. omitted them to keep the questionnaire short and flag this as a gap. Keep the total questionnaire short, but include spatial ability for a spatial-organisation manipulation.
- p. 12 (PDF p. 12): “These include factors such as cybersickness, spatial ability, or personality traits (Makransky & Petersen, 2021).”
- p. 13 (PDF p. 13): “the questionnaire length as short as possible, participants' ratings on such traits were not assessed.”

**PET-R22** [guidance-signalling; author recommendation; relation: supports; concept note §2, P13; §3, P37-P38]: Include signalling (highlighting essential material) and generative prompts (e.g. elaboration/self-explanation prompts), which the authors recommend as the next instructional techniques to test in VR museum-style lessons. Hold them constant across pathways so that they do not confound the spatial comparison.
- p. 13 (PDF p. 13): “the signaling principle (i.e., highlighting essential material) could enhance the process of learning by reducing extraneous cognitive load (Mayer, 2014a).”
- p. 13 (PDF p. 13): “Albus, Vogt, and Seufert (2021) recently investigated the signaling principle in VR and found that it increased recall performance.” *(secondary: reports another study)*
- p. 13 (PDF p. 13): “generative learning activities such as elaboration prompts, which have been found to improve recall of VR learning material” *(secondary: reports another study)*

**PET-R23** [limitation-risk; author recommendation; relation: extends; concept note §3, P31; §9, P97-P99]: Do not generalise Petersen et al.'s process paths to relational or conceptual learning. Their outcome was declarative recall only, and the authors note the paths might differ for other knowledge types.
- p. 5 (PDF p. 5): “In this study, learning is measured as pre-to post-test changes in number of correct responses on a declarative knowledge test.”
- p. 13 (PDF p. 13): “it is possible that the paths leading to learning would have been different if the purpose of the lesson had been to teach a procedure”

**PET-R24** [limitation-risk; author recommendation; relation: extends; concept note §8, P93; §6, P76]: Control for language proficiency and topic relevance. Deliver content in the participants' strongest language or record proficiency. Choose craft traditions of comparable personal relevance, since topical relevance can inflate engagement. Report sample homogeneity (e.g. single-department students) as a threat to external validity.
- p. 13 (PDF p. 13): “the study sample was not comprised of native English speakers despite the fact that the learning material was in English; this could potentially have impacted comprehension.”
- p. 6 (PDF p. 6): “the use of learning material on viral diseases during the COVID-19 pandemic could have resulted in larger engagement during learning, as the topic was personally relevant to the participants.”
- p. 13 (PDF p. 13): “the fact that the sample was European psychology students could influence the external validity of the study”

**PET-R25** [study-design; finding from this study's own data; relation: extends; concept note §5, P73]: Any mediation/SEM analysis of process variables needs to report fit indices (RMSEA, CFI, TLI) and disclose post-hoc modifications. Petersen et al.'s hypothesised model fit poorly and was modified using modification indices and iterative path deletion. With N about 40, such a model is exploratory at best; treat SEM-style process claims as hypothesis-generating and seek replication.
- p. 10 (PDF p. 10): “The model's fit was not acceptable at first (RMSEA = 0.085, CFI = 0.832, TLI = 0.816). Hence, modification indices were used to adjust the model based on data.”
- p. 10 (PDF p. 10): “The final, simplified model obtained an acceptable fit (RMSEA = 0.061, CFI = 0.914, TLI = 0.906).”
- p. 13 (PDF p. 13): “it remains for future research to replicate the results in order to strengthen the conclusions drawn.”

**PET-R26** [learning-design; finding from this study's own data; relation: extends; concept note §9, P106]: Prioritise situational interest via presence over self-efficacy or motivation as the engagement lever. In Petersen et al., immersion raised situational interest, which predicted learning. Self-efficacy also predicted learning but was not influenced by presence or agency, and intrinsic motivation was influenced but did not predict learning.
- p. 12 (PDF p. 12): “Situational interest, in turn, was predicted by participants' level of physical presence, which increased with higher objective levels of immersion and interactivity.”
- p. 11 (PDF p. 11): “Note that self-efficacy also predicted learning but was not predicted by presence and agency as expected.”
- p. 12 (PDF p. 12): “it is found that intrinsic motivation is influenced indirectly by immersion and interactivity (via physical presence) but does not predict learning.”

### Zhou et al. 2022

Zhou, Y., Chen, J., & Wang, M. (2022). A meta-analytic review on incorporating virtual and augmented reality in museum learning. *Educational Research Review*, 36, 100454. https://doi.org/10.1016/j.edurev.2022.100454

**ZHOU-R01** [study-design; author recommendation; relation: supports; concept note §8, P94]: The comparison must be a controlled design with a non-immersive control condition that receives the same learning content; the study must not be a single-group usability evaluation.
- p. 13 (PDF p. 13): “It is typical that many of the selected 51 empirical studies focused on the usability of AR and VR technologies and were conducted among a single group of participants without controlled experiments.”
- p. 13 (PDF p. 13): “In this review, only 17 out of the 51 selected articles used a controlled experimental design.”

**ZHOU-R02** [study-design; review/meta-analysis finding; relation: supports; concept note §7, P91]: Informational equivalence must be audited, not assumed: before the study, inventory every fact, relation and causal explanation available in Pathway B (including what is conveyed only visually or through animation/spatial arrangement) and confirm each is also available in Pathway A.
- p. 13 (PDF p. 13): “the dynamic visualization of AR and VR actually contains more information in many situations, which may result in learners' higher achievement.”
- p. 11 (PDF p. 11): “visitors using AR and VR applications in museum learning had significantly better academic achievement than those who used non-AR and non-VR applications such as text or traditional audio guides.”

**ZHOU-R03** [study-design; review/meta-analysis finding; relation: conflicts; concept note §8, P93–P94]: Sample size must be set by an a-priori power analysis using a realistic effect size. The pooled AR/VR museum effect on achievement is g = 0.45 (95% CI 0.00–0.89); a between-group design must be powered for an effect of this order, not for a large effect.
- p. 11 (PDF p. 11): “The weighted mean effect size for academic achievement synthesized from 13 studies was 0.45 (95% CI [0.00, 0.89], k = 13),”
- p. 11 (PDF p. 11): “Individual effect sizes of the 13 primary studies ranged from - 1.30 to 2.05.”

**ZHOU-R04** [limitation-risk; review/meta-analysis finding; relation: extends; concept note §3, P34]: Do not cite Zhou et al. (2022) as evidence that immersive VR (as opposed to AR) or desktop virtual museums improve learning; when citing it, state that the pooled effect is AR-dominated and that desktop online virtual museums were excluded.
- p. 10 (PDF p. 10): “Note that only 1 out of the 17 studies investigated the effects of VR with non-VR supported museum learning; thus, the effect size of AR and VR were not calculated separately.”
- p. 4 (PDF p. 4): “studies that only used 3D models, 3D printing techniques, or online virtual museums via computer desktops were excluded.”
- p. 4 (PDF p. 4): “The research environment must be a museum or science center; thus, studies carried out in cultural heritage, simulated outdoor learning environments and school classrooms were excluded.”

**ZHOU-R05** [study-design; design description; relation: independent]: Do not attribute moderator effects (device type, learner level, session duration, museum type, outcome type) to Zhou et al. (2022): the paper reports only two pooled effects (achievement, perceptions) and no moderator analysis. Our study must record these variables itself (device, participant level, session duration) so they can be reported.
- p. 11 (PDF p. 11): “Note. N = total number of included studies; k = number of studies analyzed for each learning outcome; g = weighted mean effect size; CI = confidence interval.”
- p. 6 (PDF p. 6): “The random-effects model was used, considering the variability of contexts, participant age, subject domains, and so on.”

**ZHOU-R06** [measurement-instrument; design description; relation: supports; concept note §9, P100–P106]: Report learning outcomes (knowledge and skills: conceptual knowledge, relational structure, transfer) separately from self-reported perceptions (enjoyment, engagement, satisfaction, motivation, novelty); perception measures must not be used as evidence of learning.
- p. 5 (PDF p. 5): “Academic achievement includes the knowledge and skills acquired through museum learning, e.g., conceptual knowledge and cognitive skills.”
- p. 5 (PDF p. 5): “Perceptions refer to self-reported feelings of the learning experience (Kyndt et al., 2013), which are often measured by surveys or questionnaires,”

**ZHOU-R07** [limitation-risk; theoretical claim; relation: supports; concept note §7, P91]: Control for and report novelty: record each participant's prior experience with 3D/VR environments and games, and interpret any between-group difference in perceptions/engagement as possibly novelty-driven.
- p. 13 (PDF p. 13): “The technical novelty of AR and VR may attract visitors, hold their attention and encourage them to persevere in learning, thus resulting in more positive perceptions (Bettelli et al., 2020).” *(secondary: reports another study)*

**ZHOU-R08** [limitation-risk; author recommendation; relation: extends; concept note §9, P103]: Measure and report physical discomfort (dizziness, nausea, device burden) for the immersive condition, e.g. with a short post-session simulator-sickness check, and treat it as a potential confound of learning outcomes.
- p. 3 (PDF p. 3): “learners claimed that using VR devices made them feel nauseous and dizzy (Rhee, 2019), and some devices such as HMDs also physically inconvenienced visitors (Oh et al., 2018; Sugiura et al., 2019).” *(secondary: reports another study)*
- p. 13 (PDF p. 13): “as some papers have reported common disadvantages, such as dizziness and device burden, which may be a factor influencing the learning effect.”

**ZHOU-R09** [content-knowledge-modelling; author recommendation; relation: supports; concept note §9, P98–P102]: Learning objectives and test items must go beyond declarative facts to include procedural (process-sequence) knowledge and analytical/causal reasoning, which existing AR/VR museum studies rarely target.
- p. 13 (PDF p. 13): “A majority of the current studies focused on declarative knowledge learning, such as general information regarding the artists and their works, while few were related to procedural-practical knowledge and distal outcomes such as analytical and other thinking skills.”
- p. 8 (PDF p. 8): “Fig. 5 shows that AR and VR were most frequently used to promote declarative knowledge learning in museums (33)”

**ZHOU-R10** [study-design; author recommendation; relation: extends; concept note §8, P94]: Consider a delayed post-test (retention of relational structure) in addition to the immediate post-test, because AR/VR museum studies mainly measure immediate outcomes after short exposures.
- p. 13 (PDF p. 13): “the typical museum learning experience with AR and VR is only a few hours or less, and current studies mainly evaluated easily observed immediate learning outcomes of visitors/participants rather than distal outcomes”

**ZHOU-R11** [study-design; author recommendation; relation: extends; concept note §8, P94]: Record participant characteristics that may moderate effects (age, education level, prior technology use) and report them by condition.
- p. 13 (PDF p. 13): “The cognitive abilities and usage of technologies and devices vary among visitors of different ages, and their preferences concerning museums visits are also diverse.”

**ZHOU-R12** [study-design; design description; relation: extends; concept note §9, P96–P106]: Report, for every outcome and each condition, the mean, SD and n (and test statistics) so the study is includable in future meta-analyses; compute standardised effect sizes as Hedges' g with small-sample correction.
- p. 4 (PDF p. 4): “The results must provide sufficient data for calculation of effect size (ES) of an intervention, including means and standard deviations and errors (SD and SE),”
- p. 6 (PDF p. 6): “Borenstein et al. (2009) suggested that Hedges' g can reduce the small-sample size bias.” *(secondary: reports another study)*

**ZHOU-R13** [measurement-instrument; design description; relation: extends; concept note §9, P99]: Any coded data (e.g. concept-map relation scoring, query categories) must be coded by two independent trained coders with Cohen's kappa reported per code, disagreements resolved by discussion.
- p. 6 (PDF p. 6): “Two trained coders independently performed all of the coding.”
- p. 6 (PDF p. 6): “Cohen's k was 0.96 for museum type, 0.98 for learner type, 0.96 for learning domain, 0.98 for learning content, 0.90 for design element, and 0.96 for technology device. All disagreements were resolved through further discussion. 2.6.”

**ZHOU-R14** [spatial-design; review/meta-analysis finding; relation: extends; concept note §7, P90]: The immersive pathway should use interaction beyond overlaid labels (object manipulation/inspection, user-generated responses), since most AR/VR museum designs only superimpose label-like information and few let visitors interact with exhibits.
- p. 9 (PDF p. 9): “This could be seen as a similar function of labels used for traditional exhibits.”
- p. 12 (PDF p. 12): “However, only a few studies have explored applying AR and VR to enhance visitors' interactions with exhibits or allow visitors to generate virtual content in immersive environments”

**ZHOU-R15** [learning-design; review/meta-analysis finding; relation: extends; concept note §6, P85]: The scientific layer (e.g. why a mordant fixes dye) may be supported by dynamic visualisation of otherwise invisible mechanisms; if used in Pathway B, an equivalent visualisation must be available in Pathway A (see ZHOU-R02).
- p. 12 (PDF p. 12): “AR can visualize the invisible mechanisms that underlie complex phenomena (Yoon et al., 2017).” *(secondary: reports another study)*
- p. 9 (PDF p. 9): “Eight studies used these technologies to provide simulations or dynamic visualization of typically invisible phenomena”

**ZHOU-R16** [technical-implementation; author recommendation; relation: extends; concept note §7, P89–P91]: Report the delivery device and immersion level of each condition using an explicit device category (mobile, HMD, desktop, projector). If Pathway B runs on a desktop display, describe it as a desktop (low-immersion) virtual environment and do not claim HMD-level presence.
- p. 10 (PDF p. 10): “allowed users to experience a high degree of immersion and provided a complete sense of presence.”
- p. 13 (PDF p. 13): “Instead of merely providing animation on desktop devices with low immersion, the learning settings should make more use of VR technologies.”

**ZHOU-R17** [accessibility-ux; review/meta-analysis finding; relation: supports; concept note §7, P91]: Provide hands-on device/interface training for all participants before the learning task, as in controlled AR museum studies, so control-skill differences do not contaminate learning outcomes.
- p. 11 (PDF p. 11): “All of the participants received hands-on training on how to use the mobile AR app and were randomly assigned to experimental or control groups.” *(secondary: reports another study)*
- p. 11 (PDF p. 11): “The experiment was conducted with 101 participants (from the general public) for 90 min in an anonymous national museum.” *(secondary: reports another study)*

**ZHOU-R18** [limitation-risk; review/meta-analysis finding; relation: supports; concept note §12, P161]: Pre-register that a null or negative result is possible and interpretable: individual AR/VR museum effects range from negative to large, and AR games have failed to beat pen-and-paper methods.
- p. 3 (PDF p. 3): “Savela et al. (2020) found that AR games in a science center did not necessarily improve learning performance or social interaction when compared to the traditional pen-and-paper learning method.” *(secondary: reports another study)*
- p. 12 (PDF p. 12): “The individual effect sizes of the 12 primary studies ranged from - 0.21 to 2.19.”

**ZHOU-R19** [learning-design; theoretical claim; relation: supports; concept note §2, P11–P13]: Ground the immersive pathway's design rationale in experiential, situated, active and multimedia learning theory, and design for active meaning-making (learners searching for information) rather than passive viewing.
- p. 2 (PDF p. 2): “The theoretical foundation of incorporating VR and AR in museum learning is grounded in experiential learning (Behrendt & Franklin, 2014; Kolb, 2014), situated learning (Falk & Dierking, 2000; Johnson, 2002), active learning (Prince, 2004), and the multimedia learning theory”
- p. 12 (PDF p. 12): “Learners can be actively involved in cognitive processing when a coherent mental representation of their own experiences is constructed (Mayer, 2014).” *(secondary: reports another study)*

### Hung & Lee 2025

Hung, P.-T., & Lee, B. (2025). Exploring the next phase of situated and interactive docents for XR exhibitions: from the perspective of knowledge delivery. *International Journal of Human–Computer Interaction*, 41(17), 10767–10786. https://doi.org/10.1080/10447318.2024.2437127

**HUNGLEE-R01** [content-knowledge-modelling; finding from this study's own data; relation: extends; concept note §6, P77]: In the knowledge schema, keep 'delivery/reference' facets (where to look; which other object is referenced) separate from 'knowledge-type' facets (visual, hidden or contextual, creation or process). Each knowledge item carries both kinds of tag, and the dataset validator rejects an item that has a knowledge-type tag but no delivery facet, where a delivery facet applies.
- p. 10771 (PDF p. 6): “Result: Taxonomy of exhibit commentary knowledge This section describes five knowledge taxonomy frameworks that outline various types of curated commentary used for exhibits in museums: (1) the focus of the description area, (2) types of referred exhibits, (3) types of visual depictions, (4) types of hidden knowledge, and (5) types of stories about creation.”
- p. 10771 (PDF p. 6): “exhibits in museums: (1) the focus of the description area,”
- p. 10771 (PDF p. 6): “(2) types of referred exhibits, (3) types of visual depictions,”
- p. 10771 (PDF p. 6): “(4) types of hidden knowledge, and (5) types of stories about”
- p. 10771 (PDF p. 6): “creation. The first two themes contain insights about how”
- p. 10771 (PDF p. 6): “ence, while the last three themes describe the different types”

**HUNGLEE-R02** [content-knowledge-modelling; finding from this study's own data; relation: extends; concept note §7, P90]: Support Taxonomy 1 ('Focus of description') as an optional view-guidance facet on each information item, with values: particular point-of-view; particular section (zonal terms); specific target; view transition within the object; viewpoint change across multiple objects. In the immersive pathway each value maps to a camera or highlight cue; in the 2D pathway, to an image crop or callout.
- p. 10771 (PDF p. 6): “The first two themes contain insights about how information is being described and delivered to the audience, while the last three themes describe the different types of knowledge it represents. 3.3.1. Taxonomy 1: Focus of description The intended viewing interactions between visitors and the exhibits are often highlighted on the basis of the focus of commentary descriptions (Figure 4).”
- p. 10771 (PDF p. 6): “adopt a particular point-of-view when explaining complex or”
- p. 10771 (PDF p. 6): “an exhibit was also frequent (Figure 4b). Several zonal terms,”
- p. 10771 (PDF p. 6): “specific targets (Figure 4c) were referred to, such as”
- p. 10771 (PDF p. 6): “involves view transitions within the exhibit, which guides”
- p. 10771 (PDF p. 6): “Some others encourage more active participation by changing viewpoints across multiple exhibits to efficiently deliver the curatorial logic or knowledge of the exhibition (Figure 4e).”

**HUNGLEE-R03** [content-knowledge-modelling; finding from this study's own data; relation: extends; concept note §6, P84]: Include Taxonomy 2's object-to-object relation types in the relational model's edge vocabulary: similar (theme or style), contrasting, preceding/inspired-by, succeeding/inspired, sibling (production relation), same period, same series. Cross-tradition comparison edges (P84) use these types, so that the spatial layout (adjacency, proximity) can encode them.
- p. 10771 (PDF p. 6): “If needed or if possible, 3.3.2. Taxonomy 2: Types of referenced exhibits We found that related exhibits were often referred to in commentary descriptions, and the type of references was varied as shown in Figure 5.”
- p. 10771 (PDF p. 6): “approaches were referring to similar exhibits (Figure 5a) that”
- p. 10771 (PDF p. 6): “Contrarily, contrasting exhibits were also”
- p. 10771 (PDF p. 6): “In this painting, however, he is shown naked and being carried vertically up stone steps to the tomb, which is situated some distance away." Moreover, exhibit descriptions often refer to exhibits with an inspirational relationship with the subject. Preceding exhibits that provided inspiration are referenced to describe the historical background or design streamline (Figure 5c).”
- p. 10771 (PDF p. 6): “Conversely succeeding exhibits that were inspired by the”
- p. 10771 (PDF p. 6): “Conversely succeeding exhibits that were inspired by the target are highlighted to show their impact (Figure 5d). Some descriptions highlight sibling exhibits with special relations to the main exhibits in terms of their production (Figure 5e).”
- p. 10771 (PDF p. 6): “works created in the same period (Figure 5f), especially”
- p. 10772 (PDF p. 7): “Many exhibits are part of a series rather than standalone”

**HUNGLEE-R04** [content-knowledge-modelling; finding from this study's own data; relation: extends; concept note §6, P79]: Model Taxonomy 3 ('visual descriptions': observable without prior knowledge) as a knowledge type. Micro-level physical features: material, dimensions, inscription, shape/form, colour tone. Macro-level: listing of visual components or arrangement, and scene description. Map it onto the template's 'materials and tools' and 'design and material outcomes' fields.
- p. 10772 (PDF p. 7): “In our analysis, descriptions of actions, poses, and detailed human bodily features were highlighted. 3.3.3. Taxonomy 3: Types of visual descriptions We found that visual descriptions were often referenced, highlighting the illustration of observable elements of the exhibit without requiring prior knowledge.”
- p. 10772 (PDF p. 7): “lighting the illustration of observable elements of the exhibit”
- p. 10772 (PDF p. 7): “Taxonomy 3: Types of visual descriptions We found that visual descriptions were often referenced, highlighting the illustration of observable elements of the exhibit without requiring prior knowledge. The micro-level physical features of the exhibits were commonly found, for example, material, dimensions, inscription, shape/form, or color tone (Figure 6a-e).”
- p. 10772 (PDF p. 7): “The micro-level physical features of the exhibits were commonly found, for example, material, dimensions, inscription, shape/form, or color tone (Figure 6a-e).”
- p. 10772 (PDF p. 7): “describes the overall visual patterns, arrangements, or layouts”
- p. 10772 (PDF p. 7): “For example, in listing visual components, the process primarily lists individual components and describes the overall visual patterns, arrangements, or layouts (Figure 6f). Additionally, scene description refers to 3.3.4.”

**HUNGLEE-R05** [content-knowledge-modelling; finding from this study's own data; relation: extends; concept note §6, P78]: Model Taxonomy 4 ('hidden knowledge': implicit meaning not visible from appearance) as a knowledge type with sub-types: actual reference (environment, object, person used as model); symbolic object; hidden stories; usage purposes (occasional, intended, future); style-related, periodic and locational knowledge; history of changes (location dissemination, damage). Map these to the template's 'tradition, geography and context' field.
- p. 10772 (PDF p. 7): “Additionally, scene description refers to 3.3.4. Taxonomy 4: Types of hidden knowledge We have discovered that much of our collected data contains implicit meanings that cannot be merely described from the appearance of the exhibit.”
- p. 10772 (PDF p. 7): “tains implicit meanings that cannot be merely described”
- p. 10772 (PDF p. 7): “exact objects that was used as a model of the exhibit (Figure”
- p. 10773 (PDF p. 8): “some descriptions refer to the symbolic objects, not the”
- p. 10773 (PDF p. 8): “sional, intended, and future uses beyond its original intention.”
- p. 10773 (PDF p. 8): “information, such as style-related (Figure 6f), periodic (Figure”
- p. 10773 (PDF p. 8): “These include changes in appearance due to location dissemination (Figure 6i) or damages (Figure 6j). and the creators themselves (Figure 8).”

**HUNGLEE-R06** [content-knowledge-modelling; finding from this study's own data; relation: extends; concept note §6, P80-P81]: Model Taxonomy 5 ('stories about creation') as two knowledge types. (a) The creation story, a short timeline: created period, location, method, contextual background, creation background, inspiration. (b) The creator, a long timeline: age or living environment at creation, life history, achievements, signature style, related exhibitions. Map (a) to the template's 'process sequence' and 'artisan decisions and tacit knowledge', and (b) to artisan profiles.
- p. 10773 (PDF p. 8): “3.3.5. Taxonomy 5: Types of stories about creation”
- p. 10773 (PDF p. 8): “creation of the exhibits, such as created period (Figure 6a),”
- p. 10773 (PDF p. 8): “location (Figure 6b), or method (Figure 6c). Moreover, the”
- p. 10773 (PDF p. 8): “environment, while the creation background (Figure 6e) and”
- p. 10773 (PDF p. 8): “Compared with the creation story, the descriptions about the creator himself/herself show longer timeline narratives, which cover the creator's life and beyond and related stories.”
- p. 10773 (PDF p. 8): “Moreover, the creator's life history, achievements, signature”
- p. 10778 (PDF p. 13): “"Every design is a decision; as a”

**HUNGLEE-R07** [content-knowledge-modelling; finding from this study's own data; relation: extends; concept note §6, P83]: Do not adopt the Hung & Lee taxonomy as our complete epistemic classification. It was derived only from object commentary in art and history exhibitions, so our schema must add categories it lacks: scientific or causal 'why' explanations, ordered process steps, and tacit artisan decisions. It must also add the 'overarching theme' category that curators reported missing. Record each added category as a documented extension.
- p. 10770 (PDF p. 5): “These exhibitions included five art and five historical exhibitions, ensuring a diverse collection of docent descriptions.”
- p. 10778 (PDF p. 13): “our taxonomy: the importance of delivering the "overarching”
- p. 10778 (PDF p. 13): “in our taxonomy because it was created based solely on the”

**HUNGLEE-R08** [spatial-design; author recommendation; relation: extends; concept note §7, P90]: Deliver a tradition-level or exhibition-level 'overarching theme' more than once, during room-to-room transitions, not only at the entrance. In the immersive pathway, a theme reminder is triggered on each room transition. In the 2D pathway, an equivalent theme reminder appears on section change. Both are logged.
- p. 10778 (PDF p. 13): “that constantly delivering the theme of the exhibition could”
- p. 10778 (PDF p. 13): “implicitly direct visitors on how to perceive or where to”
- p. 10778 (PDF p. 13): “In traditional physical exhibitions, these themes were presented near the entrance, letting visitors easily forget.”
- p. 10778 (PDF p. 13): “augmented space while the visitor is moving from one room”
- p. 10778 (PDF p. 13): “to another, use the walking time to reconnect with the”

**HUNGLEE-R09** [guidance-signalling; author recommendation; relation: supports; concept note §2, P13]: Offer viewpoint guidance for focus-of-description content as a gentle, non-intrusive cue by default (a 'best spot' marker). A forced or automatic viewpoint transition is a separate guidance level that is logged as such. Because it reduces agency, it must not be the default in the study condition.
- p. 10776 (PDF p. 11): “the need to provide better spatial guidance through XR to”
- p. 10776 (PDF p. 11): “times it could be helpful to force viewers to take a particular”
- p. 10776 (PDF p. 11): “For instance, P15 commented that sometimes it could be helpful to force viewers to take a particular perspective more strictly to deliver a specific message, even automatically transitioning their viewpoints. P2 also commented on the less intrusive idea of augmenting the best spot signs as a gentle guide that fits each individual description.”
- p. 10776 (PDF p. 11): “mented on the less intrusive idea of augmenting the best”
- p. 10776 (PDF p. 11): “spot signs as a gentle guide that fits each individual”

**HUNGLEE-R10** [spatial-design; author recommendation; relation: supports; concept note §7, P90; §10, P127]: Use the freedom of virtual space to place related objects (similar, contrasting, same-process) side by side or let users summon them on demand, which physical museums cannot do. Support visual comparison: overlaying two designs, comparing shape and size. Log every summon or comparison as a cross-object or cross-tradition event.
- p. 10776 (PDF p. 11): “The participants noted that referring to other exhibits”
- p. 10776 (PDF p. 11): “(Figure 5) often enriches descriptions and knowledge delivery;”
- p. 10776 (PDF p. 11): “because of physical limitations, as the desired two exhibits”
- p. 10776 (PDF p. 11): “wanted to digitally overlay two different drawings to”
- p. 10780 (PDF p. 15): “approach to linking diverse sets of knowledge related to”
- p. 10780 (PDF p. 15): “This may include summoning virtual versions of 3D objects (Halim et al., 2023) related to the exhibits and visually representing relational qualities intuitively, such as comparing shapes or sizes in a situated manner.”

**HUNGLEE-R11** [cognitive-load; author recommendation; relation: supports; concept note §2, P14]: Anchor hidden or contextual information to the object it explains (in-place, situated) rather than to extra detached panels. Do not deliver dense implicit knowledge only as long text or audio. Pilot testing should check perceived overload for text-heavy information layers.
- p. 10777 (PDF p. 12): “Situated visualization on physical exhibits All participants highlighted their desire to communicate implicit knowledge in a contextual and situated manner (i.e., integrated with the exhibits rather than through additional visual panels).”
- p. 10777 (PDF p. 12): “grated with the exhibits rather than through additional visual”
- p. 10777 (PDF p. 12): “these hurdles; however, they found that this approach made”
- p. 10777 (PDF p. 12): “The participants resorted to adding extra image panels next to the exhibit to overcome these hurdles; however, they found that this approach made the exhibition overwhelming and less enjoyable. Commonly shared desired ideas expressed by the participants included the need for more immersive and seamless visualizations alongside the actual exhibits.”
- p. 10777 (PDF p. 12): “visitors easily get overwhelmed if it is delivered only through”

**HUNGLEE-R12** [interface-design; finding from this study's own data; relation: supports; concept note §7, P91]: Implement progressive disclosure: the initial view of each object or room shows only highlights, and deeper layers open on user request. Log the depth each user reaches (layer index) so that 'depth of exploration' (concept note §10) can be computed.
- p. 10779 (PDF p. 14): “Beyond the type of knowledge, 12 out of 16 participants”
- p. 10779 (PDF p. 14): “emphasized the importance of providing "flexibility in the”
- p. 10779 (PDF p. 14): “make the initial exhibition as simple as possible and provide”
- p. 10779 (PDF p. 14): “interactivity to provide additional information as requested.”
- p. 10779 (PDF p. 14): “P6 commented, "The less intrusive, the better, and it is okay”

**HUNGLEE-R13** [spatial-design; author recommendation; relation: extends; concept note §7, P90]: Optionally tie disclosure depth to proximity (proxemics): closer approach to an object or station unlocks deeper layers. If used, the 2D pathway needs an informationally equivalent depth control (expand or drill-down), and distance-triggered disclosures are logged with their trigger type.
- p. 10780 (PDF p. 15): “approach to visualizing the different depths of knowledge”
- p. 10780 (PDF p. 15): “based on spatial distances. For instance, the system could”
- p. 10780 (PDF p. 15): “For instance, the system could activate visualizations incrementally based on the visitor's movement, such as their distance from the exhibit, as depicted in the first illustration in Figure 12.”
- p. 10780 (PDF p. 15): “movement, such as their distance from the exhibit, as”

**HUNGLEE-R14** [spatial-design; author recommendation; relation: extends; concept note §6, P78]: Present creation and context knowledge (the artisan's environment, regional ecology, workshop) environmentally, as a 3D setting around the content, rather than only as text or images. Any extra sensory cue (sound, light) must carry equivalent information in the 2D pathway, or be excluded from the comparison.
- p. 10778 (PDF p. 13): “Environmental or spatial representation of creators' viewpoints The participants emphasized the importance of delivering the creators' perspective in a spatial and environmental manner, which used to be challenging in many physical exhibition settings.”
- p. 10778 (PDF p. 13): “the creators' perspective in a spatial and environmental”
- p. 10778 (PDF p. 13): “To solve this challenge, the desired ideas shared by the participants mostly evolved around providing 3D environmental engagements.”
- p. 10778 (PDF p. 13): “senses besides virtual and audio senses could also be applied”

**HUNGLEE-R15** [learning-design; author recommendation; relation: extends; concept note §2, P11]: Where feasible, let users carry out a simplified step of the craft (for example, stamping a block on a virtual cloth), not only observe the creator's process from a third-person view. Treat it as an optional interaction whose use is logged, and keep it out of the informational-equivalence comparison unless the 2D pathway has a matched activity.
- p. 10779 (PDF p. 14): “of creations was helping visitors understand the creators'”
- p. 10781 (PDF p. 16): “instance, visitors could become familiar with an artist's”
- p. 10781 (PDF p. 16): “brushstroke techniques (Figure 7f) by replicating a similar”

**HUNGLEE-R16** [accessibility-ux; finding from this study's own data; relation: supports; concept note §3, P56]: Allow both browse-first and read-first strategies. Content must not be gated behind a fixed explanation order, and the order in which a user first meets objects and information layers is logged so that the two strategies can be told apart.
- p. 10779 (PDF p. 14): “types of visitors. They noted that individuals have”
- p. 10779 (PDF p. 14): “to initially browse through the works on display and then”
- p. 10779 (PDF p. 14): “read the accompanying information, others opt to gain the”
- p. 10779 (PDF p. 14): “tioned, "Sometimes artists prefer the viewer to think for”

**HUNGLEE-R17** [logging-analytics; author recommendation; relation: supports; concept note §10, P108]: Track users' movement and behaviour implicitly as feedback on the design of the exhibition (and of the study), without requiring explicit feedback actions.
- p. 10782 (PDF p. 17): “physical behaviors to gain feedback on exhibition design by”
- p. 10782 (PDF p. 17): “Moreover, XR could also be used to track visitors' physical behaviors to gain feedback on exhibition design by understanding their physical behaviors (Kim, 2018) to improve the overall exhibition design.”
- p. 10782 (PDF p. 17): “improve the overall exhibition design.”

**HUNGLEE-R18** [content-knowledge-modelling; design description; relation: extends; concept note §2, P15]: Build our epistemic classification with a documented, replicable qualitative procedure. Code each content unit (sentence) on two axes, 'what type of information' and 'how it is described', then sort the codes by affinity diagramming into themes, iterate, and re-apply the final scheme to the whole dataset to check coverage. Record codebook versions.
- p. 10770 (PDF p. 5): “Inspired by Grounded Theory (Strauss & Corbin, 1998), we”
- p. 10770 (PDF p. 5): “applied open coding and thematic analysis (Braun & Clarke,”
- p. 10770 (PDF p. 5): “each sentence from two perspectives:”
- p. 10770 (PDF p. 5): “tion it is" and "how the information is being described."”
- p. 10771 (PDF p. 6): “lected datasets back to our taxonomy and checked the”

**HUNGLEE-R19** [limitation-risk; author recommendation; relation: supports; concept note §11, P150]: Any categories borrowed from this taxonomy must go through our expert content validation (week 4). Do not cite the taxonomy as validated: its generalisability was not evaluated, and it was based on 10 exhibitions.
- p. 10782 (PDF p. 17): “have created a knowledge taxonomy based on a dataset”
- p. 10782 (PDF p. 17): “ity of the taxonomy as it was beyond the scope of our paper.”
- p. 10782 (PDF p. 17): “Future work must test the proposed taxonomy's validity”

**HUNGLEE-R20** [limitation-risk; author recommendation; relation: extends; concept note §3, P40]: Treat the knowledge-type-to-XR-delivery mapping as untested design hypotheses that come from curators, not from learner evidence. Where our platform adopts one of these mappings (situated layers, proxemic depth, theme reminders), its effect on learners is attributed to our own study only.
- p. 10782 (PDF p. 17): “sible that the experiences desired by educators may not align”
- p. 10782 (PDF p. 17): “However, it is possible that the experiences desired by educators may not align with those of actual learners. Therefore, understanding visitors' perspectives and experiences could also be fused in the future to provide more comprehensive design guidelines for XR docent systems.”
- p. 10783 (PDF p. 18): “conduct an in-the-wild experiment with potential visitors to”
- p. 10783 (PDF p. 18): “setup could not collect insights from hands-on experiences”

### Quantin et al. 2024 (AIDEN)

Quantin, M., Plessis, W., & Laroche, F. (2024). AIDEN, a visualization tool in virtual reality for RDF graph. *Procedia CIRP*, 128, 538–542 (34th CIRP Design Conference). https://doi.org/10.1016/j.procir.2024.03.034

**AIDEN-R01** [spatial-design; design description; relation: supports; concept note §3, P44; §7, P90]: The spatial compiler shall place rooms/objects from typed domain relations (sequence, causal, material, comparison) rather than from a generic force-directed node-link layout; a force-directed layout (e.g. Barnes-Hut O(N log N)) may be used only internally (e.g. to seed or check positions), never shown to participants as the experience.
- p. 540 (PDF p. 3): “The graph is a directed edge-node multigraph laid out with”
- p. 540 (PDF p. 3): “3D force-directed algorithm [12]. In order to reduce the number”
- p. 542 (PDF p. 5): “[12] J. Barnes, P. Hut, A hierarchical O(N log N) force-calculation”

**AIDEN-R02** [learning-design; design description; relation: supports; concept note §3, P44; §4, P69]: Participants in Pathway B shall never be given a raw node-link graph viewer of the knowledge base; the knowledge graph is an authoring/compilation artefact, and AIDEN shows that such viewers are low-level, expert-oriented editing representations.
- p. 541 (PDF p. 4): “AIDEN provides a way to dive into a low”
- p. 541 (PDF p. 4): “level representation of the content for accurate edits among”
- p. 538 (PDF p. 1): “2D interfaces often fail to provide an intuitive user experience.”

**AIDEN-R03** [technical-implementation; design description; relation: extends; concept note §6, P76]: Graph-scale budget: the compiled spatial scene per study session shall stay far below the ~800-node level at which AIDEN reports overload, slowdown and display saturation; record node/edge counts of each compiled manifest and verify frame rate on the target headset at the maximum manifest size.
- p. 539 (PDF p. 2): “graphs from 100 to 800 nodes (i.e. approx. 500-4000 RDF”
- p. 539 (PDF p. 2): “AIDEN is overloaded and slows down, the display is saturated,”

**AIDEN-R04** [limitation-risk; author recommendation; relation: conflicts; concept note §5, P74; §9, P98]: Do not assume 3D/spatial presentation is superior for small knowledge sets: AIDEN's authors judge 2D sufficient below ~100 nodes and easier below 20 nodes. Our concept-map set (~10 concepts) and three-tradition prototype are small, so the hypothesis must be tested, and the 2D pathway must be a genuinely strong interface.
- p. 539 (PDF p. 2): “may be enough to supervise the data; beyond 800 nodes,”
- p. 541 (PDF p. 4): “very small graph (<20 nodes), a 2D representation is easier to”

**AIDEN-R05** [content-knowledge-modelling; design description; relation: supports; concept note §7, P90]: The knowledge model shall distinguish relations (object properties between entities) from attributes (literal/datatype/annotation values): only relations may become spatial structure (adjacency, paths, sequence); attributes and images are shown in the object's information panel when selected. This reduces the number of displayed elements.
- p. 540 (PDF p. 3): “of displayed nodes, only object properties create new edges,”
- p. 540 (PDF p. 3): “while annotation and datatype properties are attached to the”
- p. 540 (PDF p. 3): “node and displayed on an overlay panel when the node is”
- p. 540 (PDF p. 3): “selected. Pictures are cast and displayed in the panel.”

**AIDEN-R06** [spatial-design; design description; relation: extends; concept note §9, P97-P99]: Provide both an overview affordance and a local, inside-the-structure view, because AIDEN reports an explicit trade-off: the overview supports pattern/group recognition but has low legibility of detail, while the immersive view improves readability of individual relationships but limits comprehension of overall structure. Our relational-understanding outcome needs both; log which one is used.
- p. 540 (PDF p. 3): “dedicated to pattern recognition and group identification. The”
- p. 541 (PDF p. 4): “approach's drawback is a low legibility for the details (text,”
- p. 541 (PDF p. 4): “This mode enhances the readability of individual node relationships. However, it limits the user's capacity to comprehend the overall structure of the graph.”
- p. 541 (PDF p. 4): “However, it limits the user's capacity to comprehend the”
- p. 541 (PDF p. 4): “overall structure of the graph. Users navigate via several”

**AIDEN-R07** [interface-design; design description; relation: supports; concept note §7, P90]: When an object is selected, show its first-degree relations in a legible, enlarged 2D form whose items are clickable for step-by-step exploration; in our platform this is rendered as text/cards (not a node-link diagram), so that relation detail is readable without exposing a raw graph.
- p. 541 (PDF p. 4): “nodes, and edges). Upon selecting a node, a 2D layout of the”
- p. 541 (PDF p. 4): “The nodes of this 2D representation are clickable, allowing step-by-step exploration of the graph. As a contrast, the second representation, immersive view, dives the user into the graph and provides a local view of the data.”

**AIDEN-R08** [interface-design; design description; relation: extends; concept note §7, P91; §10, P108]: If information panels can be pinned and repositioned in space (AIDEN 'sticky notes'), pin/unpin/move must be logged as interaction events; for the experiment, consider disabling pinning to limit interface controls, since it has no 2D equivalent.
- p. 540 (PDF p. 3): “Users can pin any panel and keep it as a sticky note,”
- p. 540 (PDF p. 3): “positioned wherever they like in the immersive virtual space.”

**AIDEN-R09** [technical-implementation; design description; relation: extends; concept note §10, P121-P122]: No free-text entry in VR via virtual keyboard. If a natural-language query channel is offered (concept note 'Query asked'), it shall be speech-to-text (AIDEN: Whisper) with the LLM step (AIDEN: ChatGPT) constrained and fully logged (raw transcript, enriched prompt, generated query, result); an equivalent query channel must exist in Pathway A.
- p. 539 (PDF p. 2): “The Voice-to-Text conversion is managed by Whisper, while the cognitive processing is executed by ChatGPT.”
- p. 540 (PDF p. 3): “for use in a VR environment (virtual keyboard). The voice”
- p. 540 (PDF p. 3): “After some basic local enrichment (selected node data) of the verbal request, chatGPT write a SPARQL request. 3.3.”

**AIDEN-R10** [accessibility-ux; design description; relation: extends; concept note §7, P91]: Voice navigation of application features (AIDEN's second voice role) is a candidate control for reducing menu overlays in VR; if used it must not appear in only one condition unless treated as part of the manipulation.
- p. 540 (PDF p. 3): “A voice interface serves a dual role: (1) enabling users to”
- p. 540 (PDF p. 3): “create SPARQL queries and (2) facilitating voice navigation”
- p. 539 (PDF p. 2): “difficulties of writing queries and the limitations of software”

**AIDEN-R11** [interface-design; design description; relation: extends; concept note §9, P103; §10, P131-P132]: Locomotion shall be a defined, small set of techniques (AIDEN offers free-axis flight, node-aimed teleportation and ground-axis teleportation); each locomotion event shall be logged with its technique so navigation burden can be separated from content difficulty.
- p. 541 (PDF p. 4): “Users navigate via several mechanisms including free-axis flight, node-aimed teleportation, and ground-axis teleportation.”
- p. 541 (PDF p. 4): “Users navigate via several mechanisms including free-axis flight, node-aimed teleportation, and ground-axis teleportation. As positively evaluated by Hayatpur et al.”

**AIDEN-R12** [guidance-signalling; design description; relation: conflicts; concept note §7, P91]: Provide a togglable mini-map (AIDEN places it on a virtual wristwatch) to maintain spatial awareness, hidden by default to honour map minimisation; log every toggle as a guidance/support event.
- p. 541 (PDF p. 4): “spatial awareness within the graph, a real-time togglable mini-”
- p. 541 (PDF p. 4): “map is embedded on the user's virtual wristwatch.”

**AIDEN-R13** [logging-analytics; design description; relation: extends; concept note §10, P125, P139]: Smooth (tweened) camera transitions between view modes, plus 'go to searched item' and 'backtrack to previous position' shortcuts, if offered, must be logged as distinct event types so that system-assisted returns are not counted as voluntary revisits in revisit-rate and path metrics.
- p. 541 (PDF p. 4): “Switching from one mode to another is smoothened by”
- p. 541 (PDF p. 4): “tweening the two camera positions; this may help with”
- p. 541 (PDF p. 4): “searched node, backtracking to a previous position augment the”

**AIDEN-R14** [accessibility-ux; design description; relation: independent]: Participant builds shall be read-only: no edit mode, no create/update/delete of knowledge; editing (AIDEN's Edit mode) belongs only to the curation tooling.
- p. 541 (PDF p. 4): “Our system features a dual-mode. In the Read mode, users”
- p. 541 (PDF p. 4): “modify the graph database: create, update or delete triples. In”

**AIDEN-R15** [logging-analytics; design description; relation: extends; concept note §10, P139; §9, P99]: Compute standard graph metrics (node degree, closeness and betweenness centrality, clustering coefficient, average shortest path length) on the knowledge graph, on each participant's navigation graph and on their post-test concept map, to support structural comparison between navigation and reconstructed knowledge.
- p. 541 (PDF p. 4): “With structural graph metrics styling, the style of the nodes is influenced by graph theory structural metrics, each providing an insight on the node's position and role within the graph. Classical metrics are implemented: average shortest path length, closeness centrality, betweenness centrality, clustering coefficient and node degree.”
- p. 541 (PDF p. 4): “coefficient and node degree. Each can be mapped to either node”

**AIDEN-R16** [guidance-signalling; design description; relation: supports; concept note §6, P77-P84]: Colour-code knowledge categories with at most seven distinguishable classes from a ColorBrewer palette; our seven-part epistemic template (P78-P84) fits this limit. Use the same category colours in Pathway A to keep the conditions informationally equivalent.
- p. 541 (PDF p. 4): “cartographers use seven (7) divergent color classes maximum.” *(secondary: reports another study)*
- p. 541 (PDF p. 4): “reached; default is seven (7). An optimal color palette is created”
- p. 541 (PDF p. 4): “with ColorBrewer2 [15]. We plan to develop further, so to have”

**AIDEN-R17** [content-knowledge-modelling; design description; relation: extends; concept note §6, P77]: When the taxonomy has more leaf classes than the colour/visual budget, merge classes upward along the taxonomy tree (deepest leaves first) until the target count is reached, so visual categories stay semantically coherent.
- p. 541 (PDF p. 4): “So we gather node classes based on their positions in the”
- p. 541 (PDF p. 4): “each step, among the leaf nodes, the deepest ones are selected,”
- p. 541 (PDF p. 4): “process loops until the target number of distinct classes is”

**AIDEN-R18** [content-knowledge-modelling; design description; relation: extends; concept note §6, P77]: Consider CIDOC-CRM (the heritage core ontology AIDEN uses, with RDFS/OWL/DCterms) as the alignment target for exporting the craft knowledge graph, without exposing ontology-level semantics (inheritance, transitivity) to participants.
- p. 539 (PDF p. 2): “Knowledge graphs are built with CIDOC-CRM as core ontology, handling most of the semantics.”
- p. 539 (PDF p. 2): “(inheritance, transitivity, etc.) are exploited but not displayed.”

**AIDEN-R19** [technical-implementation; design description; relation: independent]: Document the rendering stack and headset of our build explicitly (AIDEN: Unity engine, Ontotext GraphDB triplestore with SPARQL endpoint, HTC Vive Focus 3 standalone headset), because these determine performance budgets and comparability with prior work.
- p. 539 (PDF p. 2): “Development of the 3D environment was carried out with Unity game engine. The knowledge graph (historical data) is managed in the Ontotext GraphDB tripleStore.”
- p. 539 (PDF p. 2): “The application is build and tested with HTC vive focus 3 virtual reality headset.”

**AIDEN-R20** [limitation-risk; design description; relation: extends; concept note §3, P44]: Do not cite AIDEN as evidence that VR graph navigation reduces cognitive load or makes data accessible to non-experts: those are untested claims; the paper reports no performance figures (frame rate, latency) and no user study beyond informal testing by data-visualisation experts. Our study must measure these itself.
- p. 538 (PDF p. 1): “thereby enhancing the user experience by reducing cognitive load while exploiting the potential of a third dimension for data visualization purposes.”
- p. 541 (PDF p. 4): “So far, AIDEN testing has been carried out by”
- p. 541 (PDF p. 4): “visualization experts aware of 2D graph editing (Cytoscape) in”

**AIDEN-R21** [study-design; author recommendation; relation: supports; concept note §9, P104; §8, P94]: Use task-based evaluation with a 2D baseline: AIDEN's planned evaluation compares task completion time of content experts in VR, after short training, against a reference time set by an expert using a 2D tool. Our between-group design should likewise define tasks, a training/onboarding phase and completion-time measures in both pathways.
- p. 541 (PDF p. 4): “Conclusion and perspectives Evaluation So far, AIDEN testing has been carried out by datavisualization experts aware of 2D graph editing (Cytoscape) in order to enhance this 2D experience. We plan to evaluate AIDEN with historians (contentexperts) in the completion of a number of tasks.”
- p. 541 (PDF p. 4): “The reference time for each task will be”
- p. 541 (PDF p. 4): “complete the tasks using AIDEN will be compared with the”

**AIDEN-R22** [content-knowledge-modelling; author recommendation; relation: supports; concept note §11, P150]: Automated schema validation (e.g. SHACL) is necessary but not sufficient: craft and science claims must be reviewed by human domain experts, because content can be logically valid yet factually wrong.
- p. 538 (PDF p. 1): “constraint (SHACL). Information can be true from a logical”
- p. 538 (PDF p. 1): “but false from a historical point of view. Then, human-readable”

**AIDEN-R23** [interface-design; review/meta-analysis finding; relation: extends; concept note §2, P14]: Choose and record the VR input modality (hand tracking vs controllers): prior work reviewed by AIDEN found hand tracking more intuitive with higher presence, but controllers more robust, and multimodal interfaces more efficient and satisfying.
- p. 540 (PDF p. 3): “found that hand tracking was seen as more intuitive for users” *(secondary: reports another study)*
- p. 540 (PDF p. 3): “and yielded a higher feeling of presence. However, controllers” *(secondary: reports another study)*
- p. 540 (PDF p. 3): “A study of 2010 [9] found that a multimodal interface was more efficient and users were more satisfied with it when compared to the unimodal interface.” *(secondary: reports another study)*

**AIDEN-R24** [spatial-design; review/meta-analysis finding; relation: supports; concept note §2, P12]: Use stereo and motion depth cues to increase the amount of structure legible in 3D (secondary evidence from Ware & Mitchell, Kwon et al.), which supports using real 3D depth in Pathway B rather than flat panels in VR.
- p. 540 (PDF p. 3): “significantly increased the size of the graph that could be” *(secondary: reports another study)*
- p. 540 (PDF p. 3): “Kwon [6] found that spherical layouts and depth routing” *(secondary: reports another study)*

### Wen et al. 2024

Wen, P., Lu, F., & Mohamad Ali, A. Z. (2024). Using attentional guidance methods in virtual reality laboratories reduces students' cognitive load and improves their academic performance. *Virtual Reality*, 28(2), 110. https://doi.org/10.1007/s10055-024-01012-0

**WEN-R01** [guidance-signalling; design description; relation: supports; concept note §2, P13]: Signalling in the immersive pathway should use a salient in-world 3D cue (e.g. a 3D arrow) positioned directly above the currently relevant object and repositioned whenever the relevant object changes.
- p. 4 (PDF p. 4): “The arrow was designed to hang directly above the characters, cameras, and lights”
- p. 4 (PDF p. 4): “a reminder and guide. The arrow was suspended above the”
- p. 4 (PDF p. 4): “When the object changed, the position of the arrow changed accordingly. 2.3Measurement instruments 2.3.1Cognitive load The NASA-TLX is an important tool for developing new measures and models (Hart 2006).”

**WEN-R02** [guidance-signalling; design description; relation: extends; concept note §7, P91]: Guidance cues in the 3D scene must be 3D objects, not flat 2D overlays, so that they are visible from any viewpoint (including along the depth axis) and do not break immersion.
- p. 4 (PDF p. 4): “Since using 2D symbols in a VR scene hinders immersion,”
- p. 4 (PDF p. 4): “which is crucial (Liberatore and Wagner 2021), and because a 2D arrow cannot be seen on the Z-axis of the 3D space, it”

**WEN-R03** [guidance-signalling; design description; relation: extends; concept note §2, P13]: Reserve a cue colour that appears nowhere else in the scene and is chosen against the scene's background palette; the design token for the guidance cue must not be reused for exhibits, props or UI.
- p. 7 (PDF p. 7): “achieved using a yellow arrow--a hue of yellow that does”
- p. 7 (PDF p. 7): “not appear elsewhere in the VR lab and an obvious colour”
- p. 4 (PDF p. 4): “colour of the scene in the VR lab, a 3D yellow arrow was”

**WEN-R04** [spatial-design; author recommendation; relation: extends; concept note §7, P90]: Learning-relevant objects in the 3D space must be visually differentiated from decorative or contextual elements (by colour, shape, size, brightness or motion contrast).
- p. 7 (PDF p. 7): “should thus highlight those elements of the visual space”
- p. 7 (PDF p. 7): “in a VR lab and clearly differentiate them from other”
- p. 2 (PDF p. 2): “elements: visual/space contrast and dynamic contrast.” *(secondary: reports another study)*

**WEN-R05** [cognitive-load; theoretical claim; relation: supports; concept note §7, P91]: Limit decorative realism in the experimental scene: realistic detail not tied to learning content should be removed or de-emphasised, because realism and irrelevant detail are reported sources of extraneous load.
- p. 2 (PDF p. 2): “increased realism is a source of its higher cognitive load” *(secondary: reports another study)*
- PDF p. 1: “realistic, VR labs may present details that distract learners” *(secondary: reports another study)*
- p. 3 (PDF p. 3): “from among several useless details (Makransky et al. 2021).” *(secondary: reports another study)*

**WEN-R06** [cognitive-load; theoretical claim; relation: supports; concept note §2, P14; §7, P91]: Keep interactivity moderate: expose only interactions needed for the learning task, since high interactivity is reported to exhaust cognitive resources.
- p. 2 (PDF p. 2): “some studies finding that moderate interactivity results in” *(secondary: reports another study)*
- p. 2 (PDF p. 2): “the strongest learning effects (Kalet et al. 2012). Therefore,” *(secondary: reports another study)*
- PDF p. 1: “Simultaneously, the high level of interactivity leads to further distractions, which can quickly drain cognitive resources (Skulmowski and Rey 2018).” *(secondary: reports another study)*

**WEN-R07** [measurement-instrument; design description; relation: extends; concept note §9, P103]: If the NASA-TLX is used, administer all six subscales (mental, physical and temporal demand, frustration, effort, performance) on a 100-point scale immediately after the learning task, and report its reliability.
- p. 4 (PDF p. 4): “It contains six subscales that measure cognitive load: mental demand, physical demand, temporal demand, frustration, effort, and performance.”
- p. 4 (PDF p. 4): “Each subscale is scored from 1 to 100.”
- p. 4 (PDF p. 4): “The NASA-TLX is reliable, with a Cronbach's alpha coefficient of 0.73. As this is above the suggested threshold of 0.6, it suggests its inherently good reliability (Longo and Orru 2018).”
- p. 5 (PDF p. 5): “After the participants had submitted their tasks, they answered the NASA-TLX questionnaire. The lecturer provided no verbal or physical guidance during the experiment.”

**WEN-R08** [measurement-instrument; design description; relation: conflicts; concept note §9, P103]: The cognitive-load measure must separate content difficulty (intrinsic) from interface/navigation burden (extraneous). A single overall NASA-TLX workload score, as used by Wen et al., does not meet this requirement and must be supplemented or replaced by a differentiated instrument.
- p. 6 (PDF p. 6): “Dependent variable: scores; predictors: (constant), overall workload”
- p. 7 (PDF p. 7): “learning experience and the complexity of learning tasks”
- p. 7 (PDF p. 7): “Therefore, this study did not consider learning task com-”

**WEN-R09** [study-design; author recommendation; relation: supports; concept note §8, P94]: Participants must be randomly assigned to conditions (not by intact class) and must complete a pre-test of prior knowledge, so that group differences are not confounded with baseline differences.
- p. 4 (PDF p. 4): “The participants were not randomly assigned to each group; a quasiexperimental design was adopted and each class was considered a group of 40 students.”
- p. 7 (PDF p. 7): “formance at the beginning of the experiment, which could”
- p. 7 (PDF p. 7): “use a pre-test to assess the learning performance of both”

**WEN-R10** [study-design; finding from this study's own data; relation: conflicts; concept note §8, P93–P94]: Plan sample size against effects of the size Wen et al. found. With 40 per group they detected partial eta squared 0.30 for workload and 0.09 for performance; a 20-per-group design has markedly less power for an effect like the performance effect.
- p. 4 (PDF p. 4): “ered a group of 40 students. One class was the control group,”
- p. 5 (PDF p. 5): “p<0.05, partial eta squared=0.30, provided that the effect”
- p. 5 (PDF p. 5): “eta squared=0.09), showing a medium effect size (Cohen”

**WEN-R11** [study-design; design description; relation: supports; concept note §7, P91; §8, P94]: Use a standardised, timed session protocol identical across conditions: scripted introduction to the hardware/software, a written manual, a fixed hands-on practice period, then the timed learning task with no experimenter help, then the questionnaires (Wen et al.: about 5 + 10 + 10 + 30 min, about 60 min in total).
- p. 5 (PDF p. 5): “ware in the VR labs. This took approximately 5 min. Each”
- p. 5 (PDF p. 5): “system manually for 10 min. Next, the participants watched”
- p. 5 (PDF p. 5): “for 30 min. After the participants had submitted their tasks,”
- p. 5 (PDF p. 5): “ment. The total duration was approximately 60 min.”

**WEN-R12** [study-design; design description; relation: supports; concept note §7, P91; §11, P150]: Hold content constant across conditions and manipulate one design variable at a time, with content and design validated by external experts before the study.
- p. 4 (PDF p. 4): “same; the only difference was whether this attentional guid-”
- p. 4 (PDF p. 4): “multimedia design. Two technical, two teaching, and two”
- p. 4 (PDF p. 4): “educational psychology experts participated in the evalua-”

**WEN-R13** [study-design; finding from this study's own data; relation: extends; concept note §5, P72]: Analyse cognitive load as a predictor of learning outcomes (correlation and regression of post-test scores on cognitive load), not only as a between-group outcome.
- p. 6 (PDF p. 6): “Table4Results of the regression analysis B SE t p (Constant) 129.84 12.83 10.12 0.00 Overall workload -0.71 0.18 -0.41 -3.92 0.00 R2=0.17, Adjusted R2=0.15 4Discussion Regarding RQ1, it was found that the cognitive load of the experimental group decreased significantly.”
- p. 6 (PDF p. 6): “Table4Results of the regression analysis B SE t p (Constant) 129.84 12.83 10.12 0.00 Overall workload -0.71 0.18 -0.41 -3.92 0.00 R2=0.17, Adjusted R2=0.15 4Discussion Regarding RQ1, it was found that the cognitive load of the experimental group decreased significantly.”
- p. 6 (PDF p. 6): “academic performance could be explained by cognitive load.”

**WEN-R14** [measurement-instrument; design description; relation: extends; concept note §9, P99]: Performance/product measures (e.g. concept-map scores) must use an explicit item-level rubric with a fixed maximum, and be scored by raters blind to condition with inter-rater reliability reported (Wen et al. used a 10-item rubric scored by one lecturer with no reliability reported).
- p. 5 (PDF p. 5): “measured, each on a scale of 1 to 10 (Table 1). A lecturer”
- p. 5 (PDF p. 5): “graded their scores and the total score (out of 100) served as”

**WEN-R15** [guidance-signalling; design description; relation: extends; concept note §3, P56]: Treat guidance timing as an open design decision: Wen et al. tested only a continuous, always-visible cue against no cue, so their result supports continuous object-following signalling but provides no evidence for delayed or on-demand guidance.
- PDF p. 1: “We designed and developed two VR labs, one with and one without this attentional guidance stimulus (a 3D yellow arrow).”
- p. 4 (PDF p. 4): “When the object changed, the position of the arrow changed accordingly. 2.3Measurement instruments 2.3.1Cognitive load The NASA-TLX is an important tool for developing new measures and models (Hart 2006).”

**WEN-R16** [study-design; author recommendation; relation: supports; concept note §8, P94; §3, P37]: Measure prior knowledge (and record age and gender) as potential boundary conditions of guidance and cognitive-load effects, and test them as covariates or moderators.
- p. 7 (PDF p. 7): “found a relationship, which may be due to the boundary con-”
- p. 7 (PDF p. 7): “ditions, including age, gender, and prior knowledge. Mayer”
- p. 7 (PDF p. 7): “is associated with perceiving learning task as easy and”

**WEN-R17** [guidance-signalling; theoretical claim; relation: extends; concept note §2, P13]: Candidate cue forms for directing attention in 3D space include a moving window, 3D arrow, radiation, spherical gradation and 3D radar; colour and brightness contrast are effective attention-capturing features. Any alternative to an arrow must be justified against these.
- p. 3 (PDF p. 3): “mechanism as a moving window, 3D arrow, radiation,” *(secondary: reports another study)*
- p. 3 (PDF p. 3): “nisms vary. The 3D arrows are positioned at a central level” *(secondary: reports another study)*
- p. 3 (PDF p. 3): “2000, 2001; Turatto et al. 2004) and brightness levels (Enns” *(secondary: reports another study)*

**WEN-R18** [limitation-risk; theoretical claim; relation: extends; concept note §3, P47]: Do not assume that a cue which eases perception improves comprehension: prior studies found visual guidance with no effect on performance, and gesture cues with lower comprehension. Signalling effects on learning must be measured, not inferred from search speed.
- p. 3 (PDF p. 3): “results showed that visual attentional guidance does not” *(secondary: reports another study)*
- p. 3 (PDF p. 3): “Their results showed that learners exhibited lower learning comprehension scores despite easily perceiving information, while cognitive cues helped reduce the external cognitive load.” *(secondary: reports another study)*
- p. 3 (PDF p. 3): “Their results showed that learners exhibited lower learning comprehension scores despite easily perceiving information, while cognitive cues helped reduce the external cognitive load.” *(secondary: reports another study)*

**WEN-R19** [limitation-risk; design description; relation: independent]: Report the exact hardware (display type, HMD model or desktop, input devices) for each condition. Wen et al. do not specify the VR hardware, which limits how far their result can be generalised to a given device.
- p. 5 (PDF p. 5): “advance and played on a VR laptop by each group of par-”
- p. 5 (PDF p. 5): “ticipants the use of the hardware and operation of the soft-”

**WEN-R20** [limitation-risk; author recommendation; relation: extends; concept note §8, P93]: Do not generalise Wen et al.'s effect beyond its sample and task: single course, digital-media-art majors at two universities, intact classes and a small sample. Our study should report sample discipline and avoid over-generalising its own findings in the same way.
- p. 7 (PDF p. 7): “design, the selection of samples was limited by majors and”
- p. 7 (PDF p. 7): “a small sample size, which is a limitation of the study, they”

**WEN-R21** [measurement-instrument; author recommendation; relation: supports; concept note §9, P105–P106]: Include motivation and satisfaction (or UX) measures alongside cognitive load and performance, as Wen et al. recommend for future guidance studies.
- p. 7 (PDF p. 7): “groups of students. Finally, more variables, such as”
- p. 7 (PDF p. 7): “tion and satisfaction, could be included in future studies to”

**WEN-R22** [logging-analytics; theoretical claim; relation: extends; concept note §10, P129–P130]: Log guidance-cue exposure (when a cue is shown, for which object, and how long until the participant reaches or selects the cued object) so that cue effects on visual search time can be analysed; Wen et al. attribute the load reduction to shorter visual search but did not measure it.
- p. 6 (PDF p. 6): “guidance mechanism reduced the mental effort and time”
- p. 6 (PDF p. 6): “that the visual search consumed, allowing the students to”

### Song & Evans 2024

Song, Z., & Evans, L. (2024). The museum of digital things: extended reality and museum practices. *Frontiers in Virtual Reality*, 5, 1396280. https://doi.org/10.3389/frvir.2024.1396280

**SONG-R01** [content-knowledge-modelling; theoretical claim; relation: supports; concept note §7, P90]: Model each museum object as a relational node: every exhibit entry point shall link to its cultural, historical, material and process context (not be an isolated item), so that selecting it opens relations to the wider tradition.
- p. 03 (PDF p. 3): “The fourfold provides an account of the thing as inherently”
- p. 04 (PDF p. 4): “museum items from diverse viewpoints, liberating them from their”
- p. 04 (PDF p. 4): “physical confines and facilitating their analysis within a broader”

**SONG-R02** [content-knowledge-modelling; theoretical claim; relation: supports; concept note §6, P77]: Maintain a detailed per-object ontology (structured description of each item in the collection) as the source for both pathways; the authors argue such an ontology supports more efficient and meaningful visitor inquiry.
- p. 10 (PDF p. 10): “of a detailed ontology for each item within a collection or”
- p. 10 (PDF p. 10): “efficient and meaningful inquiries by museum visitors, thereby”

**SONG-R03** [interface-design; finding from this study's own data; relation: supports; concept note §7, P90-P91; §10, P117-P120]: Present object information in layers (multi-channel curation): a short first layer with further artisan/process/science layers opened on demand, and log each layer opened.
- p. 06 (PDF p. 6): “(Ethan). Ethan explains that multi-channel curation involves presenting collected information in a layered manner with the aid of XR technologies.”
- p. 06 (PDF p. 6): “collected information in a layered manner with the aid of XR”

**SONG-R04** [cognitive-load; finding from this study's own data; relation: supports; concept note §2, P14; §7, P91]: Multiple narratives or perspectives attached to one object shall be presented so they do not compete for attention (e.g. one at a time, user-selected), to avoid overwhelming the learner or hiding information.
- p. 06 (PDF p. 6): “multiple narratives and perspectives presented in parallel without”
- p. 06 (PDF p. 6): “multiple stories associated with a single painting or artefact without”
- p. 06 (PDF p. 6): “This would enable them to explore multiple stories associated with a single painting or artefact without becoming overwhelmed or overlooking any valuable information. The multi-sensory experience concept was a significant aspect highlighted during the interviews with the museum curators and UX researchers.”

**SONG-R05** [content-knowledge-modelling; finding from this study's own data; relation: extends; concept note §6, P84]: Support multiple interpretations: where artisans, regions or sources differ, the content model shall store alternative perspectives with attribution rather than a single interpretive narrative; the comparison layer should surface them.
- p. 05 (PDF p. 5): “This epitomises the constraints of conventional museums, which”
- p. 05 (PDF p. 5): “Museums can be a centre for multiple perspectives and”
- p. 05 (PDF p. 5): “interpretations instead of one. It's about curating multiple”

**SONG-R06** [content-knowledge-modelling; finding from this study's own data; relation: supports; concept note §7, P90]: Objects must never be presented without interpretation: each object entry point shall carry enough social/historical/process background to be understood, because artefacts are not self-explanatory.
- p. 04 (PDF p. 4): “purposes. However, the artefacts are not self-explanatory.”

**SONG-R07** [content-knowledge-modelling; finding from this study's own data; relation: supports; concept note §11, P150]: Accuracy of the scientific layer shall be verified by a domain expert before the study, and the frozen, verified content snapshot used in both pathways; museum experts stress accuracy of scientific information behind artefacts and keeping it current.
- p. 04 (PDF p. 4): “Bella ensures the scientific information behind artefacts, such as”
- p. 04 (PDF p. 4): “dinosaurs or paintings, is accurate. While Bella says the current”
- p. 05 (PDF p. 5): “We want to make sure that the information is up to date all the”

**SONG-R08** [limitation-risk; theoretical claim; relation: supports; concept note §7, P91]: Avoid technology-led spectacle: Pathway B must not add presentation glamour or extra information that Pathway A lacks, because multimedia that favours glamour over content intentions and causes information overload is a known museum-sector concern.
- p. 02 (PDF p. 2): “present challenges due to information overload. Also, many curators”
- p. 02 (PDF p. 2): “glamour of innovation instead of solving specific problems or” *(secondary: reports another study)*
- p. 02 (PDF p. 2): “preserving the exhibit content's intentions (Kelly et al., 2017).” *(secondary: reports another study)*

**SONG-R09** [study-design; finding from this study's own data; relation: conflicts; concept note §7, P91]: Do not add multi-sensory channels (audio narration, haptics, animation) or extra narrative layers to Pathway B alone; any such channel must be mirrored in Pathway A or documented as a confound, since Song & Evans present multi-sensory, multi-channel presentation as XR's main added value.
- p. 07 (PDF p. 7): “indicated that XR technologies augment artefacts from three”
- p. 07 (PDF p. 7): “The participants indicated that XR technologies augment artefacts from three perspectives: multi-channel curation, multi-sensory experience and the attraction of diverse audiences.”
- p. 06 (PDF p. 6): “technologies have the potential to augment this multi-sensory”

**SONG-R10** [spatial-design; finding from this study's own data; relation: supports; concept note §7, P90]: Organise each tradition as a walkable narrative: a sequenced path through rooms that tells the story (e.g. process order), so that the space itself carries the narrative.
- p. 07 (PDF p. 7): “stuff to work with in terms of being able to create a story that the”
- p. 07 (PDF p. 7): “element. This notion reflects the potential for imaginative and cognitive”

**SONG-R11** [spatial-design; theoretical claim; relation: supports; concept note §6, P78]: Provide a contextual backdrop for each tradition room (geography, environment, historical setting) so that place and context are part of the spatial encoding, matching the 'tradition, geography and context' template slot.
- p. 08 (PDF p. 8): “that transport users to different times and spaces, providing a”
- p. 08 (PDF p. 8): “contextual backdrop (i.e., the skies element) that enriches their”
- p. 10 (PDF p. 10): “VR can recreate historical environments, providing context that enhances the preservation and interpretation of artefacts.”

**SONG-R12** [learning-design; theoretical claim; relation: supports; concept note §2, P11; §2, P13]: Make the learner an active participant who interacts with objects, not a passive viewer: minimal interactivity with the material is argued to reduce engagement with ideas and possibilities.
- p. 07 (PDF p. 7): “embody the skies aspect. Thus, the minimal interactivity of the”
- p. 07 (PDF p. 7): “Earth element may create a potential issue, resulting in reduced”
- p. 08 (PDF p. 8): “This represents a significant shift from passive spectators to active”

**SONG-R13** [learning-design; theoretical claim; relation: supports; concept note §2, P13; §7, P88]: Include reflective prompts that ask learners how an object or process changes their understanding (meaning-making questions), equivalent in both pathways.
- p. 07 (PDF p. 7): “can ask questions like "How will I experience this? ," "How will this”
- p. 07 (PDF p. 7): “influence my understanding of the world." These questions help”

**SONG-R14** [measurement-instrument; finding from this study's own data; relation: supports; concept note §9, P106]: Measure presence ('being there') as a brief secondary outcome, since expert interviewees frequently describe XR's effect as 'being in a different world'; do not treat it as the primary outcome.
- p. 06 (PDF p. 6): “Moreover, "being in a different world" is a notion that is often”
- p. 06 (PDF p. 6): “of "being there" in a particular space, and in the VR context, that” *(secondary: reports another study)*

**SONG-R15** [study-design; finding from this study's own data; relation: extends; concept note §8, P93-P94]: Record participants' prior VR/gaming/smartphone experience as a covariate (and balance it across groups), because experts report younger people adapt quickly to VR due to familiarity; our student sample is likely high on this.
- p. 06 (PDF p. 6): “A lot of young people were immediately attracted to the VR”
- p. 06 (PDF p. 6): “suggested that young people may quickly become comfortable”
- p. 06 (PDF p. 6): “with VR since they are already accustomed to using smartphones”

**SONG-R16** [accessibility-ux; theoretical claim; relation: independent]: Assess XR barriers for participants with disabilities (motor, visual, vestibular) and provide an alternative or exclusion protocol; XR can widen access but its own barriers must be considered.
- p. 10 (PDF p. 10): “improving accessibility for people with disabilities by providing”
- p. 10 (PDF p. 10): “the barriers to using XR technology.”

**SONG-R17** [study-design; design description; relation: extends; concept note §11, P150]: For the expert content-validation / design-review step, use semi-structured interviews with purposive (and snowball) sampling of experienced practitioners (inclusion e.g. >= 2 years' experience) and Braun & Clarke thematic analysis, as Song & Evans did (22 interviews, Oct-Dec 2021, nine themes).
- p. 04 (PDF p. 4): “December 2021, we identified and recruited 22 participants,”
- p. 04 (PDF p. 4): “Inclusion criteria included having a minimum of 2 years”
- p. 04 (PDF p. 4): “Using thematic analysis, the interview data was classified into nine”

**SONG-R18** [study-design; author recommendation; relation: extends; concept note §11, P146, P150]: Content experts (curators/craft experts) and XR designers shall co-design the narrative journey through the space; record this collaboration in the design-process record.
- p. 06 (PDF p. 6): “and XR designers must collaborate to create a digital narrative”
- p. 06 (PDF p. 6): “journey for museum visitors. This would enable them to explore”

**SONG-R19** [logging-analytics; author recommendation; relation: extends; concept note §10, P108, P139]: Code the designed experience into units categorised by immersion, narrative and interactivity, and combine this design analysis with questionnaires, interviews and behavioural data on participants, as the authors recommend for future research.
- p. 11 (PDF p. 11): “other XR content and developing a coding scheme that categorizes units”
- p. 11 (PDF p. 11): “by elements of immersion, narrative and interactivity. This coding”
- p. 11 (PDF p. 11): “research could also use questionnaires and interviews to assess the”

**SONG-R20** [limitation-risk; author recommendation; relation: supports; concept note §3, P50]: Cite Song & Evans only for conceptual framing (XR objects as relational 'things'; meaning-making in digital museum space). Its claims of deeper understanding are unmeasured: qualitative expert interviews, possible researcher bias, small sample, limited generalisation, and no comparison with and without XR.
- p. 11 (PDF p. 11): “qualitative data collection, our perceptions, which are shaped by”
- p. 11 (PDF p. 11): “may not provide sufficient and exhaustive results; therefore,”
- p. 09 (PDF p. 9): “deeper understanding of and connection with the curated objects,”

**SONG-R21** [learning-design; theoretical claim; relation: supports; concept note §6, P80]: Represent the temporal dimension of craft knowledge (history of the tradition, and process past-to-outcome) in the spatial structure, since objects are argued to connect past and future in the present encounter.
- p. 07 (PDF p. 7): “museum is an intersection of the past, present and future.”
- p. 07 (PDF p. 7): “the fourfold components also have temporal aspects. When an object”

### Lu et al. 2026

Lu, Y.-C., Hwang, G.-J., & Tu, Y.-F. (2026). Self-explanation-guided virtual museum learning for knowledge co-construction based on the constructivist framework: a randomised control study. *Journal of Computer Assisted Learning*, 42(4), e70296. https://doi.org/10.1002/jcal.70296

**LU-R01** [learning-design; design description; relation: extends; concept note §2, P13]: If the study includes self-explanation, implement it as a two-part checkpoint for each room or section. (a) Structured guiding questions on factual content, with immediate correct/incorrect feedback. (b) Then an open written self-explanation in the learner's own words, with no system feedback, asking the learner to organise the content and connect it to prior knowledge. Store both responses with timestamps.
- p. 5 of 21 (PDF p. 5): “through structured guiding questions embedded in each scene”
- p. 5 of 21 (PDF p. 5): “of the virtual museum. The system provided real-time interac”
- p. 5 of 21 (PDF p. 5): “Notably, the structured guiding questions provided real-time feedback so that learners could secure an accurate initial grasp of the artefacts' factual information. Afterwards, the self-explanation task asked learners to digest, organise, and internalise these verified ideas.”
- p. 5 of 21 (PDF p. 5): “task asked learners to digest, organise, and internalise these”
- p. 5 of 21 (PDF p. 5): “their own words. By design, this task offered no instant sys”
- p. 6 of 21 (PDF p. 6): “tasks in textual form through online structured guiding”

**LU-R02** [learning-design; design description; relation: extends; concept note §6, P85]: Make self-explanation prompts written (typed) rather than covert or 'think silently' prompts, and anchor them to linking new information with prior knowledge. For our domain they should ask for causal 'why' links (for example, why a mordant precedes dyeing). The exact prompt wording is ours to write: the paper's prompts appear only in Figure 4, which is an image.
- p. 4 of 21 (PDF p. 4): “This finding revealed that in VR, it is insufficient to merely expect learners to spontaneously engage in deep cognitive processing. Therefore, this study used students' written self-explanations as the primary learning intervention in the virtual museum learning.”
- p. 4 of 21 (PDF p. 4): “ual students to perform silent, imagined summarisation (a form” *(secondary: reports another study)*
- p. 4 of 21 (PDF p. 4): “of covert self-explanation) did not result in significantly differ” *(secondary: reports another study)*
- p. 6 of 21 (PDF p. 6): “necting existing information with new concepts" was oper”
- p. 6 of 21 (PDF p. 6): “ationalised through artefact appreciation.”

**LU-R03** [study-design; finding from this study's own data; relation: supports; concept note §7, P88; §7, P91]: Keep the prompt regime (number, wording, timing and feedback of guiding questions and self-explanation prompts) identical across Pathway A (2D) and Pathway B (immersive). Adding a written self-explanation task by itself produced medium effects (d = 0.56-0.64) on every outcome, so a difference in prompts between pathways would confound the spatialisation comparison.
- p. 8 of 21 (PDF p. 8): “Both groups used the same learning content and received”
- p. 8 of 21 (PDF p. 8): “between the two conditions lay in the learning process: stu”
- p. 9 of 21 (PDF p. 9): “p=0.03<0.05), with a medium effect size (Cohen's d=0.61)”
- p. 10 of 21 (PDF p. 10): “with a medium effect size (Cohen's d=0.64) (Cohen 1988).”

**LU-R04** [limitation-risk; theoretical claim; relation: conflicts; concept note §2, P13]: If self-explanation checkpoints are added, measure their side effects on exploration and agency (exploration breadth, path entropy, and an agency item or scale), because the paper frames self-explanation as constraining exploration and never measured agency. Do not claim that the checkpoints preserve agency without our own data.
- p. 4 of 21 (PDF p. 4): “Rather, it operates as a cognitive regulation mechanism that constrains exploration, stabilises attention, and supports the transformation of multimodal sensory input into conceptual representations.”
- p. 4 of 21 (PDF p. 4): “reduces attentional diffusion caused by sensory richness and”
- p. 4 of 21 (PDF p. 4): “This process reduces attentional diffusion caused by sensory richness and helps learners align exploration with learning goals. In the VR scenario, learners were guided to engage in self-explanation based on systematic guiding questions to facilitate reflection and knowledge organisation, thereby deepening their understanding and construction of the learning content.”

**LU-R05** [logging-analytics; design description; relation: supports; concept note §10, P109-P138]: Log a closed set of coded behaviour events comparable to Lu et al.'s eight codes: start experience (SE), explore object (EO), repeat object (RO), answer correctly (AC), wrong answer (WA), read materials (RM), next scene (NS), finish experience (FE). Map them onto the concept-note events: room entered = NS, exhibit selected = EO, return to object = RO, information layer opened = RM, checkpoint answers = AC/WA.
- p. 9 of 21 (PDF p. 9): “vironment, the following eight behavioural codes were selected”
- p. 9 of 21 (PDF p. 9): “and retained: start experience (SE), explore object (EO), repeat”
- p. 9 of 21 (PDF p. 9): “object (RO), answer correctly (AC), wrong answer (WA), read”
- p. 9 of 21 (PDF p. 9): “materials (RM), next scene (NS), and finish experience (FE).”
- p. 8 of 21 (PDF p. 8): “The learning progress database recorded their exploration paths and interaction behaviours. During exploration, the structured guided questions were triggered.”

**LU-R06** [logging-analytics; design description; relation: supports; concept note §10, P139]: Support lag-sequential analysis of the event stream: export per-participant ordered event codes, compute transition adjusted residuals (z > 1.96 is significant) per condition, and draw transition diagrams. If any coding is manual, double-code it and report Cohen's kappa (Lu: 0.80).
- p. 10 of 21 (PDF p. 10): “learners were automatically recorded in the virtual museum”
- p. 10 of 21 (PDF p. 10): “ing table, with a Kappa value of 0.80.”
- p. 10 of 21 (PDF p. 10): “using the sequence analysis method to investigate whether the”
- p. 10 of 21 (PDF p. 10): “haviours; when the Z-value is greater than 1.96, the sequence”

**LU-R07** [logging-analytics; finding from this study's own data; relation: extends; concept note §10, P139]: Compute rereading (RM to RM) and read-to-move-to-read (RM to NS to RM) transitions as derived indicators of goal-oriented exploration. In Lu et al. these were the transitions that distinguished the self-explanation condition.
- p. 12 of 21 (PDF p. 12): “experimental group had a very high probability of repeatedly”
- p. 12 of 21 (PDF p. 12): “reading the materials after reading them once (Read Materials”
- p. 10 of 21 (PDF p. 10): “there were 10 learning behaviours in the experimental group”
- p. 10 of 21 (PDF p. 10): “(Table 6) and seven in the control group (Table 7) that reached a”

**LU-R08** [study-design; finding from this study's own data; relation: conflicts; concept note §8, P93-P94]: Plan sample size for realistic effects. Lu et al.'s between-group effects were medium (d = 0.56-0.64, n = 28 per group), and the authors call their sample small. With about 20 per group, a two-tailed independent t-test at alpha .05 has only about 45% power for d = 0.6; about 45 per group are needed for 80%. Justify N with an a-priori power analysis, or adopt the within-participant alternative (P95).
- p. 8 of 21 (PDF p. 8): “located to either the experimental condition (SE-VML; n=28) or”
- p. 8 of 21 (PDF p. 8): “Using a simple random assignment procedure (without stratification), students were allocated to either the experimental condition (SE-VML; n=28) or the control condition (C-VML; n=28). The student learning platform is a virtual museum learning module that allows students to experience virtual museum scenarios, perform self-explanation tasks, and complete collaborative concept mapping.”
- p. 17 of 21 (PDF p. 17): “this study adopted a post-test-only design with a small sample”

**LU-R09** [study-design; author recommendation; relation: supports; concept note §8, P94; §9, P98]: Include a pre-test (prior knowledge, and a baseline concept map for the primary outcome) and analyse gains or ANCOVA. Lu et al. relied on randomisation alone with a post-test-only design and list this as a limitation.
- p. 8 of 21 (PDF p. 8): “mise pre-existing differences between groups. Therefore,”
- p. 8 of 21 (PDF p. 8): “Therefore, there was no pre-test in the procedure. While randomisation does not guarantee perfect equivalence in small samples, it is widely regarded as an appropriate method for establishing baseline comparability in experimental research (Keppel and Wickens 2004).”
- p. 17 of 21 (PDF p. 17): “ples and to conduct pre-tests. Second, learners did not receive”

**LU-R10** [study-design; design description; relation: extends; concept note §8, P94]: Use documented random assignment (Lu used simple random assignment without stratification). Consider stratifying by prior-knowledge score, because with small samples randomisation 'does not guarantee perfect equivalence'.
- p. 8 of 21 (PDF p. 8): “mentary school in southern Taiwan. Using a simple random”
- p. 8 of 21 (PDF p. 8): “Using a simple random assignment procedure (without stratification), students were allocated to either the experimental condition (SE-VML; n=28) or the control condition (C-VML; n=28).”
- p. 8 of 21 (PDF p. 8): “This study adopted a randomised controlled (true experimen”

**LU-R11** [study-design; design description; relation: extends; concept note §8, P94]: Budget session time explicitly: Lu used a 200-min learning activity (including operation training for the equipment and the tools), 60 min for the test and questionnaires, and a 20-min interview. Our protocol must state the time for onboarding, exploration, tests and the concept-map task, equal across pathways.
- p. 8 of 21 (PDF p. 8): “tal group and the control group each took part in a 200-min”
- p. 8 of 21 (PDF p. 8): “the operation of the virtual museum equipment, the function”
- p. 9 of 21 (PDF p. 9): “were then given 60min to complete the learning achievement”
- p. 9 of 21 (PDF p. 9): “questionnaire. Finally, a 20-min interview was conducted to”

**LU-R12** [measurement-instrument; design description; relation: supports; concept note §9, P101]: For the knowledge-acquisition test, have domain experts write it and report internal-consistency reliability (Lu: 10 multiple-choice items, 100 points, written by two teachers with more than 5 years of experience, KR-20 = 0.85). Our test must also include conceptual and 'why' items, not only background facts.
- p. 9 of 21 (PDF p. 9): “The learning achievement test was designed by two elementary”
- p. 9 of 21 (PDF p. 9): “The test focused on assessing learners' background knowledge”
- p. 9 of 21 (PDF p. 9): “multiple-choice questions with a total score of 100 points. The”
- p. 9 of 21 (PDF p. 9): “The KR-20 reliability coefficient was 0.85. The critical thinking tendency questionnaire was administered using a scale by Lin et al.”

**LU-R13** [measurement-instrument; design description; relation: independent]: If metacognition is added as an exploratory measure, use the instrument Lu used: the metacognition questionnaire adapted from Lai & Hwang (2014), 5 items, 5-point Likert, alpha = 0.82 (sample item 'I regularly check to see whether or not I have achieved my goals.'). Report alpha in our sample.
- p. 9 of 21 (PDF p. 9): “The metacognition questionnaire, adapted from Lai and”
- p. 9 of 21 (PDF p. 9): “Hwang's (2014) scale, consisted of five items, such as, "I reg”
- p. 9 of 21 (PDF p. 9): “ularly check to see whether or not I have achieved my goals."”
- p. 9 of 21 (PDF p. 9): “The metacognition questionnaire, adapted from Lai and Hwang's (2014) scale, consisted of five items, such as, "I regularly check to see whether or not I have achieved my goals." Using a 5-point Likert scale, the Cronbach's alpha of the questionnaire was 0.82. For the analysis of learning behaviour patterns, the learning behaviour coding scale proposed by Hwang et al.”

**LU-R14** [measurement-instrument; design description; relation: independent]: Record the other two scales Lu used as candidate instruments, not as concept-note outcomes. Critical thinking tendency: Lin et al. (2019), adapted from Chai et al. (2015), 6 items, 5-point, alpha = 0.86. Collaboration tendency: Lai & Hwang (2014), 6 items, 5-point, alpha = 0.91. The collaboration scale is irrelevant to our individual design.
- p. 9 of 21 (PDF p. 9): “tered using a scale by Lin et al. (2019), adapted from the Chai”
- p. 9 of 21 (PDF p. 9): “et al. (2015) scale, and included six items, such as, "During the”
- p. 9 of 21 (PDF p. 9): “the questionnaire was 0.86.”
- p. 9 of 21 (PDF p. 9): “The collaboration tendency questionnaire was based on the Lai”
- p. 9 of 21 (PDF p. 9): “naire was 0.91, using a 5-point Likert scale.”

**LU-R15** [study-design; finding from this study's own data; relation: supports; concept note §9, P97; §9, P100]: Pre-register one primary outcome (the relational concept-map score) and correct the secondary outcomes for multiple comparisons. Lu et al. ran four uncorrected independent t-tests (after Shapiro-Wilk normality checks) with p between .02 and .03. Our observation: none of these would survive a Bonferroni-corrected alpha of .0125.
- p. 9 of 21 (PDF p. 9): “significantly better than that of the control group (t=2.30,”
- p. 10 of 21 (PDF p. 10): “significantly higher than that of the control group (t=2.22,”
- p. 10 of 21 (PDF p. 10): “significantly higher than that of the control group (t=2.11,”
- p. 10 of 21 (PDF p. 10): “higher than that of the control group (t=2.40, p=0.02<0.05),”
- p. 9 of 21 (PDF p. 9): “the Shapiro-Wilk method, and the results showed that these”

**LU-R16** [measurement-instrument; finding from this study's own data; relation: independent]: Report results per outcome as group means, SDs, test statistic, p and Cohen's d, following Lu's tables. Lu reported: achievement 82.86 (11.17) vs 75.36 (13.19), d = 0.61; critical thinking tendency 4.37 (0.54) vs 4.03 (0.62), d = 0.58; collaboration tendency 4.49 (0.69) vs 4.12 (0.63), d = 0.56; metacognition 4.58 (0.59) vs 4.18 (0.66), d = 0.64.
- p. 9 of 21 (PDF p. 9): “the experimental group were 82.86 and 11.17, respectively,”
- p. 9 of 21 (PDF p. 9): “while those of the control group were 75.36 and 13.19, respec”
- p. 10 of 21 (PDF p. 10): “p=0.03<0.05), with a medium effect size (Cohen's d=0.58)”
- p. 10 of 21 (PDF p. 10): “p=0.03<0.05), with a medium effect size (Cohen's d=0.56)”
- p. 10 of 21 (PDF p. 10): “experimental group were 4.58 and 0.59, respectively, while”

**LU-R17** [measurement-instrument; design description; relation: independent]: If a qualitative component is included, run semi-structured interviews (Lu: focus groups with 10 per condition, outline adapted from Hwang et al. 2009, open coding in ATLAS.ti 22, two coders, kappa = 0.74), with equal subsamples per condition.
- p. 9 of 21 (PDF p. 9): “was adapted from Hwang et al. (2009), and included questions”
- p. 9 of 21 (PDF p. 9): “group interviews were conducted with 10 students from the”
- p. 9 of 21 (PDF p. 9): “experimental group and 10 from the control group. The pro”
- p. 13 of 21 (PDF p. 13): “was calculated at 0.74. A total of 214 codes were identified”

**LU-R18** [technical-implementation; design description; relation: supports; concept note §7, P91]: Serve both pathways from one central content repository, so that each condition receives identical content. Keep a per-participant progress store (events, answers, written explanations) separate from the participant-identity store. Lu's system had a learning material database, a learning progress database and a student profile database.
- p. 8 of 21 (PDF p. 8): “The database has three components. The learning material da”
- p. 8 of 21 (PDF p. 8): “The learning progress database records student interactions and progress. This enables the teacher to monitor learning status and provides data for subsequent feedback and analytics.”
- p. 7 of 21 (PDF p. 7): “Figure 6 shows the system architecture, which consists of a”

**LU-R19** [cognitive-load; author recommendation; relation: supports; concept note §9, P103]: Measure cognitive load. Lu et al. did not, although they argue self-explanation reduces load in sensory-rich VR. Their claimed load mechanism is therefore untested, and our study must not cite them as evidence of load reduction.
- p. 18 of 21 (PDF p. 18): “nition, other important variables, such as cognitive load and”
- p. 18 of 21 (PDF p. 18): “solving), were not directly measured. Future research should”
- p. 4 of 21 (PDF p. 4): “learners resist environmental interference and focus their cog” *(secondary: reports another study)*

**LU-R20** [limitation-risk; author recommendation; relation: extends; concept note §2, P13]: Decide and document the feedback timing for any open self-explanation. Lu gave none, which the authors say may have delayed the correction of misconceptions. Options: delayed model answers, or adaptive feedback after submission. Hold the choice constant across pathways.
- p. 17 of 21 (PDF p. 17): “Second, learners did not receive immediate feedback during the written self-explanation task, unlike the real-time feedback provided for structured guiding questions.”
- p. 18 of 21 (PDF p. 18): “have delayed the correction of misconceptions. Future studies”
- p. 18 of 21 (PDF p. 18): “could integrate AI-based or adaptive feedback mechanisms to”

**LU-R21** [limitation-risk; author recommendation; relation: extends; concept note §8, P93]: Do not transfer Lu et al.'s effect sizes directly to our population and setting. Their sample was sixth-grade pupils in one Taiwanese school, in a collaborative classroom sequence, with the virtual museum device unspecified. Ours is university students exploring individually. Report the differences in population and setting when citing them.
- p. 8 of 21 (PDF p. 8): “Participants were drawn from sixth-grade students at an ele”
- p. 18 of 21 (PDF p. 18): “tary school students, which may limit the generalisability of the”
- p. 6 of 21 (PDF p. 6): “Collaboration stage: Group members constructed a concept”

**LU-R22** [logging-analytics; author recommendation; relation: extends; concept note §10, P139]: Plan a network-based analysis (for example, epistemic network analysis) that links logged navigation and concept co-occurrence to the post-learning concept map. Lu et al. recommend ENA because their analyses missed fine-grained interaction dynamics.
- p. 18 of 21 (PDF p. 18): “present analyses did not capture fine-grained interaction dy”
- p. 18 of 21 (PDF p. 18): “epistemic network analysis to examine interaction patterns and”

**LU-R23** [measurement-instrument; design description; relation: extends; concept note §9, P98-P99]: Use the concept map only as an individual outcome measure. In Lu et al. concept mapping was a collaborative learning activity, not a scored outcome, so no scoring rubric for relational understanding can be taken from this paper.
- p. 6 of 21 (PDF p. 6): “Collaboration stage: Group members constructed a concept map of knowledge through synchronous collaboration, shared the results of their group discussions (Figure 5), presented their work to the class, and received feedback and suggestions from both peers and the teacher.”
- p. 8 of 21 (PDF p. 8): “rative concept mapping. It supports a complete learning cycle”

## 6. Verification record

- Concept-note quotations: 56 checked, 56 verbatim, section labels 0 mismatches.
- Reference-paper quotations: 788 checked, 788 verbatim on the stated PDF page.
- Reproduce with the extraction and verification scripts: verify_quotes.py checks every quote against per-page text, layout and reading order (see `docs/research/citation-policy.md`).
