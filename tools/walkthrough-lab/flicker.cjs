const fs = require("fs");
const { launchGpu, rendererOf } = require("C:/Tools/Playwright/launch.cjs");
const base = "http://127.0.0.1:" + (process.env.LAB_PORT || 8940) + "/?s=";
const SCENES = (process.argv[2] || "vat,table,wash,hall,practice,entrance").split(",");
const out = process.argv[3];
(async () => {
  const browser = await launchGpu();
  let renderer = "";
  for (const scene of SCENES) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.setDefaultTimeout(170000);
    await page.goto(base + scene);
    if (!renderer) {
      renderer = await rendererOf(page);
      console.log(renderer);
    }
    await page.waitForFunction("window.READY===true");
    for (const mode of ["pan", "walk"]) {
      const result = await page.evaluate(`window.flicker(60,10,"${mode}")`);
      if (out) fs.writeFileSync(`${out}/shim-${mode}-${scene}.png`, Buffer.from(result.heat.split(",")[1], "base64"));
      delete result.heat;
      console.log(scene, JSON.stringify(result));
    }
    await page.close();
  }
  await browser.close();
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 400));
  process.exit(1);
});
