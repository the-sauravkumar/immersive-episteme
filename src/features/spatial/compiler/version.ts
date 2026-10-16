/**
 * Bump COMPILER_VERSION whenever a change can alter any output byte for the same inputs;
 * bump LAYOUT_VERSION when the building scheme itself changes. Both are part of every
 * manifest and of its hash, and spatial_manifests is unique on (snapshot, rule set,
 * compiler version, seed).
 */
export const COMPILER_VERSION = "spatial-compiler@1.4.0";
/**
 * @3 (DR-043): the "hub" building (rule set option `layout.building`), serpentine wing grids with a
 * doorway between consecutive sections (finding spatial-3), and hall exhibits placed nearest in plan.
 *
 * @4 (DR-045): rule set option `layout.exhibitMount`; "stand" puts each plate on a reading stand at the
 * front of the exhibit footprint (footprint, approach points and routes unchanged).
 */
export const LAYOUT_VERSION = "grid-wings@4";
