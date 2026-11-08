import { expect, test } from "./fixtures";

const PROTECTED = ["/cms", "/cms/relations", "/cms/datasets", "/cms/review", "/cms/media", "/admin", "/admin/users", "/admin/audit"];

for (const path of PROTECTED) {
  test(`anonymous ${path} is redirected to sign-in`, async ({ request }) => {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain(`/sign-in?next=${encodeURIComponent(path)}`);
    expect(res.headers()["x-frame-options"]).toBe("DENY");
  });
}

for (const id of ["not-a-uuid", "01a13da5-0000-7000-8000-000000000000"]) {
  test(`/figures/${id} answers 404 without a redirect`, async ({ request }) => {
    const res = await request.get(`/figures/${id}`, { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    expect(res.headers()["cache-control"]).toBe("no-store");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });
}
