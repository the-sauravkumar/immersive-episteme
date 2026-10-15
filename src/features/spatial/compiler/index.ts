/**
 * Spatial compiler: deterministic, inspectable transformation from a knowledge snapshot to a
 * navigable museum layout. Documented in docs/architecture/spatial-compiler.md.
 */
export { compileSpatialManifest, interactionFor, manifestHashOf, revalidateManifest, SpatialCompileError } from "./compile";
export { canonicalHash, canonicalJson, deterministicUuid, sha256Hex } from "./canonical";
export { DEFAULT_RULE_SET, DEFAULT_ZONE_GROUPS, defaultRuleSetConfig, layoutConfigSchema, type LayoutConfig } from "./config";
export { contentToGraph, conceptUuid, relationshipUuid, ruleSetUuid, traditionUuid, type ContentFiles } from "./content-adapter";
export { comparisonMinTraditions, DEFAULT_COMPARISON_MIN_TRADITIONS, STRATEGIES, type StrategyId } from "./rules";
export { validateCompiled, collidersOf, roomsOf, type ValidationContext } from "./validate";
export { COMPILER_VERSION, LAYOUT_VERSION } from "./version";
export type * from "./types";
