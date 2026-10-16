# Deployment Runbook: Handover to Ankit

This runbook takes Immersive Episteme from "code on `main`" (the deploy kit, the production data path and the concept verification runner, all merged) to "live, invite-only, with the first staff account, the public demo museum and invite codes". It is written for Ankit, who deploys. Read it once end to end before starting.

**How to read the sources.** Every vendor fact below keeps its URL and a verbatim quote, copied from the research notes that read the vendor pages on 2026-10-16 (`docs/deploy/RESEARCH.md`: sections 1 to 17, cited as R§n, and its Neon and Cloudflare R2 addendum, cited as N§n). At the merge (DR-061) every quote was matched mechanically: the Neon, Cloudflare, Vercel and AWS quotes against the pages (saved copies or the live page), the code and repository quotes against the repository. Three were corrected to the page text (Neon pricing, AWS Free Tier FAQ, Vercel Spend Management). Anything marked **Not verified** was not checked against the live service. Console click paths (menu and button names) come from the vendor docs and the research notes, **not from a live walk-through**, so a label may differ slightly on screen.

**Ground rules that apply everywhere.**
- Nothing is created, pushed or deployed until the project lead (Saurav) says so. Accounts are created by the account owner, not by a script.
- Never paste a secret into chat, a ticket, a commit or a document. Secrets live in one file outside the repository (step 3.1) and in Vercel as Secret variables.
- Signing in to a CLI is interactive: type it yourself (in Claude Code, prefix it with `!`).
- All commands run from the repository root, on the commit being deployed, with Node 24 on the PATH (`package.json` `engines.node` is `"24.x"`).

---

## 0. Data Location Decision (Make This First)

> **Where will participant data be stored?**
>
> | | Option A: AWS | Option B: Neon + Cloudflare R2 |
> |---|---|---|
> | Database | Amazon RDS, `ap-south-1` **Mumbai, India** | Neon, **AWS Asia Pacific (Singapore), `aws-ap-southeast-1`** |
> | Media | Amazon S3, `ap-south-1` Mumbai | Cloudflare R2, location "auto" |
> | App functions (Vercel) | `bom1` (Mumbai) | `sin1` (Singapore) |
>
> - **Neon has no region in India.** https://neon.com/docs/introduction/regions lists AWS regions only; the nearest to India is "AWS Asia Pacific (Singapore) — `aws-ap-southeast-1`". (N§3)
> - **The Neon region cannot be changed later:** "**You cannot change the region**" after the project is created (same page, N§3). Moving later means a new project and a dump-and-restore.
> - **What decides it:** the CXA/ETH/01 ethics protocol and the consent and information text. Neither is in the repository. The consent text and participant information sheet are **entered per study in the research console** and stored in the database (`src/features/study/contracts.ts:190-192`: "Versioned consent text, shown verbatim; its sha256 is stored with the decision." ... "Participant information sheet shown before consent."). A repository review found **no text that promises storage in India**, on AWS or on IIT servers (N§9), and data location is still listed as an open ethics question (`docs/research/requirements-digest.md:363`, Q-R11).
> - **Action before any real participant data:** the PI (Prof. Patnaik) or the lead reads the CXA/ETH/01 application and the consent text the team will enter. If either promises storage in India, use **Option A** (or amend the protocol). If not, either option is acceptable.
> - **Recorded so far:** DR-055 records Neon + R2 (Option B) as the lead's default and leaves the provider to the deployer (Ankit), subject to this ethics check: "let him [Ankit] choose, he might choose AWS". The deploy kit detects either option from the env file (`scripts/deploy/lib/topology.ts`); the only per-option change is the `vercel.json` region, set in step 1.1 from what preflight prints.
>
> Decision: ☐ Option A (AWS)  ☐ Option B (Neon + R2)   Checked against CXA/ETH/01 by: ________  Date: ________

---

## 1. Choose Option A or Option B

| | **Option A: AWS RDS + S3** | **Option B: Neon + Cloudflare R2** |
|---|---|---|
| Data in India | Yes (Mumbai) | No (Singapore) |
| Monthly cost | **about USD 21.6** on-demand, paid from the AWS account's credits first (USD 44.66 when checked, about two months), then billed to the account's card | **USD 0** on the free tiers |
| Backups | RDS automated backups, 7 days, plus manual snapshots | **No real backups on Neon Free.** You run `pg_dump` on a schedule (step 8.2) |
| Accounts needed | Vercel; the IIT AWS account (owner `cxa.craftecosystem@gmail.com`, ID `626159998512`) | Vercel; Neon; Cloudflare |
| Effort | More setup (budget, parameter group, IAM, CA bundle) | Less setup |
| Kit status | Ready; set `vercel.json` to `bom1` (step 1.1) | Ready; `vercel.json` already `sin1` (step 1.1) |

### 1.1 Set the Function Region From Preflight

Preflight reads the database host in the env file and prints the one Vercel region the functions must run in (`scripts/deploy/lib/topology.ts`, `FUNCTION_REGION_FOR`): **`sin1`** for Neon Singapore (`aws-ap-southeast-1`), **`bom1`** for RDS Mumbai (`ap-south-1`). Nothing else in the source depends on the option.

1. Fill the env file (step 3.1) and run preflight (step 4.1):
   ```bash
   npx tsx scripts/deploy/preflight.ts --env-file ~/.episteme/production.env
   ```
2. Read the line `[preflight] this setup needs vercel.json "regions": ["<region>"]`.
3. Set `vercel.json` to exactly that one value, `"regions": ["sin1"]` or `"regions": ["bom1"]` (the file has `["sin1"]` today, so Option B needs no change).
4. Commit it (`git commit -m "Function region <region> for the <Neon|RDS> database" vercel.json`), so the deployed commit and the `APP_BUILD_VERSION` SHA carry the region. Rerun preflight: the row `vercel.json regions = ["<region>"]` must PASS.

If the line is missing, preflight could not derive a region (a database host that is neither `*.neon.tech` nor `*.rds.amazonaws.com`, or an AWS region with no entry in `FUNCTION_REGION_FOR`): stop and tell the lead. Without the right region every database round trip crosses between Singapore and Mumbai.

### 1.2 Cost and Plan Facts

**Option A (AWS).** From `docs/deploy/aws-resources.md` (AWS Price List API, `ap-south-1`, not a verbatim page quote):

| Item | Price | Per month (730 h) |
|---|---|---|
| RDS `db.t4g.micro`, PostgreSQL, Single-AZ | USD 0.021 per instance-hour | USD 15.33 |
| RDS gp3 storage, 20 GB | USD 0.131 per GB-month | USD 2.62 |
| Public IPv4 address (publicly accessible RDS) | USD 0.005 per hour | USD 3.65 |
| S3 Standard (a few MB of media) | USD 0.025 per GB-month | under USD 0.01 |
| **Total** | | **about USD 21.6** |

The account is on a Paid plan (checked: `accountPlanType: PAID`). AWS Free plan wording, for reference (https://aws.amazon.com/free/free-tier-faqs/): "Once your credits are exhausted, you will need to upgrade to a Paid plan to continue using your account and associated services."

**Option B (Neon Free).** https://neon.com/pricing, Free column: "$0 /month"; Instant restore storage "Free with limited window/size"; History window "Up to 6 hours or 1 GB of data changes"; Snapshots "1 snapshot"; Scheduled Backups: no entry for Free (Launch: "Daily/Weekly/Monthly"). https://neon.com/docs/introduction/plans: "1 GB/project, 20 GB account total"; "100 CU-hours/project/month (enough to run a 0.25 CU compute in a project for 400 hours/month)"; "Branch creation fails once you reach 10 branches per project."; egress "5 GB per project included". https://neon.com/docs/introduction/scale-to-zero: "Scale to zero is always enabled (computes suspend after 5 minutes of inactivity) and can't be disabled." A suspended compute "reactivates automatically within a few hundred milliseconds". (N§1)

**Option B (Cloudflare R2 free tier).** https://developers.cloudflare.com/r2/pricing/: storage "10 GB-month / month"; Class A "1 million requests / month"; Class B "10 million requests / month"; egress "Free"; "The free tier only applies to Standard storage". **Not verified:** whether Cloudflare asks for a payment method to enable R2 (the page does not say). (N§7)

**Both options (Vercel).** Hobby is free, but https://vercel.com/docs/limits/fair-use-guidelines: "**Hobby teams** are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan." Commercial use includes "a paid employee or consultant writing the code". Pro: "Developer seats cost **$20 per user / month**" (https://vercel.com/docs/plans/hobby). (R§2) **The lead decides Hobby or Pro.** If unsure, Vercel says: "If you are unsure whether or not your site would be defined as commercial usage, please [contact the Vercel Support team]."

---

## 2. Signup and Setup

### 2.0 Both Options: Vercel Account and CLI

1. The account owner signs up at https://vercel.com (Hobby, or Pro if the lead chose it).
2. On the deploying machine: `npx vercel@60.1.3 login` (interactive; the kit pins this CLI version everywhere).
3. **Do not** add Neon or any other Marketplace integration in Vercel. The Neon integration writes its own `DATABASE_URL` (the owner role) and creates a Neon branch per preview deployment: "Preview branching creates an isolated Neon branch (copy-on-write) for every Vercel Preview Deployment" (Neon's Vercel integration guide, reached from https://vercel.com/marketplace/neon; the notes do not record the exact page URL), and branches count toward the Free limit of 10 (inference). This kit sets the variables itself for the `episteme_app` role.

### 2.A Option A: AWS RDS + S3

Use the `aws-provision` skill in Claude Code (`.claude/skills/aws-provision/SKILL.md`) if you can: it runs the commands below with `--profile cxa`, checks the account ID first, and asks for a yes per resource. The console route, step by step:

**A1. Sign in and check the account.**
1. Sign in to https://console.aws.amazon.com as an IAM Identity Center (SSO) admin with MFA. Never use the root user for this work, never create root access keys.
2. Top right: account menu → check the account ID is **626159998512** and the region selector says **Asia Pacific (Mumbai) ap-south-1**. If either differs, stop. (The lead also has a separate work AWS account; never use it.)
3. CLI, if you use it: `aws login --profile cxa`, then `aws sts get-caller-identity --profile cxa` must print `626159998512`. Pass `--profile cxa` on every command.

**A2. Budget (before any resource).** Billing and Cost Management → Budgets → Create budget → Cost budget, monthly, **USD 5**, alerts at 20 %, 80 % and 100 % actual and 100 % forecast, to `cxa.craftecosystem@gmail.com`. A budget by itself only sends email. The skill can also attach an uploads-only deny policy as a budget action, which needs a second IAM role: "To use budget actions, you must create a service role for AWS Budgets." (https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-action-role.html). The lead chooses alerts only, or alerts plus the action.

**A3. Check PostgreSQL 18 is offered.** `aws rds describe-db-engine-versions --engine postgres --query "DBEngineVersions[?starts_with(EngineVersion,'18')].EngineVersion" --output text --profile cxa --region ap-south-1`. If no 18.x exists, stop and tell the lead: the migrations check for PostgreSQL 18 (`EXPECTED_DB` in `scripts/db/_shared.ts`).

**A4. RDS parameter group.** RDS → Parameter groups → Create: family `postgres18`, name `immersive-episteme-pg18`. Edit it: `rds.force_ssl` = `1`. ("The `rds.force_ssl` parameter default value is 1 (on) for RDS for PostgreSQL version 15 and later", https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html, R§8; set it explicitly anyway.)

**A5. RDS instance.** RDS → Databases → Create database → Standard create → PostgreSQL, version 18.x:

| Setting | Value |
|---|---|
| Identifier | `immersive-episteme-db` |
| Class | `db.t4g.micro` |
| Storage | gp3, 20 GB, storage autoscaling **off** |
| Multi-AZ | off (Single-AZ) |
| Master password | generated locally (`openssl rand -base64 36`), kept in the owner's password manager; not Secrets Manager |
| Public access | **Yes** (Vercel has no fixed IPs: "there's no published IP range to add to an allowlist", https://vercel.com/kb/guide/can-i-get-a-fixed-ip-address, R§7) |
| Security group | new, inbound TCP 5432 only |
| Parameter group | `immersive-episteme-pg18` |
| Backups | 7 days |
| Encryption | on (default KMS key) |
| Performance Insights, Enhanced Monitoring | off |
| Deletion protection | **on** |

Create it **shortly before the pilot**, not months ahead: it costs money every hour it exists.

**A6. App role, database, extensions.** When the instance is `available`, connect with `psql` over TLS as the master user and run (password: 64 hex characters, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, so nothing needs URL-encoding):

```sql
CREATE ROLE episteme_app LOGIN PASSWORD '<generated>';
CREATE DATABASE episteme OWNER episteme_app;
\c episteme
CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**A7. RDS CA bundle** (public file, 4,580 bytes when measured; R§8):

```bash
mkdir -p ~/.episteme
curl -fsSo ~/.episteme/ap-south-1-bundle.pem https://truststore.pki.rds.amazonaws.com/ap-south-1/ap-south-1-bundle.pem
```

Why: "If your connection parameters specify `sslmode=verify-ca` or `sslmode=verify-full`, then your client requires the RDS CA certificates to be in their trust store or referenced in the connection URL." (https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html). The global bundle (174,560 bytes) would not fit Vercel's env limit: "a total of **64 KB** in Environment Variables **per-Deployment**" (https://vercel.com/docs/environment-variables, R§5).

**A8. S3 bucket.** S3 → Create bucket → `immersive-episteme-media-626159998512`, region ap-south-1:
- Block Public Access: all four on; Object Ownership: bucket owner enforced; SSE-S3; versioning on.
- Permissions → Bucket policy: deny non-TLS (`"Condition":{"Bool":{"aws:SecureTransport":"false"}}`).
- Management → Lifecycle: expire non-current versions after 30 days; abort incomplete multipart uploads after 1 day.
- Permissions → CORS (once the production domain is known):
  ```json
  [{"AllowedOrigins":["https://<production-domain>"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3000}]
  ```
  "The `Origin` header in a CORS request to your bucket must match the origins in the `AllowedOrigins` element in your CORS configuration." (https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html, R§16)

**A9. IAM: key-only user for the bucket.** IAM → Policies → Create `ImmersiveEpistemeMedia`:

```json
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::<bucket>/*"},
 {"Effect":"Allow","Action":["s3:ListBucket"],"Resource":"arn:aws:s3:::<bucket>"}]}
```

IAM → Users → Create `immersive-episteme-media` (no console access) → attach only that policy → Security credentials → Create access key. The key pair is shown once: put it straight into the env file (step 3.1). Rotate it every 90 days. OIDC (no stored key) is **not supported by this build yet**: `storage.ts` refuses `AWS_ROLE_ARN` alone ("AWS_ROLE_ARN is set, but OIDC credentials are not supported by this build yet.").

Vercel's own `AWS_*` values are not usable: "These values do not grant any AWS permissions and are not usable as AWS credentials." (https://vercel.com/docs/environment-variables/reserved-environment-variables, R§9)

**A10. Record** names and ARNs (never secrets) in `docs/deploy/aws-resources.md` under "Resources".

### 2.B Option B: Neon + Cloudflare R2

**B1. Neon account and project.**
1. Sign up at **https://neon.com** directly (not through Vercel).
2. Create project:
   - **Region: AWS Asia Pacific (Singapore), `aws-ap-southeast-1`.** It cannot be changed later (section 0).
   - **PostgreSQL 18.** (Neon PG18 ships pgvector 0.8.6; the code accepts 0.8.6 and 0.8.7.)
   - Database name `episteme` (or create it in B2).
3. Neon's Free plan support is "Community" (https://neon.com/pricing).

**B2. App role, database, extensions.** Neon console → **SQL Editor**, as the owner role `neondb_owner`. Generate the password locally (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`); paste it only into the SQL Editor and the env file.

```sql
CREATE ROLE episteme_app LOGIN PASSWORD '<generated>';
CREATE DATABASE episteme OWNER episteme_app;   -- if it already exists: ALTER DATABASE episteme OWNER TO episteme_app;
-- switch the SQL Editor's database to "episteme", still as neondb_owner:
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**Not verified:** whether `neondb_owner` may run `CREATE EXTENSION` in a database owned by `episteme_app` (N§4). If refused: connect as `episteme_app`, run `GRANT CREATE ON DATABASE episteme TO neondb_owner;`, retry. Neon roles are not superusers: "you can't connect using the Postgres `superuser` account like you can in a standalone Postgres installation." (https://neon.com/docs/manage/roles)

**B3. Connection strings.** Neon console → **Connect** → role `episteme_app`, database `episteme`. Copy both:
- **pooled** ("Connection pooling" on; host contains `-pooler`) → `DATABASE_URL`;
- **direct** (pooling off; same host without `-pooler`) → `DATABASE_URL_UNPOOLED`.

In both: put the generated password in, end with `?sslmode=verify-full`, and delete `&channel_binding=require` (node-postgres ignores it). Why two URLs: Neon's pooler is "PgBouncer in transaction mode (`pool_mode=transaction`)", and "Not supported with pooled connections" includes "`LISTEN` / `NOTIFY`"; for migrations: "| Schema migrations | Direct | Tools may not support transaction pooling |" (https://neon.com/docs/connect/connection-pooling, N§2). No CA file is needed: "Neon uses the public ISRG Root X1 certificate issued by Let's Encrypt ... Typically, you do not need to download this file directly, as it is usually available in a root store on your operating system." (https://neon.com/docs/connect/connect-securely, N§5)

**B4. Cloudflare R2 bucket.**
1. Sign up at **https://dash.cloudflare.com** → **R2**.
2. **Create bucket** `immersive-episteme-media`, location automatic, public access **off**: "By default, buckets are never publicly accessible and will always require explicit user permission to enable." (https://developers.cloudflare.com/r2/buckets/public-buckets/)
3. **Manage R2 API Tokens → Create**: permission **Object Read & Write**, **this bucket only**. Copy the **Access Key ID** and **Secret Access Key** straight into the env file (shown once). Note the **account ID**: the endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` ("The API is available via the `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` endpoint.", https://developers.cloudflare.com/r2/api/s3/api/).
4. Bucket → **Settings → CORS**, once the production domain is known: "you still need to configure CORS when making requests from a browser" (https://developers.cloudflare.com/r2/buckets/cors/).
   ```json
   [{ "AllowedOrigins": ["https://<production-domain>"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type", "x-amz-checksum-sha256"], "MaxAgeSeconds": 3600 }]
   ```

**Not verified (R2):** whether R2 accepts the signed `x-amz-checksum-sha256` header on a presigned single PUT. R2's S3 table lists SHA-256 only as a composite checksum ("| SHA-256 (`SHA256`) | ❌ | ✅ |" under `FULL_OBJECT` | `COMPOSITE`). The app therefore hashes the stored object on the server when R2 returns no SHA-256. Step 4.5 tests one real upload.

---

## 3. Environment Variables

### 3.1 The Env File

```bash
mkdir -p ~/.episteme
cp .env.production.example ~/.episteme/production.env
```

Fill it **outside the repository**. Never save it as `.env.production` or `.env.production.local` in the repo root: Next.js loads those files by itself, so a local build would talk to production. Never commit it.

There is **no separate invite-gate secret**: the invite cookie is an HMAC token signed with `BETTER_AUTH_SECRET` (`src/server/access/invite-cookie.ts`, purpose `site-invite/v1`), and the codes live hashed in the database. Rotating `BETTER_AUTH_SECRET` signs out every staff, participant and invite cookie.

### 3.2 Option A Table (AWS)

| Name | Where the value comes from | Secret? |
|---|---|---|
| `DATABASE_URL` | `postgresql://episteme_app:<hex password>@<RDS endpoint>:5432/episteme?sslmode=verify-full` (A5, A6) | **Secret** |
| `DATABASE_URL_UNPOOLED` | **leave empty**: RDS has no pooler; preflight reports "DATABASE_URL is a direct host" | (Secret if set) |
| `DATABASE_CA_PEM` | contents of `~/.episteme/ap-south-1-bundle.pem` (A7), in double quotes; required for `.rds.amazonaws.com` hosts | Config |
| `DB_POOL_MAX` | `3` | Config |
| `BETTER_AUTH_SECRET` | new: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`; never the local one. **Also signs the invite cookie** | **Secret** |
| `BETTER_AUTH_URL` | `https://<production domain>`, origin only | Config |
| `AUTH_CLIENT_IP_HEADER` | `x-forwarded-for` | Config |
| `APP_BUILD_VERSION` | git short SHA; filled by `push-env.ps1 -BuildVersionFromGit` | Config |
| `PUBLIC_DEMO` | `auto` ("/explore is off while any real study is active") | Config |
| `MEDIA_S3_BUCKET` | `immersive-episteme-media-626159998512` (A8) | Config |
| `MEDIA_S3_REGION` | `ap-south-1` | Config |
| `MEDIA_S3_ENDPOINT` | **leave empty** (AWS S3) | Config |
| `MEDIA_S3_FORCE_PATH_STYLE` | **leave empty** (AWS S3) | Config |
| `MEDIA_S3_ACCESS_KEY_ID` | IAM user `immersive-episteme-media` access key (A9) | **Secret** |
| `MEDIA_S3_SECRET_ACCESS_KEY` | same key's secret (A9) | **Secret** |

### 3.3 Option B Table (Neon + R2)

| Name | Where the value comes from | Secret? |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** string, host `ep-…-pooler.ap-southeast-1.aws.neon.tech`, role `episteme_app`, `?sslmode=verify-full` (B3) | **Secret** |
| `DATABASE_URL_UNPOOLED` | Neon **direct** string, same host **without** `-pooler`, same role and database (B3). Required when `DATABASE_URL` is pooled: the dashboard's LISTEN and the migrations use it | **Secret** |
| `DATABASE_CA_PEM` | **leave empty** (Neon's chain is in Node's default store) | Config |
| `DB_POOL_MAX` | `3` | Config |
| `BETTER_AUTH_SECRET` | as in Option A. **Also signs the invite cookie** | **Secret** |
| `BETTER_AUTH_URL` | `https://<production domain>` | Config |
| `AUTH_CLIENT_IP_HEADER` | `x-forwarded-for` | Config |
| `APP_BUILD_VERSION` | git short SHA; `push-env.ps1 -BuildVersionFromGit` | Config |
| `PUBLIC_DEMO` | `auto` | Config |
| `MEDIA_S3_BUCKET` | `immersive-episteme-media` (B4) | Config |
| `MEDIA_S3_REGION` | `auto` ("the region for an R2 bucket is `auto`", https://developers.cloudflare.com/r2/api/s3/api/) | Config |
| `MEDIA_S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (B4) | Config |
| `MEDIA_S3_FORCE_PATH_STYLE` | `true` | Config |
| `MEDIA_S3_ACCESS_KEY_ID` | R2 API token Access Key ID (B4) | **Secret** |
| `MEDIA_S3_SECRET_ACCESS_KEY` | R2 API token Secret Access Key (B4) | **Secret** |

### 3.4 Never Set These on Vercel

Preflight and `push-env.ps1` refuse them: `NODE_ENV`, `TEST_DATABASE_URL`, `AUTH_TRUSTED_PROXIES`, `MEDIA_LOCAL_DIR`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, any `VERCEL_*` name, `ADMIN_PASSWORD`. Why `x-forwarded-for` is safe: Vercel says "we currently overwrite the [`X-Forwarded-For`] header and **do not forward external IPs**" (https://vercel.com/docs/headers/request-headers, R§11).

---

## 4. Link, Push Env, Preflight, Deploy, Smoke

### 4.1 Preflight

```bash
npx tsx scripts/deploy/preflight.ts --env-file ~/.episteme/production.env
```

- Must end in `OVERALL PASS`, with one exception: before the first migration (5.1) the `migrations current` row FAILs and the run ends `OVERALL FAIL` for that row alone; that is expected here. Every other row must PASS, above all **`server + extensions`** (PostgreSQL 18; vector 0.8.6 or 0.8.7; pg_trgm 1.6; pgcrypto 1.4) and `role not superuser`.
- Option A also shows `DATABASE_CA_PEM parses` and `rds.force_ssl = 1`; Option B shows `direct URL matches DATABASE_URL` and `DATABASE_CA_PEM not needed`.
- It also checks the invite gate is in the source, the bucket keys can `HeadBucket`, an anonymous listing is refused, and CORS admits the production origin.

### 4.2 Link the Vercel Project and Check the Region

With the lead's go-ahead:

```bash
npx vercel@60.1.3 link     # create or link "immersive-episteme"; decline connecting Git for now
```

In the Vercel dashboard → Project → Settings, check:
- Framework Next.js; Build and Install come from `vercel.json` (`npm ci`; build runs the invite-gate check first).
- Node.js 24.x.
- **Function region:** the value preflight printed and you committed in step 1.1 (`sin1` for Option B, `bom1` for Option A; Vercel reads it from `vercel.json`). Default otherwise is Washington: "By default, Vercel Functions execute in *Washington, D.C., USA* (`iad1`) **for all new projects**"; Hobby gets "| Hobby | Single region |" (https://vercel.com/docs/functions/configuring-functions/region). Region codes: "| sin1 | ap-southeast-1 | Singapore |" and "| bom1 | ap-south-1 | Mumbai, India |" (https://vercel.com/docs/regions).
- Fluid compute on; memory default; Deployment Protection **Standard Protection** ("Protects all deployments **except** production domains", https://vercel.com/docs/deployment-protection; production relies on the app's invite gate); System Environment Variables on.
- Pro only: Settings → Billing → Spend Management. "Setting a spend amount does not stop usage on its own. To stop incurring costs above your spend amount, turn on Pause Production Deployments so Vercel pauses your projects when the amount is reached." Pausing shows visitors "a 503 DEPLOYMENT_PAUSED error" (https://vercel.com/docs/spend-management), so the lead chooses.
- Do not buy add-ons (Static IPs, Password Protection, Secure Compute).

### 4.3 Push the Env Variables

```powershell
powershell -File scripts\deploy\push-env.ps1 -EnvFile $HOME\.episteme\production.env -BuildVersionFromGit -DryRun
powershell -File scripts\deploy\push-env.ps1 -EnvFile $HOME\.episteme\production.env -BuildVersionFromGit -Yes   # after the lead's go-ahead
```

- The dry run prints names, types and sizes, never values. The real run sends each value over stdin as Secret or Config (`--sensitive` / `--no-sensitive`).
- It prints the linked project before writing: stop if it is not `immersive-episteme`.
- Verify: `npx vercel@60.1.3 env ls production`. Secret values "are write-only after saving" (https://vercel.com/docs/environment-variables/sensitive-environment-variables), so check values with preflight, not `env pull`.
- Every env change needs a new deployment: "they only apply to new deployments" (https://vercel.com/docs/environment-variables). This includes the `MEDIA_S3_*` values: the CSP is computed at build time.
- One variable later: `-Only NAME -Force -Yes`.

### 4.4 Deploy

**First deploy: run steps 5.1 to 5.3 (migrations, reference data, public demo museum) now, before this step.** The preflight below must PASS, and its `migrations current` row FAILs until 5.1 has run; the live site must also never serve an empty schema, telemetry needs its event types, and `/explore` needs a museum.

```bash
npx tsx scripts/deploy/preflight.ts --env-file ~/.episteme/production.env   # must PASS, incl. "S11 invite-only gate"
git status --porcelain                                                      # must be empty: the CLI uploads the working tree
npx vercel@60.1.3 deploy          # preview first
npx vercel@60.1.3 deploy --prod   # production, after the lead's go-ahead
```

- The build log must show `[invite-gate] in place`, `npm ci` and Node 24. Without the gate the production build stops with `Production build REFUSED`.
- `.vercelignore` keeps `.env` and bulky output out of the CLI upload ("When using the CLI to deploy, the maximum size of the source files that can be uploaded is limited to 100 MB for Hobby", https://vercel.com/docs/limits).
- `APP_BUILD_VERSION` must be the SHA of exactly the commit you deploy; with a CLI deploy there is no Git SHA, so `-BuildVersionFromGit` sets it. After any new commit: `push-env.ps1 -Only APP_BUILD_VERSION -BuildVersionFromGit -Force -Yes`, then deploy.

### 4.5 Smoke Test

```bash
npx tsx scripts/deploy/smoke.ts --url https://<domain> --env-file ~/.episteme/production.env
```

- **`--no-gpu` on any machine without the lead's set-up.** By default the browser rows launch Playwright's *full* Chromium (`channel: "chromium"`) with `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist --force_high_performance_gpu`, the same launch as the `chromium` project of `playwright.config.ts` (DR-056). That is tuned for the lead's laptop (Windows, NVIDIA GTX 1650, full Chromium installed by Playwright). On any other machine, or if the `browser / launch` row FAILs, rerun with `--no-gpu`: it launches Playwright's default headless Chromium with no GPU arguments (software rendering), and the browser checks (sign-in form renders, no console or CSP errors) run the same way. The rows check page behaviour, not 3D performance, so a `--no-gpu` PASS is a full PASS. The browser comes from the pinned `@playwright/test` (1.64.0); if none is installed, `npx playwright install chromium` once, or use `--no-browser` to skip the browser rows (the HTTP rows still run).
  ```bash
  npx tsx scripts/deploy/smoke.ts --url https://<domain> --env-file ~/.episteme/production.env --no-gpu
  ```
- `--use-invite` with `SMOKE_INVITE_CODE=<code of a "Smoke test" invite, limit 1-2>` redeems one real invite (after step 6).

**By hand (first deploy):**
- staff sign-in with a test researcher account;
- **Option B only, must check:** open the research dashboard, record one practice answer in a test study, confirm the dashboard updates within seconds. **Not verified until then:** that `pg_notify` sent through the pooled connection reaches the LISTEN on the direct connection (N§2). Leave the dashboard open past 300 s and confirm it reconnects (Hobby: "300s (5 minutes)" maximum, https://vercel.com/docs/plans/hobby);
- one practice session per condition, no `seq_conflict`;
- one CMS upload that finalizes (no `checksum_mismatch`) and renders at 768 px or less with its credit line. On R2, if the browser's PUT is refused, stop and record it: the presign then needs a change for R2;
- runtime logs clean (Hobby keeps "1 hour of logs").

---

## 5. Production Data: Migrations, Reference Data, Public Demo Museum

Run from your machine, never from the Vercel build, in this order. Every command goes through `with-env`, which loads the production env file, connects the database scripts to `DATABASE_URL_UNPOOLED` when set (Neon direct), else `DATABASE_URL`, and passes `DATABASE_CA_PEM` as `NODE_EXTRA_CA_CERTS` for RDS. When the env file has no `DATABASE_URL_UNPOOLED` (Option A), `with-env` drops any value of it left in your shell and refuses to run if the repo `.env` sets one, so a stale direct URL can never redirect a command. `with-env` still **refuses** `db:seed` (it loads the demo dataset), `db:reset`, `dev:bootstrap`, anything with `--test`, and `drizzle-kit push|drop` (`scripts/deploy/lib/command-guard.ts`). You never need any of them in production.

| Step | Command (after `with-env --env-file ~/.episteme/production.env --`) | Writes |
|---|---|---|
| 5.1 | `npm run db:migrate` | the schema |
| 5.2 | `npm run db:seed:reference` | vocabulary only |
| 5.3 | `npm run content:bootstrap:remote -- --i-understand-this-is-remote` | content, review snapshot, manifests, demo study |
| 5.4 | section 7 | verification and photos |

All three commands are idempotent: rerun one after a failure or a timeout.

### 5.1 Migrations

```bash
npx tsx scripts/deploy/with-env.ts --env-file ~/.episteme/production.env -- npm run db:migrate
```

Then rerun preflight: `migrations current` must PASS. Migrations are forward-only.

### 5.2 Reference Data (`db:seed:reference`)

```bash
npx tsx scripts/deploy/with-env.ts --env-file ~/.episteme/production.env -- npm run db:seed:reference
```

No migration inserts reference data, and `telemetry_events.event_type_code` has a foreign key to `event_types`, so **without this step every telemetry write fails**. It loads only (`scripts/db/seed-reference.ts`):
- knowledge categories, relationship types and telemetry event types (`db/seeds/reference.ts`, upserts);
- the questionnaire instrument definitions (`src/server/study/instruments.ts`; real, source-cited instruments, not demo data; inserted only when missing, so a definition the researchers have since locked or edited is never touched).

It never loads the demo dataset, users, participants, studies or content. Expected output on a fresh database:

```
[db:seed:reference] main database postgresql://episteme_app:***@<host>/episteme?sslmode=verify-full
[db:seed:reference] reference (knowledge categories, relationship types, event types) ok
[db:seed:reference] instruments ok: inserted cognitive-load@2, mps-physical-presence@1, sus@2, ssq@2, umux-lite@2
[db:seed:reference]   knowledge_categories                 14
[db:seed:reference]   relationship_types                   15
[db:seed:reference]   event_types                          34
[db:seed:reference]   assessments (instruments, not demo)  5
```

**Check the host** in the first line. A second run prints `instruments ok: none new` and changes no row (tested on a throwaway local database: every table identical, row by row). Run it again after any deploy that adds event types or relationship types.

### 5.3 Public Demo Museum (`content:bootstrap:remote`)

```bash
npx tsx scripts/deploy/with-env.ts --env-file ~/.episteme/production.env -- npm run content:bootstrap:remote -- --i-understand-this-is-remote
```

This builds what `/explore` and the professor's review of the deployed site show, with the same code as the local `npm run dev:bootstrap` (`scripts/content/public-demo.ts`):
1. imports `content/` (concepts, claims, relationships, sources, media candidates; state `under_review`);
2. builds the **review** snapshot (draft, never publishable);
3. compiles the spatial manifests: the three shortlisted traditions together, and each alone;
4. creates the demo study `demo-review-walkthrough` (`is_demo`, non-experimental, draft) pinned to that snapshot and the combined manifest. `/explore` and the staff preview read the newest review snapshot and the demo study pinned to it (`findPreviewContent` in `src/server/learning/context-data.ts`).

Unlike `dev:bootstrap` it **never** migrates (or touches a test database), never loads the demo seed, never creates staff, test or demo users or passwords, and never creates participants.

Guards (`scripts/content/remote-guard.ts`):
- It first prints the target: `target host <host>, database <db> (REMOTE)`. The host is the one node-postgres connects to (a `host=` query parameter in the URL overrides the host name, and the guard follows it). Without `--i-understand-this-is-remote` it stops there (exit 2). **Read the host before adding the flag.**
- It refuses to start when migrations are pending (do 5.1) or reference data is missing (do 5.2).
- Any other argument is refused, including `--test`.

Expected output (counts from the throwaway-database test on 2026-10-16 with today's `content/`; yours change with the content):

```
[content:bootstrap:remote] target host <host>, database episteme (REMOTE); confirmed by --i-understand-this-is-remote
[content:bootstrap:remote] schema current (21 migrations), reference data present
[content:bootstrap:remote] content import: concepts +442 ~0 =0; relationships +715 ~0 =0; sources +112 =0; media +26 =0
[content:bootstrap:remote] review snapshot created: ... items 2560
[content:bootstrap:remote] manifest [ajrakh+machilipatnam-kalamkari+sanganeri] created: ... status valid ... (457 elements)
[content:bootstrap:remote] manifest [ajrakh] created: ... (199 elements)
[content:bootstrap:remote] manifest [sanganeri] created: ... (183 elements)
[content:bootstrap:remote] manifest [machilipatnam-kalamkari] created: ... (183 elements)
[content:bootstrap:remote] demo study demo-review-walkthrough created: ...
```

followed by row counts (`studies 1 (real 0, demo 1)`, `content_snapshots 1 (real 1, demo 0)`, `spatial_manifests 4`). Every manifest must say `status valid`.

**A second run changes nothing:** it prints `+0 ~0`, `unchanged` for the snapshot, every manifest and the demo study. The importer's own bookkeeping still records each run (one `audit_log` row and `content_packages.imported_at`); no content, snapshot, manifest or study row changes. The local `dev:bootstrap` and this command produce the same snapshot label and identical manifest hashes from the same `content/`.

Rerun it after `content/` changes or after verification (section 7): verified states are kept (the importer keeps a curator's decision over the file, knowledge-04), and when the database content changed it stores a new review snapshot and manifests and repoints the demo study.

**Not verified until the first deploy:** that `/explore` on the live site shows the museum (the commands were tested against a local database only; no server was started).

### 5.4 Content Verification and Photos

These live **only in the database** (section 7). They need staff accounts, so do them after the first staff account (6.1) and the curator accounts exist.

---

## 6. First Staff Account and Invite Codes

### 6.1 First Staff Account (Platform Admin)

```bash
read -s ADMIN_PASSWORD && export ADMIN_PASSWORD      # at least 12 characters; never in the env file
npx tsx scripts/deploy/with-env.ts --env-file ~/.episteme/production.env -- npx tsx scripts/create-admin.ts --email <lead's email> --name "<name>"
unset ADMIN_PASSWORD
```

The role defaults to `platform_admin`. The script is idempotent: an existing account keeps its password and gains the role. Further staff (researchers, curators): sign in as the admin → **Admin → Users**.

### 6.2 Invite Codes in Admin → Access

The site is **always invite-only**. Until a code exists, only signed-in staff can open it.

1. Sign in as the platform admin → **Admin → Access**.
2. **Create an invite code**: a label (up to 120 characters, for example "Pilot cohort A", "Reviewers", "Smoke test"), an optional use limit, an optional last day (valid to the end of that day, UTC), and an optional study.
3. The code is **shown once** with its links; only a hash is stored. Copy it now. If it is lost, revoke it and create another.
4. Share links privately. Never post a code publicly, in the repository, in a document or in chat.
5. Watch the use counts in the table (status Active, Expired, Used up or Revoked). Revoke a code when it leaks or its cohort is done.

### 6.3 How Links Carry the Invite

| Link | Shape | Use |
|---|---|---|
| Site link | `https://<domain>/?invite=<CODE>` | reviewers, guests |
| Participant link (when a study was chosen) | `https://<domain>/study?code=<study-slug>&invite=<CODE>` | participants: one link opens the study with the invite included, so they see no extra step |

What happens (`src/proxy.ts`): any gated URL with `?invite=<code>` goes to `/invite/redeem`, which checks the code, sets a signed, HttpOnly, Secure, SameSite=Lax cookie (valid 30 days) and redirects to the same URL without the code. A bad, expired, revoked or used-up code sets nothing and lands on `/invite`. Visitors without the cookie are redirected to `/invite`. Staff pass by signing in and never need a code. The gate sits before consent and allocation, identical in both conditions.

**Check by hand in a private window:** no code → `/invite`; the link admits you; an expired or revoked code is refused; staff sign-in works without a code.

**Before opening the study:** the data-location check in section 0 must be done.

---

## 7. Content Verification and Photos: They Live Only in the Database

**Why this is a separate step.** `content/` holds the curated text, and every import brings it in as `under_review`. A curator's verification (the state `verified`, its `verification_records` row with the actor, reason and evidence checks, and the audit entry) and the study photographs (the uploaded file, its asset row, its link to a concept, and the second curator's verification of the asset) exist **only in the database where they were done**, and the photo files only in that database's media store. Neither is in `content/` or in git. Steps 5.1 to 5.3 therefore give production the content, but none of the verification and none of the photos done locally. Choose one route:

| | Route A: redo it against production (recommended) | Route B: restore a dump of the verified local database |
|---|---|---|
| What moves | nothing; production records its own verification and uploads | the whole local database, schema included |
| Accounts | real production staff accounts (6.1, Admin → Users) | the local accounts come along, with their local passwords |
| Photos | uploaded straight into the production bucket | **not covered**: the local files are on local disk, not in the bucket; use Route A for photos |
| When | any time, also after participants exist | only into an **empty** production database, before any staff work or participant data |
| Tested | the scripts run locally; not yet against a remote database | **not tested** |

### 7.1 Route A: Run the Verification and the Photo Ingest Against Production (Recommended)

Preconditions: 5.1 to 5.3 done; the first platform admin (6.1) has created the curator accounts in **Admin → Users** (at least two curators: nobody verifies their own upload, and the media verification is a second person). `scripts/content/verify-concepts.ts` is on `main` (merged from `prep-verify`).

**Concept verification** (`scripts/content/verify-concepts.ts`): it calls the same `transition()` service the CMS review panel uses, so every rule the CMS enforces (permission `content.verify`, separation of duties, complete citations, state) applies, and the audit log records the named curator. It touches only the listed keys and refuses demo content.

```bash
# 1. dry run: reads only; reports "would verify" or every reason for refusal, per key
npx tsx scripts/deploy/with-env.ts --env-file ~/.episteme/production.env -- npx tsx scripts/content/verify-concepts.ts \
  --as <curator email> --keys <keys.json> --evidence <https URL or repo path of the verification record> --reason "<why>" --dry-run
# 2. after reading the dry run, apply (one transaction per concept; exit code 1 if any key was refused)
npx tsx scripts/deploy/with-env.ts --env-file ~/.episteme/production.env -- npx tsx scripts/content/verify-concepts.ts \
  --as <curator email> --keys <keys.json> --evidence <same> --reason "<same>" --apply
```

Use the **same keys file, evidence and reason** the curators used locally, so production verifies exactly the same set. `<curator email>` is the production account of the curator who did the checking (the record names them); never a shared or test account.

**Study photos** (`scripts/content/ingest-study-photos.ts`): uploads each proposed photo through the media pipeline (768 px derivative, credit, licence, provenance, 60-month term), links it to its concept and submits it for review. It never verifies.

```bash
npx tsx scripts/deploy/with-env.ts --env-file ~/.episteme/production.env -- npx tsx scripts/content/ingest-study-photos.ts --uploader <curator email> --dry-run
npx tsx scripts/deploy/with-env.ts --env-file ~/.episteme/production.env -- npx tsx scripts/content/ingest-study-photos.ts --uploader <curator email>
```

- The line `[photos] storage: ...` must name the production bucket (S3 or R2, from `MEDIA_S3_*` in the env file), **not** `local`. If it says `local`, stop: the env file lacks the bucket values.
- Then a **second** curator opens each uploaded asset in the CMS and verifies it. A photo shows only when the asset is verified, its anchor claim's concept is verified and in a published release, its licence is valid, and the protocol switch `figures.photos` is on.
- Reruns: the photo ingest is idempotent (a file already in the library, same SHA-256, is reused and its link updated). `verify-concepts` has no skip: a key that is already `verified` is reported as refused for its state, so after a partial failure rerun it and read the reasons (state refusals for the keys done before are expected; anything else is not).

**Afterwards:** rerun 5.3 (`content:bootstrap:remote`), so the review snapshot behind `/explore` carries the verified states.

### 7.2 Route B: Restore a Dump of the Verified Local Database (Not Tested)

Use it only when the lead decides that verification done locally must move as it is, **before** production has any staff work, invite codes or participant data: the restore replaces the whole database. Photos stay on Route A (the files are not in the dump).

1. **Make a handover copy and check what it carries.** Never dump the working local database directly:
   ```bash
   docker exec immersive-episteme-db createdb -U episteme -T episteme episteme_handover
   docker exec immersive-episteme-db psql -U episteme -d episteme_handover -c "
     SELECT 'participants' t, count(*) FROM participants UNION ALL SELECT 'study_sessions', count(*) FROM study_sessions
     UNION ALL SELECT 'telemetry_events', count(*) FROM telemetry_events UNION ALL SELECT 'users', count(*) FROM users
     UNION ALL SELECT 'demo concepts', count(*) FROM concepts WHERE is_demo UNION ALL SELECT 'verified concepts', count(*) FROM concepts WHERE verification_state = 'verified';"
   ```
   (`createdb -T` needs no other connection to `episteme`: stop the local app server first.)
   - Participants, sessions or telemetry above 0: local test data. **Do not use Route B**; use Route A.
   - Demo concepts above 0: the local database has the demo seed (`dev:bootstrap`). Project rule: demo data goes to production only as the flagged dataset and only when the lead says yes. Without that yes, use Route A, or build a clean local database with the production path (5.1 to 5.3 against a new local database), verify there, and dump that one.
   - Users: every local account becomes a production account **with its local password** (including accounts made by `scripts/content/create-curator.ts`, whose generated password sits in a local file). Keep only the real curators' accounts; after the restore, lock any other account and revoke its roles in **Admin → Users**.
2. **Dump the copy** (the container has PostgreSQL 18 client tools, so none are needed on your machine):
   ```bash
   mkdir -p ~/.episteme/handover
   docker exec immersive-episteme-db pg_dump -U episteme --format=custom --no-owner --no-privileges episteme_handover > ~/.episteme/handover/verified-$(date +%F).dump
   docker exec immersive-episteme-db dropdb -U episteme episteme_handover
   ```
3. **Restore into the empty production database** (the one from A6/B2: extensions created, **no** migrations run), over the direct URL, as `episteme_app` so it owns every object:
   ```bash
   read -s PGURL && export PGURL      # Neon: the DATABASE_URL_UNPOOLED value; RDS: DATABASE_URL (see the note below)
   docker exec -i -e PGURL immersive-episteme-db sh -c 'pg_restore --no-owner --no-privileges --exit-on-error -d "$PGURL"' < ~/.episteme/handover/verified-<date>.dump
   unset PGURL
   ```
   RDS: libpq does not read `NODE_EXTRA_CA_CERTS`; copy the CA bundle in (`docker cp ~/.episteme/ap-south-1-bundle.pem immersive-episteme-db:/tmp/rds-ca.pem`) and add `&sslrootcert=/tmp/rds-ca.pem` to the URL.
   **Not verified:** whether `pg_restore` as `episteme_app` on Neon accepts the dump's extension entries when the extensions already exist (expected: yes, `pg_dump` writes `CREATE EXTENSION IF NOT EXISTS`), and that local pgvector 0.8.7 against Neon's 0.8.6 makes no difference (expected: none, no column uses `vector`).
4. **Then, as on any database:** preflight (`migrations current` must PASS), 5.2 `db:seed:reference`, 5.3 `content:bootstrap:remote` (both idempotent), Route A for the photos, and step 6.
5. Delete the dump file once production is confirmed; it holds staff accounts and password hashes.

---

## 8. Backups, Export, Rollback, Contacts

### 8.1 Option A Backups (AWS)

- RDS automated backups, 7 days (set in A5).
- **Manual snapshot before every production migration after the first**, and before and after data collection:
  ```bash
  aws rds create-db-snapshot --profile cxa --db-instance-identifier immersive-episteme-db --db-snapshot-identifier pre-<sha>
  ```
- Between studies: snapshot, then stop the instance (`aws rds stop-db-instance`); AWS restarts a stopped instance after 7 days, so stop it again then. Never stop it while a study or the public demo should be live.
- Restoring creates a new instance; do it only when the lead asks.

### 8.2 Option B Backups (Neon Free): the pg_dump Schedule

Neon Free has no real backups: "Free plans cap retention at 6 hours (1 GB)" (https://neon.com/docs/introduction/history-window); the pricing page's Free column gives a History window of "Up to 6 hours or 1 GB of data changes", "1 snapshot" and no Scheduled Backups (https://neon.com/pricing). So you take your own dumps:

| When | Why |
|---|---|
| Right after section 5 (and after section 7 when it runs) | known-good baseline |
| **Before every production migration** | migrations are forward-only |
| **At the end of every day with study sessions** | at most one day of data at risk |
| **Weekly** during data collection, even with no sessions | catches staff and CMS changes |
| At study close | the archive copy |

```bash
URL=$(grep '^DATABASE_URL_UNPOOLED=' ~/.episteme/production.env | cut -d= -f2-)
mkdir -p ~/.episteme/backups
pg_dump --format=custom --no-owner "$URL" -f ~/.episteme/backups/episteme-$(date +%F-%H%M).dump
unset URL
```

- Needs **PostgreSQL 18 client tools** (`pg_dump --version` must be 18.x). Not checked on your machine.
- The dumps hold study data: keep them off the repository and on encrypted storage the lead approves. Keep every session-day dump until the study closes.
- **Not verified:** a restore. Once, after the first dump, restore it into a scratch Neon branch or a local Postgres 18 to prove it works: `pg_restore --no-owner -d "<scratch database URL>" <file>.dump`.

### 8.3 Research Data Export (Both Options)

**Research → Exports** in the console gives pseudonymised CSV/JSON exports per study ("Pseudonymised CSV/JSON exports, joinable on participant, session, condition, concept and event ids."), a ZIP of every table from one moment with `manifest.json`, and an identified export for the principal investigator. This is the analysis copy, not a database backup: keep the backups above as well.

### 8.4 Rollback

- **App:** `npx vercel@60.1.3 rollback`. "On the hobby plan, you can only roll back to the previous production deployment." Undo with `npx vercel@60.1.3 promote <deployment-url>` (https://vercel.com/docs/cli/rollback).
- **Env variable:** push the old value with `push-env.ps1 -Only NAME -Force -Yes`, then redeploy.
- **Database:** a rollback does not undo migrations. Restore the pre-migration snapshot (A) or dump (B) only when the lead asks.
- **Leaked invite code:** Admin → Access → Revoke (takes effect for new visitors immediately). **Leaked `BETTER_AUTH_SECRET`:** new value, push, redeploy; everyone is signed out and must redeem their invite again.
- **Leaked bucket key:** delete it (IAM user key, or R2 token), create a new one, push, redeploy.
- **Remove everything** (lead's request only): Vercel project; Option A: RDS (deletion keeps a final snapshot), bucket, IAM user, budget; Option B: Neon project (deletes the data), R2 token, then bucket.

### 8.5 Routine Redeploy

1. Commit; run preflight.
2. If the commit adds migrations: snapshot (A) or `pg_dump` (B) first, then `with-env … -- npm run db:migrate`.
   Then, through `with-env` as in section 5 (both idempotent, safe to run on every redeploy): `npm run db:seed:reference` (new event types or relationship types), and `npm run content:bootstrap:remote -- --i-understand-this-is-remote` when `content/` changed.
3. `push-env.ps1 -Only APP_BUILD_VERSION -BuildVersionFromGit -Force -Yes`; clean tree; `vercel deploy --prod`.
4. `smoke.ts`; on failure `vercel rollback`.

### 8.6 Weekly Checks During Data Collection

- **Vercel → Usage:** Provisioned Memory. Hobby includes "Provisioned Memory | 360 GB-hrs"; "if you exceed your usage limits on the Hobby plan, you will have to wait until 30 days have passed before you can use the feature again" (https://vercel.com/docs/plans/hobby). A dashboard tab left open keeps an instance alive; the stream already stops while the tab is hidden.
- **Option A:** RDS console (CPUCreditBalance, FreeStorageSpace, DatabaseConnections); S3 bucket size; the Billing **Bills** page (not the paid Cost Explorer API).
- **Option B:** Neon console → Usage (compute hours, storage). **Not verified:** whether an idle LISTEN connection keeps the Neon compute awake (N§1); if compute hours climb while a dashboard is open, tell the lead. R2 bucket size and operations.
- The `pg_dump` schedule (B) or snapshots (A).

### 8.7 Who to Contact

| Topic | Contact |
|---|---|
| Go-ahead for any account, deploy, push or cost; the deploy kit; the code | Saurav Kumar (project lead) |
| Ethics, consent text, data location (section 0), identified exports | Prof. Priyadarshi Patnaik (PI), with the CXA/ETH/01 file |
| The IIT AWS account (owner, billing, credits) | `cxa.craftecosystem@gmail.com` (the Centre's account) |
| Vercel plan or commercial-use question | Vercel Support, via the Vercel dashboard (R§2) |
| Neon (Free plan) | Community support only (https://neon.com/pricing, Support Plans, Free: "Community (Discord)") |
| Cloudflare R2 | Cloudflare dashboard support for the account's plan (**not verified** what the free plan includes) |

---

## Open Items

1. **To check on the first Option B deploy:** NOTIFY through the pooler reaching the direct LISTEN; R2 accepting the signed checksum header; Neon extension creation as `neondb_owner`; LISTEN keeping the compute awake.
2. **First run against a remote database:** `db:seed:reference` and `content:bootstrap:remote` were tested on throwaway local databases only (each run twice; counts in 5.2 and 5.3). On the first deploy, check that `/explore` shows the museum.
3. **Route B (7.2) is not tested.** `prep-verify` is merged, so section 7.1 runs from `main`.
4. **Still to retire:** the local `vercel-deploy` skill (`.claude/skills/`, not in the repository) still describes `bom1`, RDS only and `vercel@latest`; follow this runbook instead. The older RDS-only runbook (`bom1`, `/study?invite=<CODE>` link shape) is replaced by this file. The participant link shape in the code is `/study?code=<slug>&invite=<code>`.

Resolved by the production data path (commit `748675e`, merged from `prep-all`): reference data now loads alone through `with-env` (`db:seed:reference`, 5.2), and the public demo museum has a production path (`content:bootstrap:remote`, 5.3). The region for either option comes from preflight (step 1.1; `scripts/deploy/lib/topology.ts` handles Neon and RDS), so the former "Option A needs two edits" item is gone.
