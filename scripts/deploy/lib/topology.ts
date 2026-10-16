/**
 * Provider-neutral deploy topology: which database and media store the production env file
 * configures, and the Vercel function region that must go with them. The deployer chooses the
 * providers (Neon or Amazon RDS; Cloudflare R2 or AWS S3); preflight detects the choice from the
 * file and checks it as it is, then prints the single `regions` value vercel.json must carry.
 *
 * Rules:
 *  - RDS: the instance in ap-south-1 (Mumbai), functions in bom1, DATABASE_CA_PEM set (the RDS
 *    root CA is not in Node's default store).
 *  - Neon: functions in the Vercel region of the Neon region (sin1 for aws-ap-southeast-1;
 *    Neon has no region in India), DATABASE_URL_UNPOOLED set (the pooler has no LISTEN/NOTIFY).
 *  - R2: MEDIA_S3_REGION=auto and path-style addressing.
 *  - AWS S3: the bucket in the database's AWS region, so study data stay in one region next to
 *    the functions.
 *
 * Pure functions: preflight.ts reports the rows, tests/unit/deploy-topology.test.ts covers them.
 */

/** Vercel function region next to each supported AWS region (https://vercel.com/docs/regions). */
export const FUNCTION_REGION_FOR: Readonly<Record<string, string>> = { "ap-south-1": "bom1", "ap-southeast-1": "sin1" };
/** RDS is supported in Mumbai only (the aws-provision skill and docs/deploy/aws-resources.md). */
export const RDS_REGION = "ap-south-1";

export type DbProvider = "neon" | "rds" | "other";
export type MediaProvider = "r2" | "s3" | "s3-compatible" | "none";

export interface DbTopology {
  provider: DbProvider;
  host: string;
  /** The AWS region in the host name, or null when it carries none. */
  awsRegion: string | null;
}

export interface TopologyRow {
  check: string;
  ok: boolean;
  detail: string;
  /** rule: FAIL in production when not ok; warn: WARN in production; info: always INFO. */
  level: "rule" | "warn" | "info";
}

export interface Topology {
  db: DbTopology | null;
  media: MediaProvider;
  /** The one function region this setup needs, or null when it cannot be derived. */
  functionRegion: string | null;
  rows: TopologyRow[];
}

type Env = Readonly<Record<string, string | undefined>>;

const AWS_REGION_IN_HOST = /\.([a-z]{2}(?:-[a-z]+)+-\d)\.(?:aws\.neon\.tech|rds\.amazonaws\.com)$/;

export function detectDatabase(url: string | undefined): DbTopology | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const provider: DbProvider = host.endsWith(".neon.tech") ? "neon" : host.endsWith(".rds.amazonaws.com") ? "rds" : "other";
  return { provider, host, awsRegion: AWS_REGION_IN_HOST.exec(host)?.[1] ?? null };
}

export function detectMedia(env: Env): MediaProvider {
  if (!env.MEDIA_S3_BUCKET) return "none";
  const endpoint = env.MEDIA_S3_ENDPOINT;
  if (!endpoint) return "s3";
  try {
    return new URL(endpoint).hostname.toLowerCase().endsWith(".r2.cloudflarestorage.com") ? "r2" : "s3-compatible";
  } catch {
    return "s3-compatible";
  }
}

/** The checks for the configured database, media store and vercel.json `regions`. */
export function topologyChecks(env: Env, vercelRegions: readonly string[] | undefined): Topology {
  const rows: TopologyRow[] = [];
  const add = (check: string, ok: boolean, detail: string, level: TopologyRow["level"] = "rule") => rows.push({ check, ok, detail, level });

  // Database.
  const db = detectDatabase(env.DATABASE_URL);
  let functionRegion: string | null = null;
  if (db?.provider === "rds") {
    add("database: Amazon RDS", true, `${db.host} (region ${db.awsRegion ?? "unknown"})`, "info");
    add(`RDS in ${RDS_REGION}`, db.awsRegion === RDS_REGION, `region ${db.awsRegion ?? "unknown"}; the RDS setup is Mumbai only (functions in ${FUNCTION_REGION_FOR[RDS_REGION]})`);
    add("RDS: DATABASE_CA_PEM set", Boolean(env.DATABASE_CA_PEM), `the RDS root CA is not in Node's default store; put the ${RDS_REGION} bundle in DATABASE_CA_PEM (RESEARCH.md s8)`);
    functionRegion = FUNCTION_REGION_FOR[RDS_REGION]!;
  } else if (db?.provider === "neon") {
    const fr = db.awsRegion ? FUNCTION_REGION_FOR[db.awsRegion] : undefined;
    add("database: Neon", true, `${db.host} (region ${db.awsRegion ?? "unknown"})`, "info");
    add(
      "Neon region supported",
      fr !== undefined,
      fr ? `aws-${db.awsRegion} -> Vercel ${fr}` : `region ${db.awsRegion ?? "unknown"} has no function region in scripts/deploy/lib/topology.ts FUNCTION_REGION_FOR (supported: ${Object.keys(FUNCTION_REGION_FOR).join(", ")})`,
    );
    add("Neon: DATABASE_URL_UNPOOLED set", Boolean(env.DATABASE_URL_UNPOOLED), "the direct (non -pooler) URL for LISTEN/NOTIFY and migrations; Neon's pooler runs PgBouncer in transaction mode");
    functionRegion = fr ?? null;
  } else if (db) {
    add("database provider recognised", false, `${db.host} is neither Neon (*.neon.tech) nor Amazon RDS (*.rds.amazonaws.com): no function region can be derived`);
  }

  // Function region in vercel.json: one value, the one the database needs.
  const current = vercelRegions?.length ? vercelRegions.join(",") : "(unset: Vercel defaults to iad1)";
  if (functionRegion) {
    const ok = vercelRegions?.length === 1 && vercelRegions[0] === functionRegion;
    add(
      `vercel.json regions = ["${functionRegion}"]`,
      ok,
      ok ? `functions run next to the ${db!.provider === "rds" ? "RDS" : "Neon"} database` : `vercel.json has ${current}; set "regions": ["${functionRegion}"] for this database (one region only)`,
    );
  } else if (db) {
    add("vercel.json regions", false, `vercel.json has ${current}; cannot check it without a supported database region`);
  }

  // Media store.
  const media = detectMedia(env);
  const endpointHttps = (() => {
    try {
      return new URL(env.MEDIA_S3_ENDPOINT ?? "").protocol === "https:";
    } catch {
      return false;
    }
  })();
  if (media === "r2") {
    add("media: Cloudflare R2", true, env.MEDIA_S3_ENDPOINT!, "info");
    add("MEDIA_S3_ENDPOINT https", endpointHttps, env.MEDIA_S3_ENDPOINT!);
    add("R2: MEDIA_S3_REGION auto", env.MEDIA_S3_REGION === "auto", `MEDIA_S3_REGION=${env.MEDIA_S3_REGION ?? "(unset)"}`);
    add("R2: path-style", env.MEDIA_S3_FORCE_PATH_STYLE === "true", `MEDIA_S3_FORCE_PATH_STYLE=${env.MEDIA_S3_FORCE_PATH_STYLE ?? "(unset)"}`);
  } else if (media === "s3") {
    const want = db?.awsRegion && FUNCTION_REGION_FOR[db.awsRegion] ? db.awsRegion : null;
    add("media: AWS S3", true, `bucket ${env.MEDIA_S3_BUCKET} in ${env.MEDIA_S3_REGION ?? "(unset)"}`, "info");
    add(
      "S3 bucket in the database's region",
      want !== null && env.MEDIA_S3_REGION === want,
      want ? `MEDIA_S3_REGION=${env.MEDIA_S3_REGION ?? "(unset)"}, expected ${want}` : "no supported database region to compare with",
    );
    if (env.MEDIA_S3_ENDPOINT === undefined && env.MEDIA_S3_FORCE_PATH_STYLE === "true") add("S3: path-style off", false, "MEDIA_S3_FORCE_PATH_STYLE is for R2; AWS S3 uses virtual-hosted addressing", "warn");
    if (env.AWS_ROLE_ARN) add("AWS_REGION with OIDC", env.AWS_REGION === env.MEDIA_S3_REGION, `AWS_REGION=${env.AWS_REGION ?? "(unset)"}; Vercel sets it to the execution region unless set (RESEARCH.md s9)`);
  } else if (media === "s3-compatible") {
    add("MEDIA_S3_ENDPOINT https", endpointHttps, env.MEDIA_S3_ENDPOINT!);
    add("S3-compatible store", false, "endpoint is neither AWS S3 nor Cloudflare R2: untested", "warn");
  }

  return { db, media, functionRegion, rows };
}
