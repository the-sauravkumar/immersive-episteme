import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
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
