const fs = require("fs");
const path = require("path");
const { launchGpu } = require("C:/Tools/Playwright/launch.cjs");

const out = path.resolve(__dirname, "../../public/walkthrough/tex/horizon/scrub.png");

(async () => {
  const browser = await launchGpu();
  const page = await browser.newPage();
  const base64 = await page.evaluate(async () => {
    let seed = 0x5c7b;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const colours = ["#6f7a44", "#5e6b3c", "#818a52", "#49552f"];
    const scrub = new OffscreenCanvas(4096, 512);
    const context = scrub.getContext("2d");
    for (let bush = 0; bush < 120; bush++) {
      const centre = random() * scrub.width;
      const radius = scrub.height * (0.22 + random() * 0.42);
      const y = scrub.height - radius * 0.45;
      for (let leaf = 0; leaf < radius * 46; leaf++) {
        const angle = random() * 7;
        const reach = Math.sqrt(random()) * radius;
        const leafY = y + Math.sin(angle) * reach * 0.72;
        if (leafY > scrub.height) continue;
        context.fillStyle = colours[Math.floor(random() * colours.length)];
        context.globalAlpha = 0.5 + random() * 0.5;
        const leafX = centre + Math.cos(angle) * reach * 1.3;
        const [wide, tall, turn] = [1 + random() * 3, 1 + random() * 2, random() * 3];
        for (const wrap of [-scrub.width, 0, scrub.width]) {
          context.beginPath();
          context.ellipse(leafX + wrap, leafY, wide, tall, turn, 0, 7);
          context.fill();
        }
      }
    }
    const soft = new OffscreenCanvas(4096, 512);
    const softContext = soft.getContext("2d");
    softContext.filter = "blur(5px)";
    for (const wrap of [-soft.width, 0, soft.width]) softContext.drawImage(scrub, wrap, 0);
    const bytes = new Uint8Array(await (await soft.convertToBlob({ type: "image/png" })).arrayBuffer());
    let text = "";
    for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(text);
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(base64, "base64"));
  console.log("wrote", out, fs.statSync(out).size, "bytes");
  await browser.close();
})().catch((error) => {
  console.log("FAIL", error.message);
  process.exit(1);
});
