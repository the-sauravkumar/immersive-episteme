import { posix } from "node:path";

const BLOCKED: readonly { re: RegExp; why: string }[] = [
  { re: /db:seed(?!:reference(?![\w:-]))/, why: "db:seed loads the demo dataset" },
  { re: /db:reset/, why: "db:reset drops data" },
  { re: /dev:bootstrap/, why: "dev:bootstrap seeds demo data and migrates the test database" },
  { re: /scripts\/db\/(seed|reset)(?![\w-])/i, why: "the demo seed or the reset script" },
  { re: /scripts\/dev\/bootstrap/i, why: "the local bootstrap" },
  { re: /(^|\s)--test(\s|=|$)/, why: "--test targets the test database" },
  { re: /drizzle-kit\s+(push|drop)/, why: "drizzle-kit push/drop changes the schema outside the migrations" },
];

const normalisePath = (arg: string): string => (/[\\/]/.test(arg) ? posix.normalize(arg.replace(/\\/g, "/")) : arg);

export function refusalReason(command: readonly string[]): string | null {
  if (command.length === 0) return "no command given";
  const joined = command.map(normalisePath).join(" ");
  const hit = BLOCKED.find((b) => b.re.test(joined));
  return hit ? hit.why : null;
}
