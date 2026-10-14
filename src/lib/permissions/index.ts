/**
 * Authorisation vocabulary (pure, isomorphic). Server-side enforcement helpers that redirect
 * or throw live in src/server/auth (requirePermission, requireLearningAccess, ...).
 */
export * from "./roles";
export * from "./permissions";
export * from "./matrix";
export * from "./can";
export * from "./learning";
export * from "./console-routes";
export * from "./safe-redirect";
