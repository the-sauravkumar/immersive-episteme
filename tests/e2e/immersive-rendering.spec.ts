/**
 * Rendering-quality acceptance checks C1-C12 (docs/architecture/immersive-rendering-quality.md §3)
 * on a real GPU, over the whole manifest. Writes every measured number to
 * analysis/out/museum/rendering-<project>.json (the results document cites these files).
 *
 *   IE_GPU=1 IE_BASE_URL=http://localhost:3000 npx playwright test -c scripts/museum/playwright.gpu.config.ts --project high
 *   IE_GPU=1 ... --project low      (C9: integrated GPU, low tier forced, CPU x4)
 *
 * Or headless on the discrete GPU through the default config (playwright.config.ts, PW_GPU=1: full
 * Chromium, ANGLE on Direct3D 11), which this machine reaches without a window:
 *
 *   IE_GPU=1 PW_GPU=1 PORT=3300 node node_modules/@playwright/test/cli.js test tests/e2e/immersive-rendering.spec.ts --workers=1
 *
 * Skipped unless IE_GPU=1: the default headless shell has no GPU (SwiftShader).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import { expect, test, type CDPSession, type Page } from "@playwright/test";
import sharp from "sharp";

import { blockArtefactIndex, ssim } from "../../scripts/museum/ssim";

test.skip(process.env.IE_GPU !== "1", "GPU measurement run only (IE_GPU=1, scripts/museum/playwright.gpu.config.ts)");
// The GPU config sets 30 min per test; the same budget under the default config (PW_GPU=1).
// Serial by default. With IE_MEASURE_ALL=1 a failing check does not skip the checks after it (the
// worker restarts and reloads the museum; the results of one run are merged by IE_RUN_ID), so a
// baseline run records every check.
const MEASURE_ALL = process.env.IE_MEASURE_ALL === "1";
const RUN_ID = process.env.IE_RUN_ID ?? `${process.pid}-${Date.now()}`;
test.describe.configure({ mode: MEASURE_ALL ? "default" : "serial", timeout: 30 * 60_000 });

const OUT = path.join(process.cwd(), "analysis/out/museum");
const BASELINES = path.join(process.cwd(), "tests/e2e/immersive-baselines");

/** Budgets (immersive-rendering-quality.md §2a low tier, §2c high tier). */
const BUDGET = {
  high: { p95: 16.7, p99: 25, hitch: 50, hitchesAllowed: 0, calls: 250, triangles: 1_500_000, textureMB: 512, heapMB: Infinity },
  low: { p95: 33, p99: 50, hitch: 50, hitchesAllowed: Infinity, calls: 120, triangles: 400_000, textureMB: 192, heapMB: 250 },
} as const;

interface Pose {
  id?: string;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  zoneId?: string | null;
  kind?: string;
}

type Probe = {
  info(): Record<string, unknown> & { ready: boolean; tier: string; gpu: string; config: Record<string, unknown>; textures: { url: string; width: number; height: number; levels: number; format: number }[]; drawingBuffer: { width: number; height: number }; canvasCss: { width: number; height: number }; dpr: number; framesRendered: number };
  viewpoints(): Pose[];
  stability(p: Pose, n: number): Promise<{ pixels: number; changed: number[]; luminance: { mean: number; clippedFraction: number; crushedFraction: number; inkFraction?: number } }>;
  slowYaw(p: Pose, n: number, step: number): Promise<{ meanAbsDiffPerFrame: number[] }>;
  tour(speed: number, turnRate: number): Promise<{ durationS: number; lengthM: number; unreachable: string[]; roomsVisited: string[]; programsBefore: number; programsAfter: number; frames: { t: number; calls: number; triangles: number; programs: number; moving: boolean }[]; rafDeltas: number[] }>;
  memory(): { geometries: number; textures: number; programs: number; jsHeap: number | null; letteringTexels: number; residentRooms: number };
  textureBytes(): { textures: number; renderTargets: number };
  sceneAudit(): { meshes: number; nonUniform: number; transparent: number; imagePlanesDeclared: number; imagePlanesDrawn: number };
  textureLevel0(name: string): { width: number; height: number; base64: string } | null;
  loseContext(ms: number): Promise<{ supported: boolean }>;
  panelContrast(id: string): Promise<{ titleContrast: number; kickerContrast: number; paperLuminance: number; inkLuminance: number; mutedLuminance: number } | null>;
  settle(): Promise<boolean>;
  frameCount(): number;
  /** Added by museum-scene.tsx (installDoorSignProbe). */
  doorSignViews(distance: number): (Pose & { id: string; roomId: string; toRoomId: string; size: { w: number; h: number } })[];
  spawnView(): Pose;
  doorSignRects(): { id: string; toRoomId: string; left: number; top: number; width: number; height: number }[];
};

/** Calls `window.__museumProbe[method](...args)` in the page (no eval: works under the production CSP). */
function call<M extends keyof Probe>(page: Page, method: M, ...args: Parameters<Probe[M]>): Promise<Awaited<ReturnType<Probe[M]>>> {
  return page.evaluate(
    ([m, a]) => (window as unknown as { __museumProbe: Record<string, (...x: unknown[]) => unknown> }).__museumProbe[m]!(...(a as unknown[])),
    [method, args] as const,
  ) as Promise<Awaited<ReturnType<Probe[M]>>>;
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]! : NaN;
};

const results: Record<string, unknown> = {};
let page: Page;
let cdp: CDPSession;
let tier: "high" | "low" = "high";
const telemetry: { type: string; metadata?: Record<string, unknown> }[] = [];

test.beforeAll(async ({ browser }, info) => {
  // Project metadata (scripts/museum/playwright.gpu.config.ts), else PW_GPU=low (headless, integrated GPU, CPU x4).
  tier = (info.project.metadata?.tier as "high" | "low" | undefined) ?? (process.env.PW_GPU === "low" ? "low" : "high");
  const throttle = Number(info.project.metadata?.cpuThrottle ?? (tier === "low" ? 4 : 1));
  mkdirSync(OUT, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page = await ctx.newPage();
  page.on("request", (req) => {
    if (req.url().includes("/api/telemetry/batch") && req.method() === "POST") {
      try {
        telemetry.push(...((req.postDataJSON() as { events?: typeof telemetry }).events ?? []));
      } catch {
        /* ignore */
      }
    }
  });
  cdp = await ctx.newCDPSession(page);
  await page.goto("/explore");
  await page.getByRole("button", { name: /museum/i }).click();
  await page.waitForURL(/\/learn\/immersive/, { waitUntil: "commit" });
  await page.goto(`/learn/immersive?probe=1&tier=${tier}`);
  await page.waitForFunction(() => (window as unknown as { __museumInfo?: () => { ready: boolean } }).__museumInfo?.().ready === true, null, { timeout: 300_000 });
  const enter = page.getByRole("button", { name: "Enter the museum" });
  if (await enter.isVisible().catch(() => false)) await enter.click();
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  const info0 = await call(page, "info");
  results.environment = {
    runId: RUN_ID,
    project: info.project.name,
    tier,
    cpuThrottle: throttle,
    gpu: info0.gpu,
    browser: browser.version(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    drawingBuffer: info0.drawingBuffer,
    dpr: info0.dpr,
  };
});

test.afterAll(async () => {
  const file = path.join(OUT, `rendering-${tier}.json`);
  // Merge the results of earlier workers of the same run (IE_MEASURE_ALL restarts the worker after a failure).
  const earlier = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown> & { environment?: { runId?: string } }) : null;
  const merged = earlier?.environment?.runId === RUN_ID ? { ...earlier, ...results } : results;
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
  await page?.context().close();
});

test("C7 study-mode configuration: fixed tone mapping and exposure, AA only, tier locked and logged once", async () => {
  const info = await call(page, "info");
  const cfg = info.config as { toneMapping: string; exposure: number; outputColorSpace: string; passes: string[]; shadows: boolean; near: number; far: number; fov: number; expected: { exposure: number; postprocessing: string[] } };
  results.c7 = { config: cfg, tier: info.tier };
  expect.soft(cfg.toneMapping).toBe("neutral");
  expect.soft(cfg.exposure).toBe(cfg.expected.exposure);
  expect.soft(cfg.outputColorSpace).toBe("srgb");
  expect.soft(cfg.passes).toEqual(cfg.expected.postprocessing);
  expect.soft(cfg.shadows).toBe(false);
  expect.soft(cfg.near).toBe(0.05);
  expect.soft(cfg.far).toBeLessThanOrEqual(150);
  expect.soft(cfg.fov).toBeGreaterThanOrEqual(60);
  expect.soft(cfg.fov).toBeLessThanOrEqual(70);
  expect.soft(info.tier).toBe(tier);
  await page.waitForTimeout(6_500);
  const logged = telemetry.filter((e) => e.type === "render_quality_changed");
  (results.c7 as Record<string, unknown>).renderQualityEvents = logged.map((e) => e.metadata);
  expect.soft(logged.length).toBe(1);
});

test("C6 geometry: no non-uniform scale, no transparent overlap, image planes", async () => {
  const audit = await call(page, "sceneAudit");
  results.c6 = audit;
  expect.soft(audit.nonUniform).toBe(0);
  expect.soft(audit.transparent).toBe(0);
});

test("C1 static-frame stability, C2 luminance, C5 visual baseline at every viewpoint", async () => {
  const vps = await call(page, "viewpoints");
  const rows: { id: string; zoneId: string | null; kind: string; maxChanged: number; changedFraction: number; mean: number; clipped: number; crushed: number; ink: number }[] = [];
  for (const v of vps) {
    const r = await call(page, "stability", v, 30);
    const maxChanged = Math.max(...r.changed);
    rows.push({ id: v.id!, zoneId: v.zoneId ?? null, kind: v.kind!, maxChanged, changedFraction: maxChanged / r.pixels, mean: r.luminance.mean, clipped: r.luminance.clippedFraction, crushed: r.luminance.crushedFraction, ink: r.luminance.inkFraction ?? 0 });
  }
  const museumMean = rows.reduce((s, r) => s + r.mean, 0) / rows.length;
  const zones = new Map<string, number[]>();
  for (const r of rows) (zones.get(r.zoneId ?? "none") ?? zones.set(r.zoneId ?? "none", []).get(r.zoneId ?? "none")!).push(r.mean);
  const zoneMeans = [...zones.entries()].map(([z, xs]) => ({ zone: z, mean: xs.reduce((a, b) => a + b, 0) / xs.length, deviation: xs.reduce((a, b) => a + b, 0) / xs.length / museumMean - 1 }));
  results.c1 = { viewpoints: rows.length, framesPerViewpoint: 30, worstChangedPixels: Math.max(...rows.map((r) => r.maxChanged)), worstChangedFraction: Math.max(...rows.map((r) => r.changedFraction)), failing: rows.filter((r) => r.changedFraction > 0.0001).map((r) => r.id) };
  results.c2 = { museumMeanLuma: museumMean, maxClippedFraction: Math.max(...rows.map((r) => r.clipped)), maxCrushedFraction: Math.max(...rows.map((r) => r.crushed)), maxPlateInkFraction: Math.max(...rows.map((r) => r.ink)), zoneMeans, viewpoints: rows };
  for (const r of rows) {
    expect.soft(r.changedFraction, `C1 ${r.id}`).toBeLessThanOrEqual(0.0001);
    expect.soft(r.clipped, `C2 clipped ${r.id}`).toBeLessThanOrEqual(0.005);
    expect.soft(r.crushed, `C2 crushed ${r.id}`).toBeLessThanOrEqual(0.005);
  }
  for (const z of zoneMeans) expect.soft(Math.abs(z.deviation), `C2 zone ${z.zone}`).toBeLessThanOrEqual(0.15);

  // C2b (DR-023): each study wing's entrance room from the equivalent viewpoints (its "#wall" and
  // "#door" views) has a mean luminance within ±5% of the wings' average.
  const entranceRows = rows.filter((r) => /^room:[^:]+:tradition_context#(wall|door)$/.test(r.id));
  const wingMeans = [...new Set(entranceRows.map((r) => r.id.split(":")[1]!))].map((wing) => {
    const xs = entranceRows.filter((r) => r.id.split(":")[1] === wing).map((r) => r.mean);
    return { wing, mean: xs.reduce((a, b) => a + b, 0) / xs.length, views: xs.length };
  });
  const wingAverage = wingMeans.reduce((s2, w) => s2 + w.mean, 0) / Math.max(1, wingMeans.length);
  const c2b = wingMeans.map((w) => ({ ...w, deviation: w.mean / wingAverage - 1 }));
  (results.c2 as Record<string, unknown>).c2bWingEntranceRooms = c2b;
  expect.soft(c2b.length, "C2b wings measured").toBeGreaterThanOrEqual(3);
  for (const w of c2b) expect.soft(Math.abs(w.deviation), `C2b ${w.wing}`).toBeLessThanOrEqual(0.05);

  // C5: one room view per zone against an approved baseline (640 x 360 PNG per GPU project).
  const dir = path.join(BASELINES, tier);
  mkdirSync(dir, { recursive: true });
  const c5: { id: string; diffFraction: number | null; baseline: "compared" | "created" }[] = [];
  for (const v of vps.filter((x) => x.kind === "room-wall").filter((x, i, a) => a.findIndex((y) => y.zoneId === x.zoneId) === i)) {
    await call(page, "stability", v, 1);
    const shot = await sharp(await page.locator("canvas").first().screenshot()).resize(640, 360).removeAlpha().raw().toBuffer();
    const file = path.join(dir, `${v.id!.replace(/[^a-z0-9]+/gi, "_")}.png`);
    if (!existsSync(file)) {
      await sharp(shot, { raw: { width: 640, height: 360, channels: 3 } }).png().toFile(file);
      c5.push({ id: v.id!, diffFraction: null, baseline: "created" });
      continue;
    }
    const base = await sharp(readFileSync(file)).removeAlpha().raw().toBuffer();
    let d = 0;
    for (let i = 0; i < base.length; i += 3) if (Math.abs(base[i]! - shot[i]!) + Math.abs(base[i + 1]! - shot[i + 1]!) + Math.abs(base[i + 2]! - shot[i + 2]!) > 24) d++;
    c5.push({ id: v.id!, diffFraction: d / (640 * 360), baseline: "compared" });
    expect.soft(d / (640 * 360), `C5 ${v.id}`).toBeLessThanOrEqual(0.002);
  }
  results.c5 = c5;
});

test("C1b slow yaw: no isolated shimmer spikes", async () => {
  const vps = (await call(page, "viewpoints")).filter((v) => v.kind === "room-wall").filter((x, i, a) => a.findIndex((y) => y.zoneId === x.zoneId) === i);
  const rows: { id: string; spikes: number; median: number; max: number }[] = [];
  for (const v of vps) {
    const r = await call(page, "slowYaw", v, 60, 0.1);
    const d = r.meanAbsDiffPerFrame;
    const med = pct(d, 50);
    rows.push({ id: v.id!, spikes: d.filter((x) => x > 3 * med + 0.05).length, median: med, max: Math.max(...d) });
  }
  results.c1b = { viewpoints: rows.length, framesEach: 60, stepDeg: 0.1, totalSpikes: rows.reduce((s, r) => s + r.spikes, 0), rows };
  for (const r of rows) expect.soft(r.spikes, `C1b ${r.id}`).toBe(0);
});

test("C3 frame times, C4 hitches and shader compiles, C11 memory over two tours", async () => {
  const gc = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(500);
  };
  // C11 compares counts at the same place: every snapshot is taken at the spawn view, so the same
  // rooms' lettering is resident (the tours end in different rooms).
  const home = async () => {
    await call(page, "stability", await call(page, "spawnView"), 1);
    await gc();
  };
  await home();
  const before = await call(page, "memory");
  const t1 = await call(page, "tour", 2.5, Math.PI / 2);
  const tex1 = await call(page, "textureBytes");
  await home();
  const mid = await call(page, "memory");
  const t2 = await call(page, "tour", 2.5, Math.PI / 2);
  await home();
  const after = await call(page, "memory");
  const b = BUDGET[tier];
  const summarise = (t: typeof t1) => {
    const deltas = t.rafDeltas.slice(1);
    return {
      durationS: t.durationS,
      lengthM: t.lengthM,
      roomsVisited: t.roomsVisited.length,
      unreachable: t.unreachable,
      frames: deltas.length,
      p50: pct(deltas, 50),
      p95: pct(deltas, 95),
      p99: pct(deltas, 99),
      max: Math.max(...deltas),
      over50ms: deltas.filter((d) => d > 50).length,
      maxCalls: Math.max(...t.frames.map((f) => f.calls)),
      maxTriangles: Math.max(...t.frames.map((f) => f.triangles)),
      programsBefore: t.programsBefore,
      programsAfter: t.programsAfter,
    };
  };
  const s1 = summarise(t1);
  const s2 = summarise(t2);
  results.c3 = { tour1: s1, tour2: s2, budget: b };
  results.c11 = { before, afterFirstTour: mid, afterSecondTour: after, textureBytesDuringTour: tex1, heapGrowth: before.jsHeap && after.jsHeap ? after.jsHeap / mid.jsHeap! - 1 : null };
  for (const s of [s1, s2]) {
    expect.soft(s.p95, "C3 p95").toBeLessThanOrEqual(b.p95);
    expect.soft(s.p99, "C3 p99").toBeLessThanOrEqual(b.p99);
    expect.soft(s.maxCalls, "C3 draw calls").toBeLessThanOrEqual(b.calls);
    expect.soft(s.maxTriangles, "C3 triangles").toBeLessThanOrEqual(b.triangles);
    // No program compiled after entry (a count that falls, when a material is released, is not a compile).
    expect.soft(s.programsAfter, "C4 programs after entry").toBeLessThanOrEqual(s.programsBefore);
    expect.soft(s.unreachable).toEqual([]);
  }
  if (tier === "high") expect.soft(s1.over50ms + s2.over50ms, "C4 frames > 50 ms").toBe(0);
  expect.soft(tex1.textures / 1048576, "texture MB").toBeLessThanOrEqual(b.textureMB);
  expect.soft(after.textures, "C11 textures back to baseline").toBe(mid.textures);
  expect.soft(after.geometries, "C11 geometries back to baseline").toBe(mid.geometries);
  if (mid.jsHeap && after.jsHeap) expect.soft(after.jsHeap / mid.jsHeap - 1, "C11 heap growth").toBeLessThan(0.1);
  if (after.jsHeap) expect.soft(after.jsHeap / 1048576, "JS heap MB").toBeLessThanOrEqual(b.heapMB);
});

test("C10 idle and hidden: no frames while still or hidden", async () => {
  await call(page, "settle");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value])) as Record<string, number>;
  await cdp.send("Performance.enable");
  const f0 = await call(page, "frameCount");
  const m0 = await metrics();
  await page.waitForTimeout(10_000);
  const f1 = await call(page, "frameCount");
  const m1 = await metrics();
  const idleCpu = (m1.TaskDuration! - m0.TaskDuration!) / ((m1.Timestamp! - m0.Timestamp!) || 10);
  // Hidden: minimise the window (document.visibilityState becomes "hidden").
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  await page.waitForTimeout(1_000);
  const hidden = await page.evaluate(() => document.visibilityState);
  const h0 = await call(page, "frameCount");
  const mh0 = await metrics();
  await page.waitForTimeout(5_000);
  const h1 = await call(page, "frameCount");
  const mh1 = await metrics();
  const hiddenCpu = (mh1.TaskDuration! - mh0.TaskDuration!) / ((mh1.Timestamp! - mh0.Timestamp!) || 5);
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
  results.c10 = { idleFramesIn10s: f1 - f0, idleMainThreadBusyFraction: idleCpu, visibilityWhenMinimised: hidden, hiddenFramesIn5s: h1 - h0, hiddenMainThreadBusyFraction: hiddenCpu };
  expect.soft(f1 - f0, "C10 idle frames").toBe(0);
  expect.soft(h1 - h0, "C10 hidden frames").toBe(0);
});

test("C12 texture fidelity: GPU texture vs source (SSIM, blocking), same assets on every tier, sharp at rest", async () => {
  const info = await call(page, "info");
  // Every texture the finish loads (DR-023: the two colour maps; the unlit architecture uses no normal or ORM map).
  const names = info.textures.map((t) => t.url.replace(/^.*\//, "").replace(/\.[0-9a-f]+\.ktx2$/, ""));
  expect(names.length).toBeGreaterThan(0);
  const rows: { name: string; width: number; height: number; ssim: number; minWindowSsim: number; perChannel: number[]; blockIndex: number }[] = [];
  for (const name of names) {
    const r = await call(page, "textureLevel0", name);
    expect.soft(r, name).not.toBeNull();
    if (!r) continue;
    const gpu = { data: Buffer.from(r.base64, "base64"), width: r.width, height: r.height, channels: 3 as const };
    const src = await sharp(path.join(OUT, "sources", `${name}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect.soft(src.info.width).toBe(r.width);
    const s = ssim(gpu, { data: src.data, width: src.info.width, height: src.info.height, channels: 3 });
    rows.push({ name, width: r.width, height: r.height, ssim: s.mean, minWindowSsim: s.min, perChannel: s.perChannel, blockIndex: blockArtefactIndex(gpu, { data: src.data, width: src.info.width, height: src.info.height, channels: 3 }) });
    expect.soft(s.mean, `C12 SSIM ${name}`).toBeGreaterThanOrEqual(0.98);
  }
  // Same texture assets and sizes on every tier: compared with the other tier's run when present.
  const other = path.join(OUT, `rendering-${tier === "high" ? "low" : "high"}.json`);
  const otherTextures = existsSync(other) ? (JSON.parse(readFileSync(other, "utf8")) as { c12?: { textures?: unknown } }).c12?.textures : null;
  // Native resolution at rest: the drawing buffer always equals the canvas size times the DPR (never reduced, even in motion).
  const native = info.drawingBuffer.width === Math.round(info.canvasCss.width * info.dpr) && info.drawingBuffer.height === Math.round(info.canvasCss.height * info.dpr);
  results.c12 = { textures: info.textures, fidelity: rows, sameAsOtherTier: otherTextures ? JSON.stringify(otherTextures) === JSON.stringify(info.textures) : "other tier not measured yet", nativeResolutionAlways: native, renderScaleInMotion: 1.0 };
  if (otherTextures) expect.soft(JSON.stringify(otherTextures)).toBe(JSON.stringify(info.textures));
  expect.soft(native).toBe(true);
});

/**
 * Wall plates carry the concept title only (DESIGN.md 11.6; museum-app.tsx `describe`), drawn at
 * full ink coverage (three/labels.ts). The probe still reports its "kicker" band (5-16% from the
 * top), which is now blank paper or the top of the title; it is recorded, not asserted.
 */
test("Legibility under the scene lighting: card text contrast at the approach point (WCAG 2.2 AA)", async () => {
  const vps = (await call(page, "viewpoints")).filter((v) => v.kind === "exhibit");
  const rows: { id: string; title: number; topBand: number }[] = [];
  for (const v of vps) {
    await call(page, "stability", v, 1);
    const id = v.id!.replace(/#approach$/, "");
    const c = await call(page, "panelContrast", id);
    if (c) rows.push({ id, title: c.titleContrast, topBand: c.kickerContrast });
  }
  results.contrast = { exhibits: rows.length, minTitle: Math.min(...rows.map((r) => r.title)), rows };
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) expect.soft(r.title, `title contrast ${r.id}`).toBeGreaterThanOrEqual(4.5);
});

/**
 * Room plaques (DESIGN.md 11.6: contrast at least 4.5:1 under the scene lighting), read out of the
 * rendered page with the same method as the plates: inside the plaque's screen rectangle (6% side
 * inset, 10% top and bottom), paper = 90th and ink = 1st luminance percentile. Asserted at the
 * 2.5 m signage distance of placement.ts, square-on at eye level, for every plaque; the session's
 * first view (the spawn) and every room-centre view are recorded, not asserted (a plaque seen from
 * across a room is smaller than the signage rule covers).
 */
test("Legibility under the scene lighting: room plaque contrast at 2.5 m (WCAG 2.2 AA)", async () => {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const measure = async (shot: Buffer, r: { left: number; top: number; width: number; height: number }) => {
    const meta = await sharp(shot).metadata();
    const l = Math.max(0, Math.round(r.left + r.width * 0.06));
    const t = Math.max(0, Math.round(r.top + r.height * 0.1));
    const w = Math.min(meta.width!, Math.round(r.left + r.width * 0.94)) - l;
    const h = Math.min(meta.height!, Math.round(r.top + r.height * 0.9)) - t;
    if (w < 4 || h < 4) return null;
    const { data, info } = await sharp(shot).extract({ left: l, top: t, width: w, height: h }).raw().toBuffer({ resolveWithObject: true });
    const ls: number[] = [];
    for (let i = 0; i < data.length; i += info.channels) ls.push(0.2126 * lin(data[i]!) + 0.7152 * lin(data[i + 1]!) + 0.0722 * lin(data[i + 2]!));
    ls.sort((a, b) => a - b);
    const q = (f: number) => ls[Math.min(ls.length - 1, Math.floor(f * ls.length))]!;
    return (q(0.9) + 0.05) / (q(0.01) + 0.05);
  };
  const views = await call(page, "doorSignViews", 2.5);
  const at25: { id: string; ratio: number | null }[] = [];
  for (const v of views) {
    await call(page, "stability", v, 1);
    const rect = (await call(page, "doorSignRects")).find((r) => r.id === v.id);
    at25.push({ id: v.id, ratio: rect ? await measure(await page.screenshot(), rect) : null });
  }
  const seen = async (v: Pose) => {
    await call(page, "stability", v, 1);
    const shot = await page.screenshot();
    const rows: { from: string; id: string; widthPx: number; ratio: number | null }[] = [];
    for (const r of await call(page, "doorSignRects")) rows.push({ from: v.id ?? "", id: r.id, widthPx: Math.round(r.width), ratio: await measure(shot, r) });
    return rows;
  };
  const spawn = await seen(await call(page, "spawnView"));
  const centres: Awaited<ReturnType<typeof seen>> = [];
  for (const v of (await call(page, "viewpoints")).filter((x) => x.kind === "room-door")) centres.push(...(await seen(v)));
  results.plaques = { at2_5m: { plaques: at25.length, min: Math.min(...at25.map((r) => r.ratio ?? 0)), rows: at25 }, spawn, roomCentres: centres };
  expect(at25.length).toBeGreaterThan(0);
  for (const r of at25) expect.soft(r.ratio ?? 0, `plaque contrast at 2.5 m ${r.id}`).toBeGreaterThanOrEqual(4.5);
});

test("C8 context loss: pauses, restores, logs", async () => {
  const before = await call(page, "frameCount");
  const r = await call(page, "loseContext", 800);
  expect(r.supported).toBe(true);
  await expect(page.locator("[data-testid=museum-root]")).toHaveAttribute("data-phase", "exploring", { timeout: 30_000 });
  await call(page, "stability", (await call(page, "viewpoints"))[0]!, 2);
  const after = await call(page, "frameCount");
  await page.waitForTimeout(6_500);
  const lost = telemetry.filter((e) => e.type === "webgl_context_lost").length;
  results.c8 = { framesBefore: before, framesAfterRestore: after, webglContextLostEvents: lost };
  expect.soft(after).toBeGreaterThan(before);
  expect.soft(lost).toBeGreaterThanOrEqual(1);
});
