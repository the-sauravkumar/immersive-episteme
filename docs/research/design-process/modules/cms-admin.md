# Module record: CMS and administration

Covers knowledge authoring, the review and publishing workflow, release snapshots, the staff
relationship-graph editor, the media library, the spatial studio and platform administration.
Engineering entry points: `src/server/cms/` (services, not `server-only`, so the integration
tests exercise them directly), `src/app/(cms)/cms/`, `src/app/(admin)/admin/`,
`src/server/admin/`. Every number below names the file that defines it or the test or command
that produced it.

## Why it matters for the paper

The two learning conditions may only differ in navigation. Both read one immutable knowledge
snapshot (module record `condition-equivalence.md`, E1). This module decides what can enter
that snapshot. It is therefore the provenance chain behind every statement a participant reads
in either condition: claim → verbatim quotation → page/locator → source → named curator who
verified it → release snapshot (sha256) → study.

## Decisions

| # | Context | Options considered | Decision | Rationale and evidence |
|---|---|---|---|---|
| C1 | `content/FORMAT.md` requires learner text built from claims only. A rich-text body would put unverifiable free prose in front of learners. | (a) Tiptap body as the learner text; (b) Tiptap for learner text, sanitised; (c) structured claims, with learner text generated. | (c). The editor has no free-prose learner field. `summary` = the first claim; `body_md` = every claim followed by its source ids. Both are regenerated on every claim save (`deriveLearnerText`, `src/server/cms/knowledge.ts`). | Same rule as the validator's `deriveProseFromClaims` (`src/features/knowledge/graph/validate.ts`). Test: "generates the learner summary and body from claims only" (`tests/integration/cms-workflow.test.ts`). |
| C2 | Curators still need editorial prose (open questions, sources to chase). | Separate notes table (needs a schema change); `concepts.body`. | Tiptap JSON in `concepts.body`, used only for curator notes. Stored after an allow-list sanitise. Rendered as escaped HTML and then passed through DOMPurify (`src/server/cms/rich-text.ts`). | The snapshot builder always writes `body: null` (`buildBundle`, `src/features/knowledge/graph/snapshot.ts`), so notes cannot reach a learning condition. The release test asserts `indigo.body` is null. Sanitiser tests are in `tests/unit/cms/cms-rules.test.ts`. Known cost: the database counts `body` as substantive, so saving notes on an accepted concept returns it to review (see Limitations). |
| C3 | The citation policy requires a specific source, a page or locator, and an exact quotation for every citation. | Optional locator/quote (FORMAT v1 claims carry neither); require them at verification only; require them in the form. | Both. The form refuses a claim without a quote (max 25 words, the database limit) or without a locator on each citation (`cmsClaimSchema`, `src/server/cms/schemas.ts`). Verification refuses any concept whose claims are incomplete (`citationProblems`, `src/server/cms/workflow.ts`). The release refuses with REL002. Relationship citations follow the same rule. | Imported content (1256 claims, 715 relationships in the development database, from the `/cms/datasets` readiness report) carries neither field, so none of it can be verified until a curator adds them. This is the "Pending" backfill in `docs/research/citation-policy.md`. Tests: "rejects a claim without a page/locator or without a verbatim quote" and "refuses verification when a claim's citation is incomplete". |
| C4 | Separation of duties: "nobody self-verifies". Claims have no author column. | `created_by` only; trust the UI; authorship from the audit log. | Authors = `created_by`, `updated_by`, plus every user with an authoring CMS action on the entity in `audit_log`. Curator-notes edits do not count. Verification by an author is refused with `self_verification` (`authorsOf`). | An edit makes the editor an author, so a curator cannot edit and then approve. Test: "nobody verifies their own work (even a curator)". The permission matrix is unchanged: verify = `content.verify` (curator, PI). Unit test "only curators and the PI verify". |
| C5 | A verification record must show who verified, why and what was checked. `verification_records` has only actor and reason. | New columns (schema change); `audit_log` JSON. | The trigger writes actor and reason (`app.actor_id` / `app.change_reason` set by `inActorTx`, `src/server/cms/core.ts`). Verifying requires a reason (3 or more characters) and all 4 evidence checks (`EVIDENCE_CHECKS`). The checks are written to the `cms.review.verify` audit row in the same transaction. | Test: "requires the evidence checklist and a reason; records actor, reason and checks". |
| C6 | Workflow: Draft → Under review → Verified → Published, plus Rejected / Needs evidence / Archived. | Allow a manual "publish" per item; publish only through a release. | Items reach `published` only when a release snapshot containing them is published, in the same transaction (`publishRelease`, `src/server/cms/release.ts`). A manual transition to `published` is refused (`publish_via_release`). | "Published" then always means "frozen in an immutable release". Tests: "manual 'published' is refused" and the release test. |
| C7 | What does a release contain, and when is it refused? | Only the verified subset (silently drops pending work); the curator's chosen traditions (shared and comparison concepts cross traditions); everything in the review pipeline. | Everything in the review pipeline (under review, needs evidence, verified, published), the same scope as the review snapshot (`loadModelFromDb`). The release is refused while any of it is unaccepted. To leave something out, a curator rejects, archives or withdraws it, and that decision is recorded. | Nothing is silently omitted. Built with the existing `buildSnapshot({ kind: "publishable" })`, so its codes (SNAP001 errors, SNAP002 unaccepted, SNAP003 bundle invalid, SNAP004 demo) are shown, plus REL001 (tradition row unverified), REL002 (incomplete citation) and REL003 (empty). The database then re-checks payload, items and live states at publication (migration 0005). Tests: "refuses to publish a release while anything in the pipeline is unverified" and "publishes an immutable release …". |
| C8 | Learner citations need page/locator (the read model already shows `locator`), but the builder emits `locator: null`. | Change the builder (shared); fill in after binding. | After binding to database ids, the release bundle is filled with claim-citation locators and relationship quotes/locators from the database before item hashes are computed (`withCitationDetail`). | Both conditions' shared `CitationDisclosure` can show the page. Test asserts the locator and quote in the published payload. |
| C9 | Versions and diff. | Text diff of JSON; entity diff. | Entity diff matched by stable identity: traditions by slug, concepts by key, sources and relationships by database id, claims by (concept key, position). Claim ids are ignored because they change when claims are re-saved (`src/server/cms/diff.ts`). | Test: "editing published content returns it to review, and the next release diff shows it" (1 claim added, `bodyMd` changed). |
| C10 | Graph editor must use the existing validator and never reach participants. | Separate CMS rules; reuse `validateGraph`. | `validateGraph` runs over the database model, with the registry read from `relationship_types` (`src/server/cms/graph.ts`). Submitting a relationship is refused if the validator raises an error-level issue attributed to that edge, or if an endpoint is outside the pipeline (CMS201). The page needs `graph.edit` (never held by participant/public, unit test). React Flow is imported only by `src/components/cms/graph-workspace.tsx`. | The canvas is a visual aid. Every operation also has a form and an edge table, for keyboard and screen-reader use. Edges are styled by semantics and always labelled with the type code (not colour alone). Reviewers without `graph.edit` (PI, researchers) review relationships on `/cms/review?rel=…`. |
| C11 | Media must keep 3D aspect ratios and carry licence and provenance. | Trust the dimensions the browser measures; parse headers on the server. | The server sniffs magic bytes and parses PNG/JPEG/WebP headers for width/height. Licence, a provenance kind, and a source URL or cited source are all required. SVG is refused. Keys are content-addressed by sha256. S3 uploads use a presigned PUT with a signed SHA-256 that the store verifies; there is a local-disk fallback for development. (`src/server/cms/media/`) | Tests: `tests/unit/cms/media-sniff.test.ts`, `tests/integration/cms-media.test.ts`. Tried and reverted: limiting uploads with a stream transform, which threw an uncaught "stream already closed" in Node after cancel. It was replaced by a reader that cancels the body. |
| C12 | Manual spatial overrides must be audited and reproducible. | Edit stored manifests in place (breaks `manifest_hash` provenance); overrides on a draft rule set version. | Overrides are recorded on a draft `<rule set>+overrides` version. That version is frozen when compiled, so each manifest's uniqueness key names an immutable config plus override set. Traceability fields (id, kind, parent, concept, rule, encodes, trace, rationale) cannot be overridden. Publication re-validates on the server (`src/server/cms/spatial/`). | Test: `tests/integration/cms-spatial.test.ts`. Finding: overriding `/position` alone passes validation, because the geometry checks read `approach` and colliders (reported to the lead). |
| C13 | Administration without deleting people. | Hard-delete users; lock. | Accounts are locked (`disabled_at`) and their sessions deleted. The last active platform admin cannot be revoked or locked, and an admin cannot lock themselves (`src/server/admin/users.ts`). Settings are read-only, because there is no settings table. | 40 actor foreign keys must keep their provenance (`docs/architecture/foundation.md` §1). Test: `tests/integration/admin-users.test.ts`. |

## Enforcement pattern (every mutation)

Every mutation follows the same path: server action → `runAction` (`assertPermission` from the
session, then Zod) → service. The service re-checks with `ensure()`, writes inside `inActorTx`
(actor and reason visible to the triggers) and appends the `audit_log` row in the same
transaction, so a change and its audit record commit together. Pages enforce their route
permission through `ConsolePage` and render controls only for what the actor may do. That is
cosmetic: the server refuses regardless.

## Verification

- `npx vitest run tests/unit/cms tests/integration/cms-*.test.ts tests/integration/admin-*.test.ts`:
  8 files, 53 tests passed.
- `npx playwright test tests/e2e/cms-guards.spec.ts` (against a running dev server): 9 passed.
  Anonymous requests to the CMS and admin routes get a 307 to sign-in, with `X-Frame-Options: DENY`.
- Server-rendered checks against the development database, signed in as a curator: all nine
  `/cms` pages return 200 without error markers. `/cms/datasets` reports 6 traditions,
  442 concepts, 1256 claims, 715 relationships and 112 sources in the pipeline, with
  0 integrity errors. The release is refused with SNAP002, REL001 and REL002.

## Limitations

- Saving curator notes on an accepted concept returns it to review (`ie_return_edited_to_review`
  counts `body`). Fix: a notes table, or excluding `body` in that trigger (shared schema change).
- A re-import from `content/` overwrites CMS edits to claims of concepts that are not yet
  accepted. The importer keeps only accepted rows.
- Platform settings are read-only (no settings table).
- The S3 upload path is untested against a real bucket. Browser uploads in S3 mode also need the
  bucket origin in the CSP `connect-src`.
