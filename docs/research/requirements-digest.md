# Research requirements digest: Immersive Episteme (Paper 1)

Status: engineering digest, 2026-10-14. This digest restates the research documents. It does not replace them.
Where a citation and this digest disagree, the source wins.

## Sources and order of authority

| Short name | Path | Citation form |
|---|---|---|
| **Concept** | `D:/Work/IIT-KGP/Concept/Immersive_Episteme_Paper1_Concept_Note.docx` | by section (§n). The docx has no line numbers |
| **MP** | `D:/Work/IIT-KGP/Prompt/Master_Prompt.md` | MP:line |
| **TM** | `D:/Work/IIT-KGP/Technical Requirement/Take_Merged.md` | TM:line |
| Drafts | `.../Technical Requirement/Draft/Take.md`, `.../Draft/Alternate_Take.md` | superseded by TM |
| Papers | `D:/Work/IIT-KGP/Paper To Read/` (10 PDFs) | see §10 |

The documents rank themselves:
- MP:36: "The concept note is the controlling source for the intellectual purpose of both applications."
- MP:54: "Treat the main technical specification as the implementation baseline."

**The user's direction overrides the documents on one point:** "we are not working on virtual walkthrough, we are just using its design components." See conflict C1.

Spot-checked verbatim on 2026-10-14: MP:36, 54, 107, 155, 169, 466, 593, 884; TM:54–55, 176, 680, 687. The other line references come from the extraction pass and were not re-checked.
A review pass on the same date re-checked these as well: MP:40, 58–62, 155–169, 218–228, 272, 278–286, 317, 325–341, 347–356, 387, 430, 448, 458–470, 509–523, 540–568, 593, 609, 627, 640, 657, 669–745, 749–757, 769–778, 810–828, 836, 853–858, 866–884, 937–944, 988, 997, 1107, 1127; TM:12, 54–57, 66–84, 102–110, 126, 134, 140–142, 153–178, 198, 206–214, 258, 264–292, 305–370, 390–411, 446, 483–519, 561–567, 595–597, 626, 680–700, 794, 863–865, 905, 979–993. It also re-checked the Concept quotes against the docx text.

---

## 1. Research question, hypotheses, contribution

- **Core question** (Concept §1): "Does transforming structured craft knowledge into a meaningful spatial environment change how users understand and reconstruct relationships within that knowledge?"
- **Working model** (Concept §2; MP:40): "Epistemic classification → relational modelling → spatial transformation → guided situated exploration → epistemic reconfiguration".
- **Research questions** (Concept §5):
  - **RQ1.** "Does an epistemically spatialised craft-learning environment produce stronger relational understanding than an informationally equivalent conventional interface?"
  - **RQ2.** "How does epistemic spatialisation affect knowledge acquisition, transfer and cognitive load compared with conventional information navigation?"
  - **RQ3.** "How do users' navigation and interaction pathways within the immersive environment relate to the knowledge structures they construct after learning?"
- **Primary hypothesis** (Concept §5): "users of the epistemically spatialised environment will show greater improvement in relational knowledge structure than users receiving the same knowledge through a conventional structured interface."
- **Contribution** (Concept §4): "The proposed contribution is not the 3D museum technology itself. It lies in the knowledge-to-space transformation method and in measuring its cognitive consequences."
- **Falsifiability**:
  - MP:169: "The central experimental claim must remain testable even if the results ultimately show no benefit."
  - Concept §12: "Mixed results would remain useful…"
- **Theory** (Concept §2):
  - embodied and situated cognition;
  - spatial cognition and memory (memory palaces);
  - guided discovery: "completely unguided exploration is not necessarily optimal";
  - CLT/CAMIL: "interface complexity, navigation and excessive choice may introduce extraneous cognitive load".

**Engineering implications.**
- The spatial compiler, meaning the mapping from knowledge to space, is the research artefact. It must be inspectable, deterministic and versioned.
- Null results must be reportable. Nothing in the build may bias toward the immersive condition.

## 2. Traditions

- **Six traditions exist in the project's knowledge base, but none of the documents names them.**
  - Concept §6: "The project already has artisan knowledge and process knowledge for six block-printing traditions… the experimental prototype should probably use three carefully selected traditions with comparable information depth."
  - TM:54 (KR-01): "Represent the six block-printing traditions already covered by the available artisan and process knowledge."
  - TM:55 (KR-02): "Support selecting a subset of traditions for the experiment; three traditions are the provisional plan."
  - TM:680 lists this as a **Critical** open question: "What are the actual six traditions, and which three will be used?"
  - MP:272: "Do not invent the names of missing traditions or assume each tradition has already been fully documented."
- **Not authoritative:** the reference repo mentions *dabu*, *ajrakh* and *bagru* only as writing examples (`virtual-walkthrough/docs/CONTENT_CAPTURE.md:107,113`).

**Engineering rules.**
1. Tradition is a data entity. No tradition name appears in code.
2. A study configuration selects a subset. Three is the default, not a constant.
3. Every tradition carries an "information depth" profile (count of nodes per category) so researchers can check comparability.

## 3. Knowledge categories

Every selected tradition uses the same template (Concept §6; MP:278–286; TM:66–74):

| # | Category | Content |
|---|---|---|
| 1 | Tradition and context | identity, geography, cultural context |
| 2 | Materials and tools | materials, tools, their roles |
| 3 | Process sequence | ordered stages and dependencies |
| 4 | Artisan decisions | practitioner decisions, tacit or experience-based knowledge |
| 5 | Design and outcomes | design choices, material or visual outcomes |
| 6 | Scientific/technological knowledge | mechanisms, material treatments, process conditions |
| 7 | Cross-tradition comparison | connections and differences |

- **TM:57 (KR-04)** adds a finer list: "artisan knowledge, process knowledge, tools/materials, tacit decisions, design practice, regional ecology, history and scientific mechanisms". These must be stored "without collapsing them into one undifferentiated content type".
- **Candidate entities** (MP:296–315; TM:390–409):
  - **Knowledge:** Tradition, KnowledgeConcept, KnowledgeRelationship, Material, Tool, ProcessStep, ArtisanKnowledge, ScientificExplanation (inputs, conditions, outcomes, source), DesignOutcome, EnvironmentalCondition.
  - **Spatial:** SpatialElement, SpatialMapping.
  - **Study:** LearningTask, AssessmentItem, StudyParticipant, StudySession, InteractionEvent, ReconstructedKnowledgeMap.
  - **Relaxations:** TM:411 says "a material may simply be a `KnowledgeConcept` with category `material`". MP:317 says these are "logical entities, not a requirement to create a database table for every noun."
- **Provenance and review** (MP:347–356):
  - states: Draft / Under review / Verified / Needs additional evidence;
  - keep "practitioner testimony, scientific interpretation, documented historical claims, and unresolved questions" distinct;
  - TM:446: "a plausible-sounding scientific explanation must not silently become an accepted fact merely because it has been entered in the content database."

**Engineering rules.**
- One `concept` table with a `category` enum, plus typed detail payloads (Zod discriminated union).
- Every node and edge has: `epistemicType` (testimony / scientific interpretation / historical claim / open question), `reviewState`, `sources[]`, `reviewer`, `reviewedAt`.
- The study build includes only `Verified` content, unless a researcher explicitly allows otherwise and the export records it.

## 4. Relationship types

**Candidate list** (MP:325–333; "Validate and refine these types using the actual content corpus"):
1. belongs to / associated with a tradition
2. uses a material or tool
3. precedes / depends on a process step
4. produces an outcome
5. is affected by an environmental condition
6. explains an observed result
7. represents an artisan decision
8. contrasts with / resembles another tradition
9. connects an artisan explanation to a process or scientific mechanism

**Constraints:**
- MP:339–341: store "direction, explanation, supporting source, and relevant conditions… A process sequence must distinguish earlier and later steps. A causal explanation must not be represented as a generic association."
- TM:102–108, REL-01..07:
  - shared classification and cross-category links;
  - order preserved (REL-03);
  - explanatory links between materials, treatments, conditions and outcomes (REL-04);
  - artisan decision → step, property or outcome (REL-05);
  - cross-tradition links (REL-06);
  - REL-07: "spatial design must be derived from the relationship model rather than exclusively from manually arranged exhibit positions."
- TM:110: no ontology is supplied. "A graph-based representation is a possible implementation, not an explicit technology requirement." So we use relational Postgres tables for nodes and edges. No graph DB (MP:256).

**Engineering rule.** The relationship type is a researcher-editable vocabulary table. Each type carries `directed`, `causal`, `ordered`, `crossTradition` flags. Edges carry `direction`, `explanation`, `conditions`, `sources`.

## 5. Knowledge-to-space mapping rules

**Mechanisms** (Concept §7; TM:153–157; MP:458–462):
- Adjacency, Proximity, Sequence, Pathways, Progressive disclosure.
- MP:464 also allows "branching, crossings, comparative zones, thresholds, or visual links".

**Candidate rules** (TM:165–174; explicitly "implementation proposals, not mappings already validated by the source"):

| Relationship | Spatial implementation | Purpose |
|---|---|---|
| Same tradition/domain | Shared room, zone, region | Common context |
| Material ↔ tool | Adjacent or directly connected objects | Easy to encounter |
| Ordered stages | Sequence of stations / traversable steps | Process order |
| Input + condition → outcome | Linked locations with an explicit explanatory transition | Causal reasoning, not association |
| Artisan decision → design choice | Decision point connected to its consequences | Practitioner reasoning |
| Artisan + process + science | Pathway crossing categories | Connect forms of explanation |
| Cross-tradition similarity/difference | Cross-room links, intersecting paths, comparative locations | Comparison |
| Deeper explanation | Revealed on selection/interaction | Avoid overload |

**Hard constraints:**
- **Causality is never proximity alone.**
  - TM:176: "causal dependency should not automatically be represented by proximity alone".
  - MP:466: "Do not assume proximity communicates causality by itself."
- **Justify each mapping.** TM:178: document *why* each relationship gets its representation.
- **Traceability chain** (MP:159–167; TM:483–489). Every link must be inspectable in data:
  1. domain relationship
  2. spatial encoding rule
  3. spatial elements
  4. learner interaction
  5. assessment measure
- **Data-driven mappings** (MP:470): researchers change mappings without touching rendering code. This is why we build a deterministic compiler driven by a rule table.
- **Not a 3D graph viewer** (MP:552 ff.): "Do not allow force-directed graph layouts, generic node spheres, connecting lines, graph-centrality displays… to replace the required knowledge-to-space mapping."
- **Legibility** (MP:548–550): "architectural landmarks, visible pathways, restrained wayfinding cues"; "Learners should not need to memorise an arbitrary layout."
- **Design choices need written justification** (TM:198). The source does not fix room count, coordinates, locomotion, controls, animation or visual style.
- **Experimental simplification** (Concept §7; TM:140–142; MP:542): remove social/live functions and unnecessary controls; minimise the map (Concept §7 says the map "may be minimised"; MP:542 and TM:141 UI-XR-08 state it as a requirement: "The map should not become the main interface through which users learn the knowledge structure"); instructions disappear after onboarding; disclose information progressively.
- **Required interactions** (TM:206–214; MP:531–538):
  - enter and leave spaces;
  - select exhibits;
  - open deeper layers (artisan / process / science);
  - move between related elements;
  - revisit;
  - compare traditions;
  - use guidance cues;
  - complete the task.

**Engineering rules.**
- The compiler output (manifest) stores, for each spatial element, the `mappingRuleId` and the `relationshipIds` it encodes.
- The compiler records its version and seed in every session.
- The research console renders the traceability chain.

## 6. Experimental design

- **Conditions** (Concept §7):
  - Pathway A is a conventional structured 2D interface ("menus, cards, headings and hyperlinks").
  - Pathway B is the Immersive Episteme.
  - "The intended comparison is therefore not a 'fancy 3D museum' versus a plain webpage, but two informationally equivalent knowledge pathways that differ primarily in spatial organisation."
- **Parity:**
  - MP:155: "The core difference must be spatial organisation, not unequal content, missing explanations, superior visual polish, different learning objectives, additional information, or features available to only one group."
  - TM:126: the 2D condition "is not a deliberately impoverished control".
  - MP:387: "Do not intentionally make it unattractive."
  - **Parity checklist** (MP:769–778): same dataset, identical prompts, all categories present in both conditions, comparable task functionality, assignment recorded, comparable exposure and navigation logging, "the immersive condition implements spatial organisation rather than simply adding visual effects", and "the conventional condition remains a fair and functional comparator".
- **Sample** (Concept §8): "approximately 40 participants (my Viscom students…)".
  - Between-groups gives about 20 per condition.
  - The alternative is a counterbalanced within-participant design with matched traditions, which has "more statistical sensitivity… but… requires careful matching of content difficulty… To be decided later."
  - Pilot: about 5–6 users (Concept §11, week 4).
- **Session sequence** (Concept §8):
  1. "a short prior-knowledge test"
  2. "the assigned learning/exploration task"
  3. "an immediate post-test"
  4. "a relational reconstruction task"
  5. "a short UX/cognitive-load questionnaire"
- **Engineering rules.**
  - Study protocols are data: an ordered list of steps per arm.
  - A participant may have more than one session, condition or tradition set. This keeps the within-participant design possible.
  - Assignment uses a seeded, recorded, auditable randomisation (block or stratified; to be decided).

## 7. Measures

- **Primary outcome** (Concept §9): "relational understanding / epistemic reconfiguration".
  - Participants organise or connect a fixed concept set: "material, fibre, mordant, dye, water, block, process sequence, environmental condition, reaction and colour outcome". TM:258 notes the set is illustrative.
  - Concept §9 says this happens "Before and after learning". See also AS-02 (TM:265).
  - **Scores** (AS-01..07, TM:264–270):
    - valid relations;
    - incorrect relations;
    - causal-chain depth;
    - structural similarity to an expert reference map;
    - increase in cross-category relationships.
  - **Instrument:** MP:609 says a "2D node-and-link concept-map editor is a practical candidate". MP:627: "Use typed or directed links where justified."
  - **Raw data:** TM:274 says keep the raw participant structure.
- **Secondary outcomes** (Concept §9; TM:282–287):
  - knowledge acquisition (pre/post, factual and conceptual);
  - transfer (a new "why?" problem not seen in the interface);
  - cognitive load (a short validated measure "separating content difficulty from interface/navigation burden");
  - task accuracy and time;
  - UX (SUS, UMUX-Lite or UEQ-S);
  - presence/engagement, as a "brief supplementary measure rather than the central outcome".
- **Instrument integrity:**
  - MP:593: "Do not invent a supposedly validated instrument or fabricate validation statistics."
  - MP:640: do not include every appendix instrument.
- **RQ → data mapping** (TM:499–501):
  - RQ1 → condition + pre/post maps;
  - RQ2 → pre/post, transfer, cognitive load, performance;
  - RQ3 → ordered events, concepts encountered, reconstructed maps.
- **Telemetry**: 14 events, the same in both conditions "wherever possible" (Concept §10; TM:305–318; MP:669–682):
  - EVT-01 room/page entered;
  - EVT-02 entry/exit timestamps;
  - EVT-03 exhibit/object selected;
  - EVT-04 information layer opened;
  - EVT-05 artisan/process/science layer selected;
  - EVT-06 query asked;
  - EVT-07 interaction sequence;
  - EVT-08 return to earlier object/room;
  - EVT-09 cross-tradition movement;
  - EVT-10 guidance cue used;
  - EVT-11 abandoned/incorrect pathway;
  - EVT-12 task completion time;
  - EVT-13 unique concepts encountered;
  - EVT-14 repeated concepts/links.
- **Event contract**:
  - MP:690–700 and TM:327–341 list these fields: `event_id, participant_id (pseudonymous), session_id, condition, event_type, timestamp, concept_id, location_id, interaction_target_id, metadata{knowledge_category, tradition_id}`.
  - Raw events map to shared analytical concepts across conditions, e.g. `knowledge_domain_accessed` (MP:706; TM:356).
- **Derived metrics** (Concept §10; MP:712–720; TM:511–519):
  - path length, breadth, depth, revisit rate;
  - cross-domain transitions;
  - science-layer engagement;
  - path entropy (TM:517: "Requires a formally specified calculation");
  - sequence patterns;
  - navigation-to-map correspondence (Concept §10: "particularly interesting").
  - **Rules** (MP:722–726): keep raw and derived data separate, document every calculation, do not treat dwell or visit counts as learning.
- **Integrity** (TM:350–358; MP:755; MP:937–944):
  - preserve temporal ordering;
  - detect missing, duplicate and out-of-order events;
  - flag incomplete sessions and logging failures;
  - metrics must be recomputable from exported raw data.
- **Export** (MP:732–745): participants and sessions, assignments, responses and scores, concept maps, raw events, derived metrics. CSV and/or JSON, joinable on participant, session, condition, concept and event IDs.
- **Privacy** (MP:749–757; TM:561–567): pseudonymous IDs, minimal PII, protected raw records, input validation, no client-side secrets. Consent and retention are researcher decisions.

**Engineering rules.**
- Events carry `seq` (per session), client monotonic time and server receipt time, `schemaVersion`, `compilerVersion` and `datasetVersion`.
- Ingestion is idempotent per batch.
- Unknown event types are quarantined, never dropped.
- Covariates are logged: quality tier, GPU class, input device, a11y settings.

## 8. Concrete content available

**No document contains process steps, material facts, recipes or validated science.** What exists:
- **The 10 illustrative concepts** above (Concept §9).
- **"Why" templates** for the science layer (Concept §6; TM:78–82): "why a pretreatment is necessary, why a particular mordant or material is used, why X and Y produce Z, why process order matters, and why environmental or water conditions change outcomes".
  - TM:84: the placeholders are "not a validated database schema or established scientific finding".
  - Concept §6: "(Madhur may contribute here)".
- **Content rules:**
  - MP:836: "Do not invent practitioner quotations, heritage histories, scientific reactions, material properties…"
  - MP:853–858: placeholders are labelled and kept separate. "Do not use generated demo content as evidence."
- **The reference repo** (`virtual-walkthrough`) adds nothing. All its craft content is an explicit placeholder (see `docs/architecture/design-reuse-catalogue.md` §6.3).

**Engineering rule.** Seed data for development is flagged `demo: true` and `reviewState: Draft`. Study builds refuse to include demo nodes.

## 9. Design and visual constraints

- **Knowledge over spectacle:**
  - MP:866: "the primary design objective is meaningful knowledge organisation rather than visual spectacle."
  - MP:884: "Do not allow decorative complexity, excessive motion, unnecessary objects, or elaborate navigation to compete with the knowledge being learned."
- **Visual quality:**
  - MP:448: "visually coherent, professional, and appropriate to the craft heritage represented."
  - MP:876: 3D needs "coherent spatial grammar, legible exhibits, purposeful interaction, and manageable cognitive load"; 2D needs "coherent information hierarchy, readable text".
  - MP:540: "Do not introduce unnecessary movement systems, complicated controls, or elaborate interface chrome."
- **Performance** (MP:509–523):
  - optimised GLB, compressed textures, baked lighting, instancing, LOD;
  - lazy loading, on-demand rendering, adaptive quality;
  - no unnecessary shadows or post-processing;
  - "Do not claim support for a specific low-end device without testing it."
- **Stack** (MP:179–185, 1127):
  - Next.js App Router, TypeScript, Tailwind, Three.js + R3F + Drei;
  - 3D is client-only and dynamically loaded (MP:218–228);
  - WebXR is optional and detected (MP:997);
  - "Do not build a separate Vite-based React application";
  - no microservices, Redis, Kafka or graph DB without justification (MP:256).
- **Guidance cue** (Alternate A8; TM:863–865): a diegetic yellow 3D arrow, with yellow reserved in the palette (Wen et al. 2024, N=80).
  - It is a testable option, "not a universal requirement" (MP:568).
  - Any cue must not create an unequal advantage between conditions (MP:566).
- **Not in the core build without "clear, documented justification"** (MP:810; list at MP:812–822):
  - multiplayer/social, avatars, complex AI docent, voice ontology editing, LLM SPARQL;
  - memory-palace personalisation, multiple control conditions, full museum management;
  - every psychometric scale, gaze tracking, distributed backend.
- **Decision register required** (MP:58–62, 828): each supplemental feature is marked Adopt, Defer or Reject, with a rationale.

## 10. Literature on file (`D:/Work/IIT-KGP/Paper To Read/`)

| File | Work |
|---|---|
| `1-s2.0-S2212827124007340-main.pdf` | Quantin, Plessis, Laroche (2024), AIDEN, VR RDF graph visualisation, Procedia CIRP 128 |
| `Computer Assisted Learning - 2026 - Lu - ….pdf` | Lu, Hwang, Tu (2026), self-explanation-guided virtual museum learning, JCAL 42:e70296 |
| `Exploring-the-Next-Phase-…pdf` | Pei-Tzu Hung & Bokyung Lee (2025), situated docents for XR exhibitions, IJHCI 41:17 |
| `frvir-05-1396280.pdf` | Song & Evans (2024), museum of digital things, Front. VR 5 |
| `krokos2018.pdf` | Krokos, Plaisant, Varshney, virtual memory palaces, Virtual Reality (DOI 10.1007/s10055-018-0346-3) |
| `makransky2021.pdf` | Makransky & Petersen (2021), CAMIL, Educ. Psych. Review |
| `petersen2022.pdf` | Petersen, Petkakis, Makransky (2022), immersion and interactivity in VR learning, C&E 179 |
| `s10055-024-01012-0.pdf` | Wen, Lu, Mohamad Ali (2024), attentional guidance in VR labs (yellow arrow, N=80), Virtual Reality 28:110 |
| `yang2021.pdf` | Yang et al. (2021), VR memory palace variant, IEEE TVCG |
| `zhou2022.pdf` | Zhou, Chen, Wang (2022), meta-analysis of VR/AR museum learning (ES 0.45 achievement, 0.59 perceptions), Educ. Res. Review 36 |

**Cited in Concept §3 but not in the folder:**
- Han et al. 2023;
- Poupard et al. 2025;
- De Bruyne et al. 2025/26;
- Wang et al. 2026 (flagged "very imp");
- Jiang & Gou 2026.

## 11. Conflicts between the documents (and with the user's direction)

| # | Conflict | Resolution / status |
|---|---|---|
| C1 | The documents require adapting the existing Hand Block Museum: Concept §7 "can be adapted rather than rebuilt"; MP:107 "Adapt the existing Hand Block Museum wherever possible"; MP:430, MP:988 (acceptance C), MP:1107; TM:134 (UI-XR-01), TM:626. The user says: "we are not working on virtual walkthrough, we are just using its design components". | **User wins.** New repo; design components only. Record a decision-register entry that UI-XR-01 and acceptance C.2 are deliberately not followed. **Researchers should be told** (Q-R1) |
| C2 | TM:12, TM:595 say the concept note does not mandate a technology. Alternate §2 proposes Unity + V-Ray + GraphDB. MP:179 mandates Next.js + R3F. | MP is the operative document. Unity, GraphDB, SPARQL and CIDOC-CRM are Rejected/Deferred |
| C3 | Our task scope includes a CMS. MP:657: "Do not spend time building a production-grade museum CMS"; TM:597 agrees. | Minimal CMS: graph editing, provenance, review state, dataset versioning, mapping rules |
| C4 | Our scope allows "premium/cinematic" public pages. No document authorises this. MP:155 forbids "superior visual polish" in one condition; MP:884 forbids decorative motion. | Cinematic treatment only outside both learning conditions and the study flow. Participants should not see public pages mid-study (Q-R9) |
| C5 | EVT-06 "Query asked" is required, but no query feature is defined. MP:814 keeps "a complex AI docent" out of the core build without documented justification (MP:810); voice is deferred (TM:794). | Needs a decision (Q-R6) |
| C6 | Between-groups vs counterbalanced within-participant design is "To be decided later" (Concept §8; TM:687). | Data model supports both; decision needed (Q-R3) |
| C7 | The Concept §8 sequence lists only a prior-knowledge test before learning, but §9 and AS-02 (TM:265) require a concept map before *and* after. | Needs a decision (Q-R4) |
| C8 | Guidance strategy: Concept §3 (De Bruyne row) says "we may have to take a call" on exploration-first vs guided. The yellow arrow is optional; the guidance policy must be identical across conditions (TM:905; MP:566). | Needs a decision (Q-R5) |
| C9 | Citation errors in Concept: "Hung, C.-Y., & Lee, C.-H. (2025)" should be Pei-Tzu Hung & Bokyung Lee (IJHCI 41:17, 10767–10786). (The Krokos citation is not an error: the note cites Virtual Reality 23, 2019; the PDF is the online-first version, accepted 3 May 2018, same DOI.) | Researchers to correct the note |
| C10 | Path length is in Concept §10 and TM:516 but missing from the TM §5.3 list (TM:364–370). | Implement it anyway |
| C11 | `Draft/Alternate_Take.md` states headsets, Unity, GraphDB, Barnes–Hut layout, voice-to-SPARQL, the 5×40 docent schema, lag-sequential coding and α values as mandatory. TM moves them to Appendix A (TM:696–993) as "candidates to evaluate", with an adoption gate (TM:979–992). TM:290–292 and TM:342 contain stray code fences. | Follow TM. Appendix items need a decision-register entry before adoption |
| C12 | Self-explanation checkpoints (Lu 2026; Alternate §9) change the treatment if adopted asymmetrically. | If adopted, timing and grading must be identical in both conditions |
| C13 | Performance guidance (MP:509–523) names baked lighting, LOD and compressed textures. The reference implementation uses runtime procedural textures, dynamic lighting and no LOD. | Engineering decision. Measure frame time on the study's actual devices, then choose |

## 12. Open questions for the researchers

Priority: **Critical** blocks the data model or content; **High** blocks the study flow; **Medium** can wait until the pilot.

| ID | Priority | Question | Why engineering needs it |
|---|---|---|---|
| Q-R1 | Critical | Do the researchers accept building fresh and reusing only design components, against MP:107 / UI-XR-01 / acceptance C? | Decision register; acceptance criteria |
| Q-R2 | Critical | What are the six traditions, which three are in the study, and who supplies and verifies the content (incl. "Madhur" for science)? | Seed data, information-depth matching, expert reference map |
| Q-R3 | Critical | Between-groups (about 20/20) or counterbalanced within-participant? Which randomisation (simple, block, stratified)? | Assignment engine, session model |
| Q-R4 | High | Does the pre-test include a concept map? Is the concept set fixed (the 10 listed) or per-tradition? Are links typed and directed? Who builds the expert reference map, and which similarity metric is used? | Concept-map editor and scoring |
| Q-R5 | High | Guidance policy: exploration-first, guided path, or hybrid? Is the yellow-arrow cue in or out? What is its 2D equivalent? | Compiler path output; parity |
| Q-R6 | High | EVT-06 "Query asked": which query affordance exists in both conditions (search box? fixed question list?), or is the event dropped? | Telemetry and UI |
| Q-R7 | High | Which instruments: cognitive-load measure (name/version), UX (SUS vs UMUX-Lite vs UEQ-S), presence (include or not), transfer item(s)? Who authors the pre/post items? | Assessment engine; no invented instruments (MP:593) |
| Q-R8 | Critical (TM:683) | Devices and setting: lab desktops only, or own devices? Touch allowed? Is WebXR in scope at all? Fixed screen size? | Locomotion, quality tier, covariates, joystick |
| Q-R9 | High | Exposure: fixed time limit or self-paced until done? Is the minimap always on, off, or togglable? | Task timing; navigation-load control |
| Q-R10 | High | If WebGL fails for an immersive participant, should we exclude, reassign or retry? | Study-engine routing |
| Q-R11 | High | Ethics: consent wording, retention period, who may access raw data, is IP or device fingerprinting allowed, data location? | Privacy, retention jobs, security |
| Q-R12 | Medium | Language of study materials: English only, or Hindi/Bengali too? | i18n scope and Indic typography |
| Q-R13 | Medium | Path entropy: which formal definition (TM:517)? Which unit for "path length" in 2D (page hops) vs 3D (metres vs node hops)? | Derived metrics |
| Q-R14 | Medium | May the immersive condition expose a skip link to a text equivalent for a11y, given that it crosses into the 2D condition? | A11y vs contamination |
| Q-R15 | Medium | Visual identity: may we use the madder/paper palette from the reference (and a recoloured IIT-KGP logo)? Are public "cinematic" pages wanted at all, given C4? | Design tokens, public site scope |
| Q-R16 | Medium | Self-explanation checkpoints (C12): in or out? | Treatment definition |
| Q-R17 | Critical (TM:681–682) | Which relationship types are actually present in the chosen traditions' content, and how does each map to spatial elements? | Relationship vocabulary table; compiler rule table |
| Q-R18 | High (TM:688) | What counts as a valid reconstruction, an "abandoned or incorrect pathway" (EVT-11), or a meaningful spatial relationship? | Scoring; EVT-11 detection logic |
