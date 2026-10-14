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
