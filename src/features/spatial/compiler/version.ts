/**
 * Bump COMPILER_VERSION whenever a change can alter any output byte for the same inputs;
 * bump LAYOUT_VERSION when the building scheme itself changes. Both are part of every
 * manifest and of its hash, and spatial_manifests is unique on (snapshot, rule set,
 * compiler version, seed).
 */
export const COMPILER_VERSION = "spatial-compiler@1.0.0";
export const LAYOUT_VERSION = "grid-wings@1";
