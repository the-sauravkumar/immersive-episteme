/**
 * Canonical JSON, SHA-256 and deterministic ids. Pure TypeScript (TextEncoder only), so the
 * same bytes and hashes are produced in Node, the browser and Vitest.
 *
 * Canonical JSON: object keys sorted by UTF-16 code unit order, no whitespace, `undefined`
 * members dropped, numbers rounded by the producer (see `round`) and `-0` normalised to `0`.
 * Two manifests are byte-identical iff their canonical JSON strings are equal.
 */

/** Round to millimetres (3 dp) and normalise -0. Every coordinate in a manifest goes through this. */
export function round(n: number, dp = 3): number {
  const f = 10 ** dp;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

export function canonicalJson(value: unknown): string {
  return serialise(value);
}

function serialise(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "number": {
      if (!Number.isFinite(value)) throw new Error(`Non-finite number in canonical JSON: ${value}`);
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : serialise(v))).join(",")}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${serialise(obj[k])}`).join(",")}}`;
    }
    default:
      throw new Error(`Unsupported value in canonical JSON: ${typeof value}`);
  }
}

// -----------------------------------------------------------------------------------------
// SHA-256 (FIPS 180-4). Small, synchronous and dependency-free; the compiler must not rely on
// node:crypto (it also runs in the browser research console) or on async SubtleCrypto.
// -----------------------------------------------------------------------------------------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

export function sha256Hex(input: string | Uint8Array): string {
  const msg = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const bitLen = msg.length * 8;
  const padded = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, hh = h[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}

/** sha256 of the canonical JSON of `value`. */
export function canonicalHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/**
 * Name-based UUID (RFC 9562 version 8, "custom"): the first 128 bits of sha256(namespace:name)
 * with the version and variant bits set. Used where the content files carry keys but the
 * contracts require UUIDs (concepts, relationships, rule sets compiled from content/ JSON).
 */
export function deterministicUuid(namespace: string, name: string): string {
  const hex = sha256Hex(`${namespace}:${name}`).slice(0, 32).split("");
  hex[12] = "8";
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** Short stable suffix for element ids derived from a relationship or concept id. */
export function shortHash(value: string, length = 10): string {
  return sha256Hex(value).slice(0, length);
}
