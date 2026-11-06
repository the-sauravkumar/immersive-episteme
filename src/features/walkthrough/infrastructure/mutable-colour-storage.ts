type SizedSource = { readonly width: number; readonly height: number };

interface Planned {
  readonly internalFormat: number;
  readonly width: number;
  readonly height: number;
  readonly defined: Set<number>;
}

export type StorageContext = Pick<WebGL2RenderingContext, "TEXTURE_2D" | "TEXTURE_BINDING_2D" | "RGBA8" | "SRGB8_ALPHA8" | "RGBA" | "UNSIGNED_BYTE" | "UNPACK_SKIP_PIXELS" | "UNPACK_SKIP_ROWS" | "getParameter" | "texStorage2D" | "texSubImage2D" | "texImage2D" | "generateMipmap">;

function levelSize(plan: Planned, level: number): SizedSource {
  return { width: Math.max(1, plan.width >> level), height: Math.max(1, plan.height >> level) };
}

export function storeColourTexturesMutably(gl: StorageContext): void {
  const colourFormats = new Set<number>([gl.RGBA8, gl.SRGB8_ALPHA8]);
  const plans = new WeakMap<WebGLTexture, Planned>();
  const texStorage2D = gl.texStorage2D.bind(gl);
  const texSubImage2D = gl.texSubImage2D.bind(gl) as (...args: unknown[]) => void;
  const texImage2D = gl.texImage2D.bind(gl) as (...args: unknown[]) => void;
  const generateMipmap = gl.generateMipmap.bind(gl);
  const bound = (target: number): WebGLTexture | null => (target === gl.TEXTURE_2D ? (gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null) : null);
  const unskipped = () => gl.getParameter(gl.UNPACK_SKIP_PIXELS) === 0 && gl.getParameter(gl.UNPACK_SKIP_ROWS) === 0;

  gl.texStorage2D = (target: number, levels: number, internalFormat: number, width: number, height: number) => {
    const texture = Math.floor(levels) > 1 && colourFormats.has(internalFormat) ? bound(target) : null;
    if (!texture) return texStorage2D(target, levels, internalFormat, width, height);
    plans.set(texture, { internalFormat, width, height, defined: new Set() });
  };

  gl.texSubImage2D = ((...args: unknown[]) => {
    const [target, level, x, y] = args as number[];
    const texture = bound(target!);
    const plan = texture ? plans.get(texture) : undefined;
    if (!plan || plan.defined.has(level!)) return texSubImage2D(...args);
    const size = levelSize(plan, level!);
    const sourceForm = args.length === 7 || (args.length === 9 && typeof args[8] === "object" && args[8] !== null);
    const width = args.length === 7 ? (args[6] as SizedSource).width : (args[4] as number);
    const height = args.length === 7 ? (args[6] as SizedSource).height : (args[5] as number);
    plan.defined.add(level!);
    if (sourceForm && x === 0 && y === 0 && width === size.width && height === size.height && unskipped()) {
      if (args.length === 7) texImage2D(target, level, plan.internalFormat, args[4], args[5], args[6]);
      else texImage2D(target, level, plan.internalFormat, width, height, 0, args[6], args[7], args[8]);
      return;
    }
    texImage2D(target, level, plan.internalFormat, size.width, size.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    texSubImage2D(...args);
  }) as WebGL2RenderingContext["texSubImage2D"];

  gl.generateMipmap = (target: number) => {
    const texture = bound(target);
    const plan = texture ? plans.get(texture) : undefined;
    if (!plan) return generateMipmap(target);
    if (!plan.defined.has(0)) return;
    plans.delete(texture!);
    generateMipmap(target);
  };
}
