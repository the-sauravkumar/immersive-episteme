const fs = require("fs");
const { launchGpu, rendererOf } = require("C:/Tools/Playwright/launch.cjs");
const { figureOf, seenThrough } = require("./colour-figures.cjs");
const out = process.argv[2];
const onlyColour = process.argv[3] === "colour";
const onlyStage = process.argv[4] || null;
const base = "http://127.0.0.1:" + (process.env.LAB_PORT || 8940) + "/?";
const TRADITIONS = ["ajrakh", "sanganeri", "kalamkari"];
const WIDTH = onlyColour ? 1280 : 3840;
const HEIGHT = onlyColour ? 720 : 2160;
const STANDPOINT_FOV = 55;
const REACH_FOV = 55;
const rowOf = (stage, look, form, reach, standpoint) => ({ stage, key: look.key, form, transparency: look.transparency, basis: look.renderBasis, status: look.status, renderHex: look.renderHex, target: seenThrough(look) ? "seen through" : "renderHex", reach: figureOf(reach, look), standpoint: figureOf(standpoint, look) });

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
      const measure = (look, from, to, fov) => page.evaluate(`window.colourOfLook(${JSON.stringify(look.key)},${JSON.stringify(from)},${JSON.stringify(to)},${fov},${seenThrough(look) ? JSON.stringify(look.renderHex) : "null"})`);
      const fromStandpoint = (look) => measure(look, stage.standpoint.from, stage.standpoint.to, STANDPOINT_FOV);
      const shots = [];
      for (const vessel of stage.vessels) {
        const [cx, , cz] = vessel.centre;
        const top = vessel.top;
        const near = [cx + stage.side * 0.42, top + 0.42, cz + 0.08];
        const aim = [cx, top - 0.02, cz];
        const row = rowOf(tag, vessel.look, vessel.look.fill, await measure(vessel.look, near, aim, REACH_FOV), await fromStandpoint(vessel.look));
        rows.push(row);
        console.log(JSON.stringify(row));
        shots.push({ name: `${tag}-${vessel.look.key}`, near, aim });
      }
      if (stage.liquid) {
        const { x, y, z, reach } = stage.liquid;
        const near = [x - stage.side * (reach + 0.42), 1.28, z + 0.75];
        const aim = [x - stage.side * (reach - 0.55), y, z + 0.1];
        const row = rowOf(tag, stage.liquid.look, "liquid-work", await measure(stage.liquid.look, near, aim, REACH_FOV), await fromStandpoint(stage.liquid.look));
        rows.push(row);
        console.log(JSON.stringify(row));
        shots.push({ name: `${tag}-${stage.liquid.look.key}`, near, aim });
      }
      if (!onlyColour) {
        for (const shot of shots) {
          await page.evaluate(`window.moveCamera(${JSON.stringify(shot.near)},${JSON.stringify(shot.aim)},${REACH_FOV})`);
          await page.screenshot({ path: `${out}/${shot.name}.jpg`, type: "jpeg", quality: 90 });
        }
        for (const tool of stage.tools) {
          const [cx, , cz] = tool.centre;
          await page.evaluate(`window.moveCamera(${JSON.stringify([cx + stage.side * 0.38, tool.top + 0.36, cz + 0.12])},${JSON.stringify([cx, tool.top - 0.02, cz])},55)`);
          await page.screenshot({ path: `${out}/${tag}-tool-${tool.modelId}.jpg`, type: "jpeg", quality: 90 });
        }
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
