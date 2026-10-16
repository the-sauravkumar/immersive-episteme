/**
 * Which GPU each Playwright project must render on, and the check that it does (DR-056).
 *
 * This laptop has two GPUs, and Windows' per-app GPU preference (HKCU\Software\Microsoft\DirectX\
 * UserGpuPreferences) decides which one a browser executable gets; Chromium flags such as
 * --force_low_power_gpu cannot override it. The preferences are set per executable:
 *  - the full Chromium build (channel "chromium") -> GpuPreference=2; -> NVIDIA GeForce GTX 1650;
 *  - the headless shell (chrome-headless-shell)    -> GpuPreference=1; -> Intel Iris Xe.
 * So the low-spec project runs on the headless shell and every other project on the full build.
 *
 * Hardware mode is the local default. CI (no GPU) and PW_GPU=0 run in software mode: one plain
 * headless project, no GPU expectation, exactly as before this split.
 *
 * Pure (no Playwright import) so the rule is unit-tested (tests/unit/e2e/gpu-mode.test.ts).
 */
import { isSoftwareRenderer } from "../../src/features/study/gpu-acceptance";

export type ExpectedGpu = "nvidia" | "intel";
export type RendererClass = ExpectedGpu | "software" | "other" | "unknown";

/** Project names (playwright.config.ts). */
export const LOW_SPEC_PROJECT = "low-spec";
export const DEFAULT_PROJECT = "chromium";

/** ANGLE on Direct3D 11 with the GPU forced on; the same flags for both browser builds. */
export const GPU_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] as const;

/** The low-spec profile: integrated GPU, 4x CPU throttle (via CDP), 1366 x 768 at DPR 1. */
export const LOW_SPEC = { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, cpuThrottle: 4 } as const;

/** True unless CI is set or PW_GPU=0 (software rendering, no GPU expectation). */
export function hardwareGpu(env: Record<string, string | undefined> = process.env): boolean {
  return !env.CI && env.PW_GPU !== "0";
}

/** Classifies the unmasked WebGL vendor + renderer string. */
export function classifyRenderer(renderer: string | null | undefined): RendererClass {
  if (!renderer || !renderer.trim()) return "unknown";
  if (isSoftwareRenderer(renderer)) return "software";
  if (/nvidia|geforce/i.test(renderer)) return "nvidia";
  if (/intel/i.test(renderer)) return "intel";
  return "other";
}

const LABEL: Record<ExpectedGpu, string> = { nvidia: "NVIDIA (GeForce GTX 1650)", intel: "Intel (Iris Xe)" };
const BUILD: Record<ExpectedGpu, string> = {
  nvidia: 'the full Chromium build (channel "chromium", chrome.exe), which needs GpuPreference=2;',
  intel: "the headless shell (chrome-headless-shell.exe), which needs GpuPreference=1;",
};

/**
 * Null when the renderer matches the project's expected GPU, else a message that says what was
 * expected, what was found, and where to fix it.
 */
export function rendererMismatch(project: string, expected: ExpectedGpu, renderer: string | null | undefined): string | null {
  const found = classifyRenderer(renderer);
  if (found === expected) return null;
  const head = `GPU check failed in Playwright project "${project}": expected ${LABEL[expected]}, WebGL reports ${renderer ? `"${renderer}"` : "no renderer"}.`;
  if (found === "unknown")
    return `${head} WebGL or WEBGL_debug_renderer_info is unavailable, so the GPU cannot be confirmed. Check that the GPU process started (${GPU_ARGS.join(" ")}).`;
  if (found === "software")
    return `${head} This is software rendering (SwiftShader or similar): the GPU flags (${GPU_ARGS.join(" ")}) did not take effect or the GPU is blocklisted. Run with PW_GPU=0 to test in software on purpose.`;
  return `${head} This project runs on ${BUILD[expected]} set it in HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences for that executable (re-add both executables after Playwright downloads a new browser build).`;
}
