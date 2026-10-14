/**
 * scripts/db/_shared.ts refuses to run against a database whose server major or extension
 * versions differ from the pinned ones (docker-compose.yml / CI pin the image by digest).
 */
import { describe, expect, it } from "vitest";

import { EXPECTED_DB, assertDbVersions } from "../../scripts/db/_shared";

describe("assertDbVersions", () => {
  it("accepts the pinned versions", () => {
    expect(() => assertDbVersions(180006, { ...EXPECTED_DB.extensions })).not.toThrow();
  });

  it("rejects another server major or extension version", () => {
    expect(() => assertDbVersions(170004, { ...EXPECTED_DB.extensions })).toThrow(/PostgreSQL 17/);
    expect(() => assertDbVersions(180006, { ...EXPECTED_DB.extensions, vector: "0.9.0" })).toThrow(/vector 0.9.0 \(expected 0.8.7\)/);
    expect(() => assertDbVersions(180006, { pg_trgm: "1.6", pgcrypto: "1.4" })).toThrow(/vector missing/);
  });
});
