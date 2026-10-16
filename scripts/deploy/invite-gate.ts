/**
 * Invite-gate guard (source change S11, DR-054): the site is always invite-only, so no production
 * build may ship without the gate in src/proxy.ts.
 *
 * Used in three places:
 *  - vercel.json `buildCommand` runs it before `npm run build` on every Vercel build, Git or CLI:
 *      node scripts/deploy/invite-gate.ts --if-production
 *    With --if-production it only fails when VERCEL_ENV=production. The `ignoreCommand` in
 *    vercel.json is kept as a second guard, but Vercel documents it in terms of Git commits
 *    (https://vercel.com/docs/project-configuration/project-settings, "Ignored Build Step"), so
 *    it is not relied on for `vercel deploy --prod` from this machine.
 *  - scripts/deploy/preflight.ts (section "source") reports each problem as a FAIL in production.
 *  - by hand: `node scripts/deploy/invite-gate.ts` (exit 1 when the gate is missing).
 *
 * Plain Node (no tsx, no imports beyond node:): Node 24 runs this file with type stripping, so it
 * works in Vercel's build image before dependencies matter. Text checks only: the behaviour itself
 * is covered by tests/unit/proxy-invite-gate.test.ts and tests/unit/access/invite-gate.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** What src/proxy.ts and its helpers must contain for the gate to be in force. */
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
    [/if\s*\(\s*!invited\s*\)/, "src/proxy.ts has no branch refusing visitors without an invite"],
    [/invitePath\(/, "src/proxy.ts never redirects to the invite page"],
  ];
  for (const [re, why] of needles) if (!re.test(proxy)) problems.push(why);
  // No switch may turn the gate off (DR-054: "no open mode").
  if (/process\.env\.[A-Z_]*(OPEN|INVITE|GATE)[A-Z_]*/.test(proxy)) problems.push("src/proxy.ts reads an environment switch for the gate (DR-054 rules out an open mode)");
  for (const rel of ["src/lib/access/invite-paths.ts", "src/server/access/invite-cookie.ts"]) {
    if (read(rel) === null) problems.push(`${rel} is missing`);
  }
  return problems;
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const onlyProduction = process.argv.includes("--if-production");
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const problems = inviteGateProblems(repo);
  const enforce = !onlyProduction || process.env.VERCEL_ENV === "production";
  if (problems.length === 0) {
    console.log("[invite-gate] in place");
  } else if (enforce) {
    console.error(`[invite-gate] Production build REFUSED: the invite-only gate (S11) is not in place:\n  - ${problems.join("\n  - ")}\nSee docs/deploy/RUNBOOK.md "Invite-only access".`);
    process.exit(1);
  } else {
    console.warn(`[invite-gate] not in place (allowed outside production): ${problems.join("; ")}`);
  }
}
