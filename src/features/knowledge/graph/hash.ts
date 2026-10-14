/**
 * Hashing behind a small synchronous interface so graph code stays runtime-neutral.
 * `hash-node.ts` provides the node:crypto implementation used by scripts and tests.
 */
import { canonicalJson } from "./canonical-json";

export interface Sha256Hasher {
  /** Lowercase hex sha256 of the UTF-8 bytes of `text`. */
  sha256Hex(text: string): string;
}

export function hashCanonical(hasher: Sha256Hasher, value: unknown): string {
  return hasher.sha256Hex(canonicalJson(value));
}

/**
 * Name-based UUID (RFC 9562 version 8: custom, built from sha256). Stable for a given name,
 * so a bundle built twice from the same content has the same ids. Content-derived ids live
 * in their own namespace and never collide with database uuidv7 ids.
 */
export function nameBasedUuid(hasher: Sha256Hasher, ...nameParts: string[]): string {
  const hex = hasher.sha256Hex(`immersive-episteme:content:${nameParts.join("\u0000")}`);
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
