import { expect, test } from "@playwright/test";

test("home page renders with tokens and security headers", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Immersive Episteme" })).toBeVisible();

  const headers = response?.headers() ?? {};
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["permissions-policy"]).toContain("camera=()");

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(255, 255, 255)"); // --ground, white paper (DR-022)
});

test("staff surfaces forbid framing", async ({ request }) => {
  for (const path of ["/admin", "/research", "/cms"]) {
    const res = await request.get(path);
    expect(res.headers()["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(res.headers()["x-frame-options"], path).toBe("DENY");
  }
});
