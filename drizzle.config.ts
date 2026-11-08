import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema/*.ts",
  out: "./db/migrations",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "postgres://episteme:episteme_dev_password@localhost:5433/episteme",
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
});
