<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project notes (Immersive Episteme)

- Read `docs/decisions/0001-stack-and-foundation.md` first. Versions are pinned exactly; do not run `npm install` unless your task says so.
- `cacheComponents` is on: anything reading cookies, headers or the session must be inside `<Suspense>` (see `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`). Middleware is called proxy (`src/proxy.ts`) in Next 16.
- DB: `npm run db:up`, then `npm run db:migrate` (add `-- --test` for `episteme_test`). Server code gets the DB from `getDb()` in `src/server/db/client.ts` and env from `serverEnv()` in `src/lib/env.ts`.
- shadcn components import `cn` from `@/lib/utils`. After `shadcn add`, rewrite `from "cn"` to `from "@/lib/utils"`.
- Never write craft facts. `content/` belongs to a separate curation effort. Demo data: `is_demo = true`, title prefix `Demo:`, never publishable into a study.
- `virtual-walkthrough` is read-only; copied code carries an "Adapted from virtual-walkthrough <path>" comment.
