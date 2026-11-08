import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function inviteGateProblems(repoRoot: string): string[] {
  const read = (rel: string): string | null => {
    const p = join(repoRoot, rel);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };
  const problems: string[] = [];
  const proxy = read("src/proxy.ts");
  if (proxy === null) return ["src/proxy.ts is missing"];
  const needles: Array<[RegExp, string]> = [
    [/import\s*\{[^}]*\bverifyInviteAccess\b[^}]*\}\s*from\s*["']@\/server\/access\/invite-cookie["']/, "src/proxy.ts does not import verifyInviteAccess"],
    [/import\s*\{[^}]*\bisInviteExemptPath\b[^}]*\}\s*from\s*["']@\/lib\/access\/invite-paths["']/, "src/proxy.ts does not import isInviteExemptPath"],
    [/await\s+hasInviteCookie\(\s*request\s*\)/, "src/proxy.ts never checks the invite cookie"],
    [/await\s+inviteIsLive\(/, "src/proxy.ts never checks that the invite code is not revoked"],
    [/if\s*\(\s*!invited\s*\)/, "src/proxy.ts has no branch refusing visitors without an invite"],
    [/invitePath\(/, "src/proxy.ts never redirects to the invite page"],
  ];
  for (const [re, why] of needles) if (!re.test(proxy)) problems.push(why);
  if (/process\.env\.[A-Z_]*(OPEN|INVITE|GATE)[A-Z_]*/.test(proxy)) problems.push("src/proxy.ts reads an environment switch for the gate (DR-054 rules out an open mode)");
  for (const rel of ["src/lib/access/invite-paths.ts", "src/server/access/invite-cookie.ts"]) {
    if (read(rel) === null) problems.push(`${rel} is missing`);
  }
  return problems;
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const onlyProduction = process.argv.includes("--if-production");
  const ignoreStep = process.argv.includes("--ignore-step");
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const problems = inviteGateProblems(repo);
  const enforce = !onlyProduction || process.env.VERCEL_ENV === "production";
  if (ignoreStep) {
    const cancel = process.env.VERCEL_ENV === "production" && problems.length > 0;
    console.log(cancel ? `[invite-gate] Production build CANCELED: the invite-only gate (S11) is not in place: ${problems.join("; ")}` : "[invite-gate] build may proceed");
    process.exit(cancel ? 0 : 1);
  }
  if (problems.length === 0) {
    console.log("[invite-gate] in place");
  } else if (enforce) {
    console.error(`[invite-gate] Production build REFUSED: the invite-only gate (S11) is not in place:\n  - ${problems.join("\n  - ")}\nSee docs/deploy/RUNBOOK.md "Invite-only access".`);
    process.exit(1);
  } else {
    console.warn(`[invite-gate] not in place (allowed outside production): ${problems.join("; ")}`);
  }
}
