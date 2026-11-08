import { isSoftwareRenderer } from "../../src/features/study/gpu-acceptance";

export type ExpectedGpu = "nvidia" | "intel";
export type RendererClass = ExpectedGpu | "software" | "other" | "unknown";

export const LOW_SPEC_PROJECT = "low-spec";
export const DEFAULT_PROJECT = "chromium";

export const GPU_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] as const;

export const LOW_SPEC = { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, cpuThrottle: 4 } as const;

export function hardwareGpu(env: Record<string, string | undefined> = process.env): boolean {
  return !env.CI && env.PW_GPU !== "0";
}

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
