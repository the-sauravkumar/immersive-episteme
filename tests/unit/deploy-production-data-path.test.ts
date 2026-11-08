import { describe, expect, it } from "vitest";

import { decideBootstrapTarget, missingReferenceCodes, pendingMigrations, REMOTE_CONFIRM_FLAG } from "../../scripts/content/remote-guard";
import { isLocalHost } from "../../scripts/db/_shared";
import { refusalReason } from "../../scripts/deploy/lib/command-guard";

const NEON = "postgresql://episteme_app:pw@ep-cool-name-a1b2c3d4.ap-southeast-1.aws.neon.tech/episteme?sslmode=verify-full";
const RDS = "postgres://episteme_app:pw@ie.abc123.ap-south-1.rds.amazonaws.com:5432/episteme?sslmode=verify-full";
const LOCAL = "postgres://episteme:episteme_dev_password@localhost:5433/episteme";
const split = (s: string) => s.split(" ");

describe("with-env command guard", () => {
  it.each([
    "npm run db:seed:reference",
    "npx tsx scripts/db/seed-reference.ts",
    "npm run content:bootstrap:remote -- --i-understand-this-is-remote",
    "npx tsx scripts/content/bootstrap-remote.ts --i-understand-this-is-remote",
    "npm run db:migrate",
    "npm run content:import",
    "npx tsx scripts/create-admin.ts --email a@b.c --name Ada",
  ])("allows %s", (cmd) => {
    expect(refusalReason(split(cmd))).toBeNull();
  });

  it.each([
    "npm run db:seed",
    "npm run db:seed -- --whatever",
    "npm run db:seed:reference && npm run db:seed",
    "npm run db:seed:referencex",
    "npm run db:seed:reference-all",
    "npm run db:reset",
    "npm run dev:bootstrap",
    "npx tsx scripts/dev/bootstrap.ts",
    "npx tsx scripts/db/seed.ts",
    "npx tsx scripts/db/seed",
    "npx tsx scripts\\db\\reset.ts",
    "npx tsx scripts/db/../db/seed.ts",
    "npx tsx ./scripts/./db/seed.ts",
    "npx tsx Scripts\\DB\\Seed.ts",
    "npx tsx scripts/content/../dev/bootstrap.ts",
    "npx tsx SCRIPTS/DEV/BOOTSTRAP.TS",
    "npm run db:seed:reference -- --test",
    "npm run db:migrate -- --test",
    "npx drizzle-kit push",
    "npx drizzle-kit drop",
  ])("refuses %s", (cmd) => {
    expect(refusalReason(split(cmd))).not.toBeNull();
  });

  it("refuses an empty command", () => {
    expect(refusalReason([])).not.toBeNull();
  });
});

describe("content:bootstrap:remote target guard", () => {
  it("refuses a remote host without the confirmation and names the host and database", () => {
    for (const url of [NEON, RDS]) {
      const d = decideBootstrapTarget(url, []);
      expect(d.ok).toBe(false);
      expect(d.remote).toBe(true);
      expect(d.message).toContain(new URL(url).hostname);
      expect(d.message).toContain("database episteme");
      expect(d.message).toContain(REMOTE_CONFIRM_FLAG);
      expect(d.message).not.toContain("pw");
    }
  });

  it("runs on a remote host with the confirmation, printing the host back", () => {
    const d = decideBootstrapTarget(NEON, [REMOTE_CONFIRM_FLAG]);
    expect(d).toMatchObject({ ok: true, remote: true, host: "ep-cool-name-a1b2c3d4.ap-southeast-1.aws.neon.tech", database: "episteme" });
    expect(d.message).toContain("ep-cool-name-a1b2c3d4.ap-southeast-1.aws.neon.tech");
  });

  it("runs on a local database without the confirmation", () => {
    expect(decideBootstrapTarget(LOCAL, [])).toMatchObject({ ok: true, remote: false, host: "localhost" });
    expect(decideBootstrapTarget("postgres://u:p@127.0.0.1:5433/x", [])).toMatchObject({ ok: true, remote: false });
  });

  it("judges the host pg connects to: a `host` query parameter overrides the URL's host name", () => {
    const disguised = "postgres://u:p@localhost:5433/episteme?host=ep-cool-name-a1b2c3d4.ap-southeast-1.aws.neon.tech";
    const d = decideBootstrapTarget(disguised, []);
    expect(d).toMatchObject({ ok: false, remote: true, host: "ep-cool-name-a1b2c3d4.ap-southeast-1.aws.neon.tech" });
    expect(isLocalHost(disguised)).toBe(false);
    expect(isLocalHost("postgres://u:p@ep-x.neon.tech/db?host=localhost")).toBe(true);
    expect(isLocalHost("postgres://u:p@localhost/db?host=")).toBe(true);
    expect(isLocalHost("postgres://u:p@[::1]:5433/db")).toBe(true);
    expect(isLocalHost("postgres://u:p@LOCALHOST/db")).toBe(true);
    expect(isLocalHost("postgres://u:p@localhost.evil.example/db")).toBe(false);
  });

  it("refuses unknown arguments, --test and near-miss spellings even with the confirmation", () => {
    for (const extra of ["--test", "--i-understand-this-is-remote=yes", "--yes", "--force"]) {
      expect(decideBootstrapTarget(NEON, [REMOTE_CONFIRM_FLAG, extra]).ok).toBe(false);
      expect(decideBootstrapTarget(LOCAL, [extra]).ok).toBe(false);
    }
  });

  it("refuses unreadable or non-postgres URLs", () => {
    expect(decideBootstrapTarget("", [REMOTE_CONFIRM_FLAG]).ok).toBe(false);
    expect(decideBootstrapTarget("not a url", [REMOTE_CONFIRM_FLAG]).ok).toBe(false);
    expect(decideBootstrapTarget("https://example.org/db", [REMOTE_CONFIRM_FLAG]).ok).toBe(false);
  });
});

describe("content:bootstrap:remote preconditions", () => {
  it("lists reference codes the database lacks", () => {
    const expected = { eventTypes: ["a", "b"], relationshipTypes: ["USES"], knowledgeCategories: ["tools"] };
    expect(missingReferenceCodes(expected, expected)).toEqual([]);
    expect(missingReferenceCodes(expected, { eventTypes: ["a"], relationshipTypes: [], knowledgeCategories: ["tools", "extra"] })).toEqual([
      "event_types:b",
      "relationship_types:USES",
    ]);
  });

  it("counts pending migrations", () => {
    expect(pendingMigrations(21, 21)).toBe(0);
    expect(pendingMigrations(21, 0)).toBe(21);
    expect(pendingMigrations(21, 22)).toBe(0);
  });
});
