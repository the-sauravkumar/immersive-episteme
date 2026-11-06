import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

import { generateInviteCode, hashInviteCode, inviteCodeHint, normaliseInviteCode } from "../../src/server/access/invite-code";

import { expect, newContext, test } from "./fixtures";
import { closeDb, createE2eStaff, db, ensureDemoStudy, JOURNEY_STUDY, retireE2eStaff, signInStaff } from "./study-fixtures";

test.describe.configure({ mode: "serial", timeout: 300_000 });

const tag = randomBytes(3).toString("hex");
const PASSWORD = `e2e-${randomBytes(12).toString("hex")}`;
const ADMIN = `e2e-admin-${tag}@example.test`;
const WAITING = `e2e-waiting-${tag}@example.test`;
const EDITOR = `e2e-editor-${tag}@example.test`;
const CURATOR = `e2e-curator-${tag}@example.test`;
const STAFF = [ADMIN, WAITING, EDITOR, CURATOR];
const UNINVITED = { storageState: { cookies: [], origins: [] } };
const uploaded: string[] = [];
const invites: string[] = [];

async function inviteCode(maxUses: number | null): Promise<{ id: string; code: string }> {
  const code = normaliseInviteCode(generateInviteCode())!;
  const owner = await db().query<{ id: string }>("SELECT id FROM users WHERE email = $1", [ADMIN]);
  const r = await db().query<{ id: string }>(
    `INSERT INTO invite_codes (label, code_hash, code_hint, expires_at, max_uses, created_by)
     VALUES ($1, $2, $3, now() + interval '1 hour', $4, $5) RETURNING id`,
    [`Demo: e2e gate ${tag}`, hashInviteCode(code), inviteCodeHint(code), maxUses, owner.rows[0]!.id],
  );
  invites.push(r.rows[0]!.id);
  return { id: r.rows[0]!.id, code };
}

async function uniquePng(dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `e2e-upload-${tag}.png`);
  const pixels = randomBytes(96 * 64 * 3);
  await sharp(pixels, { raw: { width: 96, height: 64, channels: 3 } }).png().toFile(file);
  return file;
}

test.beforeAll(async () => {
  ensureDemoStudy(JOURNEY_STUDY, 30);
  createE2eStaff(ADMIN, "E2E Admin", "platform_admin", PASSWORD);
  createE2eStaff(WAITING, "E2E Waiting", "researcher", PASSWORD);
  createE2eStaff(EDITOR, "E2E Editor", "content_editor", PASSWORD);
  createE2eStaff(CURATOR, "E2E Curator", "curator", PASSWORD);
  await db().query("DELETE FROM user_roles WHERE user_id = (SELECT id FROM users WHERE email = $1)", [WAITING]);
});

test.afterAll(async () => {
  if (uploaded.length) {
    const stored = await db().query<{ storage_key: string }>("SELECT storage_key FROM assets WHERE id = ANY($1::uuid[])", [uploaded]);
    await db().query("DELETE FROM asset_versions WHERE asset_id = ANY($1::uuid[])", [uploaded]);
    await db().query("DELETE FROM assets WHERE id = ANY($1::uuid[])", [uploaded]);
    for (const { storage_key } of stored.rows) rmSync(join(process.env.MEDIA_LOCAL_DIR ?? join(".data", "media"), storage_key), { force: true });
  }
  if (invites.length) await db().query("UPDATE invite_codes SET revoked_at = now() WHERE id = ANY($1::uuid[]) AND revoked_at IS NULL", [invites]);
  await retireE2eStaff(undefined, STAFF);
  await closeDb();
});

test("the invite gate admits a valid code once, refuses a used-up one, and a revoked code cannot start a study", async ({ browser }) => {
  const { id, code } = await inviteCode(1);
  const first = await newContext(browser, UNINVITED);
  const page = await first.newPage();
  await page.goto("/explore");
  await expect(page).toHaveURL(/\/invite\?next=%2Fexplore/);
  await page.getByRole("textbox", { name: "Invite code" }).fill("ABCD-EFGH-JKMN-PQRS-TVWX");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Code not accepted")).toBeVisible();
  await page.getByRole("textbox", { name: "Invite code" }).fill(code.toLowerCase());
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/explore$/);

  const second = await newContext(browser, UNINVITED);
  const other = await second.newPage();
  await other.goto(`/explore?invite=${encodeURIComponent(code)}`);
  await expect(other).toHaveURL(/\/invite\?.*error=invalid/);
  await expect(other.getByText("Code not accepted")).toBeVisible();
  await second.close();

  await db().query("UPDATE invite_codes SET revoked_at = now() WHERE id = $1", [id]);
  await page.goto("/study");
  await page.getByLabel("Study code").fill(JOURNEY_STUDY);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/invite\?next=%2Fstudy/);
  await first.close();

  const linked = await newContext(browser, UNINVITED);
  const fresh = await inviteCode(null);
  const viaLink = await linked.newPage();
  await viaLink.goto(`/about?invite=${encodeURIComponent(fresh.code)}`);
  await expect(viaLink).toHaveURL(/\/about$/);
  await expect(viaLink.getByRole("heading", { level: 1 })).toBeVisible();
  await linked.close();
});

test("a signed-in account without a role waits at /awaiting-access until an administrator grants one", async ({ browser }) => {
  const waiting = await newContext(browser);
  const page = await waiting.newPage();
  await signInStaff(page, WAITING, PASSWORD);
  await expect(page).toHaveURL(/\/awaiting-access$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your Account Is Waiting For An Administrator" })).toBeVisible();
  for (const path of ["/console", "/research", "/cms", "/admin"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/awaiting-access$/);
  }

  const adminContext = await newContext(browser);
  const admin = await adminContext.newPage();
  await signInStaff(admin, ADMIN, PASSWORD);
  await admin.goto(`/admin/users?status=awaiting&q=${encodeURIComponent(WAITING)}`);
  const row = admin.getByRole("row").filter({ hasText: WAITING });
  await expect(row.getByText("Awaiting access")).toBeVisible();
  await expect(row.getByText("No roles")).toBeVisible();
  await row.getByRole("button", { name: `Manage E2E Waiting (${WAITING})` }).click();
  await admin.getByRole("menuitem", { name: "Add a role…" }).click();
  const dialog = admin.getByRole("dialog", { name: "Add a role" });
  await dialog.getByLabel("Role").selectOption({ label: "Researcher" });
  const status = admin.getByRole("status").filter({ hasText: WAITING });
  await expect(admin.getByRole("status").filter({ hasText: "role granted" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Add role" }).click();
  await expect(admin.getByRole("row").filter({ hasText: WAITING })).toHaveCount(0);
  await expect(admin.getByText("No accounts match these filters.")).toBeVisible();
  await expect(status).toHaveText(`E2E Waiting (${WAITING}): Researcher role granted.`);
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute("aria-live", "polite");
  await admin.goto(`/admin/users?q=${encodeURIComponent(WAITING)}`);
  const granted = admin.getByRole("row").filter({ hasText: WAITING });
  await expect(granted.getByText("Active", { exact: true })).toBeVisible();
  await expect(granted.getByText("Researcher", { exact: true })).toBeVisible();
  const audited = await db().query<{ n: number }>(
    "SELECT count(*)::int AS n FROM audit_log WHERE entity_id = (SELECT id FROM users WHERE email = $1) AND action LIKE '%role%' AND actor_id = (SELECT id FROM users WHERE email = $2)",
    [WAITING, ADMIN],
  );
  expect(audited.rows[0]!.n).toBeGreaterThan(0);
  await adminContext.close();

  await page.goto("/console");
  await expect.poll(() => new URL(page.url()).pathname).not.toBe("/awaiting-access");
  await page.goto("/research");
  await expect(page).toHaveURL(/\/research/);
  await waiting.close();
});

test("an editor uploads an image, a curator verifies it, and an unready release publishes nothing", async ({ browser }, info) => {
  const file = await uniquePng(info.outputPath("upload"));
  const editorContext = await newContext(browser);
  const editor = await editorContext.newPage();
  await signInStaff(editor, EDITOR, PASSWORD);
  await editor.goto("/cms/media");
  await expect(editor.getByText("Storage: local disk (development)."), "the e2e server must store media on local disk (MEDIA_LOCAL_DIR), never in a remote bucket").toBeVisible();
  const form = editor.locator("form").filter({ has: editor.getByRole("button", { name: "Upload" }) });
  await form.getByLabel("File").setInputFiles(file);
  await form.getByRole("textbox", { name: "Title" }).fill(`E2E upload check ${tag}`);
  await form.getByRole("textbox", { name: "Credit" }).fill("E2E test run");
  await form.getByRole("textbox", { name: "Alt text" }).fill("A small square of random coloured noise generated by the end to end test run");
  await form.getByRole("textbox", { name: "Caption" }).fill("Generated test pattern; it stands for no claim.");
  await form.getByRole("textbox", { name: "Licence", exact: true }).fill("CC0 1.0");
  await form.getByLabel("Provenance kind").selectOption("unverified");
  await form.getByRole("textbox", { name: "Source URL" }).fill("https://example.test/e2e-upload");
  await form.getByRole("button", { name: "Upload" }).click();
  await expect(form.getByRole("status")).toContainText("Open it to link it to a concept");
  const asset = await db().query<{ id: string; verification_state: string; width: number; height: number; mime_type: string }>(
    "SELECT id, verification_state, width, height, mime_type FROM assets WHERE title = $1",
    [`E2E upload check ${tag}`],
  );
  const row = asset.rows[0]!;
  uploaded.push(row.id);
  expect(row).toMatchObject({ verification_state: "draft", width: 96, height: 64, mime_type: "image/png" });
  const stateOf = async () => (await db().query<{ s: string }>("SELECT verification_state AS s FROM assets WHERE id = $1", [row.id])).rows[0]!.s;
  const submit = async () => {
    await editor.goto(`/cms/media?asset=${row.id}`);
    await editor.getByRole("button", { name: "Submit for review" }).click();
    await expect.poll(stateOf).toBe("under_review");
  };
  await submit();

  const curatorContext = await newContext(browser);
  const curator = await curatorContext.newPage();
  await signInStaff(curator, CURATOR, PASSWORD);
  const original = await curator.request.get(`/cms/media/file/${row.id}`);
  expect(original.status()).toBe(200);
  expect(original.headers()["content-type"]).toContain("image/png");
  const decide = async (decision: "Verify" | "Needs evidence", reason: string | null) => {
    await curator.goto(`/cms/media?asset=${row.id}`);
    const review = curator.locator("form").filter({ has: curator.getByRole("button", { name: "Record decision" }) });
    await review.getByRole("radio", { name: decision, exact: true }).check();
    if (decision === "Verify") for (const box of await review.locator("input[name=evidenceChecked]").all()) await box.check();
    if (reason) await review.getByRole("textbox", { name: "Reason (required unless verifying)" }).fill(reason);
    await review.getByRole("button", { name: "Record decision" }).click();
    return review;
  };
  const refused = await decide("Verify", null);
  await expect(refused.getByRole("alert")).toContainText("Cannot verify: missing a provenance kind other than 'unverified'.");
  expect(await stateOf()).toBe("under_review");
  await decide("Needs evidence", "Name the provenance of the pattern.");
  await expect.poll(stateOf).toBe("needs_evidence");

  await editor.goto(`/cms/media?asset=${row.id}`);
  const metadata = editor.locator("form").filter({ has: editor.getByRole("button", { name: "Save metadata" }) });
  await metadata.getByLabel("Provenance kind").selectOption("researcher_interpretation");
  await metadata.getByRole("button", { name: "Save metadata" }).click();
  await expect.poll(async () => (await db().query<{ p: string }>("SELECT provenance_kind::text AS p FROM assets WHERE id = $1", [row.id])).rows[0]!.p).toBe("researcher_interpretation");
  await submit();
  await editorContext.close();

  await decide("Verify", null);
  await expect.poll(stateOf).toBe("verified");

  const label = `e2e-refused-${tag}`;
  await curator.goto("/cms/datasets");
  await expect(curator.getByText("Not ready. The release would be refused with:")).toBeVisible();
  const publish = curator.locator("#publish form");
  await publish.getByRole("textbox", { name: "Version label", exact: true }).fill(label);
  await publish.getByRole("textbox", { name: "Title", exact: true }).fill("E2E refused release");
  await publish.getByRole("textbox", { name: "Type the version label again to confirm" }).fill(label);
  const before = (await db().query<{ n: number }>("SELECT count(*)::int AS n FROM content_snapshots")).rows[0]!.n;
  await publish.getByRole("button", { name: "Publish release" }).click();
  await expect(curator.getByText("The release was refused; nothing was published.")).toBeVisible();
  const after = await db().query<{ n: number; labelled: number }>("SELECT count(*)::int AS n, count(*) FILTER (WHERE version_label = $1)::int AS labelled FROM content_snapshots", [label]);
  expect(after.rows[0]).toEqual({ n: before, labelled: 0 });
  await curatorContext.close();
});
