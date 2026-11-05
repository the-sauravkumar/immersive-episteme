# Sequence of design steps

In order of occurrence. "Lead" is the project lead. Commits are on branch `main`.

| Step | What happened | Record |
|---|---|---|
| 1 | Master implementation specification adopted as the build target (one Next.js platform, two experimentally controlled learning conditions). | DR-001 |
| 2 | Existing Hand Block Printing virtual museum (`virtual-walkthrough`) cloned to a sibling folder as a **read-only design reference**; the platform is built fresh. | DR-002 |
| 3 | Audit of the reference repo's reusable design components and digest of the research documents (concept note, master prompt, merged technical requirements). | `docs/architecture/design-reuse-catalogue.md`, `docs/research/requirements-digest.md` |
| 4 | Lead confirmed code reuse rights, chose Docker Postgres, and set research-critical-first ordering. | DR-003 |
| 5 | Lead asked for six real craft datasets; six Indian hand-block-printing traditions selected (same craft type, for comparable structure). | DR-004 |
| 6 | Curation by per-tradition research agents, then adversarial fact-check agents. | DR-005 |
| 7 | Lead: "do all the research yourself and verify rather than assert … never invent a research or a claim". First-hand verification of the whole dataset began. | DR-006 |
| 8 | All 105 cited sources archived with hashes; all 1,252 claims checked against source text; 14 claims and 1 summary corrected (§V6 corrections table). | `content/review/verification.md` §V5–V6 |
| 9 | Learner-facing prose restricted to verified claims ("claims-only"). | DR-007 |
| 10 | All 704 relationships checked; 8 unsupported relationships removed, 3 corrected, 1 process stage renamed. | §V8, DR-008 |
| 11 | Foundation built (schema, auth, permission matrix, condition lock), reviewed by independent agents (26 findings, 20 confirmed and fixed). | DR-009 |
| 12 | Knowledge-graph validator, concept-map scoring and spatial compiler built in parallel; all integrity warnings fixed (24 → 0). | DR-010, DR-011, §V9 |
| 13 | Rendering acceptance specification written; lead added: no artefacts, no rough edges, low-spec support, never compromise texture quality. | DR-012, DR-013 |
| 14 | AAA rendering practice researched from primary sources; techniques mapped to verified three.js 0.186.1 capabilities. | DR-014 |
| 15 | Image dimensions from Wikimedia Commons; compiler warnings fixed; a validator rule corrected (ordinals per chain). | §V10 |
| 16 | First local commit `97328cc` (352 files): foundation, dataset and core modules; 746 tests passing. | git log |
| 17 | Wave 0 (shared data layer, importer, telemetry) started. Lead asked for this design-process record. | this folder |
| 18 | Wave 0 completed: content imported to the database losslessly (the snapshot built from the database matches the snapshot built from the files), read model, learning context, telemetry ingestion and client, manifests stored; 799 tests passing. | `docs/architecture/data-and-telemetry-layer.md` |
| 19 | Lead set the citation standard for every project citation (source, page, verbatim quote, mechanically verified). | `docs/research/citation-policy.md` |
| 20 | Technical requirements extracted from the concept note and ten reference papers; concept-note claims about the papers checked; contradictions flagged. | DR-016, `docs/research/technical-requirements.md` |
| 21 | Lead required equivalence of content, exposure time and citation availability between conditions, with navigation time recorded separately. | DR-015 |
| 22 | Condition-equivalence module built: server-timed learning budget, one shared time accountant (exposure, navigation, pauses; reconciles exactly), lossless exit flush, shared citation disclosure, versioned timing metrics kept out of outcome tables. | `modules/condition-equivalence.md` |
| 23 | Study engine moved to Concept Note rev2: two doors, the note's step order, self-paced learning with a server cap and every stage required, new test item types generated from the stage templates, delayed test, Door 2 behavioural logging, parity from one template, analysis on H1 to H3. | DR-074 |
| 24 | Both doors wired into the study from one template, the old doors and the spatial compiler deleted, and the whole journey run through both doors on a production build. | DR-076 |
| 25 | Final adversarial review: test option order, recording of stops, resume, exit events and the WebGL backstop corrected. | DR-077 |
| 26 | Lead's material rule L12 recorded; material look sheet and asset list corrected after an adversarial check. | DR-078 |
| 27 | Materials built from the look sheet: fitted fills from measured vessels, a bath of its own for each stage, real scans recoloured, one Door 1 still per material, fills in the scene check. | DR-079 |

## 2026-11-04: Door 2 Whole-Route Faults

Walking every station, rather than the first three, exposed faults the single-scene checks could not see.

- The hill ring sat at a fixed world position with radius 130 m, and the route reached it at Station 4, where a strip painted over the walls and shed. The hills now follow the walker. Reported by the cut-over agent from a journey capture.
- A freeze of about 1.4 s on the legs to Stations 4, 5 and 6 was traced by Chrome trace to a blocked `DXGISwapChainImageBacking::Present`. Shader compilation, video memory and first-time model loads were each tested and rejected. The cause was the water canvas, which ran one blur pass per ellipse for 700 ellipses. Worst frame on those legs after the fix: 73 to 90 ms on the GTX 1650, still over the 50 ms budget.
- Yards left behind were never released: geometries reached 907 and textures 169. Both now stay flat, near 280 and 85.
- Guided turning compared raw yaw, so a turn that crossed the wrap never ended and the camera kept overriding the look input. Back also stopped short during arrival and walked forward before turning. All fixed and covered by `npm run walkthrough:route`.
- Pan shimmer, pixels with 4 or more reversals, budget 0.5%: vat 2.18 to 0.93, table 0.77 to 0.41, wash 2.69 to 0.81. Vat and wash remain over budget. Close-up sharpness was compared by eye at 4K and held.
- Not measured: the Iris Xe timing on the new scenes. Claude Code stopped the run for low memory about 20 s after launch, before the page reported ready.

## 2026-11-05: Materials Must Look Like Themselves

The lead asked whether materials in pots match real life and asked that nothing overlaps, tears or pixelates. This became rule L12 (DR-078).

- The first material look sheet had real quotes, but about 16 rows marked sourced had colours their evidence did not establish. An adversarial check caught this, and rice starch, tamarind paste and the red baths were the worst.
- After correction, 12 of 58 rows render on evidence, 26 on an inferred colour and 20 on a provisional one. Each stays flagged for the lead. Indigo vat liquor is amber to yellowish-green in general dyers' guides, and clean water and alum baths have no invented tint.
- The asset list recorded physical size and density, which exposed Bitumen at 205 px/m. All 47 Fab rows stay unverified, because the site returned 403 to a script. Liquids are shaded, not sourced.
- The running scenes changed on 2026-11-05: materials now render from these rows (DR-079).
- Mechanical checks for overlap, tearing and density were added with planted faults (DR-080). They found inside-out roots, words past their boards and a tear at a cloth join, all fixed. The camera now stops 0.6 m from anything it could previously walk through.
- Door 1 stills were re-rendered tightly framed, one per look row, with hashed file names so a test image cannot name its answer (DR-081). Unused stills were deleted.
- Reference photos were gathered per material and vessel, and 10 look rows moved to a new `photo` basis, still flagged for the lead (DR-083). Indigo vats now render near black, as photographs show, while the guides' amber to yellowish-green stays in the words. Five evidence materials differ from photos and were reported, not changed. Renders do not yet match the photos.
