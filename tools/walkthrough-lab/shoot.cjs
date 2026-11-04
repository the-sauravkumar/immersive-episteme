const { launchGpu, rendererOf } = require("C:/Tools/Playwright/launch.cjs");
const base = "http://127.0.0.1:" + (process.env.LAB_PORT || 8940) + "/?";
(async () => {
  const browser = await launchGpu();
  let first = true;
  for (const job of process.argv.slice(2)) {
    const [query, out] = job.split("=>");
    const page = await browser.newPage({ viewport: { width: +(process.env.W || 1600), height: +(process.env.H || 900) } });
    page.setDefaultTimeout(150000);
    page.on("pageerror", (error) => console.log("PAGEERR", query, error.message.slice(0, 400)));
    await page.goto(base + query);
    if (first) {
      console.log(await rendererOf(page));
      first = false;
    }
    await page.waitForFunction("window.READY===true");
    await page.waitForTimeout(250);
    await page.screenshot({ path: out, type: "jpeg", quality: 86 });
    const report = await page.evaluate("(()=>{const r=window.QA();return {solids:r.solidsChecked,points:r.clothPointsChecked,problems:r.problems.slice(0,14)}})()");
    console.log(query, JSON.stringify(await page.evaluate("window.INFO")), JSON.stringify(report).slice(0, 900));
    await page.close();
  }
  await browser.close();
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 500));
  process.exit(1);
});
