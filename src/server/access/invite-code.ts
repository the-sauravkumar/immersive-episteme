/**
 * Invite codes (deployment source change S11): generation, normalisation and hashing. Pure.
 *
 * A code is 20 symbols of Crockford base32 (100 random bits), shown in groups of four:
 * `7K2M-QX9D-...`. People may type it in any case, with or without the dashes and spaces, and with
 * the letters Crockford folds (O -> 0, I and L -> 1). Only the SHA-256 of the normalised code is
 * stored (db/schema/access.ts); 100 random bits make a salt unnecessary and guessing infeasible.
 */
import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const INVITE_CODE_SYMBOLS = 20;
const VALID = new RegExp(`^[${ALPHABET}]{${INVITE_CODE_SYMBOLS}}$`);

/** A new random code, formatted for people (`XXXX-XXXX-XXXX-XXXX-XXXX`). */
export function generateInviteCode(): string {
  // 256 is a multiple of 32, so `byte & 31` is uniform over the alphabet.
  const bytes = randomBytes(INVITE_CODE_SYMBOLS);
  const symbols = Array.from(bytes, (b) => ALPHABET[b & 31]).join("");
  return symbols.match(/.{4}/g)!.join("-");
}

/** The canonical form of what someone typed or pasted, or null when it cannot be a code. */
export function normaliseInviteCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 64) return null;
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return VALID.test(s) ? s : null;
}

/** Lowercase hex SHA-256 of a normalised code (what the database stores). */
export function hashInviteCode(normalised: string): string {
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}

/** The last four symbols, kept in clear so an administrator can tell codes apart. */
export function inviteCodeHint(normalised: string): string {
  return normalised.slice(-4);
}
