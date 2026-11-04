const { launchGpu, launchLowSpec, rendererOf } = require("C:/Tools/Playwright/launch.cjs");
const out = process.argv[2];
const launch = process.env.LOW_SPEC ? launchLowSpec : launchGpu;

const arrived = "(()=>{const r=window.runtime;return r.autoTarget===null&&r.autoHeading===null})()";
const place = "(()=>{const r=window.runtime;return {index:r.stationIndex,x:+r.walker.x.toFixed(2),z:+r.walker.z.toFixed(2),localZ:+(r.walker.z+r.stationIndex*44).toFixed(2)}})()";
const hillsAway = `(()=>{const r=window.runtime;const cam=r.camera.position;let nearest=Infinity;r.hills.children.forEach(s=>{const p=s.getWorldPosition(s.position.clone());nearest=Math.min(nearest,Math.hypot(p.x-cam.x,p.z-cam.z))});return +nearest.toFixed(1)})()`;
const WALL_REACH = 62;

(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.setDefaultTimeout(240000);
  const faults = [];
  page.on("pageerror", (error) => faults.push("page error " + error.message.slice(0, 300)));
  await page.goto("http://127.0.0.1:" + (process.env.LAB_PORT || 8941) + "/");
  console.log(await rendererOf(page));
  await page.waitForFunction("window.READY===true");
  const stations = await page.evaluate("window.stations");
  for (let target = 1; target < stations; target++) {
    await page.evaluate(`window.frames.length=0;window.runtime.walkTo(${target})`);
    await page.waitForFunction(`window.runtime.stationIndex===${target}&&${arrived}`, undefined, { timeout: 200000 });
    const near = await page.evaluate(hillsAway);
    const stats = await page.evaluate("(()=>{const f=[...window.frames].slice(5);return {max:+Math.max(...f).toFixed(0),over50:f.filter(x=>x>50).length,frames:f.length}})()");
    const where = await page.evaluate(place);
    console.log("station", target + 1, JSON.stringify(where), "hills m", near, JSON.stringify(stats));
    if (near < WALL_REACH) faults.push(`station ${target + 1}: hills ${near} m from camera, inside the yard reach of ${WALL_REACH} m`);
    if (out) await page.screenshot({ path: `${out}/route-${target + 1}.jpg`, type: "jpeg", quality: 84 });
  }
  const from = stations - 1;
  const start = await page.evaluate(place);
  await page.evaluate(`window.runtime.walkTo(${from - 1})`);
  await page.waitForTimeout(1500);
  const afterTurn = await page.evaluate(place);
  console.log("back from a stop", JSON.stringify(start), "->", JSON.stringify(afterTurn));
  if (afterTurn.index === start.index && afterTurn.localZ < start.localZ - 0.5) faults.push("Back walked further into the yard before turning round");
  await page.waitForFunction(`window.runtime.stationIndex===${from - 1}&&${arrived}`, undefined, { timeout: 200000 });
  const home = await page.evaluate(place);
  console.log("back arrived", JSON.stringify(home));
  await page.evaluate(`window.runtime.walkTo(${from})`);
  await page.waitForFunction(`window.runtime.stationIndex===${from}&&window.runtime.autoArriving===true`, undefined, { timeout: 200000 });
  await page.evaluate(`window.runtime.walkTo(${from - 1})`);
  await page.waitForFunction(`window.runtime.stationIndex===${from - 1}&&${arrived}`, undefined, { timeout: 200000 });
  const interrupted = await page.evaluate(place);
  console.log("back during arrival", JSON.stringify(interrupted));
  if (Math.hypot(interrupted.x - home.x, interrupted.localZ - home.localZ) > 0.6) faults.push("Back during arrival stopped short of the standpoint");
  console.log(faults.length ? "FAULTS\n" + faults.join("\n") : "route passed");
  await browser.close();
  process.exit(faults.length ? 1 : 0);
})().catch((error) => {
  console.log("FAIL", error.message.slice(0, 500));
  process.exit(1);
});
