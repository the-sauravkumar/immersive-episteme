/**
 * Architectural texture set for /learn/immersive (docs/architecture/immersive-rendering-quality.md §2d).
 *
 * One set for every quality tier: the same files, the same resolution. Only CC0 sources.
 * Poly Haven publishes every asset under CC0 1.0 (https://polyhaven.com/license); the
 * pipeline re-reads each asset's info record from the Poly Haven API so ASSETS.md carries the
 * author and page a reviewer can check.
 *
 * Authored resolution: 2048 x 2048 per map. Rationale (module record I-T2): the densest
 * on-screen texel demand is a wall seen from the closest approach point (about 1.0 m) at
 * 1920 x 1080 with a 62 degree vertical field of view, about 1080 / (2 * 1.0 * tan 31 deg) = 899 px/m.
 * The wall map covers 3.0 m (683 px/m) and the floor map 1.7 m (1205 px/m), so neither is
 * magnified at normal viewing distances by more than ~1.3x, and mip level 0 is what a visitor
 * reading a wall panel sees.
 */
export interface TextureMapSpec {
  /** Poly Haven map key in the /files API (e.g. "Diffuse", "nor_gl", "arm"). */
  map: "Diffuse" | "nor_gl" | "arm";
  /** Role in the PBR material. */
  role: "color" | "normal" | "orm";
  colorSpace: "srgb" | "linear";
  /**
   * UASTC rate-distortion optimisation (default true). Off for the wall colour map (DR-044): RDO
   * on the near-flat plaster cost C12 (GPU SSIM 0.9746 < 0.98); without it the offline proxy
   * (RGBA8 transcode, scripts/museum/ssim.ts) measures 0.9883, for 1.0 MB more download.
   */
  rdo?: boolean;
}

export interface TextureAssetSpec {
  /** Name used in public/museum/textures and the renderer (material key). */
  name: "wall" | "floor";
  polyHavenId: string;
  /** Real-world size of one texture tile in metres (Poly Haven `dimensions`, mm / 1000). */
  tileMetres: number;
  /**
   * Optional albedo grade: the colour map is scaled per channel so its mean (in sRGB) becomes
   * this colour. Detail is preserved (a linear gain); recorded in ASSETS.md as a modification.
   */
  gradeMeanSrgb?: string;
  maps: TextureMapSpec[];
}

export const RESOLUTION = "2k" as const;

export const TEXTURE_ASSETS: TextureAssetSpec[] = [
  {
    name: "wall",
    polyHavenId: "beige_wall_001",
    tileMetres: 3.0,
    // Warm off-white gallery plaster (design-reuse catalogue §4.3 plaster #ece6dc), slightly
    // darker so the lit wall stays below highlight clipping at the study exposure (C2).
    gradeMeanSrgb: "#e3ddd2",
    maps: [
      { map: "Diffuse", role: "color", colorSpace: "srgb", rdo: false },
      { map: "nor_gl", role: "normal", colorSpace: "linear" },
      { map: "arm", role: "orm", colorSpace: "linear" },
    ],
  },
  {
    name: "floor",
    polyHavenId: "laminate_floor_02",
    tileMetres: 1.7,
    maps: [
      { map: "Diffuse", role: "color", colorSpace: "srgb" },
      { map: "nor_gl", role: "normal", colorSpace: "linear" },
      { map: "arm", role: "orm", colorSpace: "linear" },
    ],
  },
];

/**
 * KTX2 encoding: UASTC (the high-quality Basis mode) with a full mip chain and Zstandard.
 * Rate-distortion optimisation (lambda 0.5, the mildest setting tried) lets Zstandard compress
 * the blocks: without it the six maps were 25.6 MB (over the 25 MB first-download budget, §2a);
 * with it see ASSETS.md. Level-0 SSIM against the source is printed per map by --compare-ssim
 * (analysis/out/museum/encode-report.json) and measured on the GPU by C12. A map may switch RDO
 * off (`rdo: false`): the wall colour does (DR-044), the only map whose GPU SSIM failed C12.
 * Encoding is deterministic: maps whose arguments did not change keep their bytes and hashes.
 */
export const KTX_ENCODE_ARGS = (colorSpace: "srgb" | "linear", rdo = true) => [
  "--format",
  colorSpace === "srgb" ? "R8G8B8_SRGB" : "R8G8B8_UNORM",
  "--assign-tf",
  colorSpace === "srgb" ? "srgb" : "linear",
  "--encode",
  "uastc",
  "--uastc-quality",
  "2",
  ...(rdo ? ["--uastc-rdo", "--uastc-rdo-l", "0.5"] : []),
  "--zstd",
  "20",
  "--generate-mipmap",
  "--mipmap-filter",
  "lanczos4",
  "--mipmap-wrap",
  "wrap",
  "--compare-ssim",
];
