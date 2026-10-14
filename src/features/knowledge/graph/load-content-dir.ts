/**
 * Filesystem reader for content/ (Node only: scripts and tests). Read-only.
 * Finds content/shared/*.json, content/comparisons.json and
 * content/traditions/<slug>/tradition.json, plus content/review/source-manifest.tsv.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { sha256OfBytes } from "./hash-node";
import type { ContentFileInput } from "./loader";

export interface ContentDirectory {
  root: string;
  files: ContentFileInput[];
  sourceManifest: { path: string; text: string; sha256: string } | null;
}

function toPosix(p: string): string {
  return p.split("\\").join("/");
}

export function readContentDirectory(contentDir: string, repoRoot: string = join(contentDir, "..")): ContentDirectory {
  const paths: string[] = [];
  const shared = join(contentDir, "shared");
  if (existsSync(shared)) {
    for (const f of readdirSync(shared).sort()) if (f.endsWith(".json")) paths.push(join(shared, f));
  }
  const comparisons = join(contentDir, "comparisons.json");
  if (existsSync(comparisons)) paths.push(comparisons);
  const traditions = join(contentDir, "traditions");
  if (existsSync(traditions)) {
    for (const d of readdirSync(traditions).sort()) {
      const f = join(traditions, d, "tradition.json");
      if (existsSync(f)) paths.push(f);
    }
  }
  const files = paths.map((p) => {
    const bytes = readFileSync(p);
    return { path: toPosix(relative(repoRoot, p)), text: bytes.toString("utf8"), sha256: sha256OfBytes(bytes) };
  });

  const manifestPath = join(contentDir, "review", "source-manifest.tsv");
  let sourceManifest: ContentDirectory["sourceManifest"] = null;
  if (existsSync(manifestPath)) {
    const bytes = readFileSync(manifestPath);
    sourceManifest = { path: toPosix(relative(repoRoot, manifestPath)), text: bytes.toString("utf8"), sha256: sha256OfBytes(bytes) };
  }
  return { root: contentDir, files, sourceManifest };
}
