/**
 * Playwright configuration for the immersive rendering-quality checks (C1-C12) and the 3D
 * functional flow, which need a real GPU (the default headless shell renders with SwiftShader,
 * which the museum refuses as software rendering).
 *
 *   IE_BASE_URL=http://localhost:3000 npx playwright test -c scripts/museum/playwright.gpu.config.ts [--project high|low]
 *
 * Projects: high = discrete GPU, high tier; low = integrated GPU, low tier forced, CPU x4
 * throttling (check C9). Runs headed on a desktop session; one worker (GPU timing).
 */
import { defineConfig } from "@playwright/test";

import { gpuLaunchArgs } from "./gpu-browser";

export default defineConfig({
  testDir: "../../tests/e2e",
  testMatch: /immersive-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30 * 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.IE_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    headless: false,
  },
  projects: [
    { name: "high", use: { launchOptions: { args: gpuLaunchArgs("high") } }, metadata: { tier: "high", cpuThrottle: 1 } },
    { name: "low", use: { launchOptions: { args: gpuLaunchArgs("low") } }, metadata: { tier: "low", cpuThrottle: 4 } },
  ],
});
