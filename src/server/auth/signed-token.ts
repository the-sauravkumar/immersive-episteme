/**
 * Compact HMAC-SHA256 signed tokens over WebCrypto (no extra dependency).
 *
 * Format: `v1.<base64url(JSON payload)>.<base64url(signature)>`; the signature covers
 * `v1.<payload>`. Each use ("purpose") gets its own key derived from the master secret with
 * HKDF-SHA256, so a token minted for one purpose (e.g. the demo cookie) can never verify as
 * another (e.g. a participant session), even though both use BETTER_AUTH_SECRET.
 *
 * Verification uses `crypto.subtle.verify` (constant time). Payloads are not encrypted: never
 * put secrets or identifying data in them.
 */
const VERSION = "v1";
const SALT = new TextEncoder().encode("immersive-episteme/signed-token");

const keyCache = new Map<string, Promise<CryptoKey>>();

function deriveKey(secret: string, purpose: string): Promise<CryptoKey> {
  const cacheKey = `${purpose}\u0000${secret}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    key = (async () => {
      const master = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, [
        "deriveKey",
      ]);
      return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: SALT, info: new TextEncoder().encode(purpose) },
        master,
        { name: "HMAC", hash: "SHA-256", length: 256 },
        false,
        ["sign", "verify"],
      );
    })();
    keyCache.set(cacheKey, key);
  }
  return key;
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  return new Uint8Array(Buffer.from(text, "base64url"));
}

export async function signToken(payload: unknown, secret: string, purpose: string): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${VERSION}.${body}`;
  const key = await deriveKey(secret, purpose);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput)));
  return `${signingInput}.${toBase64Url(sig)}`;
}

export type VerifyFailure = "malformed" | "bad_signature";

/** Returns the parsed (still untyped) payload, or the failure reason. */
export async function verifyToken(
  token: string,
  secret: string,
  purpose: string,
): Promise<{ ok: true; payload: unknown } | { ok: false; reason: VerifyFailure }> {
  if (typeof token !== "string" || token.length > 4096) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: "malformed" };
  const [, body, sigText] = parts as [string, string, string];
  const sig = fromBase64Url(sigText);
  if (!sig || sig.length !== 32 || body.length === 0) return { ok: false, reason: "malformed" };

  const key = await deriveKey(secret, purpose);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig as Uint8Array<ArrayBuffer>,
    new TextEncoder().encode(`${VERSION}.${body}`),
  );
  if (!valid) return { ok: false, reason: "bad_signature" };

  const raw = fromBase64Url(body);
  if (!raw) return { ok: false, reason: "malformed" };
  try {
    return { ok: true, payload: JSON.parse(new TextDecoder().decode(raw)) };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
