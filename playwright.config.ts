import { defineConfig, devices } from "@playwright/test";

import { DEFAULT_PROJECT, GPU_ARGS, hardwareGpu, LOW_SPEC, LOW_SPEC_PROJECT } from "./tests/e2e/gpu-mode";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * GPU split (DR-049, number to confirm at merge). Windows' per-app GPU preference, not a Chromium flag, picks the GPU on this
 * laptop: the full Chromium build is mapped to the NVIDIA GTX 1650, the headless shell to the Intel
 * Iris Xe (tests/e2e/gpu-mode.ts). So, in hardware mode (the local default):
 *  - "chromium": every spec, full Chromium (channel "chromium") with ANGLE on D3D11, NVIDIA expected;
 *  - "low-spec": the headless shell with the same flags, Intel expected, CPU x4 through CDP,
 *    1366 x 768 at DPR 1. Runs the low-tier museum measurements (immersive-rendering.spec.ts, with
 *    IE_GPU=1) and the renderer check.
 * The automatic fixture in tests/e2e/fixtures.ts fails a worker whose WebGL renderer is not the
 * expected GPU (SwiftShader included). Software mode (CI, or PW_GPU=0): one plain headless
 * "chromium" project as before, no GPU expectation. Pick one project with --project.
 */
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
        testMatch: /(immersive-rendering|gpu-renderer)\.spec\.ts/,
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
  // One GPU per project and a 16 GB machine: never more than two workers.
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // The site is always invite-only (S11): every spec starts with a valid invite cookie.
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    storageState: "test-results/.auth/invite.json",
  },
  projects,
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
