# Deployment research: Vercel with AWS, or with Neon and Cloudflare R2

Research for deploying Immersive Episteme to Vercel (app) and lean AWS in `ap-south-1` (RDS PostgreSQL `db.t4g.micro` Single-AZ, one private S3 bucket, one IAM role or key-only IAM user, one AWS Budget). Nothing here was deployed or changed on any platform.

**Two data options, the deployer chooses (DR-055).** Sections 1 to 17 cover Option A (AWS: RDS and S3 in `ap-south-1`, functions in `bom1`). The addendum at the end covers Option B (Neon in `aws-ap-southeast-1` and Cloudflare R2, functions in `sin1`). The deploy kit detects either from the production env file (`scripts/deploy/lib/topology.ts`), and `docs/deploy/RUNBOOK.md` gives both routes.

**Method.** Every platform fact below is quoted verbatim from the official page named next to it (vercel.com/docs and vercel.com/kb, docs.aws.amazon.com, and the Next.js 16.4.0 docs shipped in `node_modules/next/dist/docs/`). Pages were read on 2026-10-16; the `last_updated` date that Vercel prints on each page is given where it exists. Statements marked **Measured** were checked in this repo or with a read-only download. Statements marked **Inference** are our reading of the quotes, not a documented fact.

---

## 1. What affects our setup (summary)

| # | Finding | Effect on us | Action |
|---|---|---|---|
| 1 | Hobby is "non-commercial personal use only", and commercial use includes "a paid employee or consultant writing the code" (§2). | Academic research is not commercial by intent, but if anyone writing the code is paid for it, Vercel's own definition may classify the deployment as commercial. Hobby also has no team collaboration. | **Lead decides** Hobby vs Pro. If unsure, Vercel says to contact support. |
| 2 | Functions default to `iad1`; `bom1` = `ap-south-1` Mumbai; Hobby gets a single region (§3). | Without a region setting, every DB round trip crosses from Washington to Mumbai. | `"regions": ["bom1"]` in `vercel.json` (works on Hobby: one region). |
| 3 | Max duration on Hobby is 300 s default and maximum; streamed responses count; overrun returns 504 `FUNCTION_INVOCATION_TIMEOUT` (§4). | The dashboard SSE stream is cut every 300 s (Hobby) or at most 800 s (Pro). The client already reconnects (`retry: 3000`, fingerprint check on `ready`), so no data is lost, but each cut is logged as a timeout. | Source change: export `maxDuration` on the stream route and end the stream cleanly just before it (§13). |
| 4 | Provisioned Memory is "Billed for the entire instance lifetime" and "Billing continues until the last in-flight request completes"; Hobby includes 360 GB-hrs; Hobby function memory is 2 GB fixed; exceeding a Hobby limit can mean waiting 30 days (§4, §5). | **Inference:** an open dashboard SSE stream keeps an instance alive. At 2 GB, 360 GB-hrs is about 180 instance-hours a month for all traffic combined. A dashboard left open around the clock (~720 h) would exceed Hobby's allowance and could pause the project mid-study. | Source change: stream only while the tab is visible, and fall back to polling when hidden (§13). Watch Usage weekly. On Pro, Spend Management caps it. |
| 5 | Fluid compute runs many requests in one instance; Vercel recommends `attachDatabasePool` from `@vercel/functions` and a short idle timeout (§6). | `@vercel/functions` is not a dependency, and new dependencies are out of scope. Our pool has `idleTimeoutMillis: 30_000`. | Set `DB_POOL_MAX=3` (env only). Source changes: shorter idle timeout; `attachDatabasePool` needs a dependency approval (§13). |
| 6 | Vercel has no published IP ranges; Static IPs cost $100/month per project on Pro; Secure Compute is Enterprise-only (§7). | RDS must be publicly accessible with port 5432 open to `0.0.0.0/0`; security comes from TLS, a strong password and a non-superuser role. | As planned in `aws-provision`. |
| 7 | node-postgres treats `sslmode=verify-full` as `ssl: true` (Node's default CA store); RDS servers are signed by the Amazon RDS root CA. Global bundle is 174,560 bytes; the `ap-south-1` bundle is 4,580 bytes; Vercel env vars are limited to 64 KB total (§8). | **Inference:** `?sslmode=verify-full` alone will fail verification against RDS on Vercel. The global bundle cannot go in an env var; the `ap-south-1` bundle can. | Source change: `DATABASE_CA_PEM` env var passed as `ssl: { ca }` (§13). Never `no-verify`. |
| 8 | Vercel puts non-working `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` values into functions ("not usable as AWS credentials") (§9). | `storage.ts` falls back to the default AWS credential chain when `MEDIA_S3_ACCESS_KEY_ID` is unset, so on Vercel S3 calls would fail with those placeholder values. | Until OIDC is added, **Option B is required**: set `MEDIA_S3_ACCESS_KEY_ID` + `MEDIA_S3_SECRET_ACCESS_KEY` as Secrets. |
| 9 | OIDC needs `@vercel/oidc-aws-credentials-provider`; Vercel sets `AWS_REGION` to the execution region unless you set it (§9). | OIDC is a dependency change (lead approval). Our S3 client reads `MEDIA_S3_REGION`, so `AWS_REGION` does not affect it today. | Ship with Option B; OIDC is a follow-up source change. |
| 10 | Request and response bodies are capped at 4.5 MB (413 `FUNCTION_PAYLOAD_TOO_LARGE`) (§10). | Telemetry batches are capped at 512 KiB (`MAX_BATCH_BYTES`), well under. Media uploads go browser → S3 directly (presigned PUT), so they never pass through a function. The `/figures/<id>` route streams images through a function; the 768 px cap keeps them small. | None. |
| 11 | `X-Forwarded-For` is overwritten by Vercel: "do not forward external IPs" (§11). | The sign-in rate limiter can trust `x-forwarded-for` on Vercel. | Set `AUTH_CLIENT_IP_HEADER=x-forwarded-for`, leave `AUTH_TRUSTED_PROXIES` unset. |
| 12 | Image Optimization on Hobby: 5K transformations/month; over the limit, new images get a 402 and show alt text. Local-image cache lasts up to 31 days and redeploys don't invalidate it. Next's `minimumCacheTTL` default is 4 hours, and the optimiser keeps whichever of it and the upstream `max-age` is larger (§12). | Few figures (3 V&A photos), so 5K is ample. **Risk:** a figure whose licence expires could stay in the optimiser cache past its licence date, even though `/figures` shortens its own `max-age`. | Source changes: `images.localPatterns` restricted to `/figures/**` and `/museum/**`; for licence-limited figures, `unoptimized` or a purge on expiry (§13). |
| 13 | Node: 24.x is the default and supported; `engines.node` overrides project settings. npm on Vercel: the docs list npm 10 for Node 20/22 and nothing for Node 24, and the npm install command is `npm install` (§14). | Our `engines` is `node >=24 <25`, `npm >=11`; lockfile v3. `npm install` can change the lockfile. | `"installCommand": "npm ci"` in `vercel.json`. Check the npm version in the first build log. |
| 14 | CLI deploys upload every file except a fixed default list, which does **not** include `.env` or `analysis/out` (184 MB, measured); Hobby CLI uploads are capped at 100 MB (§14). | A `vercel deploy` from this working tree would upload `.env` (local secrets) and would exceed 100 MB. | Deploy from Git (the `github-repo` skill), or add a root `.vercelignore` (new root file; listed under §13). |
| 15 | Static assets are cached on the CDN "for the lifetime of the deployment". The 10 MB / 20 MB cache limits apply to **function** responses (§12). | The largest museum texture is 4,360,493 bytes; `public/museum` is 22 MB in total (measured). No per-file static limit was found in the docs. | None. |
| 16 | Deployment Protection "Standard Protection" protects every URL except production domains; Password Protection is not available on Hobby (§15). | Production must rely on the app-level invite gate (to be built); previews are protected by Vercel Authentication. | Document invite-gate env/admin steps (runbook). |
| 17 | `.env.production.example` matches `.env.*` in `.gitignore` (measured with `git check-ignore`). | The template file would not be committed. | Source change: add `!.env.production.example` to `.gitignore` (§13). |

---

## 2. Vercel plans: Hobby vs Pro

**Hobby is non-commercial only.** https://vercel.com/docs/limits/fair-use-guidelines (updated 2026-09-14):
> "**Hobby teams** are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan."

> "Commercial usage is defined as any [Deployment] that is used for the purpose of financial gain of **anyone** involved in **any part of the production** of the project, including a paid employee or consultant writing the code. Examples of this include, but are not limited to, the following:"
> "- Any method of requesting or processing payment from visitors of the site"
> "- Advertising the sale of a product or service"
> "- Receiving payment to create, update, or host the site"
> "- Affiliate linking is the primary purpose of the site"
> "- The inclusion of advertisements, including but not limited to online advertising platforms like Google AdSense"

> "If you are unsure whether or not your site would be defined as commercial usage, please [contact the Vercel Support team]."

https://vercel.com/docs/plans/hobby (updated 2026-09-14):
> "The Hobby plan is **free** and aimed at developers with personal projects, and small-scale applications."

> "As stated in the [fair use guidelines], the Hobby plan restricts users to non-commercial, personal use only."

> "In most cases, if you exceed your usage limits on the Hobby plan, you will have to wait until 30 days have passed before you can use the feature again."

Plan comparison rows that matter here (same page):

| Feature | Hobby | Pro |
|---|---|---|
| Vercel Function maximum duration | "300s (5 minutes)" | "300s (default) - configurable up to 800s; extended max duration up to 1800s (30 minutes, beta)" |
| Team collaboration features | "-" | "Yes" |
| Spend Management | "N/A" | "Configurable" |
| Runtime Logs | "1 hour of logs" | "1 day of logs" |
| Deployment Protection | "Vercel Authentication for preview and production deployments, Deployment Protection Exceptions, and Shareable Links" | "The Hobby features, plus Password Protection for $20 per month per protected project" |

> "Developer seats cost **$20 per user / month**, while Viewer seats are free"

Hobby included usage (same page): "Active CPU | 4 CPU-hrs"; "Provisioned Memory | 360 GB-hrs"; "Function Invocations | First 1,000,000"; "Fast Data Transfer | First 100 GB"; "Image Transformations | First 5,000".

**Effect.** Whether a university research deployment counts as commercial depends on whether anyone writing the code is paid for it. That is a decision for the lead (or a question for Vercel Support). It is not ours to make. Hobby also has no team collaboration, so only the account owner can manage the project.

---

## 3. Function region (`bom1`)

https://vercel.com/docs/regions (updated 2026-08-11), region list row:
> "| bom1 | ap-south-1 | Mumbai, India |"

> "Functions should be executed in the same region as your database, or as close to it as possible"

https://vercel.com/docs/functions/configuring-functions/region (updated 2026-08-11):
> "By default, Vercel Functions execute in [*Washington, D.C., USA* (`iad1`)] **for all new projects**"

> "To change the default region in your `vercel.json` [configuration file], add the region code(s) to the `"regions"` key"

> "Pass `--regions` to `vercel deploy` (or the default `vercel` command) from your project's root directory with a region value, for example `vercel --regions sfo1`."

Limits table: "| Hobby | Single region |", "| Pro | 5 regions |", "| Enterprise | All regions |".
> "Deploying to more regions than your plan allows causes the deployment to fail before the [build step]."

> "Vercel deploys [Routing Middleware] to all regions by default, regardless of your region settings."

(The Fluid compute page's table gives "Multi-region functions | ... | Up to 3" for Pro, which differs from the "5 regions" above. We use one region, so the difference does not matter.)

**Next.js side.** `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/preferredRegion.md`:
> "**Deprecated:** The `preferredRegion` route segment config is deprecated. Remove the `preferredRegion` export from your route files."

So the region belongs in `vercel.json` (or the dashboard), not in route code.

**Effect.** `"regions": ["bom1"]` in `vercel.json`. One region is allowed on Hobby.

---

## 4. Function duration, streaming and SSE (Fluid compute)

https://vercel.com/docs/functions/limitations (updated 2026-08-24):
> "This refers to the longest time a function invocation can run before Vercel terminates it. For request handlers, this includes time spent processing the request and sending the response, including streamed responses."

> "If a Vercel Function doesn't complete within the duration, a 504 error code ([`FUNCTION_INVOCATION_TIMEOUT`]) is returned."

| | Default | Maximum | Extended maximum |
|---|---|---|---|
| Hobby | 300s (5 minutes) | 300s (5 minutes) | - |
| Pro | 300s (5 minutes) | 800s | 1800s (30 minutes) Beta |

> "Hobby: 2 GB, Pro and Ent: 4 GB" (maximum memory); memory table: "| Hobby | 2 GB / 1 vCPU | 2 GB / 1 vCPU |", "| Pro / Enterprise | 2 GB / 1 vCPU | 4 GB / 2 vCPU |".

> "Vercel Functions have a limit of **1,024 file descriptors** shared across all concurrent executions."

https://vercel.com/docs/functions/configuring-functions/duration (updated 2026-08-24):
> "the Next.js app router uses a named maxDuration export."

```ts
export const maxDuration = 5; // This function can run for a maximum of 5 seconds
```
> "For long-running request handlers that keep a client connection open over HTTP/2, Vercel sends connection-level HTTP/2 `PING` frames while the response is idle. HTTP/1.1 does not have an equivalent protocol frame, so HTTP/1.1 clients and intermediate network layers may still close idle connections. For those cases, stream progress or heartbeat data while work is running."

> "If your Next.js project is configured to use [src directory], you will need to prefix your function routes with `/src/` for them to be detected." (applies to the `vercel.json` `functions` key)

https://vercel.com/docs/fluid-compute (updated 2026-08-24):
> "As of April 23, 2025, fluid compute is enabled by default for new projects."

> "Fluid compute allows multiple invocations to share a single function instance"

> "Settings in your function code always take top priority. These include max duration defined directly in your code."

```json
{ "$schema": "https://openapi.vercel.sh/vercel.json", "fluid": true }
```

https://vercel.com/docs/functions/streaming-functions (updated 2026-09-01):
> "Maximum durations can be configured for Node.js functions to enable streaming responses for longer periods."

**Next.js 16.4 docs** (`.../route-segment-config/maxDuration.md`):
> "The `maxDuration` option allows you to set the maximum execution time (in seconds) for server-side logic in a route segment. Deployment platforms can use `maxDuration` from the Next.js build output to add specific execution limits."

The segment-config index lists `maxDuration` with default "Set by deployment platform". With Cache Components on, it says: "`dynamic`, `dynamicParams`, `revalidate`, and `fetchCache` removed when [Cache Components] is enabled". `maxDuration` is not among the removed options.

**Pricing that a long-lived stream drives.** https://vercel.com/docs/functions/usage-and-pricing (updated 2026-06-16):
> "Billed for the entire instance lifetime in GB-hours"
> "Continues billing while handling requests, even during I/O operations"
> "Billing continues until the last in-flight request completes"
> "After all requests complete, the instance is paused, and no CPU or memory charges apply until the next invocation."
> "| Mumbai, India (bom1) | $0.140 | $0.0116 |" (Active CPU per hour, Provisioned Memory per GB-hr; Pro on-demand)

**Our stream** (`src/app/api/research/dashboard/stream/route.ts`): it sends `retry: 3000`, a `ready` event with a fingerprint, `change` on NOTIFY and `ping` every 25 s. The client (`live-status.tsx`) resets its error count on `ready` and re-renders if the fingerprint changed. It falls back to polling after repeated errors.

**Effect (inference):** the forced cut every 300 s is recovered in about 3 s, and nothing is missed. Two problems remain. First, each cut is a 504 timeout in the logs. Second, an open dashboard keeps one 2 GB instance provisioned. 360 GB-hrs ÷ 2 GB = 180 instance-hours a month on Hobby, shared with all other traffic.

---

## 5. Environment variables

https://vercel.com/docs/environment-variables (updated 2026-09-17):
> "Any change you make to environment variables are not applied to previous deployments, they only apply to new deployments."

> "Developers on all plans using the runtimes stated below can use a total of **64 KB** in Environment Variables **per-Deployment** on Vercel. This [limit] is for all variables combined, and so no **single** variable can be larger than 64 KB."

> "**Production**: When selected, the Environment Variable will be applied to your next Production Deployment."
> "**Preview**: The Environment Variable is applied to your next Preview Deployment."

https://vercel.com/docs/environment-variables/sensitive-environment-variables (updated 2026-08-28). Sensitive variables are now called "Secret":
> "**Secret** values are write-only after saving. Use them for passwords, API keys, and tokens. Existing [Sensitive environment variables] continue to work as Secrets."

> "During builds, if a Secret environment variable value is 32 characters or longer and appears in build logs, Vercel replaces the value with `[REDACTED]`."

> "When enabled, each Secret must use a **different value in Production** than in Preview, Development, and custom environments." (optional team policy "Separate Production Secret Values")

https://vercel.com/docs/cli/env (updated 2026-08-20):
> "`vercel env add [name] [environment] < [file]` ... *Using the `vercel env` command to add an Environment Variable to a Vercel Project using a local file's content as the value.*"

> "*Using the `echo` command to generate the value of the Environment Variable and piping that value into the `vercel env add` command. Warning: this will save the value in bash history, so this is not recommended for secrets.*"

Default types: "| Production | `secret` |", "| Preview | `secret` |", "| Development | `config` |". Flags: "Use `--type config` or `--type secret` to set the type explicitly. The `--sensitive` and `--no-sensitive` flags map to Secret and Config."

> "To leverage environment variables in local tools ... run `vercel env pull <file>`."
> "For Secret variables whose values cannot be read from Vercel, the CLI keeps the real value already in your local file. If your local file has no real value for that key, the CLI writes a placeholder for you to replace with a local-only value."
> "`vercel env pull --environment=preview` ... *download Preview Environment Variables from the cloud and write to the `.env.local` file.*"
> "The `vercel env run` sub-command runs any command with environment variables from your linked Vercel project, without writing them to a file."
> "`-e, --environment`: Specify the environment to pull variables from. Defaults to `development`. Accepts `development`, `preview`, or `production`."

https://vercel.com/docs/limits: "The maximum number of [Environment Variables] per environment per [Project] is `1000`."

**Effect.** Set secrets with `vercel env add NAME production --sensitive < file` (never with `echo`). Redeploy after every change. Secret values cannot be pulled back, so `vercel env pull` cannot be used to check production secrets; check presence with `vercel env ls production`. Our total is far below 64 KB, but the RDS **global** CA bundle (174,560 bytes, measured) would not fit; the `ap-south-1` bundle (4,580 bytes) would.

---

## 6. Database connections from Fluid compute (node-postgres)

https://vercel.com/kb/guide/connection-pooling-with-functions:
> "Use the `attachDatabasePool` helper to handle idle connections."
> "Use a relatively short idle timeout (e.g., 5 seconds) to ensure unused connections are quickly closed"
> "Avoid max pool size of 1: This does not reduce total connections and harms concurrency in Fluid Compute."
> "In many serverless platforms, when a function becomes idle, it's suspended in memory."
> "Idle connection timeouts don't run while suspended, so connections remain open until either the VM shuts down"
> "Fluid Compute uses `waitUntil` to keep the instance alive just long enough to close idle connections"

```ts
import { attachDatabasePool } from "@vercel/functions";
attachDatabasePool(pool);
```

https://vercel.com/docs/functions/limitations: "Use connection pooling for database connections".

**RDS side.** https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html:
> "| PostgreSQL | max_connections | 6–262143 | LEAST({DBInstanceClassMemory/9531392}, 5000) | Maximum number of concurrent connections |"
> "`DBInstanceClassMemory` is in bytes. ... Because of memory reserved for the operating system and RDS management processes, this memory size is smaller than the value in gibibytes (GiB)"

https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.Summary.html: "| db.t4g.micro\* | 2 | — | 1 | EBS-optimized only | Up to 2,085 | Up to 5 |" (vCPU 2, memory 1 GiB).

**Inference:** 1 GiB ÷ 9,531,392 = 112.6, so `max_connections` on `db.t4g.micro` is below 112. Read the real value with `SHOW max_connections` once the instance exists.

**Effect.** With `DB_POOL_MAX=3`, each instance uses at most 3 pooled connections, plus 1 `LISTEN` connection from the dashboard notifier. That allows roughly 25 concurrent instances before about 100 connections, which is plenty for this cohort. Our pool's `idleTimeoutMillis: 30_000` is longer than Vercel's suggested ~5 s, and `attachDatabasePool` is not wired. Both are source changes (§13). `@vercel/functions` is a new dependency, which needs approval.

---

## 7. Reaching RDS from Vercel (IPs, public access)

https://vercel.com/kb/guide/can-i-get-a-fixed-ip-address:
> "Vercel deployments don't have a fixed outbound IP by default."
> "there's no published IP range to add to an allowlist."
> Static IPs: "$100/month per project" (Pro and Enterprise). "Secure Compute is an Enterprise feature with custom pricing."
> "the addresses alone don't authenticate the caller."

https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html:
> "Access to the DB instance is ultimately controlled by the security group it uses. That public access is not permitted if the security group assigned to the DB instance doesn't include inbound rules that permit it. In addition, for a DB instance to be publicly accessible, the subnets in its DB subnet group must have an internet gateway."
> "If you want your DB instance in the VPC to be publicly accessible, make sure to turn on the VPC attributes *DNS hostnames* and *DNS resolution*."

**Effect.** As planned: Publicly accessible = Yes, with a security group that opens 5432 only. Security comes from TLS, a 32+ character password and the non-superuser `episteme_app` role. Static IPs ($100/month) are out of scope.

---

## 8. TLS to RDS with node-postgres

https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html:
> "The `rds.force_ssl` parameter default value is 1 (on) for RDS for PostgreSQL version 15 and later."
> "If your connection parameters specify `sslmode=verify-ca` or `sslmode=verify-full`, then your client requires the RDS CA certificates to be in their trust store or referenced in the connection URL."

https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html:
> "The default CA is set to rds-ca-rsa2048-g1."
> "The `rds-ca-rsa4096-g1` and `rds-ca-ecc384-g1` certificates are not available in the following Regions: Asia Pacific (Mumbai) ..."
> "Your application trust store needs to only register the root CA certificate. Do not register the intermediate CA certificates to your trust store as this might cause connection issues when RDS automatically rotates your DB server certificate."
> Bundles: "Any commercial AWS Region | global-bundle.pem" (`https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem`); "Asia Pacific (Mumbai) | ap-south-1-bundle.pem" (`https://truststore.pki.rds.amazonaws.com/ap-south-1/ap-south-1-bundle.pem`).

**Measured (read-only download, 2026-10-16):** `global-bundle.pem` 174,560 bytes, 114 certificates; `ap-south-1-bundle.pem` 4,580 bytes, 3 certificates.

**node-postgres** (`node_modules/pg-connection-string/README.md`, v2.14.1):
> "`sslmode=prefer`, `sslmode=require`, `sslmode=verify-ca`, `sslmode=verify-full` - sets `ssl` to true"
`index.js` line 99: `config.ssl.ca = fs.readFileSync(config.sslrootcert).toString()`. In other words, `sslrootcert=` in the URL is a file path read at runtime.

**Effect (inference).** With `ssl: true`, Node verifies against its built-in public CA list, and the Amazon RDS root CA is not on it. So `DATABASE_URL=...?sslmode=verify-full` alone should fail on Vercel with a certificate-chain error. There are two working options:
1. **Preferred:** a `DATABASE_CA_PEM` env var (Secret) holding the `ap-south-1` bundle (4.6 KB), and in `createPool` `ssl: { ca: env.DATABASE_CA_PEM, rejectUnauthorized: true }`. This is a source change; `env.ts` must accept the var.
2. `sslrootcert=<path>` with the PEM committed and traced into the function bundle (`outputFileTracingIncludes`). This is also a source change.

Never use `sslmode=no-verify`. Locally, `npm run db:migrate` (tsx) can use `NODE_EXTRA_CA_CERTS=<path to bundle>`. Node supports that variable, but we did not verify it on Vercel's runtime, so production should not rely on it.

---

## 9. S3 credentials: OIDC vs keys

https://vercel.com/docs/oidc (updated 2026-08-04):
> "Secure backend access with OIDC federation is available on all plans"
> "**Team** *(Recommended)*: The issuer URL is bespoke to your team e.g. `https://oidc.vercel.com/acme`."
> "When your application invokes a Vercel Function, the OIDC token is set to the `x-vercel-oidc-token` header on the Function's `Request` object."
> "Function tokens have a Time to Live (TTL) of two hours."

https://vercel.com/docs/oidc/aws (updated 2026-08-28):
> Provider URL "**Team**: `https://oidc.vercel.com/[TEAM_SLUG]`"; "Enter `https://vercel.com/[TEAM_SLUG]` in the **Audience** field"
> Trust condition example: `"oidc.vercel.com/[TEAM_SLUG]:sub": "owner:[TEAM SLUG]:project:[PROJECT NAME]:environment:production"`
> "declare it as an environment variable ... with key name `AWS_ROLE_ARN`."
> "**`AWS_REGION` is not stable by default.** Vercel sets `AWS_REGION` automatically to your function's execution region. ... [declare `AWS_REGION` as an environment variable] in your Vercel project with the value set to the AWS region where your resources live."
> "Vercel sends the OIDC token to the SDK using the `awsCredentialsProvider` function from `@vercel/oidc-aws-credentials-provider`."

https://vercel.com/docs/environment-variables/reserved-environment-variables (updated 2025-12-10):
> Allowed: "`AWS_ACCESS_KEY_ID`", "`AWS_SECRET_ACCESS_KEY`", "`AWS_SESSION_TOKEN`", "`AWS_REGION`", "`AWS_DEFAULT_REGION`"
> "These variables may appear in your Vercel Functions even if you don't set them in your project explicitly. These values do not grant any AWS permissions and are not usable as AWS credentials. Configure your own AWS credentials using environment variables or set up [OIDC]."

**Our code.** `src/server/cms/media/storage.ts` uses explicit keys when `MEDIA_S3_ACCESS_KEY_ID`/`MEDIA_S3_SECRET_ACCESS_KEY` are both set. Otherwise it uses the default AWS credential chain, which reads `AWS_ACCESS_KEY_ID`. Region comes from `MEDIA_S3_REGION`.

**Effect.** On Vercel, leaving the media keys unset would make the SDK pick up Vercel's placeholder `AWS_*` values, which "are not usable as AWS credentials". **For launch, use Option B** (key-only IAM user, both `MEDIA_S3_*` keys as Secrets, rotated every 90 days). OIDC (Option A) needs `@vercel/oidc-aws-credentials-provider` plus a `storage.ts` change: a new dependency for the lead to approve (§13). If OIDC is added, set `AWS_REGION=ap-south-1` explicitly as the docs say.

---

## 10. Body size and telemetry

https://vercel.com/docs/functions/limitations:
> "The maximum payload size for the request body or the response body of a Vercel Function is **4.5 MB**. If a Vercel Function receives a payload in excess of the limit it will return an error [413: `FUNCTION_PAYLOAD_TOO_LARGE`]."

**Measured:** `MAX_BATCH_BYTES = 512 * 1024` (`src/features/telemetry/contracts.ts:308`), enforced in `/api/telemetry/batch` with a 413. CMS uploads use a presigned S3 PUT (`storage.ts`), so files of up to 200 MiB (GLB) never pass through a function. `/figures/<id>` streams S3 bytes through the function; the images are capped at 768 px.

**Effect.** None. Note that `TokenBucketLimiter` (telemetry) is in-process memory. With Fluid compute's many instances, each instance keeps its own buckets (inference). That is acceptable as a per-instance abuse guard, but it is not a global limit.

---

## 11. Client IP for rate limiting

https://vercel.com/docs/headers/request-headers (updated 2025-12-13):
> "`x-forwarded-for`: The public IP address of the client that made the request."
> "If you are trying to use Vercel behind a proxy, we currently overwrite the [`X-Forwarded-For`] header and **do not forward external IPs**. This restriction is in place to prevent IP spoofing."
> "`x-real-ip`: This header is identical to the `x-forwarded-for` header."

**Effect.** Set `AUTH_CLIENT_IP_HEADER=x-forwarded-for` and leave `AUTH_TRUSTED_PROXIES` unset. Vercel overwrites the header, so a client cannot spoof it. If neither variable is set, `src/proxy.ts` strips forwarding headers and Next falls back to the socket address, which on Vercel is not the visitor (inference).

---

## 12. Images, media route and static assets

**Vercel Image Optimization.** https://vercel.com/docs/image-optimization (updated 2026-08-13):
> "If you use a framework's `Image` component (like [`next/image`]) it will use Vercel's image optimization pipeline"
> "Vercel validates the [loader configuration] ... and verifies that the image [source URL] matches the allowed patterns defined in your configuration ([`remotePatterns`] or [`localPatterns`])."
> Local images: "Redeploying your app doesn't invalidate the image cache."; "[Cached] **for up to 31 days** on the Vercel CDN."
> Remote images: "TTL is determined by the [`Cache-Control`] `max-age` header from the upstream image or [`minimumCacheTTL`] config (default: `3600` seconds), whichever is larger."
> "Once an image is cached, it remains so even if you update the source image."
> "Frequently changing images where caching could lead to outdated content" (listed under cases where optimization "may not be necessary or beneficial").

https://vercel.com/docs/image-optimization/limits-and-pricing (updated 2026-08-11):
> "| Image transformations | 5K/month |", "| Image cache reads | 300K/month |", "| Image cache writes | 100K/month |" (Hobby included)
> "New images will fail to optimize and instead return a runtime error response with [402 status code]. This will trigger the [`onError`] callback and show the [`alt`] text instead of the image"
> "You will **not** be charged for exceeding the usage limits"
> "Each source image has a maximum width and height of 8192 pixels"
> "A source image must be one of the following formats to be optimized: `image/jpeg`, `image/png`, `image/webp`, `image/avif`."

**Next.js 16.4 docs** (`.../02-components/image.md`):
> "Use `localPatterns` in your `next.config.js` file to allow images from specific local paths to be optimized and block all others."
> "Omitting the `search` property allows all search parameters which could allow malicious actors to optimize URLs you did not intend."
> `minimumCacheTTL`: "minimumCacheTTL: 14400, // 4 hours" (default)
> "The expiration (or rather Max Age) of the optimized image is defined by either the `minimumCacheTTL` or the upstream image `Cache-Control` header, whichever is larger."
> "There is no mechanism to invalidate the cache at this time, so its best to keep `minimumCacheTTL` low."

(Vercel's page says the default is 3600 s, while the Next 16.4 docs say 14400 s. If it matters, set the value explicitly.)

**Our media route.** `KnowledgeFigure` renders `next/image` with `src=/figures/<id>`. `next.config.ts` has no `images` block, so every local path can be optimized. `/figures/<id>` answers `public, max-age=31536000, immutable`, or a shorter `max-age` when the licence ends sooner.

**Effect (inference).** Three V&A photos at a 768 px cap need very few transformations; 5K/month is ample. The risk is licence expiry. If Vercel treats `/figures/<id>` as a local image, a cached transform can live "up to 31 days" and survive redeploys. The optimiser also keeps the larger of `minimumCacheTTL` and `max-age`. Either way, a figure could be shown after its licence ends. Mitigations (source changes, §13): `images.localPatterns` limited to `/figures/**` with `search: ''`; `unoptimized` for figures with a licence end date (or for all figures, since they are already 768 px). Alternatively, purge on expiry.

**CDN cache and static files.** https://vercel.com/docs/caching/cdn-cache (updated 2026-09-14):
> "Static files are **automatically cached on Vercel's global network** for the lifetime of the deployment after the first request."
> Function cache criteria include "Response doesn't exceed `10MB` in content length (`20MB` for streaming [Vercel Function] responses" and "Response doesn't contain the `private`, `no-cache` or `no-store` directives"
> "To cache the response of Functions on Vercel's CDN, you must include [`Cache-Control`] headers with **any** of the following directives: `s-maxage=N` ..."
> "Vercel **doesn't allow bypassing the cache for static files** by design."

**Measured:** `public/museum` is 22 MB; the largest file is `floor-color.3b88b65a.ktx2` at 4,360,493 bytes. The texture names are content-hashed. No per-file size limit for static files was found in the pages read. The SSE route sends `Cache-Control: no-store`, so it is never cached. `/figures` sends `public, max-age=...` without `s-maxage`, so the Vercel CDN does not cache it as a function response; only browsers and the image optimiser do.

---

## 13. Source changes needed (not made here: another workflow owns source files)

| # | File | Change | Why |
|---|---|---|---|
| S1 | `src/app/api/research/dashboard/stream/route.ts` | `export const maxDuration = 300` (Hobby) or the Pro value. Close the stream cleanly ~15 s before it (timer → `controller.close()`); the client reconnects after `retry: 3000`. | Avoid a 504 timeout every 5 minutes (§4). |
| S2 | `src/app/(research)/research/dashboard/_components/live-status.tsx` | Close the EventSource when `document.visibilityState === "hidden"`; reopen on visible (the fingerprint check on `ready` already resyncs). | A forgotten open tab keeps a 2 GB instance provisioned (§4); Hobby has 360 GB-hrs a month. |
| S3 | `src/server/db/client.ts` + `src/lib/env.ts` | Accept `DATABASE_CA_PEM` (optional; required when `NODE_ENV=production` and the host ends in `.rds.amazonaws.com`) and pass `ssl: { ca, rejectUnauthorized: true }`. | RDS certificates do not chain to Node's default CAs (§8). |
| S4 | `src/server/db/client.ts` | `idleTimeoutMillis` about 5 s when running on Vercel (`process.env.VERCEL`); optionally `attachDatabasePool(pool)` (adds `@vercel/functions`, needs approval). | Vercel's pooling guidance (§6). |
| S5 | `src/server/cms/media/storage.ts` (+ dependency) | Optional OIDC: when `AWS_ROLE_ARN` is set, use `awsCredentialsProvider({ roleArn })` from `@vercel/oidc-aws-credentials-provider` (exact pin, needs approval). Until then, refuse to start in production with neither the media keys nor `AWS_ROLE_ARN` set, rather than falling through to Vercel's placeholder `AWS_*` values. | §9. |
| S6 | `next.config.ts` | `images: { localPatterns: [{ pathname: '/figures/**', search: '' }], minimumCacheTTL: <explicit> }`; add `/museum/**` only if a museum image ever uses `next/image`. | Lock the optimiser to our own paths (§12). |
| S7 | `src/components/knowledge/knowledge-figure.tsx` | `unoptimized` for figures with a licence end date (or for all 768 px figures). | Licence expiry must not outlive the cache (§12). |
| S8 | `.gitignore` | Add `!.env.production.example`. | The new template matches `.env.*` and would not be committed (measured). |
| S9 | `.vercelignore` (new root file, outside this task's allowed paths) | Exclude `.env`, `.data/`, `analysis/out/`, `test-results/`, `tests/e2e/immersive-baselines/`, `content/` (only if not needed at build time; check first). | CLI deploys upload everything except a fixed list that does not include `.env` (§14); `analysis/out` alone is 184 MB, over Hobby's 100 MB CLI limit. Not needed if we deploy only from Git. |
| S10 | `package.json` | Optional: `"engines": { "node": "24.x" }` (the documented form). | `>=24 <25` is a valid range and should resolve to 24.x, but the docs' examples use `24.x` (§14). |
| S11 | Invite-code gate (to be built) | Env/admin steps go in the runbook. No platform setting replaces it, because Password Protection is not on Hobby (§15). | Site is always invite-only. |

---

## 14. Build settings, Node version, install command, upload limits

https://vercel.com/docs/functions/runtimes/node-js/node-js-versions (updated 2026-02-27):
> "Current available versions are: **24.x** (default), **22.x**"
> "Only major versions are available. Vercel automatically rolls out minor and patch updates when needed"
> "You can define the major Node.js version in the `engines#node` section of the `package.json` to override the one you have selected in the [Project Settings]"
> Table: "`24.x` / `^24.0.0` / `>=22.0.0` | latest **24.x** version"
> "To verify the Node.js version your Deployment is using, either run `node -v` in the Build Command or log `process.version`."

https://vercel.com/docs/builds/configure-a-build (updated 2026-08-28):
> "if [Next.js] is your framework: Vercel checks for the `build` command in `scripts` and uses this to build the project"
> "If you would like to override the Build Command for a **specific deployment**, add [`buildCommand`] to your `vercel.json` configuration."
> "Vercel performs a "shallow clone" on your Git repository using the command `git clone --depth=10 (...)`"

https://vercel.com/docs/package-managers (updated 2026-08-11):
> "| npm | `package-lock.json`: present | `npm install` | Varies |", "| | `lockfileVersion`: 2 | - | npm 8 |", "| | Node 20 | - | npm 10 |", "| | Node 22 | - | npm 10 |"
> "To specify a package manager for a deployment, use the [`installCommand`] property in your projects `vercel.json`."

https://vercel.com/docs/limits (updated 2026-09-16):
> "| Build Time per Deployment (Minutes) | 45 | 45 | 45 |"
> "| Static File uploads | 100 MB | 1 GB | N/A |"
> "When using the CLI to deploy, the maximum size of the source files that can be uploaded is limited to 100 MB for Hobby and 1 GB for Pro."
> "The maximum number of files that can be uploaded when creating a CLI [Deployment] is `15,000` for source files."
> "| Deployments Created per Day | 100 | 6000 |"

https://vercel.com/docs/builds/build-features (updated 2026-09-16), default ignore list for CLI uploads (abridged to the entries that matter): "`.git`", "`.next`", "`.vercel`", "`.env.local`", "`.env.*.local`", "`node_modules`". "These ignored files are only relevant when using Vercel CLI."
https://vercel.com/docs/deployments/vercel-ignore: "Aside from the [default exclusions], all files within your project are uploaded to Vercel if no source path is specified to be excluded in a `.vercelignore` configuration file"

**Measured:** `package.json` engines `node >=24 <25`, `npm >=11`; `.nvmrc` = `24`; `package-lock.json` `lockfileVersion: 3`; no `.npmrc`. 863 tracked files, 35.6 MB in total. Untracked `analysis/out` is 184 MB, and `.env` exists at the root.

**Effect.**
- `vercel.json` should set `"installCommand": "npm ci"`, so the build installs exactly from the lockfile. It should also set `"buildCommand": "npm run build"`, which is the default but stated for clarity.
- The docs do not say which npm comes with Node 24. Check `npm -v` in the first build log against `engines.npm >=11`. npm only warns on an engines mismatch unless `engine-strict` is set, and we have no `.npmrc` (inference).
- Prefer Git-based deploys. If the CLI is used, add `.vercelignore` first (S9), so `.env` is never uploaded.

---

## 15. Access control on Vercel (and why the invite gate is in-app)

https://vercel.com/docs/deployment-protection (updated 2026-09-15):
> "**Standard Protection**: Protects all deployments **except** production domains"
> "**Password Protection**: Restricts access to users with the correct password. **Available on Pro for $20 per month per protected project and included on Enterprise at the team level. Not available on Hobby**"
> "**Vercel Authentication**: Restricts access to only Vercel users with suitable access rights"
> "Vercel Authentication for All Deployments and Deployment Protection Exceptions do not require a paid add-on."

**Effect.** Production must be open at the platform level and gated by the app's invite code, because participants are not Vercel users. Previews stay behind Vercel Authentication, so automated checks against a preview need a bypass or a production-like custom environment. Standard Protection also hides `VERCEL_URL`, so the app must use `BETTER_AUTH_URL`, not `VERCEL_URL`, for absolute URLs.

---

## 16. S3 CORS (browser uploads)

https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html:
> "Cross-origin resource sharing (CORS) defines a way for client web applications that are loaded in one domain to interact with resources in a different domain."
> "The `Origin` header in a CORS request to your bucket must match the origins in the `AllowedOrigins` element in your CORS configuration."
> "The ACLs and policies continue to apply when you enable CORS on your bucket."

**Effect.** CORS `AllowedOrigins` must hold the exact production origin, and each preview origin if uploads are tested on previews. Preview URLs change per deployment, so test uploads on production or on a fixed preview alias.

---

## 17. Open questions for the lead

1. **Hobby or Pro** (§2): does anyone writing the code get paid for it? If yes, Vercel's definition points to Pro ($20/developer seat/month, Spend Management available).
2. **OIDC dependency** (`@vercel/oidc-aws-credentials-provider`) and `@vercel/functions` (`attachDatabasePool`): approve, or launch on the key-only IAM user.
3. **Dashboard usage pattern**: how many hours a month will researchers keep it open? This sizes the Provisioned Memory risk on Hobby (§4).

---

## Addendum: Neon and Cloudflare R2 (Option B)

Read on 2026-10-16 on the vendors' official pages. Quotes are verbatim. Where a statement is an inference or was not verified, it says so. Section numbers are cited in RUNBOOK.md as "N§n". Decision: DR-055 (Neon + R2 is the lead's default; the deployer chooses between this option and the AWS option of sections 1 to 17). At the merge (DR-061) every vendor quote here was matched mechanically against the page text: the Neon pricing quotes and the end of the DPA quote were corrected to the page as served.

### N§1. Neon Free Plan

- https://neon.com/pricing, Free column of the plan comparison: "$0 /month"; Instant restore storage "Free with limited window/size"; History window ("For instant restore (configurable)") "Up to 6 hours or 1 GB of data changes"; Snapshots "1 snapshot"; Scheduled Backups: no entry for Free (Launch: "Daily/Weekly/Monthly"); Support Plans "Community (Discord)".
- https://neon.com/docs/introduction/plans:
  - "1 GB/project, 20 GB account total"
  - "100 CU-hours/project/month (enough to run a 0.25 CU compute in a project for 400 hours/month)"
  - "Up to 2 CU (8 GB RAM)"
  - "Branch creation fails once you reach 10 branches per project."
  - "5 GB per project included" (egress)
- https://neon.com/docs/introduction/scale-to-zero: "Scale to zero is always enabled (computes suspend after 5 minutes of inactivity) and can't be disabled." A suspended compute "reactivates automatically within a few hundred milliseconds".
- https://neon.com/docs/reference/glossary: "When a connection is made to an idle compute, the Activity Monitor reactivates the compute".
- https://neon.com/docs/introduction/compute-lifecycle: LISTEN subscriptions "only exist for the duration of the current session".
- **Not verified:** whether an idle LISTEN connection keeps the compute from suspending. Neon does not say. The dashboard's reconnect loop (`src/server/research/dashboard-live.ts`) re-runs LISTEN after a drop.

### N§2. Pooled and Direct Connections

- https://neon.com/docs/connect/connection-pooling:
  - the pooler is "PgBouncer in transaction mode (`pool_mode=transaction`)";
  - "Not supported with pooled connections" includes "`LISTEN` / `NOTIFY`";
  - "| Schema migrations | Direct | Tools may not support transaction pooling |";
  - "**10,000** = Maximum number of client connections PgBouncer can accept";
  - "`max_prepared_statements=1000`".
- https://neon.com/docs/guides/vercel-managed-integration: "| `DATABASE_URL_UNPOOLED` | Direct connection string |"; `DATABASE_URL` is the "Pooled connection string (PgBouncer)".
- Code consequences:
  - `src/lib/env.ts`: `DATABASE_URL_UNPOOLED` (optional; required in production when the `DATABASE_URL` host contains `-pooler.`, and must not itself be pooled); `directDatabaseUrl()`.
  - `src/server/research/dashboard-service.ts`: LISTEN on `directDatabaseUrl(env)`.
  - `scripts/db/_shared.ts` `resolveDatabaseUrl` and `drizzle.config.ts`: the direct URL for the main database.
  - Session state through the pooler is safe: every `set_config` is transaction-local (`src/server/cms/core.ts:56,70`, `src/server/cms/media/service.ts:338,535`, `src/server/study/purge.ts:108`); no session `SET`, advisory lock, temp table or named prepared statement (code-compat notes).
- **Inference, to verify live:** `pg_notify()` in the triggers of `db/migrations/0014_dashboard_notify.sql:20,24` runs inside the writer's transaction through the pooler and is delivered at commit to the LISTEN on the direct connection. Neon lists NOTIFY as unsupported on pooled connections, meaning sessions that wait for notifications; RUNBOOK 4.5 (by hand) tests it.

### N§3. Regions

- https://neon.com/docs/introduction/regions: lists AWS regions only (the Azure ones are "deprecated"); nearest to India: "AWS Asia Pacific (Singapore) — `aws-ap-southeast-1`"; "**You cannot change the region**" after creation. No region in India.
- https://vercel.com/docs/regions: "| sin1 | ap-southeast-1 | Singapore |".
- https://vercel.com/docs/functions/configuring-functions/region (updated 2026-08-11): default "*Washington, D.C., USA* (`iad1`) **for all new projects**"; "| Hobby | Single region |"; "Deploying to more regions than your plan allows causes the deployment to fail before the build step."
- Consequence: `vercel.json` `regions: ["sin1"]`; preflight checks that the database host's region is `ap-southeast-1`.

### N§4. Roles

- https://neon.com/docs/manage/roles: "you can't connect using the Postgres `superuser` account like you can in a standalone Postgres installation." Console roles are members of `neon_superuser`, whose `CREATEDB` "Provides the ability to create databases." Roles made with `CREATE ROLE` get no `neon_superuser` membership; passwords need at least 60 bits of entropy (a 64-hex-digit password has 256).
- **Not verified:** whether the owner role may run `CREATE EXTENSION` in a database owned by `episteme_app` (RUNBOOK B2 gives the fallback grant).

### N§5. TLS

- https://neon.com/docs/connect/connect-securely: "Neon requires that all connections use SSL/TLS encryption"; "Neon recommends that you always use `verify-full` mode"; "Neon uses the public ISRG Root X1 certificate issued by Let's Encrypt ... Typically, you do not need to download this file directly, as it is usually available in a root store on your operating system."
- Local checks (code-compat notes): Node v24.21.0 `tls.rootCertificates` contains "CN=ISRG Root X1"; `node_modules/pg-connection-string/index.js:139-151` treats `sslmode=require` as verify-full and warns ("treated as aliases for 'verify-full'", line 222); `channel_binding=require` is ignored unless the `enableChannelBinding` option is set (`node_modules/pg/lib/client.js:87`).
- Consequence: no `DATABASE_CA_PEM` on Neon; the RDS CA rule in `src/lib/env.ts` fires only for `.rds.amazonaws.com` hosts.

### N§6. Backups

- https://neon.com/docs/introduction/history-window: "Free plans cap retention at 6 hours (1 GB)".
- Consequence: own `pg_dump` exports before migrations, after session days and weekly (RUNBOOK 8.2).

### N§7. Cloudflare R2 (Media)

- https://developers.cloudflare.com/r2/pricing/: free each month: storage "10 GB-month / month"; Class A "1 million requests / month"; Class B "10 million requests / month"; egress "Free"; "The free tier only applies to Standard storage".
- https://developers.cloudflare.com/r2/buckets/public-buckets/: "By default, buckets are never publicly accessible and will always require explicit user permission to enable."
- https://developers.cloudflare.com/r2/api/s3/api/ ("Last updated Oct 14, 2026"): "the region for an R2 bucket is `auto`"; "an empty value and `us-east-1` will alias to the `auto` region"; endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`; checksum table "| SHA-256 (`SHA256`) | ❌ | ✅ |" in the `FULL_OBJECT` / `COMPOSITE` columns; PutObject lists "✅ Content-MD5" only.
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/: presigned GET, HEAD, PUT and DELETE are supported.
- https://developers.cloudflare.com/r2/buckets/cors/: "you still need to configure CORS when making requests from a browser".
- Code consequence: `storedSha256()` in `src/server/cms/media/storage.ts` hashes the stored object on the server when `HeadObject` returns no single-part SHA-256 (bounded by the type's size limit); `finalizeAssetUpload` uses it.
- **Not verified:** whether R2 accepts the signed `x-amz-checksum-sha256` header on a presigned single PUT. RUNBOOK 4.5 tests one upload.

### N§8. Terms and Data Processing

- https://neon.com/terms-of-service: now a Databricks "Product Specific Schedule (Neon)", "Last Updated: October 14, 2026", "subject to the terms of the then-current Databricks Master Cloud Services Agreement"; no academic or research clause found. The Master Cloud Services Agreement itself was not read.
- https://neon.com/dpa returns the same Schedule; its subprocessor clause: "The Platform Services use Grafana Labs located in the United States for infrastructure services in addition to all other listed subprocessors" (the list itself was not read).
- https://neon.com/docs/security/security-overview: data hosted in "Amazon's or Azure's secure data centers", "AES-256 encryption at rest"; lists SOC 2, ISO 27001/27701, GDPR and CCPA.
- **Not verified:** which DPA now governs (an older Neon DPA of 20 Aug 2025 appears superseded).

### N§9. Consent and Data Location (Repository Review)

**No contradiction found.** No participant-facing or ethics text in the repository says where data is stored (India, AWS, Mumbai or IIT Kharagpur servers), and nothing promises encryption at rest.

- The real consent and information-sheet text is entered per study in the console and stored in the database: `src/features/study/contracts.ts:190-192` ("Versioned consent text, shown verbatim; its sha256 is stored with the decision." ... "Participant information sheet shown before consent."). The only consent text in the repo is a test fixture (`tests/e2e/study-fixtures.ts:61`).
- The CXA/ETH/01 protocol is not in the repo; data location is an open question: `docs/research/requirements-digest.md:363` ("Q-R11 | High | Ethics: consent wording, retention period, who may access raw data, is IP or device fingerprinting allowed, data location?").
- Gap, not contradiction: `src/app/(public)/about/page.tsx:346` says "The privacy page describes what the platform records and where.", but `src/app/(public)/privacy/page.tsx` names no storage location.
- Internal documents that now go out of date: `docs/deploy/aws-resources.md:13` (`ap-south-1` Mumbai) and DR-054 ("RDS and S3 in `ap-south-1`"); DR-055 now leaves the provider to the deployer.
- **Action for the team (not done here, by design):** check the CXA/ETH/01 application and the consent text before any real participant data; with Neon, study data is stored in Singapore (`aws-ap-southeast-1`), and media in Cloudflare R2 (location "auto").
