/** node:crypto implementation of `Sha256Hasher` (scripts and tests). */
import { createHash } from "node:crypto";

import type { Sha256Hasher } from "./hash";

export const nodeSha256: Sha256Hasher = {
  sha256Hex: (text) => createHash("sha256").update(text, "utf8").digest("hex"),
};

export function sha256OfBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
