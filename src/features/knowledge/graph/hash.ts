import { canonicalJson } from "./canonical-json";

export interface Sha256Hasher {
  sha256Hex(text: string): string;
}

export function hashCanonical(hasher: Sha256Hasher, value: unknown): string {
  return hasher.sha256Hex(canonicalJson(value));
}

export function nameBasedUuid(hasher: Sha256Hasher, ...nameParts: string[]): string {
  const hex = hasher.sha256Hex(`immersive-episteme:content:${nameParts.join("\u0000")}`);
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
