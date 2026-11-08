import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const INVITE_CODE_SYMBOLS = 20;
const VALID = new RegExp(`^[${ALPHABET}]{${INVITE_CODE_SYMBOLS}}$`);

export function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_SYMBOLS);
  const symbols = Array.from(bytes, (b) => ALPHABET[b & 31]).join("");
  return symbols.match(/.{4}/g)!.join("-");
}

export function normaliseInviteCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 64) return null;
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return VALID.test(s) ? s : null;
}

export function hashInviteCode(normalised: string): string {
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}

export function inviteCodeHint(normalised: string): string {
  return normalised.slice(-4);
}
