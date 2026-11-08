const fs = require("fs");
const { launchGpu, rendererOf } = require("C:/Tools/Playwright/launch.cjs");
const { figureOf, seenThrough } = require("./colour-figures.cjs");
const out = process.argv[2];
const base = "http://127.0.0.1:" + (process.env.LAB_PORT || 8940) + "/?";
const WIDTH = 1800;
const HEIGHT = 1440;
const BROWSER_LIFE = 12;

async function openReady(browser, url) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  page.setDefaultTimeout(90000);
  page.on("pageerror", (error) => console.log("PAGEERR", url, error.message.slice(0, 300)));
  await page.goto(url);
  await page.waitForFunction("window.READY===true");
  return page;
}

(async () => {
  let browser = await launchGpu();
  const probe = await openReady(browser, base + "s=still&m=crate");
  const renderer = await rendererOf(probe);
  console.log(renderer);
  const jobs = await probe.evaluate("window.stillJobs()");
  await probe.close();
  const rows = [];
  const seen = new Set();
  let opened = 0;
  for (const job of jobs) {
    if (seen.has(job.file) || job.looks.length === 0) continue;
    seen.add(job.file);
    if (++opened % BROWSER_LIFE === 0) {
      await browser.close();
      browser = await launchGpu();
    }
    const page = await openReady(browser, base + job.query);
    for (const look of job.looks) {
      const measured = await page.evaluate(`window.colourOfStill(${JSON.stringify(look.key)},${seenThrough(look) ? JSON.stringify(look.renderHex) : "null"})`);
      const row = { still: job.file, item: job.name, key: look.key, fill: look.fill, transparency: look.transparency, renderHex: look.renderHex, target: seenThrough(look) ? "seen through" : "renderHex", ...figureOf(measured, look) };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
    await page.close();
  }
  await browser.close();
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(`${out}/still-colours.json`, JSON.stringify({ renderer, rows }, null, 1));
  console.log("done", rows.length);
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 500));
  process.exit(1);
});
