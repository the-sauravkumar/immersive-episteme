/**
 * Chromium launch flags for GPU measurement runs on this Windows laptop (two GPUs: NVIDIA GeForce
 * GTX 1650 and Intel Iris Xe). ANGLE on Direct3D 11; `--force_high_performance_gpu` selects the
 * discrete GPU (high tier), `--force_low_power_gpu` the integrated one (low tier). Headed, because
 * the headless shell renders with SwiftShader (software). The renderer string actually used is
 * recorded with every result.
 */
export function gpuLaunchArgs(gpu: "high" | "low"): string[] {
  return [
    "--use-angle=d3d11",
    gpu === "high" ? "--force_high_performance_gpu" : "--force_low_power_gpu",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-webgpu",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
  ];
}
