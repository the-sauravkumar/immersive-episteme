/**
 * Quality tiers (docs/architecture/immersive-rendering-quality.md §2). The same content, zones,
 * exhibits, interactions and TEXTURES exist on every tier (§2d); tiers change only rendering cost:
 * how many accumulation samples are rendered per frame at rest (anti-aliasing converges in more
 * or fewer frames) and how far ahead room lettering is kept resident.
 *
 * The tier is chosen once at start-up from the GPU's renderer string, `deviceMemory` and
 * `hardwareConcurrency`, then LOCKED for the session (stored under the telemetry session id) and
 * logged once as a covariate (`render_quality_changed` from "unset").
 */
export type QualityTier = "high" | "low";

export interface TierConfig {
  tier: QualityTier;
  /** Device-pixel-ratio cap: native resolution up to 2x on every tier (never lowered at rest). */
  maxDpr: number;
  /** TAARenderPass.sampleLevel while at rest (2^n jittered samples per frame, 32 in total). */
  restSampleLevel: number;
  /** Doorway hops from the visitor's room whose lettering stays resident. */
  residentDepth: number;
}

export const TIERS: Record<QualityTier, TierConfig> = {
  high: { tier: "high", maxDpr: 2, restSampleLevel: 2, residentDepth: 2 },
  low: { tier: "low", maxDpr: 2, restSampleLevel: 1, residentDepth: 2 },
};

export interface GpuInfo {
  webgl2: boolean;
  renderer: string | null;
  vendor: string | null;
  deviceMemory: number | null;
  cores: number | null;
  software: boolean;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|microsoft basic render|software/i;
const INTEGRATED = /intel|iris|uhd|hd graphics|mali|adreno|powervr|apple gpu|videocore|radeon\(tm\) graphics|vega \d+ graphics/i;

export function probeGpu(): GpuInfo {
  const info: GpuInfo = { webgl2: false, renderer: null, vendor: null, deviceMemory: null, cores: null, software: false };
  if (typeof document === "undefined") return info;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    if (gl) {
      info.webgl2 = true;
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      info.renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      info.vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    info.webgl2 = false;
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  info.deviceMemory = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  info.cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null;
  info.software = !!info.renderer && SOFTWARE.test(info.renderer);
  return info;
}

/** Heuristic tier from the probe (documented in the module record, I-R4). */
export function classifyTier(gpu: GpuInfo): QualityTier {
  if (!gpu.renderer || gpu.software) return "low";
  if (INTEGRATED.test(gpu.renderer)) return "low";
  if (gpu.deviceMemory !== null && gpu.deviceMemory < 8) return "low";
  if (gpu.cores !== null && gpu.cores < 4) return "low";
  return "high";
}

const KEY = (sessionId: string) => `ie-immersive-tier:v1:${sessionId}`;

export interface LockedTier {
  tier: QualityTier;
  /** True when this call chose the tier (first load of the session): log it once. */
  fresh: boolean;
}

/**
 * The session's tier: the stored one if present (reloads keep it), else `chosen`. `override`
 * (measurement runs, non-study modes only) replaces the stored tier.
 */
export function lockTier(sessionId: string, chosen: QualityTier, override: QualityTier | null): LockedTier {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY(sessionId));
  } catch {
    stored = null;
  }
  if (override && override !== stored) {
    try {
      localStorage.setItem(KEY(sessionId), override);
    } catch {
      /* storage unavailable: the tier still applies to this page load */
    }
    return { tier: override, fresh: true };
  }
  if (stored === "high" || stored === "low") return { tier: stored, fresh: false };
  try {
    localStorage.setItem(KEY(sessionId), chosen);
  } catch {
    /* see above */
  }
  return { tier: chosen, fresh: true };
}
