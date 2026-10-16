import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * PW_GPU=1 runs the same specs headless on the machine's discrete GPU instead of SwiftShader: the
 * full Chromium build (channel "chromium", not the headless shell) with ANGLE on Direct3D 11.
 * PW_GPU=low selects the integrated GPU instead (the low tier of immersive-rendering.spec.ts). Used
 * locally for the museum specs (immersive-flow, immersive-rendering with IE_GPU=1, parity); the
 * renderer string each run used is recorded by the specs. Unset (CI and the default), nothing
 * changes.
 */
const GPU = process.env.PW_GPU === "1" || process.env.PW_GPU === "low";
const GPU_LAUNCH = {
  channel: "chromium",
  launchOptions: { args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", process.env.PW_GPU === "low" ? "--force_low_power_gpu" : "--force_high_performance_gpu"] },
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // The site is always invite-only (S11): every spec starts with a valid invite cookie.
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    storageState: "test-results/.auth/invite.json",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], ...(GPU ? GPU_LAUNCH : {}) } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
