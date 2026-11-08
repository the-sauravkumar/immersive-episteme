import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { serverEnv } from "@/lib/env";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function sealKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "immersive-episteme", "invite-code-at-rest/v1", 32));
}

export function sealInviteCode(normalised: string, codeHash: string, secret: string = serverEnv().BETTER_AUTH_SECRET): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", sealKey(secret), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(codeHash, "utf8"));
  const body = Buffer.concat([cipher.update(normalised, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${VERSION}.${iv.toString("base64url")}.${body.toString("base64url")}`;
}

export function openInviteCode(sealed: string, codeHash: string, secret: string = serverEnv().BETTER_AUTH_SECRET): string | null {
  const [version, iv, body] = sealed.split(".");
  if (version !== VERSION || !iv || !body) return null;
  try {
    const raw = Buffer.from(body, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", sealKey(secret), Buffer.from(iv, "base64url"), { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(codeHash, "utf8"));
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    return Buffer.concat([decipher.update(raw.subarray(0, raw.length - TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
