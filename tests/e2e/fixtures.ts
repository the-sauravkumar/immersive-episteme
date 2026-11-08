import { test as base, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

import type { LearningCondition } from "../../src/lib/permissions/learning";
import { signDemoSession } from "../../src/server/auth/demo-session";

import { rendererMismatch, type ExpectedGpu } from "./gpu-mode";
import { INVITE_STORAGE_STATE } from "./invite-state";

export { expect } from "@playwright/test";
export type { Browser, BrowserContext, Page } from "@playwright/test";

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

function configuredStorageState(): ContextOptions["storageState"] {
  try {
    return base.info().project.use.storageState ?? INVITE_STORAGE_STATE;
  } catch {
    return INVITE_STORAGE_STATE;
  }
}

export function newContext(browser: Browser, options: ContextOptions = {}): Promise<BrowserContext> {
  return browser.newContext({ storageState: configuredStorageState(), ...options });
}

async function applyProjectThrottle(page: Page, info: Pick<TestInfo, "project">): Promise<number> {
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

export async function openDemo(page: Page, condition: LearningCondition): Promise<void> {
  await page.goto("/explore");
  const url = new URL(page.url());
  const token = await signDemoSession(process.env.BETTER_AUTH_SECRET!, condition);
  await page.context().addCookies([
    { name: "ie_demo", value: token, url: url.origin },
    { name: "__Host-ie_demo", value: token, domain: url.hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" },
  ]);
  await page.getByRole("button", { name: "Open the demo" }).click();
  await page.waitForURL(condition === "2d" ? /\/learn\/2d$/ : /\/learn\/immersive$/, { timeout: 120_000 });
}
