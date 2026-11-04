const fs = require("fs");
const { launchGpu, rendererOf } = require("C:/Tools/Playwright/launch.cjs");
const base = "http://127.0.0.1:" + (process.env.LAB_PORT || 8940) + "/?";
const OUT = "public/walkthrough/stills";
const catalogue = fs.readFileSync("src/features/process/domain/asset-catalogue.ts", "utf8");
const MODELS = [...catalogue.matchAll(/(?:scan|integral)\("([a-z-]+)"/g)].map((match) => match[1]);
const only = process.argv.slice(2);

async function shoot(browser, query, file, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(170000);
  page.on("pageerror", (error) => console.log("PAGEERR", query, error.message.slice(0, 300)));
  await page.goto(base + query);
  await page.waitForFunction("window.READY===true");
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${file}`, type: "jpeg", quality: 88 });
  console.log(file, fs.statSync(`${OUT}/${file}`).size);
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchGpu();
  const probe = await browser.newPage();
  await probe.goto(base + "s=still&m=crate");
  console.log(await rendererOf(probe));
  await probe.close();
  const wanted = (name) => only.length === 0 || only.includes(name);
  for (const model of MODELS) if (wanted(model)) await shoot(browser, `s=still&m=${model}`, `${model}.jpg`, 1800, 1440);
  if (wanted("practice-view")) await shoot(browser, "s=practice", "practice-view.jpg", 3840, 2160);
  if (wanted("entrance")) {
    await shoot(browser, "s=entrance", "entrance-closed.jpg", 3840, 2160);
    await shoot(browser, "s=entrance&open=door-1&t=1", "entrance-open1.jpg", 3840, 2160);
    await shoot(browser, "s=entrance&open=door-2&t=1", "entrance-open2.jpg", 3840, 2160);
  }
  await browser.close();
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 400));
  process.exit(1);
});
