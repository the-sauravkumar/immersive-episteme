/**
 * The shared Playwright `test` for every spec (DR-056). Import `test` and `expect` from here, not
 * from "@playwright/test", so the GPU check and the low-spec CPU throttle apply everywhere.
 *
 *  - gpuRenderer (worker, automatic): once per worker, before its first test, reads the unmasked
 *    WebGL renderer (WEBGL_debug_renderer_info) from the worker's browser and fails the worker with
 *    a clear message when it is not the project's GPU (metadata.gpu: Intel for low-spec, NVIDIA for
 *    the rest), including SwiftShader. Without metadata.gpu (software mode: CI, PW_GPU=0) it only
 *    records the renderer.
 *  - page: the built-in page with the project's CPU throttle applied through CDP
 *    (metadata.cpuThrottle, 4 in low-spec). Pages a spec opens itself with browser.newContext()
 *    are not throttled by this; such specs call applyProjectThrottle() (immersive-rendering.spec.ts
 *    already throttles its own page from the same metadata).
 *  - newContext(browser, options): browser.newContext() with the invite cookie (S11). A context a
 *    spec opens itself does not inherit the config's `use`, so without this it would land on the
 *    invite gate. Every spec opens its own contexts through it; a gate test passes
 *    `storageState: { cookies: [], origins: [] }` to start uninvited.
 */
import { test as base, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

import { rendererMismatch, type ExpectedGpu } from "./gpu-mode";
import { INVITE_STORAGE_STATE } from "./invite-state";

export { expect } from "@playwright/test";
export type { Browser, BrowserContext, CDPSession, Locator, Page, Request, Response } from "@playwright/test";

async function readRenderer(browser: Browser): Promise<string | null> {
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    return await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
      if (!gl) return null;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (!ext) return null;
      return `${String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL))} | ${String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))}`;
    });
  } finally {
    await ctx.close();
  }
}

type ContextOptions = NonNullable<Parameters<Browser["newContext"]>[0]>;

/** The storage state the config gives the built-in fixtures (use.storageState), else the invite file. */
function configuredStorageState(): ContextOptions["storageState"] {
  try {
    return base.info().project.use.storageState ?? INVITE_STORAGE_STATE;
  } catch {
    return INVITE_STORAGE_STATE; // outside a test or hook
  }
}

/** browser.newContext() admitted through the invite gate; an explicit `storageState` wins. */
export function newContext(browser: Browser, options: ContextOptions = {}): Promise<BrowserContext> {
  return browser.newContext({ storageState: configuredStorageState(), ...options });
}

export async function applyProjectThrottle(page: Page, info: Pick<TestInfo, "project">): Promise<number> {
  const rate = Number(info.project.metadata?.cpuThrottle ?? 1);
  if (rate > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  }
  return rate;
}

export const test = base.extend<object, { gpuRenderer: string | null }>({
  gpuRenderer: [
    async ({ browser }, provide, workerInfo) => {
      const renderer = await readRenderer(browser);
      const expected = workerInfo.project.metadata?.gpu as ExpectedGpu | undefined;
      if (expected) {
        const problem = rendererMismatch(workerInfo.project.name, expected, renderer);
        if (problem) throw new Error(problem);
      }
      await provide(renderer);
    },
    { scope: "worker", auto: true },
  ],
  page: async ({ page }, provide, testInfo) => {
    const rate = await applyProjectThrottle(page, testInfo);
    if (rate > 1) testInfo.annotations.push({ type: "cpu-throttle", description: `${rate}x (CDP)` });
    await provide(page);
  },
});
