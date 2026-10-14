/**
 * Client telemetry: persistent outbox, batching tracker, typed event helpers and the React
 * provider. Client-safe (no server-only imports). See docs/architecture/data-and-telemetry-layer.md.
 */
export * from "./events";
export * from "./outbox";
export * from "./timing";
export * from "./tracker";
export * from "./provider";
