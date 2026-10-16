# Deployment runbook: Vercel + lean AWS

This runbook takes Immersive Episteme from "code ready" to "live and invite-only". It covers Vercel for the app and lean AWS in `ap-south-1`: RDS PostgreSQL `db.t4g.micro` Single-AZ, one private S3 bucket, one IAM user or role, and one AWS Budget. Every step lists what it needs from the lead, the command, how to verify it and how to undo it. Platform facts are quoted from the official docs, either in [RESEARCH.md](RESEARCH.md) (section numbers given as "R§n") or in the [sources](#sources) at the end.

**Nothing in this kit deploys by itself.** The scripts only read or check things, with two exceptions, and both need an explicit flag: `push-env.ps1 -Yes` and the commands the lead approves at the marked steps.

## The kit

| File | What it does | Changes anything? |
|---|---|---|
| [`vercel.json`](../../vercel.json) | Region `bom1`, `npm ci`, the dashboard stream's max duration, and a guard that cancels production builds until the invite gate exists | Read by Vercel at deploy time |
| [`.env.production.example`](../../.env.production.example) | Every production variable, with where it comes from and how to generate it; no values | No |
| [`scripts/deploy/preflight.ts`](../../scripts/deploy/preflight.ts) | Checks the env file against the app's own schemas and the production rules. It also checks source readiness, the database (TLS, versions, role, migrations, read-only) and S3 (HeadBucket, no public listing, CORS). An optional production build. Prints a PASS/FAIL table | No. `--build` overwrites `.next` |
| [`scripts/deploy/push-env.ps1`](../../scripts/deploy/push-env.ps1) | Runs `vercel env add` for each variable: secrets as Secret, the rest as Config, values passed on stdin. `-DryRun` only prints the plan | Only with `-Yes` |
| [`scripts/deploy/with-env.ts`](../../scripts/deploy/with-env.ts) | Runs one local command (migrations, first admin) with the production env file and the RDS CA. Refuses seed, reset and `--test` | The command you give it |
| [`scripts/deploy/smoke.ts`](../../scripts/deploy/smoke.ts) | Post-deploy checks against a URL, with headless Chromium on the NVIDIA GPU | No. `--use-invite` redeems one invite |
| `scripts/deploy/lib/*` | Shared variable catalogue, dotenv parsing and the report table | No |

### Why `vercel.json` says what it says

| Key | Value | Reason |
|---|---|---|
| `regions` | `["bom1"]` | Functions default to `iad1` (Washington); `bom1` is `ap-south-1` Mumbai, next to RDS. One region is allowed on Hobby (R§3). |
| `installCommand` | `npm ci` | For npm projects Vercel runs `npm install`, which can rewrite the lockfile. Our versions are pinned exactly (R§14). |
| `buildCommand`, `framework` | `npm run build`, `nextjs` | These are the detected defaults, stated so a dashboard change cannot drift from them. |
| `functions["src/app/api/research/dashboard/stream/route.ts"].maxDuration` | `"max"` | The SSE stream is the only long-lived response. `"max"` "resolves to your plan's maximum at deploy time": 300 s on Hobby (the same as the default) and 800 s on Pro, so the stream reconnects less often. The cost is unchanged, because an open stream keeps the instance alive either way (R§4). Once S1 adds a `maxDuration` export, the route's own value wins: "Settings in your function code always take top priority" (R§4). The `src/` prefix is required (see Sources). |

| `ignoreCommand` | `node -e "..."` | A safety net for "always invite-only". If `VERCEL_ENV` is `production` and `src/proxy.ts` does not mention the invite gate (the same text check as preflight's S11 row), the command exits 0 and Vercel cancels the build; otherwise it exits 1 and the build continues. Docs: "When the command exits with code 1, the build will continue. When the command exits with 0, the build is ignored." The command "can access the System Environment Variables that are available at build time". Note: "Canceled builds are counted as full deployments" (Hobby: 100 a day). It is a text check, not proof the gate works: `smoke.ts` is the proof. Previews still build (they sit behind Vercel Authentication). |

Nothing else is set. Memory cannot be set in `vercel.json` under Fluid compute, and every other route stays at the platform default of 300 s.

All commands run from the repo root, with Node on the PATH:

```bash
export PATH="/c/Tools/Node:$PATH"     # Git Bash
$env:Path = "C:\Tools\Node;$env:Path" # PowerShell
```

## Inputs from the lead (nothing starts without these)

| # | Decision | Needed at | Why |
|---|---|---|---|
| L1 | **Vercel plan: Hobby or Pro.** | Step 6 | Hobby is "non-commercial personal use only", and commercial use includes "a paid employee or consultant writing the code" (R§2). Pro costs "$20 per user / month" per developer seat. Pro raises the stream limit to 800 s and adds Spend Management. |
| L2 | **Production domain:** a custom domain, or the project's `*.vercel.app`. | Steps 5, 8 | It becomes `BETTER_AUTH_URL` and the S3 CORS origin. |
| L3 | **AWS go-ahead with costs:** about USD 21.6 a month on-demand, from credits first (`aws-resources.md`). | Step 3 | `aws-provision` asks for a yes per resource. |
| L4 | **GitHub repo creation and push.** | Step 2 | Deploys come from Git, so the local `.env` is never uploaded (R§14). Standing rule: no repo, push or deploy until the lead says so. |
| L5 | **Production deploy go-ahead.** | Steps 7, 9 | Production env changes and `--prod` deploys are outward-facing. |
| L6 | Optional: approval for `@vercel/oidc-aws-credentials-provider` (OIDC) and `@vercel/functions` (`attachDatabasePool`). | Later | Without them, the launch uses the key-only IAM user (R§9) and a short pool idle timeout. |
| L7 | Optional: how many hours a month the research dashboard stays open. | Step 12 | Sizes the Hobby memory allowance (R§4). |

**Signing in is interactive.** Only the lead or user can do it, by typing it with a leading `!` in Claude Code: `! aws login --profile cxa` (or `! aws configure sso --profile cxa`) and `! npx vercel@60.1.3 login`.

---

## Step 1. Source changes landed (gate)

These changes belong to the source tree; another workflow owns them, so this kit made none (R§13). Preflight checks for each one as text and turns its row to PASS once it lands.

| ID | Change | Blocks the deploy? |
|---|---|---|
| **S11** | **Invite-only gate.** See [Invite-only access](#invite-only-access) for the contract that `smoke.ts` tests. | **Yes.** The site is always invite-only. |
| **S3** | `DATABASE_CA_PEM` in `src/lib/env.ts` (optional; required in production when the host ends in `.rds.amazonaws.com`). `createPool` passes `ssl: { ca, rejectUnauthorized: true }`. **Also strip `sslmode`/`sslrootcert` from the URL before passing it.** node-postgres applies the parsed connection string *after* the explicit config (`pg/lib/connection-parameters.js`: "this will override other default values with what is stored in connectionString"), and any `sslmode` resets `ssl` to `{}` (`pg-connection-string/index.js`), which would drop the CA. `preflight.ts` `checkDatabase` shows the working shape. **The same applies to the dashboard's `LISTEN` connection**, which does not use the pool: `src/server/research/dashboard-live.ts` opens `new Client({ connectionString })` from `DATABASE_URL`, so it needs the same stripped URL and `ssl` object, or the live dashboard never connects on RDS. | **Yes**, on RDS: TLS verification fails without it (R§8). |
| S5 | `storage.ts` refuses, in production, to run with neither the `MEDIA_S3_*` keys nor `AWS_ROLE_ARN` set. It must not fall back to Vercel's placeholder `AWS_*` values. Add OIDC once L6 is approved. | No, if the `MEDIA_S3_*` keys are set (preflight enforces them). |
| S1 | `export const maxDuration` on `src/app/api/research/dashboard/stream/route.ts`, and close the stream cleanly about 15 s before it. | No: the client reconnects. Without it, every cut logs a 504. |
| S2 | Close the EventSource while the tab is hidden. | **Already in place** (`live-status.tsx` handles `visibilitychange`). |
| S4 | `idleTimeoutMillis` about 5 s on Vercel (`process.env.VERCEL`). | No |
| S6, S7 | `images.localPatterns` limited to `/figures/**`, and `unoptimized` for licence-limited figures. | No, but it is needed before any figure's licence end date (R§12). |
| S8 | `.gitignore`: add `!.env.production.example`. | No. Until then, the template cannot be committed. |
| S9 | Root `.vercelignore` with `.env`, `.data/`, `analysis/out/`, `test-results/`. | Only for CLI deploys (R§14). |
| S10 | `engines.node` set to `"24.x"`. | No |
| S12 | `APP_BUILD_VERSION` defaults to `VERCEL_GIT_COMMIT_SHA` (short) when unset. Vercel docs: "`VERCEL_GIT_COMMIT_SHA` ... Available at: Both build and runtime ... The git SHA of the commit the deployment was triggered by." | Strongly recommended before data collection. Until then, step 7 sets the version by hand, which is only right if production is fast-forwarded to exactly that commit (step 9); preview builds report `dev`. |

**Verify:** `npx tsx scripts/deploy/preflight.ts --env-file .env --mode local --skip-db --skip-s3`. No `source` row may FAIL except S11 and S3, which are FAIL only in production mode.

## Step 2. Git remote (L4)

Use the `github-repo` skill: a private repo under `the-sauravkumar`, with a secret scan before the first push. Never switch GitHub accounts.

- **Verify:** `git rev-parse --abbrev-ref @{u}` names the remote branch, and the preflight row `branch has upstream` passes.
- **Rollback:** delete the remote repo, only if the lead asks.

## Step 3. AWS resources (L3)

Use the `aws-provision` skill, in its order:
1. preflight: `--profile cxa`, and the account ID must equal `626159998512`;
2. the budget;
3. RDS: custom parameter group with `rds.force_ssl=1`, deletion protection;
4. the S3 bucket: Block Public Access, TLS-only policy, versioning, lifecycle;
5. IAM: Option B user `immersive-episteme-media` with one access key.

**Budget: decide alerts-only or alerts plus action (L3).** A budget by itself only sends email; it does not stop charges. The `aws-provision` skill also attaches an uploads-only deny policy through a budget *action*, and AWS says: "To use budget actions, you must create a service role for AWS Budgets. A service role is an IAM role that a service assumes to perform actions on your behalf." (https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-action-role.html). That is a second IAM role, beyond the lean plan's "one IAM role or user". The lead chooses: alerts only (lean, exactly as planned), or alerts plus the action (one extra, free IAM service role).

Record names and ARNs in `aws-resources.md`, never secrets.

- **Outputs you need for step 5:** the RDS endpoint, the bucket name, and the access key pair. The key pair is shown once, so put it straight into the env file, never in chat.
- **CORS:** set `AllowedOrigins` to the exact production origin from L2. If L2 is not decided yet, set CORS in step 8.
- **Verify:** `aws-provision` section 4. Preflight's `s3` rows check the same things from the app's side in step 5.
- **Cost:** about USD 21.6 a month (`aws-resources.md`). The USD 44.66 in credits covers about two months. Do not create the RDS instance months ahead of the study.
- **Rollback:** stop the RDS instance (`aws rds stop-db-instance`; AWS restarts it after 7 days). Deleting anything needs the lead to name the exact resource, and RDS deletion keeps a final snapshot.

## Step 4. Database bootstrap

1. **Role, database and extensions.** Connect as the master user over TLS and run the SQL in `aws-provision` step 1: `episteme_app` (not a superuser), database `episteme`, and the three extensions.
2. **CA bundle** (public, 4,580 bytes; R§8):
   ```bash
   mkdir -p ~/.episteme
   curl -fsSo ~/.episteme/ap-south-1-bundle.pem https://truststore.pki.rds.amazonaws.com/ap-south-1/ap-south-1-bundle.pem
   ```
3. **Fill the env file and run preflight** (step 5, items 1 to 3) before migrating: the next commands read the file, and preflight checks versions without writing anything. Before the first migration, `migrations current` FAILs as expected; every other `db` row must PASS, above all **`server + extensions`**.
   - Why first: `db:migrate` checks the server and extension versions (`EXPECTED_DB` in `scripts/db/_shared.ts`: PostgreSQL 18, vector 0.8.7, pg_trgm 1.6, pgcrypto 1.4) only **after** it has applied the migrations (`runMigrations`). A mismatch found that late leaves a half-built schema.
   - If RDS offers only 17.x, or a different `vector` version, stop and follow `aws-provision` step 0. Changing `EXPECTED_DB` is a source change for the other workflow.
4. **Migrations.** These run from this machine, never from the Vercel build:
   ```bash
   npx tsx scripts/deploy/with-env.ts --env-file ~/.episteme/production.env -- npm run db:migrate
   ```
   `with-env` passes `DATABASE_CA_PEM` as `NODE_EXTRA_CA_CERTS`, so the script verifies the RDS certificate with `sslmode=verify-full` (node-postgres turns any `sslmode` into an `ssl` object that uses Node's CA store, which `NODE_EXTRA_CA_CERTS` extends; `pg-connection-string/index.js`). `with-env` refuses `drizzle-kit push`/`drop`, which would bypass the migration history.
5. **First admin** (the password comes from the shell, never from the file):
   ```bash
   read -s ADMIN_PASSWORD && export ADMIN_PASSWORD
   npx tsx scripts/deploy/with-env.ts --env-file ~/.episteme/production.env -- npx tsx scripts/create-admin.ts --email <lead's email> --name "<name>"
   unset ADMIN_PASSWORD
   ```
6. **Study content** is decided by the lead and curators. `content/` belongs to the curation effort, and demo data never goes to production unless it is the flagged demo dataset and the lead asks. When asked, the same wrapper runs:
   - `-- npm run content:import`;
   - `-- npx tsx scripts/content/ingest-study-photos.ts --uploader <curator email>`;
   - `-- npm run spatial:compile`.

   `with-env` refuses `db:seed`, `db:reset`, `dev:bootstrap` and `--test`.

- **Verify:** preflight's `db` rows (step 5): `migrations current`, `role not superuser`, `TLS in use`, `rds.force_ssl = 1`.
- **Rollback:** migrations are forward-only. **Take a manual RDS snapshot before every production migration after the first** (`aws rds create-db-snapshot --profile cxa --db-instance-identifier immersive-episteme-db --db-snapshot-identifier pre-<sha>`). Restore only if the lead asks.

## Step 5. Production env file and preflight (L2)

1. Copy the template **outside the repo**:
   ```bash
   cp .env.production.example ~/.episteme/production.env
   ```
   Never save it as `.env.production` or `.env.production.local` in the repo root. Next.js loads those names by itself (load order in `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`), so a local build or start would talk to production.
2. Fill it in, following the comments in the file:
   - generate a new `BETTER_AUTH_SECRET`;
   - `BETTER_AUTH_URL=https://<L2 domain>`;
   - the RDS URL with `episteme_app` and `?sslmode=verify-full` (a hex password, so nothing needs URL-encoding);
   - `DATABASE_CA_PEM` = the bundle from step 4, in double quotes;
   - the bucket;
   - the Option B keys.
3. Run:
   ```bash
   npx tsx scripts/deploy/preflight.ts --env-file ~/.episteme/production.env
   ```
   Optionally add `--build`, for one production build with these values. Run it only when no dev server, test run or other build is running.

- **Verify:** `OVERALL PASS`. Acceptable WARN rows are the source items not marked "blocks" in step 1, and `APP_BUILD_VERSION = HEAD` until step 7.
- **What preflight proves:**
  - the app's own `serverEnvSchema` (with `NODE_ENV=production`) and `parseMediaEnv` accept the file;
  - no forbidden variable is present (`NODE_ENV`, `TEST_DATABASE_URL`, `AUTH_TRUSTED_PROXIES`, `AWS_*` keys, `MEDIA_LOCAL_DIR`, ...);
  - the total is under the 64 KB limit (R§5);
  - the secret differs from the local `.env` one;
  - TLS to RDS is verified with the given CA;
  - migrations match `db/migrations` (same SHA-256 as drizzle's migrator);
  - the app keys can `HeadBucket` the bucket owned by `626159998512`;
  - anonymous listing gets a 403;
  - S3 CORS admits the production origin.

## Step 6. Vercel project (L1, L5, sign-in)

The Vercel CLI is pinned to `vercel@60.1.3` (published 2026-09-26) everywhere in this kit, so the secrets in step 7 go into a known version. Its `env add --help` lists `--sensitive`, `--no-sensitive`, `--force`, `--value` and `--yes`.

1. The lead runs `! npx vercel@60.1.3 login`.
2. **Creating the project changes Vercel: get the lead's go-ahead first.** Run `npx vercel@60.1.3 link` and create or link `immersive-episteme` in the chosen team (L1). This creates `.vercel/project.json` (gitignored). If the CLI offers to connect the Git repository, decline for now.
3. **Do not connect the GitHub repo yet.** "By default, Vercel creates a new deployment and build ... for every commit pushed to your connected Git repository" (Project settings → Ignored Build Step). Connecting Git before step 7 would build production without its variables, and every later push to `main` becomes a production deploy. Connect it in step 9. Do not use the dashboard's new-project import flow either; link with the CLI.
4. **Settings to check** (most come from `vercel.json`, which "override[s] the default behavior of Vercel from within your project"):
   - **Framework:** Next.js. **Build:** `npm run build`. **Install:** `npm ci` (from `vercel.json`).
   - **Node.js version:** 24.x, the default; our `engines` range resolves to it (R§14).
   - **Function region:** `bom1` (from `vercel.json`; Hobby allows one region; R§3).
   - **Fluid compute:** on, the default for new projects (R§4).
   - **Function memory:** leave the default. "Memory cannot be set in `vercel.json` with Fluid compute enabled." On Hobby it is fixed at 2 GB (R§4).
   - **Deployment Protection:** Standard Protection. It protects previews and leaves production open, so production relies on the app's invite gate (R§15). Do not buy Password Protection ($20/month on Pro, not available on Hobby).
   - **System environment variables:** keep "Enable access to System Environment Variables" on. Skew Protection and S12 depend on it.
   - **Pro only:** Settings → Billing → Spend Management. Set an On-Demand Budget and decide on **Pause Production Deployments**. Pausing takes the study offline ("503 DEPLOYMENT_PAUSED"), so the lead must choose between a hard cost stop and continuity mid-study. Vercel checks spend "every few minutes", so set the amount below the true ceiling.
5. Do not enable paid add-ons: Static IPs ($100/month, R§7), Secure Compute, extra Observability.

- **Verify:** `npx vercel@60.1.3 project ls` lists the project, and `.vercel/project.json` exists.
- **Rollback:** unlink by deleting `.vercel/`. Removing the project needs the lead's request.

## Step 7. Environment variables (L5)

```powershell
powershell -File scripts\deploy\push-env.ps1 -EnvFile $HOME\.episteme\production.env -BuildVersionFromGit -DryRun
powershell -File scripts\deploy\push-env.ps1 -EnvFile $HOME\.episteme\production.env -BuildVersionFromGit -Yes   # after the lead's go-ahead
```

- The dry run prints names, types (Secret or Config) and byte sizes, never values. It exits 1 if anything blocks: a missing required variable, a refused name, or more than 64 KB.
- The real run writes each value to `vercel env add NAME production --sensitive|--no-sensitive --yes` over stdin, never on a command line. The Vercel docs warn that `echo` piping "will save the value in bash history".
- To overwrite one variable, use `-Only NAME -Force -Yes`. `--force` "overwrites an existing environment variable of the same target without prompting for confirmation".
- **Verify:** `npx vercel@60.1.3 env ls production` lists every catalogue name, and secrets show as Secret. Secret values "are write-only after saving" (R§5), so check the values with preflight on your local file, not with `env pull`.
- **Every env change needs a new deployment:** "they only apply to new deployments" (R§5). This includes `MEDIA_S3_BUCKET`, because the CSP `connect-src` is computed when `next.config.ts` is evaluated.
- **Rollback:** push the previous value with `-Only NAME -Force -Yes`, then redeploy.
- **Preview environment:** previews sit behind Vercel Authentication. If uploads are to be tested on a preview, it needs its own variables and a CORS origin; use a scratch database, not production. `push-env.ps1 -Environment preview` refuses any env file whose name lacks `preview` (for example `~/.episteme/preview.env`), so the production file cannot reach every branch build.
- **Linked project:** a real run prints the linked project name and IDs from `.vercel/project.json` before it writes anything. Stop if they are not the project from step 6.

## Step 8. Domain (L2)

- **Custom domain:** in Project → Settings → Domains, add it and create the DNS records the dashboard shows at the registrar (the lead does this).
- **`*.vercel.app` only:** nothing to do.

Then:
- Make sure `BETTER_AUTH_URL` and the S3 CORS `AllowedOrigins` hold exactly this origin. CORS: "The `Origin` header in a CORS request to your bucket must match the origins in the `AllowedOrigins` element" (R§16).
- Rerun preflight. The `CORS allows app origin` row checks it.
- **Rollback:** remove the domain. Production stays reachable on `*.vercel.app`.

## Step 9. Deploy (L5)

**Git (preferred).**
1. **Connect the repo now** (L5), in Project → Settings → Git, after step 7's variables are in place. From then on every push to the production branch is a production deploy.
2. Push a feature branch, and Vercel builds a **preview** (protected by Vercel Authentication). Previews have no Preview variables unless you push a separate preview file (step 7), so a preview build may fail env validation; that is expected and safe.
3. Run preflight once more on the exact commit to ship.
4. Until S12 lands: `push-env.ps1 -Only APP_BUILD_VERSION -BuildVersionFromGit -Force -Yes` on that commit, then **fast-forward** the production branch to it (`git merge --ff-only <branch>` on `main`, then push). A GitHub merge commit or squash creates a different SHA, so `APP_BUILD_VERSION` would name a commit production never ran, and study records would carry it.
5. Vercel builds production from that commit. The `ignoreCommand` guard cancels it (deployment state `CANCELED`) if the invite gate is not in `src/proxy.ts`.

**CLI (fallback).** Use it only after `.vercelignore` exists (S9). Otherwise the CLI uploads `.env`, and `analysis/out` (184 MB) exceeds Hobby's 100 MB upload limit (R§14).

```bash
npx vercel@60.1.3 deploy          # preview
npx vercel@60.1.3 deploy --prod   # production, after L5
```

- **Verify:**
  - the deployment shows Ready;
  - the build log shows `npm ci` and Node 24, and `npm -v` satisfies `engines.npm >=11` (the docs do not state Node 24's npm; R§14);
  - there are no build errors.
- **Rollback:**
  - `npx vercel@60.1.3 rollback`. "On the hobby plan, you can only roll back to the previous production deployment."
  - Undo a rollback with `npx vercel@60.1.3 promote <deployment-url>`. It "re-enables auto-assignment of production domains".
  - A rollback does not undo migrations. Restore the pre-migration snapshot only if the lead asks.

## Step 10. Smoke test

```bash
npx tsx scripts/deploy/smoke.ts --url https://<domain> --env-file ~/.episteme/production.env
# protected preview: SMOKE_BYPASS_SECRET=<Protection Bypass for Automation secret> npx tsx scripts/deploy/smoke.ts --url https://<preview-url>
# one real admission: SMOKE_INVITE_CODE=<code of a "Smoke test" invite, limit 1-2> npx tsx scripts/deploy/smoke.ts --url https://<domain> --use-invite
```

| Area | What it checks |
|---|---|
| Invite gate | `/`, `/explore`, `/study`, `/about`, `/learn/*` redirect to `/invite`, which loads; an invalid code is refused with no cookie. With `--use-invite`, a valid code sets an HttpOnly, Secure cookie that admits `/`. |
| Always reachable | `/sign-in` (200, frame-ancestors `'none'`, `X-Frame-Options: DENY`); `/api/auth/ok` returns `{ok:true}`; every museum texture and transcoder file, at the exact byte size from `public/museum`; the transcoder worker's own CSP. |
| Staff | `/research`, `/cms` and `/admin` redirect to `/sign-in`; the dashboard stream refuses anonymous callers with `no-store`. |
| Headers | HSTS, `nosniff`, no `x-powered-by`, CSP present; with `--env-file`, `connect-src` contains the bucket origin. |
| Telemetry | No session gets 401, cross-origin gets 403, GET gets 405. Nothing is written. |
| Browser | Headless Chromium on the GTX 1650 (`--use-angle=d3d11 ... --force_high_performance_gpu`, as in `playwright.config.ts`). The sign-in form renders and `/invite` renders, with no console errors or CSP violations, and the renderer reports NVIDIA. Nothing is submitted. |

**Manual checks**, from `vercel-deploy` section 5. None of them writes to study data except the practice sessions, which run under a test study:
- staff sign-in with a test researcher account for this environment;
- **research dashboard:** leave it open past 300 s (Hobby) and confirm it reconnects by itself, with no missing or duplicate rows;
- one practice session per condition, with no `seq_conflict`;
- one CMS upload that lands in S3 and renders at 768 px or less with its credit line;
- runtime logs with no errors (Hobby keeps 1 hour of logs; R§2);
- RDS `DatabaseConnections` well under `max_connections` (preflight prints the value).

## Step 11. Open the study: invite codes

See [Invite-only access](#invite-only-access) below. Create the cohort codes in Admin → Access and hand out the links.

## Step 12. Running costs and weekly checks

| Item | Cost | Source |
|---|---|---|
| AWS: RDS `db.t4g.micro` + 20 GB gp3 + public IPv4 + S3 | about USD 21.6/month on-demand, from credits first | `aws-resources.md` (AWS Price List API) |
| Vercel Hobby | free; includes "Provisioned Memory 360 GB-hrs", "Active CPU 4 CPU-hrs", "Fast Data Transfer First 100 GB", "Image Transformations First 5,000" | R§2 |
| Vercel Pro (if L1 = Pro) | "$20 per user / month" per developer seat, plus metered usage beyond the monthly credit | R§2, Spend Management docs |
| Not bought | Static IPs ($100/month), Password Protection ($20/month), RDS Proxy, CloudFront, Secrets Manager | R§7, R§15, `aws-provision` |

**Weekly during data collection:**
- **Vercel → Usage:** Provisioned Memory. A dashboard tab left open keeps a 2 GB instance alive; 360 GB-hrs is about 180 instance-hours a month. S2 already stops the stream while the tab is hidden. "if you exceed your usage limits on the Hobby plan, you will have to wait until 30 days have passed" (R§2).
- **RDS console:** CPUCreditBalance, FreeStorageSpace, DatabaseConnections.
- **S3:** bucket size.
- **AWS Bills page**, not the paid Cost Explorer API.

**Between studies:** snapshot, then stop RDS (`aws-provision` "Idle periods"). Never stop it while a study or the public demo should be live.

---

## Invite-only access

The site is **always invite-only**; there is no open mode. Vercel cannot provide this: Password Protection is not on Hobby, and Vercel Authentication admits only Vercel users (R§15). So the gate lives in the app (source change S11).

**Contract** (what `smoke.ts` tests; change `--invite-path` if the built gate uses another path):

| Rule | Detail |
|---|---|
| Gated | Every page and API not listed below. A visitor without the invite cookie or a staff session gets a redirect (3xx) to `/invite`. The gate sits before consent and allocation, and is identical in both study conditions. |
| Always reachable | `/invite`, `/sign-in`, `/sign-out`, `/forbidden`, `/_next/*`, `/museum/*`, `/favicon.ico`. Staff areas (`/research`, `/cms`, `/admin`) keep redirecting to `/sign-in`: staff never need a code. |
| API routes | `/api/*` is not redirected to an HTML page. `/api/auth/*` stays open (sign-in). The other API routes already refuse callers without a participant, demo or staff session (401/403), and `smoke.ts` expects exactly that. |
| Redeeming | `/?invite=<CODE>` (any URL works), or typing the code on `/invite`. A valid code sets a signed, HttpOnly, Secure, SameSite=Lax cookie and redirects to the page asked for. An invalid, expired, revoked or used-up code sets nothing and returns to `/invite`. |
| Storage and secrets | Codes, labels, usage limits, expiry, revocation and use counts live in the database (a migration). The cookie is signed with the existing `BETTER_AUTH_SECRET`, so **no new environment variable** is needed. Rotating the secret signs everyone out, including invite cookies. |
| Participants | Study links carry the participant's invite (`/study?invite=<CODE>`), so participants see no extra step. |

**Admin steps (after S11 lands):**
1. Sign in as `platform_admin` and open **Admin → Access**.
2. Create one code per audience, with a label (for example "Pilot cohort A", "Reviewers", "Smoke test"), an optional usage limit and an optional expiry.
3. Share links like `https://<domain>/?invite=<CODE>`. Never post codes publicly, and never put them in the repo or in chat.
4. Watch the use counts. Revoke a code as soon as it leaks or its cohort is done; revocation takes effect immediately for new visitors.
5. Staff accounts: Admin → Users, as before. Staff pass the gate by signing in.

**Verify after each deploy:**
- `smoke.ts` invite rows;
- by hand, in a fresh private window: no code leads to `/invite`; the invite link admits you; an expired or revoked code is refused; staff sign-in works without a code.

---

## Routine redeploy (after launch)

1. Commit, then run `npx tsx scripts/deploy/preflight.ts --env-file ~/.episteme/production.env`.
2. If the commit adds migrations: take a snapshot `pre-<sha>`, then run `with-env ... -- npm run db:migrate`.
3. Until S12 lands: `push-env.ps1 -Only APP_BUILD_VERSION -BuildVersionFromGit -Force -Yes`.
4. Fast-forward the production branch to that commit and push (Git deploy), then run `smoke.ts` from the same commit (its museum size checks read the local tree).
5. If something fails: run `vercel rollback` (step 9) and record what happened.

## Sources

Read on 2026-10-16, in addition to the quotes in RESEARCH.md:

- https://vercel.com/docs/cli/env:
  - "The `--sensitive` and `--no-sensitive` flags map to Secret and Config."
  - "The `--force` option overwrites an existing environment variable of the same target without prompting for confirmation."
  - "`vercel env add [name] [environment] < [file]` ... using a local file's content as the value."
  - "Warning: this will save the value in bash history, so this is not recommended for secrets."
- https://vercel.com/docs/project-configuration/project-settings (Ignored Build Step, updated 2026-09-21):
  - "By default, Vercel creates a new deployment and build (unless the Build Step is skipped) for every commit pushed to your connected Git repository."
  - "The command is executed within the Root Directory and can access the System Environment Variables that are available at build time."
  - "If the command exits with code `0`, the build is immediately aborted, and the deployment state is set to `CANCELED`"
  - "Canceled builds are counted as full deployments as they execute a build command in the build step."
- https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-action-role.html: "To use budget actions, you must create a service role for AWS Budgets."
- `npx vercel@60.1.3 env add --help` (read locally, 2026-10-16): "--sensitive Store the value as a Secret", "--no-sensitive Store the value as Config", "--force Overwrite an existing variable for the same target".
- https://vercel.com/docs/project-configuration/vercel-json:
  - `ignoreCommand`: "When the command exits with code 1, the build will continue. When the command exits with 0, the build is ignored."
  - `functions`: "`memory`: Memory cannot be set in `vercel.json` with Fluid compute enabled."
  - "`maxDuration` (optional): How long your Vercel Function can run on each request. Set an integer number of seconds between `1` and your plan's maximum limit. ... `"max"` is also accepted and resolves to your plan's maximum at deploy time, but not to the extended max duration beta."
  - `installCommand`: "The `installCommand` property can be used to override the Install Command in the Project Settings dashboard for a given deployment."
  - `regions`: "Hobby plans can select any single region." "Selecting a Vercel Function region does not impact static files, which are deployed to every region by default."
- https://vercel.com/docs/functions/configuring-functions/duration:
  - "If your Next.js project is configured to use src directory, you will need to prefix your function routes with `/src/` for them to be detected."
  - the Next.js App Router example keys `vercel.json` `functions` on `"app/api/**/*"`.
- https://openapi.vercel.sh/vercel.json (schema): `maxDuration` is `oneOf [{"type":"number","minimum":1,"maximum":1800},{"type":"string","enum":["max"]}]`. `vercel.json` validates against this schema (checked with ajv).
- https://vercel.com/docs/cli/rollback:
  - "On the hobby plan, you can only roll back to the previous production deployment."
  - "To undo a rollback, promote a deployment using `vercel promote` ... This promotes the specified deployment to production and re-enables auto-assignment of production domains."
- https://vercel.com/docs/spend-management:
  - "Spend Management is available on Enterprise and Pro plans."
  - "Setting a spend amount does not stop usage on its own. To stop incurring costs above your spend amount, turn on Pause Production Deployments."
  - "When visitors access your production deployment while it is paused, they will see a 503 DEPLOYMENT_PAUSED error."
  - "This check happens every few minutes."
- https://vercel.com/docs/environment-variables/system-environment-variables:
  - "`VERCEL_GIT_COMMIT_SHA` Available at: Both build and runtime. The git SHA of the commit the deployment was triggered by."
  - "If you disable this setting, no deployment ID will be made available for supported frameworks (like Next.js) to use, which means Skew Protection will also be disabled."
- https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation:
  - "Protection Bypass for Automation is available on all plans."
  - "you can authenticate using either an HTTP header or a query parameter named `x-vercel-protection-bypass` with the value of the generated secret for the project."
  - "you can set an additional header or query parameter named `x-vercel-set-bypass-cookie` with the value `true`."
- `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` (Next 16.4.0):
  - the load order is "`process.env`", "`.env.$(NODE_ENV).local`", "`.env.local`", "`.env.$(NODE_ENV)`", "`.env`";
  - "If the environment variable `NODE_ENV` is unassigned, Next.js automatically assigns `development` when running the `next dev` command, or `production` for all other commands."
