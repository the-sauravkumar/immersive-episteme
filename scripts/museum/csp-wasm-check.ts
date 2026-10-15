/**
 * Does the app's production Content-Security-Policy allow WebAssembly? The KTX2 transcoder
 * (Basis Universal, WASM, run in a blob worker by KTX2Loader) needs it.
 *
 *   npx tsx scripts/museum/csp-wasm-check.ts          (the policy as shipped)
 *   FIX=1 npx tsx scripts/museum/csp-wasm-check.ts    (with 'wasm-unsafe-eval' added to script-src)
 *
 * Headless Chromium, a static page served with the policy from src/lib/security/csp.ts.
 */
import { createServer } from "node:http";
import { chromium } from "playwright";
import { contentSecurityPolicy } from "../../src/lib/security/csp";
const csp = contentSecurityPolicy({ frameAncestors: "self", dev: false }).replace("script-src 'self' 'unsafe-inline'", process.env.FIX ? "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'" : "script-src 'self' 'unsafe-inline'");
const html = `<!doctype html><script>
const bytes = new Uint8Array([0,97,115,109,1,0,0,0]);
window.result = (async () => {
  const out = {};
  try { await WebAssembly.instantiate(bytes); out.page = "allowed"; } catch (e) { out.page = "blocked: " + e.message; }
  const src = "WebAssembly.instantiate(new Uint8Array([0,97,115,109,1,0,0,0])).then(()=>postMessage('allowed'),e=>postMessage('blocked: '+e.message))";
  const w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
  out.blobWorker = await new Promise((r) => { w.onmessage = (e) => r(e.data); w.onerror = (e) => r("worker error: " + e.message); });
  return out;
})();
</script>`;
const server = createServer((_q, res) => res.writeHead(200, { "Content-Type": "text/html", "Content-Security-Policy": csp }).end(html)).listen(3198);
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
await p.goto("http://localhost:3198/");
console.log(JSON.stringify({ csp, result: await p.evaluate(() => (window as unknown as { result: Promise<unknown> }).result) }, null, 1));
await b.close();
server.close();
