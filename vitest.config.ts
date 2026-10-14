import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Two projects (each inherits the root plugins/resolve — Vitest 5 inline projects extend
 * the declaring config by default):
 *  - "dom":  component tests (*.test.tsx) in jsdom with Testing Library.
 *  - "node": everything else (*.test.ts) — pure logic, server services, DB integration.
 *  - "content": the curation contract over the live files in content/ (tests/content). Kept
 *    out of `npm test` (which runs dom + node) so in-progress curation never fails app CI;
 *    run it with `npm run test:content` (its own CI job).
 * Integration tests that need Postgres read TEST_DATABASE_URL (see .env.example).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside RSC; neutralise it for unit tests of server modules.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/**/*.test.tsx", "src/**/*.test.tsx"],
          setupFiles: ["./tests/setup/dom.ts"],
        },
      },
      {
        test: {
          name: "node",
          environment: "node",
          include: [
            "tests/unit/**/*.test.ts",
            "tests/integration/**/*.test.ts",
            "src/**/*.test.ts",
          ],
          setupFiles: ["./tests/setup/node.ts"],
        },
      },
      {
        test: {
          name: "content",
          environment: "node",
          include: ["tests/content/**/*.test.ts"],
        },
      },
    ],
  },
});
