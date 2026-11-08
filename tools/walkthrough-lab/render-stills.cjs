const fs = require("fs");
const path = require("path");
const { launchGpu, rendererOf } = require("C:/Tools/Playwright/launch.cjs");
const origin = "http://127.0.0.1:" + (process.env.LAB_PORT || 8940);
const base = origin + "/?";
const PUBLIC = "public";
const STILLS = "/walkthrough/stills";
const BROWSER_LIFE = 12;
const READY_LIMIT_MS = 90000;
const only = process.argv.slice(2);
const stillFiles = only.filter((name) => name.startsWith(`${STILLS}/objects/`));
const wanted = (name) => only.length === 0 || only.includes(name) || (name === "objects" && stillFiles.length > 0);

async function openReady(browser, url, width, height, scale) {
  for (let attempt = 1; ; attempt++) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    page.setDefaultTimeout(READY_LIMIT_MS);
    page.on("pageerror", (error) => console.log("PAGEERR", url, error.message.slice(0, 300)));
    try {
      await page.goto(url);
      await page.waitForFunction("window.READY===true");
      return page;
    } catch (error) {
      await page.close();
      if (attempt === 2) throw error;
      console.log("RETRY", url);
    }
  }
}

async function shoot(browser, url, file, width, height, scale = 1) {
  const page = await openReady(browser, url, width, height, scale);
  await page.waitForTimeout(250);
  fs.mkdirSync(path.dirname(`${PUBLIC}${file}`), { recursive: true });
  await page.screenshot({ path: `${PUBLIC}${file}`, type: "jpeg", quality: 88 });
  console.log(file, fs.statSync(`${PUBLIC}${file}`).size);
  await page.close();
}

(async () => {
  let browser = await launchGpu();
  const probe = await openReady(browser, base + "s=still&m=crate", 1280, 720, 1);
  console.log(await rendererOf(probe));
  const jobs = await probe.evaluate("window.stillJobs()");
  await probe.close();
  if (wanted("objects")) {
    const seen = new Set();
    let shot = 0;
    for (const job of jobs) {
      if (seen.has(job.file) || (stillFiles.length > 0 && !stillFiles.includes(job.file))) continue;
      seen.add(job.file);
      if (++shot % BROWSER_LIFE === 0) {
        await browser.close();
        browser = await launchGpu();
      }
      await shoot(browser, base + job.query, job.file, 1800, 1440);
    }
    if (process.env.STILL_INDEX) fs.writeFileSync(process.env.STILL_INDEX, JSON.stringify(jobs, null, 1));
  }
  await browser.close();
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 400));
  process.exit(1);
});
