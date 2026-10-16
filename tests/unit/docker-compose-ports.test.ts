/**
 * The dev database uses a password committed in this repository (docker-compose.yml,
 * .env.example, drizzle.config.ts), so its port must be published on loopback only. A bare
 * "5433:5432" binds every host interface (0.0.0.0 and [::]), and Docker Desktop's firewall rule
 * lets other hosts on the same network log in (final review security-11).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const compose = readFileSync(join(__dirname, "..", "..", "docker-compose.yml"), "utf8");

/** The `ports:` entries of the compose file, without quotes (short syntax only). */
function publishedPorts(text: string): string[] {
  const out: string[] = [];
  let inPorts = false;
  let indent = -1;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || line.trim() === "") continue;
    const lead = line.length - line.trimStart().length;
    if (/^\s*ports:\s*$/.test(line)) {
      inPorts = true;
      indent = lead;
      continue;
    }
    if (inPorts && lead <= indent) inPorts = false;
    const item = inPorts ? /^\s*-\s*["']?([^"'#]+?)["']?\s*(#.*)?$/.exec(line) : null;
    if (item?.[1]) out.push(item[1]);
  }
  return out;
}

describe("docker-compose.yml", () => {
  it("publishes the database on loopback only, for IPv4 and IPv6", () => {
    const ports = publishedPorts(compose);
    expect(ports.length).toBeGreaterThan(0);
    for (const p of ports) expect(p).toMatch(/^(127\.0\.0\.1|\[::1\]):\d+:\d+$/);
    // localhost resolves to ::1 first on Windows, so both families must be published.
    expect(ports).toContain("127.0.0.1:5433:5432");
    expect(ports).toContain("[::1]:5433:5432");
  });
});
