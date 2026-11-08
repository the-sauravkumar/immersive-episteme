# Immersive Episteme

A research platform comparing two experimentally controlled learning conditions —
a visual course (`/learn/2d`) and a walkthrough of working yards (`/learn/immersive`), both
generated from one stage template — over one shared knowledge model, auth/RBAC,
study engine, assessments, telemetry, CMS and research console.

One Next.js 16 App Router modular monolith. Start with
`docs/decisions/0001-stack-and-foundation.md`, then `docs/architecture/foundation.md`
(structure, permission model, participant sessions) and
`docs/architecture/knowledge-schema.md` (data model).

## Prerequisites

- Node 24 (`.nvmrc`), npm 11
- Docker Desktop (PostgreSQL 18 + pgvector runs in Docker on `localhost:5433`)

## Setup

```bash
npm ci
cp .env.example .env              # then set BETTER_AUTH_SECRET (generator command is in the file)

docker compose up -d --wait       # or: npm run db:up  (creates `episteme` and `episteme_test`)
npm run db:migrate                # main database
npm run db:migrate -- --test      # test database (episteme_test), needed by npm test
npm run db:seed                   # reference data + clearly flagged demo data (idempotent)

# First staff account, a Super Admin. The password comes from ADMIN_PASSWORD (min 12 chars), never argv.
ADMIN_PASSWORD='choose-a-long-password' npm run create-admin -- --email admin@example.org --name "Local Admin"

npm run dev                       # http://localhost:3000  (sign in at /sign-in)
```

### Development data (one command)

```bash
npm run dev:bootstrap -- --verify-as <local curator email>
```

Starts the database container, migrates the main and test databases, seeds reference and demo
data, imports `content/` (`npm run content:import`), builds the REVIEW snapshot (content is
`under_review` / `needs_evidence`: draft, `kind = review`, never publishable, never usable by a
real study), and creates the draft demo study
`demo-review-walkthrough` (non-experimental) pinned to it, so /explore and staff preview of
/learn/* render real content. With `--verify-as` it accepts, as that existing local curator, every
concept and link the content files record as `verified`, each file's tradition and every source the
file lists (except sources the file itself marks `kind: "unverified"`) before building the snapshot;
without it the doors show "Learning Content Is Not Available" (DR-131, DR-133). Idempotent; it prints the row counts.
Refuses non-local databases.
API reference for pages: `docs/architecture/data-and-telemetry-layer.md`.

`create-admin` is idempotent: re-running keeps the existing password and sets the account's one
role. Staff roles are `--role super_admin` (the default), `--role admin`, `--role researcher`,
`--role curator`, and `--role principal_investigator` (a researcher marked as the study's principal
investigator). The retired names `platform_admin`, `study_facilitator`, `research_analyst` and
`content_editor` still work and map onto the roles; the script refuses to take Super Admin from the
last active Super Admin (DR-133, DR-134, `src/lib/permissions/roles.ts`). Super Admin may do
everything; Admin only lets people in (gives Researcher or Curator, locks, resets passwords, makes
invite codes). An account whose verified email is listed in `SUPER_ADMIN_EMAILS` (local `.env`)
becomes Super Admin when it signs in, by Google or password.
Add `--test` to target `TEST_DATABASE_URL`.

Sign-in must come from the origin in `BETTER_AUTH_URL` (default `http://localhost:3000`);
Better Auth rejects other origins with 403. Sign-in is rate-limited to 5 attempts per minute
per IP.

## Tests

```bash
npm run typecheck
npm run lint
npm test                          # Vitest unit + integration (integration uses TEST_DATABASE_URL)
npm run build
npx playwright install chromium   # first time only
npm run test:e2e                  # Playwright; starts `next dev` on :3000 itself
npm run check                     # typecheck + lint + test
```

Integration tests that need their own schema state create and drop throwaway databases on the
`TEST_DATABASE_URL` server; the others expect `episteme_test` to be fully migrated.

## Scripts

| Script | What it does |
|---|---|
| `dev` / `build` / `start` | Next.js dev server, production build, production server |
| `typecheck` | `next typegen && tsc --noEmit` |
| `lint` | ESLint (flat config, `eslint-config-next`) |
| `test` / `test:watch` | Vitest: `dom` project (jsdom, `*.test.tsx`) and `node` project (`*.test.ts`) |
| `test:e2e` | Playwright (starts `next dev` on :3000) |
| `check` | typecheck + lint + test |
| `db:up` / `db:down` | `docker compose up -d --wait` / `docker compose down` |
| `db:generate` | `drizzle-kit generate` from `db/schema/*.ts` into `db/migrations` |
| `db:migrate` | Programmatic migrator (`scripts/db/migrate.ts`); `-- --test` targets `TEST_DATABASE_URL` |
| `db:seed` | Reference data + demo data (`is_demo = true`, titles prefixed `Demo:`) |
| `db:reset` | Drops and re-migrates a **local** database (`-- --test` for the test DB). Destructive |
| `db:studio` | Drizzle Studio |
| `create-admin` | Create a staff account / set its one role (`scripts/create-admin.ts`) |
| `dev:bootstrap` | DB up + migrate (main and test) + seed + content import + review snapshot + manifests + demo study |
| `content:import` | Import `content/` and build the review snapshot (`-- --test`, `-- --no-snapshot`) |
| `study:seed-demo` | Create an active demo study with the generated test battery (`-- --slug demo-x --cap-minutes 30`) |
| `content:test-items` | Generate `db/seeds/study-test-items.generated.json` from the stage templates. A form holding a `Sample Text` item is written as a demo assessment (`demo-` code, `Demo:` title), which no real study can include (DR-115) |

## Migrations

`db/migrations` holds `0000` extensions (pgvector, pg_trgm, pgcrypto), `0001` hand-written SQL
helper functions, `0002` all tables generated by drizzle-kit (auth + domain), `0003` hand-written
integrity triggers, `0004`/`0005` review fixes, `0006` (generated: `content_snapshots.kind`,
media candidate dimensions, `spatial_manifests.traditions`) `0007` (hand-written review-snapshot guards), `0008` (generated: `study_sessions.learning_*`) and `0009` (hand-written learning-clock trigger; timing metrics barred from `derived_scores`). After editing `db/schema/*.ts`, run
`npm run db:generate` to add the next migration, and check that the triggers in `0003` still
match any renamed tables or columns. On a clean tree `npm run db:generate` reports
"No schema changes".

## Layout

```
src/app/(public|learning|study|cms|research|admin)/   route groups
src/app/api/auth/[...all]/                            Better Auth handler
src/proxy.ts                                          Next 16 proxy (formerly middleware)
src/components/{ui,shell,learning,assessment,analytics}
src/features/{knowledge,process,course,walkthrough,study,telemetry,cms,media,research}
src/server/{auth,db,services,repositories}             server-only code
src/lib/{env.ts,utils.ts,a11y,validation,permissions}
db/{schema,migrations,seeds}
scripts/db/                                           migrate / seed / reset
scripts/create-admin.ts
tests/{unit,integration,e2e}
content/                                              curated craft content (separate effort)
docs/{architecture,research,decisions}
```

## Content rule

Never fabricate craft facts. Curated, source-cited content lives in `content/` (see
`content/FORMAT.md`). In a file, `verified` means the item passed a mechanical source check
recorded in `content/review/<tradition>-verification.md`: every quote re-found verbatim at its
locator in an archived copy of a recorded source. It is still imported as `under_review`;
acceptance in the database is a named curator's transition in the CMS or through
`scripts/content/verify-concepts.ts`, which accepts a file's tradition, sources, concepts and links
under the same evidence rule (DR-059, DR-120, DR-124, DR-133). Fixtures and demo data are flagged `is_demo = true`,
titled `Demo: …`, and can never be published into a study (enforced by database triggers).

## Deployment

Nothing is deployed: the Vercel project was deleted and the repository handed over (DR-124).
To deploy, follow `docs/deploy/RUNBOOK.md`.
