/**
 * Room walk times in the real scene (DR-064): the browser check of scripts/museum/walk-times.ts.
 * Production server, one full Chromium on the NVIDIA GPU (the renderer string is recorded and
 * must name NVIDIA), the preview museum at /learn/immersive?probe=1&tier=high, 1280 x 720 at DPR 1.
 * For every wing room: put the visitor back on the spawn (probe), open the Plan and click the
 * room's row (the scene's walkToRoom), then time from the click to the frame the visitor stops.
 *
 *   node scripts/museum/walk-times-browser.mjs <sim.json> <out.json>
 * Needs the e2e invite cookie (test-results/.auth/invite.json) and a server on BASE (localhost:3000).
 */
import fs from "node:fs";
import { chromium } from "@playwright/test";

const [simPath, outPath] = process.argv.slice(2);
const BASE = process.env.BASE ?? "http://localhost:3000";
const sim = JSON.parse(fs.readFileSync(simPath, "utf8"));

const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--force_high_performance_gpu"] });
const result = { method: "Plan row click -> walkToRoom, timed in the page from the click to the last frame the visitor moved", rooms: [] };
try {
  const ctx = await browser.newContext({ storageState: "test-results/.auth/invite.json", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`${BASE}/explore`);
  await page.getByRole("button", { name: /museum/i }).click();
  await page.waitForURL(/\/learn\/immersive/, { waitUntil: "commit" });
  await page.goto(`${BASE}/learn/immersive?probe=1&tier=high`);
  await page.waitForFunction(() => window.__museumInfo?.().ready === true, null, { timeout: 300_000 });
  const enter = page.getByRole("button", { name: "Enter the museum" });
  if (await enter.isVisible().catch(() => false)) await enter.click();
  const info = await page.evaluate(() => window.__museumInfo());
  result.gpu = info.gpu;
  result.browser = browser.version();
  if (!/NVIDIA/i.test(String(info.gpu))) throw new Error(`renderer is not NVIDIA: ${info.gpu}`);
  await page.evaluate(() => {
    window.__walkClick = 0;
    document.addEventListener("click", () => (window.__walkClick = performance.now()), true);
  });
  const spawn = await page.evaluate(() => window.__museumProbe.spawnView());
  result.spawn = spawn;

  // The Plan lists each wing's rooms in planOrder, the order of the simulated wing legs.
  const jobs = sim.wings.flatMap((w) => w.legs.map((l, i) => ({ r: sim.rooms.find((x) => x.roomId === l.to), i })));
  for (const { r, i } of jobs) {
    await page.evaluate((p) => window.__museumProbe.stability(p, 1), spawn);
    // The minimap's Expand, else the study bar's Plan then Expand (as exposure-parity.spec.ts does).
    let expand = page.getByRole("button", { name: "Expand plan" });
    if (!(await expand.isVisible())) {
      await page.locator("[data-slot=study-bar]").getByRole("button", { name: "Plan" }).click();
      expand = page.getByRole("button", { name: "Expand plan" });
    }
    await expand.click();
    await page.locator(`[data-slot="museum-plan-dialog"] li button[data-tradition="${r.tradition}"]`).nth(i).click();
    const t = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const t0 = window.__walkClick;
          let last = null;
          let lastMove = performance.now();
          let still = 0;
          const tick = (now) => {
            const v = window.__museumInfo().visitor;
            const key = `${v.x.toFixed(4)},${v.z.toFixed(4)},${v.yaw.toFixed(4)}`;
            if (key !== last) {
              last = key;
              lastMove = now;
              still = 0;
            } else still++;
            if (v.route === 0 && v.routeYaw === null && still >= 30) resolve({ seconds: (lastMove - t0) / 1000, at: { x: v.x, z: v.z }, room: window.__museumInfo().roomId });
            else if (now - t0 > 120_000) resolve({ seconds: null, timeout: true, at: { x: v.x, z: v.z }, room: window.__museumInfo().roomId });
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    const row2 = { roomId: r.roomId, tradition: r.tradition, group: r.group, seconds: t.seconds === null ? null : Math.round(t.seconds * 100) / 100, simSeconds: r.seconds, arrivedIn: t.room, timeout: !!t.timeout };
    row2.diff = row2.seconds === null ? null : Math.round((row2.seconds - r.seconds) * 100) / 100;
    result.rooms.push(row2);
    console.log(JSON.stringify(row2));
  }
} finally {
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
  await browser.close();
}
