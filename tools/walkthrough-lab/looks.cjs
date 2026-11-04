const fs = require("fs");
const { launchGpu, rendererOf } = require("C:/Tools/Playwright/launch.cjs");
const out = process.argv[2];
const onlyColour = process.argv[3] === "colour";
const onlyStage = process.argv[4] || null;
const base = "http://127.0.0.1:" + (process.env.LAB_PORT || 8940) + "/?";
const TRADITIONS = ["ajrakh", "sanganeri", "kalamkari"];
const WIDTH = onlyColour ? 1280 : 3840;
const HEIGHT = onlyColour ? 720 : 2160;

const linear = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
function lab([r, g, b]) {
  const [R, G, B] = [linear(r), linear(g), linear(b)];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const delta = (a, b) => {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
const parseHex = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await launchGpu();
  const rows = [];
  let renderer = "";
  for (const tradition of TRADITIONS) {
    for (let n = 0; n < 9; n++) {
      const tag = `${tradition}-${n + 1}`;
      if (onlyStage && !onlyStage.split(",").includes(tag)) continue;
      const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
      page.setDefaultTimeout(170000);
      page.on("pageerror", (error) => console.log("PAGEERR", tag, error.message.slice(0, 300)));
      await page.goto(`${base}t=${tradition}&n=${n}`);
      if (!renderer) {
        renderer = await rendererOf(page);
        console.log(renderer);
      }
      await page.waitForFunction("window.READY===true");
      const stage = await page.evaluate("window.stageContents()");
      for (const vessel of stage.vessels) {
        const [cx, cy, cz] = vessel.centre;
        const top = vessel.top;
        const name = `${tag}-${vessel.look.key}`;
        const near = [cx + stage.side * 0.42, top + 0.42, cz + 0.08];
        const colour = await page.evaluate(`window.colourAt(${JSON.stringify([cx + 0.012, top + 0.55, cz + 0.012])},${JSON.stringify([cx, top, cz])},5,0.3)`);
        const row = { stage: tag, key: vessel.look.key, form: vessel.look.fill, transparency: vessel.look.transparency, basis: vessel.look.renderBasis, renderHex: vessel.look.renderHex, rendered: colour, deltaE: +delta(colour, parseHex(vessel.look.renderHex)).toFixed(1) };
        rows.push(row);
        console.log(JSON.stringify(row));
        if (!onlyColour) {
          await page.evaluate(`window.moveCamera(${JSON.stringify(near)},${JSON.stringify([cx, top - 0.02, cz])},55)`);
          await page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 90 });
        }
      }
      if (stage.liquid) {
        const name = `${tag}-${stage.liquid.look.key}`;
        const { x, y, z, reach } = stage.liquid;
        const sampleX = 3 + (reach - 0.14);
        const colour = await page.evaluate(`window.colourAt(${JSON.stringify([sampleX + 0.02, y + 1.2, z])},${JSON.stringify([sampleX, y, z])},4,0.3)`);
        const row = { stage: tag, key: stage.liquid.look.key, form: "liquid-work", transparency: stage.liquid.look.transparency, basis: stage.liquid.look.renderBasis, renderHex: stage.liquid.look.renderHex, rendered: colour, deltaE: +delta(colour, parseHex(stage.liquid.look.renderHex)).toFixed(1) };
        rows.push(row);
        console.log(JSON.stringify(row));
        if (!onlyColour) {
          await page.evaluate(`window.moveCamera(${JSON.stringify([x - stage.side * (reach + 0.42), 1.28, z + 0.75])},${JSON.stringify([x - stage.side * (reach - 0.55), y, z + 0.1])},55)`);
          await page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 90 });
        }
      }
      for (const tool of stage.tools) {
        if (onlyColour) continue;
        const [cx, , cz] = tool.centre;
        await page.evaluate(`window.moveCamera(${JSON.stringify([cx + stage.side * 0.38, tool.top + 0.36, cz + 0.12])},${JSON.stringify([cx, tool.top - 0.02, cz])},55)`);
        await page.screenshot({ path: `${out}/${tag}-tool-${tool.modelId}.jpg`, type: "jpeg", quality: 90 });
      }
      await page.close();
    }
  }
  fs.writeFileSync(`${out}/colours${onlyStage ? "-part" : ""}.json`, JSON.stringify({ renderer, rows }, null, 1));
  await browser.close();
  console.log("done", rows.length);
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 500));
  process.exit(1);
});
