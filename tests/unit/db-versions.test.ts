/**
 * scripts/db/_shared.ts refuses to run against a database whose server major or extension
 * versions differ from the pinned ones (docker-compose.yml / CI pin the image by digest; Neon's
 * PostgreSQL 18 ships pgvector 0.8.6, accepted as well: decision record "Neon").
 */
import { describe, expect, it } from "vitest";

import { assertDbVersions } from "../../scripts/db/_shared";

const PINNED = { vector: "0.8.7", pg_trgm: "1.6", pgcrypto: "1.4" };

describe("assertDbVersions", () => {
  it("accepts the pinned versions and Neon's pgvector 0.8.6", () => {
    expect(() => assertDbVersions(180006, PINNED)).not.toThrow();
    expect(() => assertDbVersions(180001, { ...PINNED, vector: "0.8.6" })).not.toThrow();
  });

  it("rejects another server major or extension version", () => {
    expect(() => assertDbVersions(170004, PINNED)).toThrow(/PostgreSQL 17/);
    expect(() => assertDbVersions(180006, { ...PINNED, vector: "0.9.0" })).toThrow(/vector 0.9.0 \(expected 0.8.7 or 0.8.6\)/);
    expect(() => assertDbVersions(180006, { ...PINNED, vector: "0.8.0" })).toThrow(/vector 0.8.0/);
    expect(() => assertDbVersions(180006, { pg_trgm: "1.6", pgcrypto: "1.4" })).toThrow(/vector missing/);
  });
});
