# Knowledge-graph validation and content snapshots

- **Status:** implemented
- **Code:** `src/features/knowledge/graph/` (pure TypeScript; `hash-node.ts` and
  `load-content-dir.ts` are the only Node-specific modules)
- **CLIs:** `scripts/content/validate.ts`, `scripts/content/build-snapshot.ts`
- **Tests:** `tests/unit/knowledge-graph/`
- **Spec:** master directive §6.4–6.5 (typed relationships, provenance), §10.6 (graph
  integrity), §21 (snapshots)

The validator checks the curated interchange files in `content/` (FORMAT v1) as one graph.
The snapshot builder turns them into a knowledge bundle v1 (`knowledgeBundleSchema`, the
`content_snapshots.payload` contract). Neither one ever writes to `content/`, and neither
ever changes a verification state. Interchange content arrives as `under_review` or
`needs_evidence` and stays that way. Only a curator, through the CMS, can verify it.

## Pipeline

```
content/*.json ──loader──▶ KnowledgeGraphModel ──validators──▶ IntegrityIssue[] ──▶ report (JSON + markdown)
                  │ contentPackageFileSchema (KG100)                    │
                  │ source-id resolution (KG410)                        ▼
                  └──────────────────────────────────────────▶ buildSnapshot(kind) ──▶ envelope + bundle (+ JSON-LD)
```

- **Loader** (`loader.ts`): validates each file with the canonical
  `contentPackageFileSchema`. A file that fails the contract adds KG100 issues and contributes
  no entities. Source ids become global refs (`<slug>#<id>`). In `comparisons.json`, a
  qualified id such as `ajrakh:S7` resolves to the Ajrakh file's `S7`. The copy in the
  comparisons file is checked against that origin (KG410), so each source becomes one bundle
  row. The loader keeps `prose_policy`, which the Zod contract strips.
- **Registry** (`registry.ts`): reuses `RELATIONSHIP_TYPES` from
  `db/seeds/reference-data.ts`, the rows seeded into `relationship_types`, so the validator and
  the database agree on semantics, direction, ordering, cycles and evidence. Two policies sit
  on top of the registry:
  - **PRECEDES loops.** The registry allows PRECEDES cycles. The validator accepts a cycle only
    when one of its edges is a *marked loop*: no ordinal, and `conditions` names a
    loop/repeat/cycle. Dabu's "repeat cycles → resist printing" is an example.
  - **Dependency graph.** `DEPENDS_ON ∪ REQUIRES` must be acyclic.
- **Cycle detection** (`cycles.ts`): an iterative Tarjan SCC with deterministic output and no
  recursion limit.
- **Similarity** (`similarity.ts`): titles are normalised (NFKD, accents stripped, lower case,
  non-alphanumerics removed) and compared with pg_trgm-style trigram Jaccard similarity
  (each word is padded `"  w "`).

## Rule catalogue

Codes are stable: a code is never renumbered or reused. Every issue carries `code`,
`severity`, `message`, and optionally `packageSlug`, `entity` (a concept key,
`source|TYPE|target`, or a source ref) and `detail`.

| Code | Severity | Rule | Rationale |
|---|---|---|---|
| KG100 | error | File does not satisfy the FORMAT v1 contract | Covers enums, key shape, claims ≥ 1, sources per claim, quotes ≤ 25 words, importable states only, unique keys and edges within the file, and no self-loops |
| KG101 | error | File is not readable JSON | |
| KG102 | error | Two files declare the same slug | The later file by path is ignored |
| KG103 | error | Concept key defined in more than one file | Cross-file key resolution |
| KG104 | error | Concept key namespace ≠ file slug | `bagru.*` keys live in the bagru file, `shared.*` keys in shared |
| KG105 | error | Demo marker in real content | A `demo` key or slug, a `Demo:` title, or `isDemo` set |
| KG107 | warning | Tradition file without exactly one `tradition` concept | BELONGS_TO needs a single hub |
| KG108 | warning | Comparison concept compares < 2 concepts | |
| KG109 | error | `compares` names an unknown concept | |
| KG110 | warning | Media candidate depicts an unknown concept | |
| KG200 | error | Relationship type not in the registry | |
| KG201 | error | Relationship endpoint does not exist | Checked across files |
| KG202 | error | Self-loop | No registry type allows one (database constraint) |
| KG203 | error | Duplicate typed edge (`source, type, target`) | Checked across files |
| KG204 | error | Undirected type stated in both directions | The database keeps one row per unordered pair |
| KG205 | error | Ordinal on a type that is not ordered | Only PRECEDES is ordered |
| KG206 | error | Accepted relationship has an unaccepted endpoint | A verified link cannot hang off unverified concepts |
| KG300 | error | Cycle in a type that forbids cycles | BELONGS_TO, DEPENDS_ON (`allowsCycles = false`) |
| KG301 | error | PRECEDES cycle without a marked loop edge | Checked after the marked loop edges are removed |
| KG302 | info | PRECEDES loop closed by a marked loop edge | Reported so the spatial compiler knows about the loop |
| KG303 | error | Cycle in the DEPENDS_ON ∪ REQUIRES graph | A mutual requirement cannot be realised. Pure DEPENDS_ON cycles are already reported as KG300 |
| KG310 | error | Duplicate PRECEDES ordinal within one connected chain | A file may hold several independent chains; each numbers 1..n on its own. |
| KG311 | error | PRECEDES ordinals in a chain are not contiguous 1..n | |
| KG312 | warning | Step k's target ≠ step k+1's source | A chain that does not join up |
| KG313 | error | Fork without conditions | A stage with ≥ 2 next stages (marked loops excluded) where any branch has empty `conditions` |
| KG314 | info | PRECEDES without an ordinal that is not a marked loop | Allowed: side sequences and historical order |
| KG315 | info | PRECEDES between concepts that are not process stages | |
| KG316 | warning | Process stage with no PRECEDES, DEPENDS_ON or REQUIRES link | |
| KG400 | error | Concept has no claims | |
| KG401 | error | Claim cites no source | |
| KG402 | error | Claim cites an unknown source | |
| KG403 | error | Relationship cites no source although its type `requiresEvidence` | Every registry type requires evidence |
| KG404 | error | Relationship cites an unknown source | |
| KG405 | error | CAUSES without direct evidence | Raised when no source resolves, provenance is `hypothesis` or `unverified`, or every source has one of those kinds. FORMAT.md says to use ENABLES or AFFECTED_BY instead |
| KG406 | warning | CAUSES supported only by low-reliability sources | |
| KG407 | info | Claim supported only by low-reliability sources | |
| KG408 | info | Source never cited | Counts claims, relationships and GI records |
| KG409 | warning | Source URL missing from `content/review/source-manifest.tsv` | The source was never archived or hashed |
| KG410 | warning | Qualified source id does not match its origin file | Compares url, title and kind |
| KG411 | error | GI record cites an unknown source | |
| KG412 | error | Relationship evidence quotes a source the relationship does not cite | Each `evidence` entry must name one of the relationship's `source_ids` (content/FORMAT.md "Relationship evidence"); the file schema refuses it too (KG100) |
| KG500 | error | Same normalised title and type twice in one file | |
| KG501 | warning | Near-duplicate titles (trigram ≥ 0.8), same type, same file | |
| KG502 | warning | Same claim text twice in one concept | |
| KG600 | error | `prose_policy: "claims-only"` but `summary` ≠ first claim | FORMAT.md: learner-facing text comes from claims only |
| KG601 | error | `prose_policy: "claims-only"` but `body_md` ≠ the claims, each followed by its source ids | The exact output of `content/review/tools/claims-only-prose.js` |
| KG602 | warning | No prose policy and the prose cannot be derived from the claims | |
| KG700 | warning | Explanation wording belongs to another semantics class | Fires when a causal type is explained with associative wording ("associated with", "correlated", "linked to"), or a comparative or associative type with causal wording ("causes", "leads to", "results in"). This is a warning rather than an error because wording is only a signal: "X is similar to Y because both…" is legitimate, and a human must decide whether a link was collapsed |
| KG701 | info | One concept pair linked by several semantics classes | Usually correct (for example USES plus SCIENTIFICALLY_EXPLAINED_BY). Listed so reviewers can confirm the links were not collapsed |
| KG800 | warning | Concept has no relationships and is not part of a `compares` list | Orphan |
| KG801 | info | Concept attached only by BELONGS_TO | |
| KG802 | info | Tradition below a FORMAT.md depth target | Targets are ≥ 8 stages, 6 materials, 4 tools, 3 decisions, 3 mechanisms (linked shared mechanisms count), 2 conditions, 3 principles, 2 outcomes and 1 open question |

Issues are sorted by severity, code, package, entity and message, so a report is
byte-identical across runs.

### Report

`buildIntegrityReport` returns:

```ts
{ reportVersion: 1, files: {path, slug, kind, sha256}[], counts, verificationStates: {concepts, relationships, sources},
  issueCounts: {error, warning, info}, byCode, ok /* no errors */, rules /* catalogue */, issues }
```

`renderIntegrityMarkdown` turns it into a summary, state counts, file hashes, a table per
rule, and the issues grouped by severity and code (at most 40 per code; the JSON report has
every issue).

## Snapshots

`buildSnapshot(model, { kind, hasher, generatedAt, issues, versionLabel?, sourceManifest? })`:

| Kind | `includesUnverified` | Refused when |
|---|---|---|
| `review` | true | any error-level issue (SNAP001) or demo content (SNAP004) |
| `publishable` | false | any of the above, or any tradition, concept, relationship or source that is not `verified` or `published` (SNAP002) |

An invalid bundle is refused with SNAP003. Interchange files cannot carry accepted states, so
`content/` alone can never produce a publishable snapshot. That is intentional. A review
snapshot is labelled in its `notice`: "REVIEW SNAPSHOT … not publishable, and not for use in a
study". Its default label is `review-<12 hex>`.

**Bundle mapping.** Traditions are the tradition files. A tradition's `verificationState` is
the state of its `tradition` concept, since FORMAT v1 has no file-level state. Sources come
from all files with qualified copies merged, and carry `under_review` because FORMAT v1
sources have no state. Concepts and relationships map field by field, with `body` set to null
and `bodyMd` kept. Categories and relationship types come from the reference data.

**Ids.** Every id is a name-based RFC 9562 version 8 UUID: sha256 of
`immersive-episteme:content:<kind>\0<name>`, with the version and variant bits set. Names are
`tradition/<slug>`, `source/<slug>#<id>`, `concept/<key>`, `claim/<key>/<position>` and
`relationship/<source|TYPE|target>`. These ids are stable across builds and cannot collide
with database `uuidv7()` ids.

**Ordering.** Categories are sorted by position, relationship types by code, traditions by
slug, concepts by key, and sources and relationships by id. A relationship's sources are
sorted by id. Claims keep their authored position, because the summary is the first claim.
Local terms and `compares` keep their authored order. Shuffling files, sources, concepts or
relationships leaves the bundle unchanged (tested).

**Hashes** (`canonical-json.ts`, `hash.ts`):

| Field | Definition |
|---|---|
| `contentSha256` | sha256 of `canonicalJson(payload)` without `generatedAt` and `versionLabel`. It identifies the content and is independent of build time and label |
| `payloadSha256` | sha256 of `canonicalJson(payload)` |
| `predictedDbPayloadSha256` | sha256 of the payload printed as PostgreSQL `jsonb` text (keys ordered by length then bytes, `", "`/`": "` separators). This is the value the generated column `content_snapshots.payload_sha256 = ie_jsonb_sha256(payload)` should hold after insert |
| `items[].itemSha256` | sha256 of `canonicalJson(entity)`. Same rows and hashing as `snapshotItemsFor` in `db/seeds/demo.ts` |

`canonicalJson` sorts keys by UTF-16 code unit order, writes compact JSON and drops
`undefined`. It is the same function as `db/seeds/_util.ts`. Hashing goes through the
synchronous `Sha256Hasher` interface. The `node:crypto` implementation is in `hash-node.ts`;
a Web Crypto implementation would need an async variant.

**Envelope.** The envelope has `envelopeVersion`, `kind`, `notice`, `versionLabel`, the three
hashes, and `contentFiles` (the path, slug and sha256 of every file). It also has
`sourceManifest`: the sha256 of `source-manifest.tsv`, its entry count, each cited URL's
archived sha256 and HTTP status, and `notArchived`. The remaining fields are
`verificationCounts` (traditions, concepts, relationships, sources), `integrity` (issue
counts), `itemCount`, `items` and `payload`.

**JSON-LD** (`jsonld.ts`): schema.org `DefinedTermSet` for each tradition and `DefinedTerm`
for each concept (`termCode` = key, local terms as `alternateName`). Sources become
`CreativeWork`, claims become `ie:Claim` with `citation`, relationships are reified as
`ie:Relationship`, and types become `ie:RelationshipType`. `ie:` is the URN namespace
`urn:immersive-episteme:vocab#`.

## CLIs

```sh
npx tsx scripts/content/validate.ts                       # exit 1 on error-level issues
npx tsx scripts/content/build-snapshot.ts                 # review snapshot (default)
npx tsx scripts/content/build-snapshot.ts --kind publishable   # exit 2: refused for content/
#   options: --content <dir> --out <dir> --label <versionLabel> --generated-at <ISO> --no-jsonld
```

Output goes to `analysis/out/knowledge-graph/`, which `.gitignore` already ignores
(`/analysis/out/`; `.tmp/` is not ignored). The files are `integrity-report.{json,md}` and
`snapshot-<label>.{json,jsonld}`.

## Known limits

- Bundle ids derived from content are not database ids. A snapshot built from the database
  after import (`buildBundleFromDb`) has different ids, and therefore different hashes, for
  the same content. Compare `contentSha256` only between builds from the same origin.
- `predictedDbPayloadSha256` assumes that JavaScript and `jsonb` print numbers the same way.
  They do for the integers and short decimals in bundles.
- KG700 is a lexical heuristic. It cannot prove that semantics were collapsed.
