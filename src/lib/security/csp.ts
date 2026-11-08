export type FrameAncestors = "self" | "none";

export type CspOptions = {
  frameAncestors: FrameAncestors;
  dev?: boolean;
  connectSrc?: string[];
};

type EnvSource = Record<string, string | undefined>;

export function mediaUploadOrigin(env: EnvSource = process.env): string | null {
  const bucket = env.MEDIA_S3_BUCKET?.trim();
  if (!bucket) return null;
  const endpoint = env.MEDIA_S3_ENDPOINT?.trim();
  const pathStyle = env.MEDIA_S3_FORCE_PATH_STYLE?.trim() === "true";
  try {
    if (endpoint) {
      const u = new URL(endpoint);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      return pathStyle ? u.origin : `${u.protocol}//${bucket}.${u.host}`;
    }
    const region = env.MEDIA_S3_REGION?.trim() || "us-east-1";
    if (!/^[a-z0-9-]+$/.test(region) || !/^[a-z0-9.-]+$/.test(bucket)) return null;
    return pathStyle ? `https://s3.${region}.amazonaws.com` : `https://${bucket}.s3.${region}.amazonaws.com`;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy({ frameAncestors, dev = false, connectSrc }: CspOptions): string {
  const extraConnect = connectSrc ?? [mediaUploadOrigin()].filter((o): o is string => o !== null);
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    ["script-src", "'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:"],
    ["font-src", "'self'", "data:"],
    ["media-src", "'self'", "blob:"],
    ["connect-src", "'self'", ...extraConnect],
    ["worker-src", "'self'", "blob:"],
    ["manifest-src", "'self'"],
    ["frame-src", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
    ["form-action", "'self'"],
    ["frame-ancestors", `'${frameAncestors}'`],
  ];
  return directives.map((d) => d.join(" ")).join("; ");
}

export const isDevBuild = () => process.env.NODE_ENV === "development";
