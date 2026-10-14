/**
 * Drizzle schema barrel. Each domain has its own file in db/schema/ and is re-exported here
 * so `getDb()` sees the full schema.
 *
 * Conventions: snake_case columns (drizzle `casing: "snake_case"`), uuid primary keys
 * (PostgreSQL 18 `uuidv7()`), timestamptz everywhere. See db/schema/_common.ts and
 * docs/architecture/knowledge-schema.md.
 *
 * Migrations: 0000 extensions, 0001 SQL helper functions (custom), 0002 tables
 * (drizzle-kit generated), 0003 integrity triggers (custom), 0004 review-fix tables/columns
 * (drizzle-kit generated), 0005 review-fix integrity triggers (custom).
 */
export * from "./auth";
export * from "./_common";
export * from "./knowledge";
export * from "./publishing";
export * from "./spatial";
export * from "./release";
export * from "./media";
export * from "./study";
export * from "./assessment";
export * from "./telemetry";
export * from "./audit";
