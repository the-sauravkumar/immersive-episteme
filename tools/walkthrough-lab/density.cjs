const fs = require("fs");
const { eachScene, scenesFrom } = require("./each-scene.cjs");

const report = process.argv[3];
const pad = (value, width) => String(value).padEnd(width).slice(0, width);
const number = (value, digits = 2) => (value === null || value === undefined ? "-" : Number(value).toFixed(digits));
const perMetre = (value) => (value === null || value === undefined ? "-" : String(Math.round(value)));

(async () => {
  let failed = 0;
  const merged = new Map();
  await eachScene(scenesFrom(process.argv[2]), { width: 640, height: 360 }, async (scene, page) => {
    const rows = await page.evaluate("window.surfaceAudit()");
    const planted = await page.evaluate("window.surfacePlanted()");
    const coarseCaught = planted.some((row) => row.label.includes("coarse") && row.failures.some((failure) => failure.includes("texels")));
    const facetCaught = planted.some((row) => row.label.includes("faceted") && row.failures.some((failure) => failure.includes("facets"))) && planted.some((row) => row.label.includes("six-sided") && row.failures.some((failure) => failure.includes("facets"))) && planted.some((row) => row.label.includes("flat-shaded") && row.failures.some((failure) => failure.includes("flat-shaded")));
    if (!coarseCaught || !facetCaught) {
      failed++;
      console.log(scene, "PLANTED NOT CAUGHT", JSON.stringify(planted));
    }
    const bad = rows.filter((row) => row.failures.length > 0);
    console.log(scene, "surfaces", rows.length, "failing", bad.length, "plantedCaught", coarseCaught && facetCaught);
    if (bad.length > 0) failed++;
    for (const row of bad) console.log("  ", pad(row.label, 62), row.failures.join("; "));
    for (const row of rows) {
      const key = row.label.replace(/^(bench paint|textile paint|curved paint|bench|item|frame part|table leg|tank curb|paint|gate pier|frame|textile) [^/]*\//, "$1 /");
      const known = merged.get(key);
      const score = Math.min(row.colourTexelsPerPixel ?? Infinity, row.normalTexelsPerPixel ?? Infinity);
      const worse = !known || row.failures.length > known.row.failures.length || (row.failures.length === known.row.failures.length && score < known.score);
      if (worse) merged.set(key, { row, score, scene, seen: (known?.seen ?? 0) + 1 });
      else known.seen++;
    }
  }, (scene, error) => {
    failed++;
    console.log("PAGEERR", scene, error.message.slice(0, 300));
  });
  const ranked = [...merged.values()].sort((a, b) => b.row.failures.length - a.row.failures.length || a.score - b.score);
  console.log(pad("surface", 58), pad("class", 15), "reach m  col/px nor/px  col/m det/m  nor/m det/m facet px  scene / failures");
  for (const { row, scene } of ranked) {
    console.log(pad(row.label, 58), pad(row.surfaceClass, 15), pad(number(row.reachMetres), 8), pad(number(row.colourTexelsPerPixel), 6), pad(number(row.normalTexelsPerPixel), 6), pad(perMetre(row.colourPerMetre), 6), pad(perMetre(row.detailColourPerMetre), 5), pad(perMetre(row.normalPerMetre), 6), pad(perMetre(row.detailNormalPerMetre), 5), pad(number(row.facetPixels), 8), scene, row.failures.join("; "));
  }
  if (report) fs.writeFileSync(report, JSON.stringify(ranked.map(({ row, scene, seen }) => ({ ...row, scene, seen })), null, 1));
  console.log(failed === 0 ? "DENSITY CHECK PASSED" : "DENSITY CHECK FAILED");
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 500));
  process.exit(1);
});
