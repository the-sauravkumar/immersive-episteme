/**
 * The ONE rule for "can this browser show the 3D museum?", shared by the study device check
 * (src/components/study/device-check.tsx, evaluated by the engine) and the museum's own probe
 * (src/features/immersive/quality.ts, src/components/museum/museum-app.tsx).
 *
 * Final review study-01: the device check used to pass any WebGL (1 or 2) and could not see a
 * software renderer, while the museum refuses both in study mode. An immersive participant on a
 * GPU-blocklisted lab PC or a VM therefore passed the check, saw only the fallback screen for the
 * whole learning budget, and the WebGL-failure policy (Q-R10) never ran. Pure and client-safe.
 */

/** Renderer strings of software rasterisers (SwiftShader, llvmpipe, Microsoft Basic Render, ...). */
export const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|microsoft basic render|software/i;

export function isSoftwareRenderer(renderer: string | null | undefined): boolean {
  return !!renderer && SOFTWARE_RENDERER.test(renderer);
}

/**
 * Study mode: the museum needs WebGL 2 on a hardware renderer (a software renderer is refused
 * there; only the non-study `allowSoftware` debug switch lifts that).
 */
export function museumCanRender(gpu: { webglVersion: 1 | 2 | null; softwareRenderer?: boolean | null }): boolean {
  return gpu.webglVersion === 2 && gpu.softwareRenderer !== true;
}
