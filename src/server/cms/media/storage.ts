/**
 * Media object storage.
 *
 *  - S3-compatible (production): selected when MEDIA_S3_BUCKET is set. Browsers upload directly
 *    with a short-lived presigned PUT that signs the object's SHA-256 (`x-amz-checksum-sha256`),
 *    so the store itself refuses bytes that do not match the checksum the server recorded.
 *  - Local disk (development fallback): MEDIA_LOCAL_DIR, default `.data/media` under the working
 *    directory. Refused in production unless MEDIA_LOCAL_DIR is set explicitly.
 *
 * Keys are content-addressed (`sha256/<2 hex>/<sha256>.<ext>`), so a key can never be chosen by
 * the client and identical bytes share one object.
 *
 * Environment (validated here; not part of src/lib/env.ts yet):
 *   MEDIA_S3_BUCKET, MEDIA_S3_REGION (default us-east-1), MEDIA_S3_ENDPOINT (optional, e.g. MinIO),
 *   MEDIA_S3_ACCESS_KEY_ID, MEDIA_S3_SECRET_ACCESS_KEY (optional: default AWS credential chain),
 *   MEDIA_S3_FORCE_PATH_STYLE ("true" for MinIO-style endpoints), MEDIA_LOCAL_DIR.
 *
 * Not `server-only` (integration tests use the local store).
 */
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

import { CmsError } from "../core";
import { ALLOWED_MEDIA, SNIFF_BYTES, type AllowedMime } from "./sniff";

const SHA_RE = /^[0-9a-f]{64}$/;

const mediaEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MEDIA_S3_BUCKET: z.string().trim().min(3).max(63).optional(),
  MEDIA_S3_REGION: z.string().trim().min(1).default("us-east-1"),
  MEDIA_S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  MEDIA_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  MEDIA_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  MEDIA_S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
  MEDIA_LOCAL_DIR: z.string().min(1).optional(),
});

export type MediaEnv = z.infer<typeof mediaEnvSchema>;

export function parseMediaEnv(source: Record<string, string | undefined> = process.env): MediaEnv {
  const blankToUndefined = Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v === "" ? undefined : v]));
  const r = mediaEnvSchema.safeParse(blankToUndefined);
  if (!r.success) {
    throw new Error(`Invalid media storage environment: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  if ((r.data.MEDIA_S3_ACCESS_KEY_ID === undefined) !== (r.data.MEDIA_S3_SECRET_ACCESS_KEY === undefined)) {
    throw new Error("Invalid media storage environment: set both MEDIA_S3_ACCESS_KEY_ID and MEDIA_S3_SECRET_ACCESS_KEY, or neither");
  }
  return r.data;
}

/** Content-addressed key for a stored original. */
export function storageKeyFor(sha256: string, mime: AllowedMime): string {
  if (!SHA_RE.test(sha256)) throw new CmsError("invalid_checksum", "Expected a lowercase hex SHA-256.", 400);
  return `sha256/${sha256.slice(0, 2)}/${sha256}.${ALLOWED_MEDIA[mime].extension}`;
}

export const hexToBase64 = (hex: string) => Buffer.from(hex, "hex").toString("base64");
export const base64ToHex = (b64: string) => Buffer.from(b64, "base64").toString("hex");

export interface PresignedUpload {
  url: string;
  method: "PUT";
  /** Headers the browser must send exactly (they are part of the signature). */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface StoredObjectInfo {
  byteSize: number;
  /** Lowercase hex SHA-256 as reported by the store, when it keeps one. */
  sha256: string | null;
}

export interface LocalMediaStorage {
  mode: "local";
  root: string;
  put(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}

export interface S3MediaStorage {
  mode: "s3";
  bucket: string;
  presignPut(key: string, opts: { mime: string; byteSize: number; sha256: string }): Promise<PresignedUpload>;
  head(key: string): Promise<StoredObjectInfo | null>;
  readHead(key: string, bytes?: number): Promise<Uint8Array>;
  presignGet(key: string, opts: { mime: string; disposition: string }): Promise<string>;
}

export type MediaStorage = LocalMediaStorage | S3MediaStorage;

/** Local-disk store rooted at `root`; keys never escape the root. */
export function createLocalStorage(root: string): LocalMediaStorage {
  const base = resolve(root);
  const pathOf = (key: string) => {
    if (!/^[a-z0-9/._-]+$/.test(key) || key.includes("..")) throw new CmsError("invalid_key", "Invalid storage key.", 400);
    const p = resolve(base, key);
    if (!p.startsWith(base + sep)) throw new CmsError("invalid_key", "Invalid storage key.", 400);
    return p;
  };
  return {
    mode: "local",
    root: base,
    async put(key, bytes) {
      const p = pathOf(key);
      await mkdir(dirname(p), { recursive: true });
      const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, bytes);
      await rename(tmp, p);
    },
    async read(key) {
      return readFile(pathOf(key));
    },
    async exists(key) {
      try {
        await stat(pathOf(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function createS3Storage(env: MediaEnv): S3MediaStorage {
  const bucket = env.MEDIA_S3_BUCKET!;
  const client = new S3Client({
    region: env.MEDIA_S3_REGION,
    endpoint: env.MEDIA_S3_ENDPOINT,
    forcePathStyle: env.MEDIA_S3_FORCE_PATH_STYLE === "true",
    credentials:
      env.MEDIA_S3_ACCESS_KEY_ID && env.MEDIA_S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.MEDIA_S3_ACCESS_KEY_ID, secretAccessKey: env.MEDIA_S3_SECRET_ACCESS_KEY }
        : undefined,
    // Only the SHA-256 we sign ourselves; no SDK-added CRC the browser would have to reproduce.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const EXPIRES = 600;
  return {
    mode: "s3",
    bucket,
    async presignPut(key, { mime, byteSize, sha256 }) {
      const checksum = hexToBase64(sha256);
      const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mime, ContentLength: byteSize, ChecksumSHA256: checksum });
      const url = await getSignedUrl(client, cmd, {
        expiresIn: EXPIRES,
        signableHeaders: new Set(["content-type", "content-length", "x-amz-checksum-sha256"]),
      });
      return { url, method: "PUT", headers: { "Content-Type": mime, "x-amz-checksum-sha256": checksum }, expiresInSeconds: EXPIRES };
    },
    async head(key) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: "ENABLED" }));
        const sha = r.ChecksumSHA256 && !r.ChecksumSHA256.includes("-") ? base64ToHex(r.ChecksumSHA256) : null;
        return { byteSize: Number(r.ContentLength ?? 0), sha256: sha };
      } catch (err) {
        const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404 || (err as { name?: string }).name === "NotFound") return null;
        throw err;
      }
    },
    async readHead(key, bytes = SNIFF_BYTES) {
      const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
      return r.Body ? await r.Body.transformToByteArray() : new Uint8Array();
    },
    async presignGet(key, { mime, disposition }) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: mime, ResponseContentDisposition: disposition, ResponseCacheControl: "private, max-age=300" }),
        { expiresIn: 300 },
      );
    },
  };
}

let cached: MediaStorage | undefined;

/** The configured store (memoised). */
export function getMediaStorage(source: Record<string, string | undefined> = process.env): MediaStorage {
  if (cached && source === process.env) return cached;
  const env = parseMediaEnv(source);
  let storage: MediaStorage;
  if (env.MEDIA_S3_BUCKET) {
    storage = createS3Storage(env);
  } else {
    if (env.NODE_ENV === "production" && !env.MEDIA_LOCAL_DIR) {
      throw new Error("Media storage: set MEDIA_S3_BUCKET (or MEDIA_LOCAL_DIR explicitly) in production");
    }
    const dir = env.MEDIA_LOCAL_DIR ?? join(".data", "media");
    storage = createLocalStorage(isAbsolute(dir) ? dir : join(process.cwd(), dir));
  }
  if (source === process.env) cached = storage;
  return storage;
}

/** Safe description of the store for the UI and the admin health page (no secrets). */
export function describeMediaStorage(storage: MediaStorage): { mode: "local" | "s3"; location: string } {
  return storage.mode === "s3" ? { mode: "s3", location: `bucket ${storage.bucket}` } : { mode: "local", location: storage.root };
}
