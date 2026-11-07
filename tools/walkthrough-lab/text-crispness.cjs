const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { eachScene } = require("./each-scene.cjs");

const [sceneList, outDir, kindList] = process.argv.slice(2);
if (!sceneList || !outDir) {
  console.log("usage: node text-crispness.cjs <scene,scene> <out dir> [kind,kind]");
  process.exit(1);
}
const kinds = new Set((kindList || "heading,caption,bench label,local name,lime label").split(","));
const VIEWS = ["arrival", "6m", "3.6m", "nearest"];
fs.mkdirSync(outDir, { recursive: true });
const fileName = (scene, name, viewName) => `${scene}__${name}__${viewName}`.replace(/[^a-z0-9.-]+/gi, "_") + ".png";
const percentile = (sorted, share) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];

async function crispness(png) {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const tones = Float32Array.from(data).sort();
  const contrast = Math.max(1, percentile(tones, 0.98) - percentile(tones, 0.02));
  const steps = [];
  let laplacianSquares = 0;
  let inner = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      steps.push(Math.max(Math.abs(data[i + 1] - data[i]), Math.abs(data[i + width] - data[i])));
      const laplacian = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - width] - data[i + width];
      laplacianSquares += laplacian * laplacian;
      inner++;
    }
  }
  steps.sort((a, b) => a - b);
  return { contrast: Math.round(contrast), edge: inner ? +(percentile(steps, 0.99) / contrast).toFixed(3) : 0, band: inner ? +(Math.sqrt(laplacianSquares / inner) / contrast).toFixed(3) : 0 };
}

(async () => {
  const rows = [];
  await eachScene(sceneList.split(","), { width: +(process.env.W || 1366), height: +(process.env.H || 768) }, async (scene, page) => {
    const paints = (await page.evaluate("window.paintViews()")).filter((paint) => kinds.has(paint.kind));
    for (const paint of paints) {
      for (const viewName of VIEWS) {
        const view = paint.views[viewName];
        await page.evaluate(`window.moveCamera(${JSON.stringify(view.eye)}, ${JSON.stringify(view.target)}, 55)`);
        const clip = await page.evaluate(`window.paintBox(${JSON.stringify(paint.name)})`);
        if (!clip) continue;
        const file = path.join(outDir, fileName(scene, paint.name, viewName));
        const png = await page.screenshot({ clip });
        fs.writeFileSync(file, png);
        const distance = +Math.hypot(view.eye[0] - view.target[0], view.eye[1] - view.target[1], view.eye[2] - view.target[2]).toFixed(2);
        const row = { scene, name: paint.name, kind: paint.kind, view: viewName, distance, cssPx: [clip.width, clip.height], ...(await crispness(png)), file };
        rows.push(row);
        console.log(scene.padEnd(16), paint.kind.padEnd(12), paint.name.padEnd(14), viewName.padEnd(8), String(distance).padEnd(6), "edge", String(row.edge).padEnd(6), "band", String(row.band).padEnd(6), "contrast", row.contrast);
      }
    }
  }, (scene, error) => console.log("PAGEERR", scene, error.message.slice(0, 300)));
  const summary = {};
  for (const row of rows) {
    const key = `${row.kind} @ ${row.view}`;
    (summary[key] ??= []).push(row);
  }
  console.log("mean per kind and view: edge (99th percentile step / contrast) and band (Laplacian RMS / contrast), device pixels");
  for (const [key, group] of Object.entries(summary)) console.log(key.padEnd(28), "n", group.length, "edge", (group.reduce((s, r) => s + r.edge, 0) / group.length).toFixed(3), "band", (group.reduce((s, r) => s + r.band, 0) / group.length).toFixed(3));
  fs.writeFileSync(path.join(outDir, "crispness.json"), JSON.stringify(rows, null, 1));
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 500));
  process.exit(1);
});
