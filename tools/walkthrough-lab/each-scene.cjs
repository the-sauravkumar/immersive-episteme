const { launchGpu, rendererOf } = require("C:/Tools/Playwright/launch.cjs");

const ROUTES = ["ajrakh", "sanganeri", "kalamkari"].flatMap((tradition) => Array.from({ length: 10 }, (_, n) => `t=${tradition}&n=${n}`));
const ALL_SCENES = ["s=practice", "s=entrance", ...ROUTES];
const SCENES_PER_BROWSER = 6;
const base = "http://127.0.0.1:" + (process.env.LAB_PORT || 8940) + "/?";

const scenesFrom = (argument) => (argument && argument !== "all" ? argument.split(",") : ALL_SCENES);

async function eachScene(scenes, viewport, visit, onPageError) {
  let browser = await launchGpu();
  let used = 0;
  let renderer = "";
  const restart = async () => {
    await browser.close().catch(() => {});
    browser = await launchGpu();
    used = 0;
  };
  for (const scene of scenes) {
    if (used >= SCENES_PER_BROWSER) await restart();
    for (let attempt = 1; ; attempt++) {
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(400000);
      page.on("pageerror", (error) => onPageError(scene, error));
      try {
        await page.goto(base + scene);
        if (!renderer) {
          renderer = await rendererOf(page);
          console.log(renderer);
        }
        await page.waitForFunction("window.READY===true");
        await visit(scene, page);
        await page.close();
        used++;
        break;
      } catch (error) {
        if (attempt >= 2 || !/crash|closed/i.test(error.message)) throw error;
        console.log("RETRY", scene, "browser restarted after:", error.message.slice(0, 120));
        await restart();
      }
    }
  }
  await browser.close();
  return renderer;
}

module.exports = { eachScene, scenesFrom };
