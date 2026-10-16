/**
 * Post-deploy smoke test against a deployed URL. Read-only: GET/HEAD requests, plus two POSTs to
 * the telemetry endpoint that carry no session and are refused before any database write
 * (src/app/api/telemetry/batch/route.ts checks the origin and the session first).
 *
 *   npx tsx scripts/deploy/smoke.ts --url https://<domain> [--env-file <production env>]
 *        [--invite-path /invite] [--use-invite] [--no-browser] [--no-gpu]
 *
 * Optional environment (never printed):
 *   SMOKE_INVITE_CODE    a valid invite code. Only used with --use-invite, because redeeming a
 *                        code increments its use count (a write); create a "Smoke test" code with
 *                        a small usage limit for this.
 *   SMOKE_BYPASS_SECRET  Vercel "Protection Bypass for Automation" secret, for protected PREVIEW
 *                        deployments; sent as `x-vercel-protection-bypass` (docs: https://vercel.com/
 *                        docs/deployment-protection/methods-to-bypass-deployment-protection/
 *                        protection-bypass-automation).
 *
 * Checks: pages respond; security headers and CSP (with the media store origin, AWS S3 or
 * Cloudflare R2, when --env-file is given);
 * the invite gate redirects every gated page and refuses an invalid code; staff sign-in, the auth
 * API and static assets stay reachable without an invite; staff areas redirect to sign-in; the
 * dashboard stream refuses anonymous callers; telemetry rejects bad input; every museum texture
 * and transcoder file is served with the right size; and, in headless Chromium on the discrete
 * GPU (args from playwright.config.ts), the sign-in form renders with no CSP violation.
 *
 * Invite-gate contract assumed here (source change S11, docs/deploy/RUNBOOK.md "Invite-only
 * access"): visitors without the invite cookie or a staff session are redirected to
 * --invite-path (default /invite); `?invite=<code>` sets the cookie.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { readEnvFile } from "./lib/env-catalog";
import { Report } from "./lib/report";
import { mediaUploadOrigin } from "../../src/lib/security/csp";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const { values: args } = parseArgs({
  options: {
    url: { type: "string" },
    "env-file": { type: "string" },
    "invite-path": { type: "string", default: "/invite" },
    "use-invite": { type: "boolean", default: false },
    "no-browser": { type: "boolean", default: false },
    "no-gpu": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (args.help || !args.url) {
  console.log("Usage: npx tsx scripts/deploy/smoke.ts --url <https://domain> [--env-file <file>] [--invite-path /invite] [--use-invite] [--no-browser] [--no-gpu]");
  process.exit(args.help ? 0 : 2);
}

const base = new URL(args.url);
const ORIGIN = base.origin;
const INVITE = args["invite-path"]!;
const bypass = process.env.SMOKE_BYPASS_SECRET;
const extra: Record<string, string> = bypass ? { "x-vercel-protection-bypass": bypass } : {};
const report = new Report();

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(new URL(path, ORIGIN), {
    redirect: "manual",
    ...init,
    headers: { ...extra, ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(20_000),
  });
}
const loc = (r: Response): string | null => {
  const l = r.headers.get("location");
  return l ? new URL(l, ORIGIN).pathname : null;
};
const err = (e: unknown) => `${(e as Error).name}: ${(e as Error).message}`.slice(0, 160);

// ---- Reachability ------------------------------------------------------------------------------
try {
  const r = await req("/");
  report.add("reach", "GET /", r.status < 500 ? "PASS" : "FAIL", `HTTP ${r.status}${loc(r) ? ` -> ${loc(r)}` : ""}`);
} catch (e) {
  report.add("reach", "GET /", "FAIL", err(e));
  report.print(`Smoke test ${ORIGIN}`);
  process.exit(1);
}

// ---- Invite gate -------------------------------------------------------------------------------
for (const path of ["/", "/explore", "/study", "/about", "/learn/2d", "/learn/immersive"]) {
  try {
    const r = await req(path);
    const to = loc(r);
    const gated = (r.status >= 300 && r.status < 400 && to === INVITE) || (r.status === 200 && path === INVITE);
    report.add("invite gate", `${path} -> ${INVITE}`, gated ? "PASS" : "FAIL", `HTTP ${r.status}${to ? ` -> ${to}` : ""}`);
  } catch (e) {
    report.add("invite gate", `${path} -> ${INVITE}`, "FAIL", err(e));
  }
}
try {
  const r = await req(INVITE);
  report.add("invite gate", `${INVITE} page loads`, r.status === 200 ? "PASS" : "FAIL", `HTTP ${r.status}`);
} catch (e) {
  report.add("invite gate", `${INVITE} page loads`, "FAIL", err(e));
}
try {
  const bogus = `SMOKE-INVALID-${Date.now().toString(36)}`;
  const r = await req(`/?invite=${bogus}`);
  const setsCookie = (r.headers.get("set-cookie") ?? "").length > 0;
  const to = loc(r);
  report.add("invite gate", "invalid code refused", r.status >= 300 && r.status < 400 && to === INVITE && !setsCookie ? "PASS" : "FAIL", `HTTP ${r.status}${to ? ` -> ${to}` : ""}${setsCookie ? ", set a cookie" : ""}`);
} catch (e) {
  report.add("invite gate", "invalid code refused", "FAIL", err(e));
}
if (!args["use-invite"]) {
  report.add("invite gate", "valid code admits", "SKIP", "pass --use-invite with SMOKE_INVITE_CODE (redeeming increments the code's use count)");
} else if (!process.env.SMOKE_INVITE_CODE) {
  report.add("invite gate", "valid code admits", "FAIL", "SMOKE_INVITE_CODE is not set");
} else {
  try {
    const r = await req(`/?invite=${encodeURIComponent(process.env.SMOKE_INVITE_CODE)}`);
    const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const attrs = (r.headers.get("set-cookie") ?? "").toLowerCase();
    const ok = cookie.length > 0 && attrs.includes("httponly") && attrs.includes("secure");
    report.add("invite gate", "valid code sets cookie", ok ? "PASS" : "FAIL", `HTTP ${r.status}; cookie ${cookie ? "set" : "missing"}${ok ? " (HttpOnly, Secure)" : ""}`);
    if (cookie) {
      const again = await req("/", { headers: { cookie } });
      report.add("invite gate", "cookie admits /", again.status === 200 ? "PASS" : "FAIL", `HTTP ${again.status}${loc(again) ? ` -> ${loc(again)}` : ""}`);
    }
  } catch (e) {
    report.add("invite gate", "valid code admits", "FAIL", err(e));
  }
}

// ---- Always reachable without an invite ------------------------------------------------------
let signInCsp: string | null = null;
try {
  const r = await req("/sign-in");
  const html = await r.text();
  signInCsp = r.headers.get("content-security-policy");
  report.add("staff", "/sign-in loads (no invite)", r.status === 200 && /staff sign in/i.test(html) ? "PASS" : "FAIL", `HTTP ${r.status}`);
  report.add("headers", "/sign-in frame-ancestors none", /frame-ancestors 'none'/.test(signInCsp ?? "") && r.headers.get("x-frame-options") === "DENY" ? "PASS" : "FAIL", `XFO ${r.headers.get("x-frame-options") ?? "-"}`);
  const hsts = r.headers.get("strict-transport-security") ?? "";
  report.add("headers", "HSTS", /max-age=\d{7,}/.test(hsts) ? "PASS" : "FAIL", hsts || "(missing)");
  report.add("headers", "nosniff", r.headers.get("x-content-type-options") === "nosniff" ? "PASS" : "FAIL", r.headers.get("x-content-type-options") ?? "(missing)");
  report.add("headers", "no x-powered-by", r.headers.get("x-powered-by") ? "FAIL" : "PASS", r.headers.get("x-powered-by") ?? "");
  report.add("headers", "CSP present", signInCsp && /default-src 'self'/.test(signInCsp) && /object-src 'none'/.test(signInCsp) ? "PASS" : "FAIL", signInCsp ? `${signInCsp.length} chars` : "(missing)");
} catch (e) {
  report.add("staff", "/sign-in loads (no invite)", "FAIL", err(e));
}
if (signInCsp) {
  const connect = /connect-src ([^;]+)/.exec(signInCsp)?.[1] ?? "";
  if (args["env-file"]) {
    const expected = mediaUploadOrigin(readEnvFile(resolve(args["env-file"])));
    report.add("headers", "CSP connect-src has media store", expected && connect.split(/\s+/).includes(expected) ? "PASS" : "FAIL", `expected ${expected ?? "(no bucket in file)"}; connect-src ${connect}`);
  } else {
    report.add("headers", "CSP connect-src", "INFO", `${connect} (pass --env-file to check the media store origin)`);
  }
}
try {
  const r = await req("/api/auth/ok");
  const body = r.status === 200 ? ((await r.json()) as { ok?: boolean }) : null;
  report.add("staff", "/api/auth/ok", body?.ok === true ? "PASS" : "FAIL", `HTTP ${r.status}`);
} catch (e) {
  report.add("staff", "/api/auth/ok", "FAIL", err(e));
}
for (const path of ["/research", "/cms", "/admin"]) {
  try {
    const r = await req(path);
    report.add("staff", `${path} -> /sign-in`, r.status >= 300 && r.status < 400 && loc(r) === "/sign-in" ? "PASS" : "FAIL", `HTTP ${r.status}${loc(r) ? ` -> ${loc(r)}` : ""}`);
  } catch (e) {
    report.add("staff", `${path} -> /sign-in`, "FAIL", err(e));
  }
}
try {
  const r = await req("/api/research/dashboard/stream?study=00000000-0000-4000-8000-000000000000");
  const refused = r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400);
  report.add("staff", "dashboard stream anonymous", refused ? "PASS" : "FAIL", `HTTP ${r.status}, cache-control ${r.headers.get("cache-control") ?? "-"}`);
  await r.body?.cancel();
} catch (e) {
  report.add("staff", "dashboard stream anonymous", "FAIL", err(e));
}

// ---- Telemetry rejects bad input (no session => refused before any write) ---------------------
try {
  const r = await req("/api/telemetry/batch", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: "{not json" });
  report.add("telemetry", "no session -> 401", r.status === 401 ? "PASS" : "FAIL", `HTTP ${r.status}`);
} catch (e) {
  report.add("telemetry", "no session -> 401", "FAIL", err(e));
}
try {
  const r = await req("/api/telemetry/batch", { method: "POST", headers: { "content-type": "application/json", origin: "https://smoke-cross-origin.invalid" }, body: "{}" });
  report.add("telemetry", "cross-origin -> 403", r.status === 403 ? "PASS" : "FAIL", `HTTP ${r.status}`);
} catch (e) {
  report.add("telemetry", "cross-origin -> 403", "FAIL", err(e));
}
try {
  const r = await req("/api/telemetry/batch");
  report.add("telemetry", "GET -> 405", r.status === 405 ? "PASS" : "FAIL", `HTTP ${r.status}`);
} catch (e) {
  report.add("telemetry", "GET -> 405", "FAIL", err(e));
}

// ---- Museum assets (the local tree is the deployed commit's tree) ----------------------------
type TexIndex = { textures: Record<string, { maps: Record<string, { url: string; bytes: number }> }> };
const assets: { path: string; bytes: number }[] = [];
const indexPath = join(REPO, "public/museum/textures/index.json");
if (existsSync(indexPath)) {
  const idx = JSON.parse(readFileSync(indexPath, "utf8")) as TexIndex;
  for (const t of Object.values(idx.textures)) for (const m of Object.values(t.maps)) assets.push({ path: m.url, bytes: m.bytes });
}
const basisDir = join(REPO, "public/museum/basis");
if (existsSync(basisDir)) for (const f of readdirSync(basisDir)) assets.push({ path: `/museum/basis/${f}`, bytes: statSync(join(basisDir, f)).size });
if (existsSync(indexPath)) assets.push({ path: "/museum/textures/index.json", bytes: statSync(indexPath).size });
else report.add("museum", "local texture index", "WARN", "public/museum/textures/index.json missing locally; texture checks skipped");
// The expected sizes come from this working tree, so it must match the deployed commit.
let museumDirty = "";
try {
  museumDirty = execFileSync("git", ["status", "--porcelain", "--", "public/museum"], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
} catch {
  museumDirty = "";
}
if (museumDirty) {
  report.add("museum", "local tree = deployed commit", "WARN", `${museumDirty.split("\n").length} uncommitted change(s) under public/museum: expected sizes may not match the deployment`);
}
let assetFails = 0;
for (const a of assets) {
  try {
    // Node's fetch asks for gzip/br by default, and a compressed response (.wasm, .js, .json)
    // reports the compressed length or none. Ask for the identity encoding to compare exact bytes.
    const r = await req(a.path, { method: "HEAD", headers: { "accept-encoding": "identity" } });
    const len = Number(r.headers.get("content-length") ?? "-1");
    const sizeOk = len === a.bytes || (len === -1 && /\.(js|json|wasm)$/.test(a.path));
    if (r.status !== 200 || !sizeOk) {
      assetFails++;
      report.add("museum", a.path, "FAIL", `HTTP ${r.status}, ${len} bytes (expected ${a.bytes})`);
    }
  } catch (e) {
    assetFails++;
    report.add("museum", a.path, "FAIL", err(e));
  }
}
report.add("museum", `${assets.length} assets served`, assetFails === 0 ? "PASS" : "FAIL", `${assets.length - assetFails}/${assets.length} with the expected size, no invite needed`);
try {
  const r = await req("/museum/basis/ktx2-worker-boot.js", { method: "HEAD" });
  const csp = r.headers.get("content-security-policy") ?? "";
  report.add("museum", "transcoder worker CSP", csp.startsWith("default-src 'none'") ? "PASS" : "FAIL", csp || "(missing)");
} catch (e) {
  report.add("museum", "transcoder worker CSP", "FAIL", err(e));
}

// ---- Headless browser ------------------------------------------------------------------------
if (args["no-browser"]) {
  report.add("browser", "sign-in renders", "SKIP", "--no-browser");
} else {
  await browserChecks();
}

async function browserChecks(): Promise<void> {
  const { chromium } = await import("@playwright/test");
  // Same launch as the "chromium" project of playwright.config.ts (DR-056): full Chromium, ANGLE on D3D11, discrete GPU.
  const gpu = !args["no-gpu"];
  let browser;
  try {
    browser = await chromium.launch(
      gpu
        ? { channel: "chromium", headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--force_high_performance_gpu"] }
        : { headless: true },
    );
  } catch (e) {
    report.add("browser", "launch", "FAIL", err(e));
    return;
  }
  try {
    const context = await browser.newContext({ extraHTTPHeaders: bypass ? { ...extra, "x-vercel-set-bypass-cookie": "true" } : {} });
    const page = await context.newPage();
    let problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(m.text().slice(0, 140));
    });
    page.on("pageerror", (e) => problems.push(e.message.slice(0, 140)));
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
    });
    const errorsOn = (label: string) => {
      report.add("browser", `${label}: no console/CSP errors`, problems.length === 0 ? "PASS" : "FAIL", problems.slice(0, 3).join(" | "));
      problems = [];
    };

    const signIn = await page.goto(new URL("/sign-in", ORIGIN).toString(), { waitUntil: "networkidle", timeout: 30_000 });
    const email = page.locator('input[name="email"]');
    const password = page.locator('input[type="password"]');
    await email.waitFor({ state: "visible", timeout: 15_000 });
    const pwVisible = await password.isVisible();
    report.add("browser", "sign-in form renders", signIn?.status() === 200 && pwVisible ? "PASS" : "FAIL", `HTTP ${signIn?.status()}; email + password fields visible (nothing submitted)`);
    errorsOn("/sign-in");

    const invite = await page.goto(new URL(INVITE, ORIGIN).toString(), { waitUntil: "networkidle", timeout: 30_000 });
    const onInvite = new URL(page.url()).pathname === INVITE && invite?.status() === 200;
    report.add("browser", `${INVITE} renders`, onInvite ? "PASS" : "FAIL", `HTTP ${invite?.status()} at ${new URL(page.url()).pathname}`);
    errorsOn(INVITE);
    if (gpu) {
      const renderer = await page.evaluate(() => {
        const gl = document.createElement("canvas").getContext("webgl");
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "no WebGL";
      });
      report.add("browser", "GPU renderer", /nvidia/i.test(renderer) ? "PASS" : "WARN", renderer.slice(0, 120));
    }
  } catch (e) {
    report.add("browser", "browser checks", "FAIL", err(e));
  } finally {
    await browser.close();
  }
}

report.print(`Smoke test ${ORIGIN}`);
process.exit(report.failed === 0 ? 0 : 1);
