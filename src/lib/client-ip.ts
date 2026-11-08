export const CLIENT_IP_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "cf-connecting-ip",
  "true-client-ip",
  "x-client-ip",
  "x-cluster-client-ip",
  "fastly-client-ip",
] as const;

export type ClientIpPolicy = {
  trustedProxies: string[];
  header: string;
  trustForwardedHeaders: boolean;
};

export function parseTrustedProxies(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function clientIpPolicy(env: Record<string, string | undefined> = process.env): ClientIpPolicy {
  const trustedProxies = parseTrustedProxies(env.AUTH_TRUSTED_PROXIES);
  const configuredHeader = env.AUTH_CLIENT_IP_HEADER?.trim().toLowerCase() || undefined;
  return {
    trustedProxies,
    header: configuredHeader ?? "x-forwarded-for",
    trustForwardedHeaders: trustedProxies.length > 0 || configuredHeader !== undefined,
  };
}

export function stripClientIpHeaders(headers: Headers): boolean {
  let changed = false;
  for (const name of CLIENT_IP_HEADERS) {
    if (headers.has(name)) {
      headers.delete(name);
      changed = true;
    }
  }
  return changed;
}
