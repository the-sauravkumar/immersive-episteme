/**
 * DR-014 decision by measurement: renders the same museum world with
 *   webgl-taa             WebGLRenderer + TAARenderPass accumulation at rest + SMAA (the shipped path)
 *   webgpu-traa           WebGPURenderer + TRAA (WebGPU backend)
 *   webgpu-fallback-traa  WebGPURenderer + TRAA with forceWebGL (WebGL2 fallback backend)
 * and measures C1 (30 frames at a still camera: changed pixels against the first frame), C1b
 * (0.1 degree per frame yaw: frame-to-frame difference spikes) and GPU frame time while turning.
 *
 *   npx tsx scripts/museum/renderer-decision.ts [--gpu high|low]
 *
 * Writes analysis/out/museum/renderer-decision.json. Needs the database (the demo study's
 * manifest) and a desktop session (headed Chromium with the GPU).
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import pg from "pg";
import { chromium } from "playwright";

import { buildSceneModel } from "../../src/features/immersive/scene-model";
import { createRouter } from "../../src/features/immersive/navigation";
import { viewpoints } from "../../src/features/immersive/tour-path";
import { gpuLaunchArgs } from "./gpu-browser";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "analysis/out/museum");
const LAB = path.join(OUT, "lab");
const gpu = (process.argv[process.argv.indexOf("--gpu") + 1] ?? "high") as "high" | "low";

async function loadManifest() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query<{ manifest: unknown; id: string }>(
    "SELECT m.id, m.manifest FROM spatial_manifests m JOIN studies s ON s.manifest_id = m.id WHERE s.slug = 'demo-review-walkthrough'",
  );
  await pool.end();
  if (!r.rows[0]) throw new Error("demo study manifest not found: run npm run dev:bootstrap");
  return r.rows[0];
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? NaN;
};

async function main() {
  mkdirSync(LAB, { recursive: true });
  const rec = await loadManifest();
  const model = buildSceneModel(rec.manifest as never);
  writeFileSync(path.join(LAB, "scene-model.json"), JSON.stringify(model));
  await build({
    entryPoints: [path.join(ROOT, "scripts/museum/renderer-lab/lab.ts")],
    bundle: true,
    format: "esm",
    outfile: path.join(LAB, "lab.js"),
    tsconfig: path.join(ROOT, "tsconfig.json"),
    target: "es2022",
    logLevel: "warning",
  });
  writeFileSync(
    path.join(LAB, "index.html"),
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}canvas{display:block;width:1280px;height:720px}</style><canvas id="c"></canvas><script type="module" src="/lab.js"></script>`,
  );
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    const file = url === "/" ? path.join(LAB, "index.html") : url.startsWith("/museum/") ? path.join(ROOT, "public", url) : path.join(LAB, url);
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".json") ? "application/json" : file.endsWith(".html") ? "text/html" : file.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": type }).end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(3199, r));

  const vps = viewpoints(model, createRouter(model.rooms, model.colliders));
  // One room-wall and one doorway view per zone, plus exhibit approaches: 12 views.
  const pick = [...vps.filter((v) => v.kind === "room-wall").filter((v, i, a) => a.findIndex((x) => x.zoneId === v.zoneId) === i), ...vps.filter((v) => v.kind === "doorway").slice(0, 3), ...vps.filter((v) => v.kind === "exhibit").slice(0, 3)].slice(0, 12);

  const results: Record<string, unknown> = { gpuPreference: gpu, manifestId: rec.id, viewpoints: pick.map((v) => v.id) };
  for (const mode of ["webgl-taa", "webgpu-traa", "webgpu-fallback-traa"] as const) {
    const browser = await chromium.launch({ headless: false, args: gpuLaunchArgs(gpu) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:3199/");
    await page.evaluate((m) => window.startLab(m), mode);
    const err = await page.evaluate(() => window.labError);
    const backend = await page.evaluate(() => window.lab?.backend ?? null);
    const gpuName = await page.evaluate(() => {
      const c = document.createElement("canvas").getContext("webgl2");
      const e = c?.getExtension("WEBGL_debug_renderer_info");
      return e && c ? String(c.getParameter(e.UNMASKED_RENDERER_WEBGL)) : null;
    });
    if (err || !backend) {
      results[mode] = { error: err ?? "lab did not start", errors };
      await browser.close();
      continue;
    }
    const c1: { id: string; maxChanged: number; framesWithChange: number }[] = [];
    const c1b: { id: string; spikes: number; maxDiff: number; medianDiff: number }[] = [];
    for (const v of pick) {
      const r = await page.evaluate(async (p) => {
        window.lab!.setPose(p.x, p.z, p.yaw);
        await window.lab!.render();
        const st = await window.lab!.stability(29);
        const yaw = await window.lab!.slowYaw(60, (0.1 * Math.PI) / 180);
        return { st, yaw };
      }, v);
      c1.push({ id: v.id, maxChanged: Math.max(...r.st), framesWithChange: r.st.filter((x) => x > 0).length });
      const med = pct(r.yaw, 50);
      c1b.push({ id: v.id, spikes: r.yaw.filter((d) => d > 3 * med + 0.05).length, maxDiff: Math.max(...r.yaw), medianDiff: med });
    }
    const times = await page.evaluate(async (p) => {
      window.lab!.setPose(p.x, p.z, p.yaw);
      await window.lab!.frames(30, 0.004);
      return window.lab!.frames(240, 0.004);
    }, pick[0]!);
    results[mode] = {
      backend,
      gpu: gpuName,
      browser: browser.version(),
      c1: { pixels: 1280 * 720, viewpoints: c1.length, viewpointsWithChange: c1.filter((x) => x.maxChanged > 0).length, worstChangedPixels: Math.max(...c1.map((x) => x.maxChanged)), detail: c1 },
      c1b: { totalSpikes: c1b.reduce((s, x) => s + x.spikes, 0), detail: c1b },
      frameMsWhileTurning: { n: times.length, p50: pct(times, 50), p95: pct(times, 95), p99: pct(times, 99), max: Math.max(...times) },
      errors,
    };
    console.log(mode, JSON.stringify({ backend, c1: (results[mode] as { c1: { viewpointsWithChange: number; worstChangedPixels: number } }).c1.worstChangedPixels, c1b: c1b.reduce((s, x) => s + x.spikes, 0) }));
    await browser.close();
  }
  server.close();
  writeFileSync(path.join(OUT, `renderer-decision-${gpu}.json`), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, (k, v) => (k === "detail" ? undefined : v), 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
