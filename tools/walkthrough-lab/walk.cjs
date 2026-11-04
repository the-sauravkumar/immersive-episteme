const { launchGpu, launchLowSpec, rendererOf } = require("C:/Tools/Playwright/launch.cjs");
const out = process.argv[2];
const stationsToWalk = +(process.argv[3] || 3);
const launch = process.env.LOW_SPEC ? launchLowSpec : launchGpu;
(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.setDefaultTimeout(240000);
  page.on("pageerror", (error) => console.log("PAGEERR", error.message.slice(0, 400)));
  page.on("console", (message) => {
    if (message.type() === "error") console.log("CONSOLE", message.text().slice(0, 200));
  });
  const base = "http://127.0.0.1:" + (process.env.LAB_PORT || 8941) + "/";
  await page.goto(base);
  console.log(await rendererOf(page));
  await page.waitForFunction("window.READY===true");
  console.log("load seconds", await page.evaluate("window.loadSeconds.toFixed(1)"), "stations", await page.evaluate("window.stations"));
  for (let target = 1; target <= stationsToWalk; target++) {
    await page.evaluate(`window.frames.length=0;window.runtime.walkTo(${target})`);
    const begun = Date.now();
    await page.waitForFunction(`window.runtime.stationIndex===${target}`, undefined, { timeout: 200000 });
    await page.waitForTimeout(600);
    const stats = await page.evaluate(`(()=>{const f=[...window.frames].slice(5).sort((a,b)=>a-b);const p=q=>f[Math.min(f.length-1,Math.floor(f.length*q))];return {frames:f.length,mean:+(f.reduce((a,b)=>a+b,0)/f.length).toFixed(1),p95:+p(.95).toFixed(1),p99:+p(.99).toFixed(1),max:+p(1).toFixed(1),over50:f.filter(x=>x>50).length}})()`);
    console.log("to station", target, "walk seconds", ((Date.now() - begun) / 1000).toFixed(1), JSON.stringify(stats));
    if (out) await page.screenshot({ path: `${out}/walk-${target}.jpg`, type: "jpeg", quality: 84 });
  }
  console.log("log", JSON.stringify(await page.evaluate("window.walkLog.map(e=>[e.event,e.station,e.detail])")).slice(0, 700));
  const memory = await page.evaluate("performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null");
  console.log("js heap MB", memory);
  await browser.close();
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 500));
  process.exit(1);
});
