const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|microsoft basic render|software/i;

export function isSoftwareRenderer(renderer: string | null | undefined): boolean {
  return !!renderer && SOFTWARE_RENDERER.test(renderer);
}

export function walkthroughCanRender(gpu: { webglVersion: 1 | 2 | null; softwareRenderer?: boolean | null }): boolean {
  return gpu.webglVersion === 2 && gpu.softwareRenderer !== true;
}

export function detectWebgl(doc: Document = document): 1 | 2 | null {
  try {
    const canvas = doc.createElement("canvas");
    if (canvas.getContext("webgl2")) return 2;
    if (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) return 1;
  } catch {
    return null;
  }
  return null;
}

export function detectSoftwareRenderer(doc: Document = document): boolean {
  try {
    const canvas = doc.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return isSoftwareRenderer(renderer);
  } catch {
    return false;
  }
}

export function probeGpu(): { readonly webglVersion: 1 | 2 | null; readonly softwareRenderer: boolean } {
  return { webglVersion: detectWebgl(), softwareRenderer: detectSoftwareRenderer() };
}
