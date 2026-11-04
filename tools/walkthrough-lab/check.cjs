const { launchGpu, rendererOf } = require("C:/Tools/Playwright/launch.cjs");
const base = "http://127.0.0.1:" + (process.env.LAB_PORT || 8940) + "/?";
const ROUTES = ["ajrakh", "sanganeri", "kalamkari"].flatMap((tradition) => Array.from({ length: 10 }, (_, n) => `t=${tradition}&n=${n}`));
const SCENES = process.argv[2] ? process.argv[2].split(",") : ["s=practice", "s=entrance", ...ROUTES];
(async () => {
  const browser = await launchGpu();
  let failed = 0;
  let renderer = "";
  for (const scene of SCENES) {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.setDefaultTimeout(170000);
    page.on("pageerror", (error) => {
      failed++;
      console.log("PAGEERR", scene, error.message.slice(0, 300));
    });
    await page.goto(base + scene);
    if (!renderer) {
      renderer = await rendererOf(page);
      console.log(renderer);
    }
    await page.waitForFunction("window.READY===true");
    const report = await page.evaluate("window.QA(false)");
    const planted = await page.evaluate("window.QA(true)");
    const caught = planted.problems.length > report.problems.length;
    const plantedFill = await page.evaluate("window.QA(false,true)");
    const fillCaught = report.fillPointsChecked === 0 || plantedFill.problems.some((problem) => problem.rule === "fill-outside-vessel");
    console.log(scene, "solids", report.solidsChecked, "clothPoints", report.clothPointsChecked, "fillPoints", report.fillPointsChecked, "fillPieces", report.fillPiecesChecked, "hits", report.problems.length, "plantedFaultCaught", caught, "plantedFillCaught", fillCaught);
    for (const problem of report.problems) console.log("  ", JSON.stringify(problem));
    const walk = await page.evaluate("window.walkCheck()");
    if (walk) console.log("   walk", JSON.stringify(walk));
    if (walk && !walk.reachedEnd) failed++;
    if (report.problems.length > 0 || !caught || !fillCaught) failed++;
    await page.close();
  }
  await browser.close();
  console.log(failed === 0 ? "SCENE CHECK PASSED" : "SCENE CHECK FAILED");
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 500));
  process.exit(1);
});
