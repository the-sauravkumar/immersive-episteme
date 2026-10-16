/**
 * Helper for push-env.ps1: parses an env file with the same dotenv parser as the rest of the kit
 * and prints a JSON plan on stdout.
 *
 *   npx tsx scripts/deploy/lib/env-json.ts --env-file <path> [--with-values] [--build-version <sha>]
 *
 * Without --with-values (dry run) the output carries NO values at all, only names, kinds, byte
 * lengths and decisions. With --with-values the values are included for push-env.ps1 to pipe into
 * `vercel env add` over stdin; push-env never prints them.
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import { CATALOG, FORBIDDEN, catalogEntry, envBytes, isVercelSystemName, readEnvFile, VERCEL_ENV_LIMIT_BYTES } from "./env-catalog";

const { values } = parseArgs({
  options: {
    "env-file": { type: "string" },
    "with-values": { type: "boolean", default: false },
    "build-version": { type: "string" },
  },
});

const file = values["env-file"];
if (!file || !existsSync(file)) {
  console.error(`env-json: env file not found: ${file ?? "(none)"}`);
  process.exit(2);
}

const env = readEnvFile(file);
if (values["build-version"]) env.APP_BUILD_VERSION = values["build-version"];

type Item = { name: string; kind: "secret" | "config"; action: "push" | "skip"; reason: string; bytes: number; value?: string };
const items: Item[] = [];
const known = new Set(CATALOG.map((e) => e.name));

for (const entry of CATALOG) {
  const v = env[entry.name];
  if (v === undefined) {
    items.push({ name: entry.name, kind: entry.kind, action: "skip", reason: entry.need === "required" ? "MISSING (required)" : "not set", bytes: 0 });
    continue;
  }
  items.push({ name: entry.name, kind: entry.kind, action: "push", reason: entry.source, bytes: Buffer.byteLength(v), ...(values["with-values"] ? { value: v } : {}) });
}
for (const [name, v] of Object.entries(env)) {
  if (known.has(name)) continue;
  const why = FORBIDDEN[name] ?? (isVercelSystemName(name) ? "Vercel system variable; set by the platform" : "not in the catalogue (scripts/deploy/lib/env-catalog.ts)");
  items.push({ name, kind: catalogEntry(name)?.kind ?? "secret", action: "skip", reason: `REFUSED: ${why}`, bytes: Buffer.byteLength(v) });
}

const pushed = Object.fromEntries(items.filter((i) => i.action === "push").map((i) => [i.name, env[i.name]!]));
process.stdout.write(
  JSON.stringify({
    file,
    totalBytes: envBytes(pushed),
    limitBytes: VERCEL_ENV_LIMIT_BYTES,
    missingRequired: items.filter((i) => i.reason === "MISSING (required)").map((i) => i.name),
    refused: items.filter((i) => i.reason.startsWith("REFUSED")).map((i) => i.name),
    items,
  }),
);
