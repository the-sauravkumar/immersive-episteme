import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config. `npm run db:generate` diffs db/schema/*.ts against the migration
 * snapshots and writes SQL to db/migrations. Migrations are applied by the programmatic
 * migrator (scripts/db/migrate.ts), never by `drizzle-kit push`.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema/*.ts",
  out: "./db/migrations",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    // Direct connection when set (Neon's pooler runs in transaction mode; see scripts/db/_shared.ts).
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "postgres://episteme:episteme_dev_password@localhost:5433/episteme",
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
});
