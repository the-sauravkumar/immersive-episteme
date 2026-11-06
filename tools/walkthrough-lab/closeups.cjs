const fs = require("fs");
const { eachScene } = require("./each-scene.cjs");

const [sceneList, pattern, outDir] = process.argv.slice(2);
if (!sceneList || !pattern || !outDir) {
  console.log("usage: node closeups.cjs <scene,scene> <part regex> <out dir>");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const fileName = (scene, label) => `${scene}__${label}`.replace(/[^a-z0-9.-]+/gi, "_").slice(0, 150) + ".png";

(async () => {
  let shots = 0;
  await eachScene(sceneList.split(","), { width: 3840, height: 2160 }, async (scene, page) => {
    const views = await page.evaluate(`window.nearestViews(${JSON.stringify(pattern)})`);
    for (const view of views) {
      await page.evaluate(`window.moveCamera(${JSON.stringify(view.eye)}, ${JSON.stringify(view.target)}, 55)`);
      const file = `${outDir}/${fileName(scene, view.label)}`;
      await page.screenshot({ path: file });
      shots++;
      console.log(scene, view.label, "at", view.distance, "m", file);
    }
  }, (scene, error) => console.log("PAGEERR", scene, error.message.slice(0, 300)));
  console.log(`CLOSE-UPS DONE ${shots}`);
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 500));
  process.exit(1);
});
