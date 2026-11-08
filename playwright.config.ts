import { defineConfig, devices } from "@playwright/test";

import { DEFAULT_PROJECT, GPU_ARGS, hardwareGpu, LOW_SPEC, LOW_SPEC_PROJECT } from "./tests/e2e/gpu-mode";
import { INVITE_STORAGE_STATE } from "./tests/e2e/invite-state";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

const HARDWARE = hardwareGpu();

const projects = HARDWARE
  ? [
      {
        name: DEFAULT_PROJECT,
        use: { ...devices["Desktop Chrome"], channel: "chromium", headless: true, launchOptions: { args: [...GPU_ARGS, "--force_high_performance_gpu"] } },
        metadata: { gpu: "nvidia", tier: "high", cpuThrottle: 1 },
      },
      {
        name: LOW_SPEC_PROJECT,
        testMatch: /gpu-renderer\.spec\.ts/,
        use: {
          ...devices["Desktop Chrome"],
          channel: undefined,
          headless: true,
          viewport: LOW_SPEC.viewport,
          deviceScaleFactor: LOW_SPEC.deviceScaleFactor,
          launchOptions: { args: [...GPU_ARGS] },
        },
        metadata: { gpu: "intel", tier: "low", cpuThrottle: LOW_SPEC.cpuThrottle },
      },
    ]
  : [{ name: DEFAULT_PROJECT, use: { ...devices["Desktop Chrome"] } }];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    storageState: INVITE_STORAGE_STATE,
  },
  projects,
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
