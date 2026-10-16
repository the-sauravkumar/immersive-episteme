/**
 * Where the e2e global setup (global-setup.ts) writes the invite cookie that admits the test browser
 * through the always-on invite gate (S11). Kept apart from global-setup.ts so playwright.config.ts
 * and fixtures.ts can name it without loading pg or the server code. Relative to the repo root,
 * the directory Playwright runs from.
 */
export const INVITE_STORAGE_STATE = "test-results/.auth/invite.json";
