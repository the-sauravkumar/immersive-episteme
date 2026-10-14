/**
 * Shared helpers for the content CLIs (validate, build-snapshot). Read-only on content/.
 *
 * Output goes to analysis/out/knowledge-graph/ by default: `.tmp/` is not in .gitignore,
 * while `/analysis/out/` is ("generated data is not committed").
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readContentDirectory } from "../../src/features/knowledge/graph/load-content-dir";
import { parseSourceManifest } from "../../src/features/knowledge/graph/source-manifest";
import { validateContentFiles } from "../../src/features/knowledge/graph/report";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_OUT = join(REPO_ROOT, "analysis", "out", "knowledge-graph");

export function arg(name: string, argv: readonly string[] = process.argv.slice(2)): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq?.slice(name.length + 3);
}

export function flag(name: string, argv: readonly string[] = process.argv.slice(2)): boolean {
  return argv.includes(`--${name}`);
}

/**
 * Exit with an error on any argument that is not a known option, so a typo
 * (e.g. `--publishable` for `--kind publishable`) cannot silently fall back to a default.
 */
export function assertKnownArgs(
  options: { values?: readonly string[]; flags?: readonly string[] },
  argv: readonly string[] = process.argv.slice(2),
): void {
  const values = new Set(options.values ?? []);
  const flags = new Set(options.flags ?? []);
  const unknown: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) {
      unknown.push(a);
      continue;
    }
    const name = a.slice(2).split("=")[0]!;
    if (flags.has(name)) continue;
    if (values.has(name)) {
      if (!a.includes("=")) i++; // skip the value that follows
      continue;
    }
    unknown.push(a);
  }
  if (unknown.length > 0) {
    const known = [...values].map((v) => `--${v} <value>`).concat([...flags].map((f) => `--${f}`));
    console.error(`Unknown argument(s): ${unknown.join(" ")}\nKnown options: ${known.join(", ")}`);
    process.exit(64);
  }
}

export function loadAndValidate(contentDir: string) {
  const dir = readContentDirectory(contentDir, REPO_ROOT);
  const manifestEntries = dir.sourceManifest ? parseSourceManifest(dir.sourceManifest.text) : null;
  const { model, report } = validateContentFiles(dir.files, { sourceManifest: manifestEntries });
  return { dir, model, report, manifestEntries };
}

export function writeOut(outDir: string, name: string, content: string): string {
  mkdirSync(outDir, { recursive: true });
  const p = join(outDir, name);
  writeFileSync(p, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  return p;
}
