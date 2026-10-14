/**
 * content/review/source-manifest.tsv: one row per archived source URL
 * (`cache_id  http_status  sha256  url`). The archive itself is kept outside the repository
 * (copyright); the manifest records what was fetched and its hash (verification.md V5).
 */

export interface SourceManifestEntry {
  cacheId: string;
  httpStatus: number | null;
  sha256: string;
  url: string;
}

export function parseSourceManifest(text: string): SourceManifestEntry[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0]?.split("\t").map((h) => h.trim()) ?? [];
  const col = (name: string) => header.indexOf(name);
  const [ci, hs, sh, ur] = [col("cache_id"), col("http_status"), col("sha256"), col("url")];
  if (sh < 0 || ur < 0) throw new Error("source manifest needs sha256 and url columns");
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const status = hs >= 0 ? Number(cells[hs]) : NaN;
    return {
      cacheId: ci >= 0 ? (cells[ci] ?? "").trim() : "",
      httpStatus: Number.isFinite(status) ? status : null,
      sha256: (cells[sh] ?? "").trim(),
      url: (cells[ur] ?? "").trim(),
    };
  });
}

/** Normalised URL key (manifest and content may differ in a trailing slash). */
export function manifestUrlKey(url: string): string {
  return url.trim().replace(/\/+$/, "");
}
