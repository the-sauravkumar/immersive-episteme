const fs = require("fs");
const { eachScene, scenesFrom } = require("./each-scene.cjs");

const report = process.argv[3];
const pad = (value, width) => String(value).padEnd(width).slice(0, width);

(async () => {
  let failed = 0;
  const everything = [];
  await eachScene(scenesFrom(process.argv[2]), { width: 960, height: 540 }, async (scene, page) => {
    const planted = await page.evaluate("window.tearingPlanted()");
    const caught = {
      fight: planted.some((row) => row.label.includes("planted fight") && row.failures.some((failure) => failure.includes("depth fight"))),
      crack: planted.some((row) => row.label.includes("planted crack") && row.failures.some((failure) => failure.includes("crack"))),
      missing: planted.some((row) => row.label.includes("planted missing") && row.failures.some((failure) => failure.includes("missing face"))),
      flicker: planted.some((row) => row.label.includes("planted flicker") && row.failures.some((failure) => failure.includes("flicker"))),
    };
    if (!caught.fight || !caught.crack || !caught.missing || !caught.flicker) {
      failed++;
      console.log(scene, "PLANTED NOT CAUGHT", JSON.stringify(planted));
    }
    const rows = await page.evaluate("window.tearingAudit()");
    const bad = rows.filter((row) => row.failures.length > 0);
    console.log(scene, "objects", rows.length, "failing", bad.length, "planted", JSON.stringify(caught));
    if (bad.length > 0) failed++;
    for (const row of rows) {
      everything.push({ scene, ...row });
      if (row.failures.length > 0) console.log("  ", pad(row.label, 58), "at", row.distance, "m", row.visiblePixels, "px fight", row.fightingPercent, "flicker", row.colourFlickerPercent, "crack", row.crackPixels, "back", row.backFacePercent, row.failures.join("; "));
    }
  }, (scene, error) => {
    failed++;
    console.log("PAGEERR", scene, error.message.slice(0, 300));
  });
  console.log(pad("object", 62), pad("scene", 14), "dist   px      fight% flick% crack back%");
  const worst = [...everything].sort((a, b) => b.failures.length - a.failures.length || b.fightingPercent + b.colourFlickerPercent - a.fightingPercent - a.colourFlickerPercent);
  for (const row of process.env.ALL_ROWS ? everything : worst.slice(0, 40)) console.log(pad(row.label, 62), pad(row.scene, 14), pad(row.distance, 6), pad(row.visiblePixels, 7), pad(row.fightingPercent, 6), pad(row.colourFlickerPercent, 6), pad(row.crackPixels, 5), row.backFacePercent);
  if (report) fs.writeFileSync(report, JSON.stringify(everything, null, 1));
  console.log(failed === 0 ? "TEARING CHECK PASSED" : "TEARING CHECK FAILED");
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 500));
  process.exit(1);
});
