const { eachScene, scenesFrom } = require("./each-scene.cjs");

const PLANTED_RULES = ["outside-yard", "cloth-penetration", "through-bench", "solid-overlap", "unchecked-mesh"];

(async () => {
  let failed = 0;
  await eachScene(scenesFrom(process.argv[2]), { width: 640, height: 360 }, async (scene, page) => {
    const report = await page.evaluate("window.QA(false)");
    const planted = await page.evaluate("window.QA(true)");
    const plantedRules = new Set(planted.problems.map((problem) => problem.rule));
    const plantedNames = planted.problems.map((problem) => `${problem.subject}|${problem.against}`).join(";");
    const caught = PLANTED_RULES.every((rule) => plantedRules.has(rule)) && plantedNames.includes("planted neighbour A|planted neighbour B");
    const plantedFill = await page.evaluate("window.QA(false,true)");
    const poked = new Set(plantedFill.problems.filter((problem) => problem.rule === "fill-outside-vessel").map((problem) => problem.subject));
    const pokeCaught = poked.size >= Math.max(0, report.fillsChecked);
    const overlapCaught = report.fillPiecesChecked === 0 || plantedFill.problems.some((problem) => problem.rule === "fill-overlap");
    const paintCaught = (await page.evaluate("window.paintOffPlanted()")).some((row) => row.name === "planted paint");
    const fillCaught = pokeCaught && overlapCaught && paintCaught;
    console.log(scene, "solids", report.solidsChecked, "clothPoints", report.clothPointsChecked, "fillPoints", report.fillPointsChecked, "fillPieces", report.fillPiecesChecked, "hits", report.problems.length, "plantedFaultCaught", caught, "pokesCaught", poked.size, "of", report.fillsChecked, "overlapCaught", overlapCaught, "paintCaught", paintCaught);
    for (const problem of report.problems) console.log("  ", JSON.stringify(problem));
    const offSurface = await page.evaluate("window.paintOffSurface()");
    if (offSurface.length > 0) {
      failed++;
      console.log("   paint off its surface", JSON.stringify(offSurface));
    }
    const walk = await page.evaluate("window.walkCheck()");
    if (walk) console.log("   walk", JSON.stringify(walk));
    if (walk && !walk.reachedEnd) failed++;
    if (report.problems.length > 0 || !caught || !fillCaught) failed++;
  }, (scene, error) => {
    failed++;
    console.log("PAGEERR", scene, error.message.slice(0, 300));
  });
  console.log(failed === 0 ? "SCENE CHECK PASSED" : "SCENE CHECK FAILED");
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 500));
  process.exit(1);
});
