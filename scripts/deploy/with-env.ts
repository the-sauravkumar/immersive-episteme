import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { refusalReason } from "./lib/command-guard";
import { FORBIDDEN, readEnvFile, redactUrl } from "./lib/env-catalog";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const fileIdx = argv.indexOf("--env-file");
if (sep < 0 || fileIdx < 0 || fileIdx > sep || !argv[fileIdx + 1]) {
  console.error("Usage: npx tsx scripts/deploy/with-env.ts --env-file <path> -- <command...>");
  process.exit(2);
}
const command = argv.slice(sep + 1);
const joined = command.join(" ");
const refused = refusalReason(command);
if (refused) {
  console.error(`Refused: "${joined}" must never run against production (${refused}).`);
  process.exit(2);
}

const fileEnv = readEnvFile(resolve(argv[fileIdx + 1]!));
const env: Record<string, string | undefined> = { ...process.env };
for (const [k, v] of Object.entries(fileEnv)) if (!(k in FORBIDDEN)) env[k] = v;
delete env.TEST_DATABASE_URL;
if (!fileEnv.DATABASE_URL_UNPOOLED) {
  delete env.DATABASE_URL_UNPOOLED;
  const repoEnv = resolve(".env");
  if (existsSync(repoEnv) && readEnvFile(repoEnv).DATABASE_URL_UNPOOLED) {
    console.error(
      "Refused: the repo .env sets DATABASE_URL_UNPOOLED and the production env file does not, so the database " +
        "scripts would connect to the .env value. Set DATABASE_URL_UNPOOLED in the production file, or remove it from .env.",
    );
    process.exit(2);
  }
}

let caDir: string | null = null;
if (fileEnv.DATABASE_CA_PEM) {
  caDir = mkdtempSync(join(tmpdir(), "episteme-ca-"));
  const caFile = join(caDir, "rds-ca.pem");
  writeFileSync(caFile, `${fileEnv.DATABASE_CA_PEM.trim()}\n`);
  env.NODE_EXTRA_CA_CERTS = caFile;
}

console.log(`[with-env] ${joined}`);
console.log(`[with-env] DATABASE_URL ${fileEnv.DATABASE_URL ? redactUrl(fileEnv.DATABASE_URL) : "(not set)"}${caDir ? " + RDS CA via NODE_EXTRA_CA_CERTS" : ""}`);
if (fileEnv.DATABASE_URL_UNPOOLED) console.log(`[with-env] DATABASE_URL_UNPOOLED ${redactUrl(fileEnv.DATABASE_URL_UNPOOLED)} (used by the database scripts)`);
const quote = (a: string) => (/[\s"&|<>^()%!]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const r =
  process.platform === "win32"
    ? spawnSync(command.map(quote).join(" "), { env: env as NodeJS.ProcessEnv, stdio: "inherit", shell: true })
    : spawnSync(command[0]!, command.slice(1), { env: env as NodeJS.ProcessEnv, stdio: "inherit" });
if (caDir) rmSync(caDir, { recursive: true, force: true });
process.exit(r.status ?? 1);
