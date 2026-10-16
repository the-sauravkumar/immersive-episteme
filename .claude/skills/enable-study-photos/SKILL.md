---
name: enable-study-photos
description: How the six study photographs (one V&A textile and one printing-blocks photo per study tradition) get from the repository to learners in both 2D and 3D on a deployed site (Vercel or any host), what gates them, who must do which step, and what an agent must never do. Use when asked to enable, show, deploy, check or debug the study photos or figures.
---

# Enabling the Study Photographs

The six study photographs are in the repository, but **no learner sees them until every step below is done on the target database**. Nothing done on a developer's machine carries over to a deployed site: accounts, concept verifications and photo reviews live in each database separately.

## What Is in the Repository

| What | Where |
| --- | --- |
| The six image files (768 px, already licence-capped) | `scripts/content/study-photos/<tradition>-<textile or blocks>-768.jpg` |
| Which photo illustrates which concept and claim, with caption, alt text and source | `content/review/media-proposals.json` (status `proposed`) |
| Upload, link and submit for review | `scripts/content/ingest-study-photos.ts` (never verifies) |
| Second-curator review | `scripts/content/review-study-photos.ts` (or one click per photo in CMS → Media) |
| Concept verification | `scripts/content/verify-concepts.ts` |
| Permissions and credits | `docs/research/` (V&A, Sahapedia and PARI replies; `public-repo-image-permission-note.md`) |
| Decisions | `docs/research/design-process/decisions.md`: DR-020 (V&A photos), DR-037 (frozen figures), DR-057 (other sources), DR-063 (keep the gate) |
| Full deployment procedure | `docs/deploy/RUNBOOK.md`, section 7.1 Route A |

## Where Each Photo Appears

Both conditions place a concept by its type through one section map (`src/features/learning/sections.ts`), so each photo is in the same numbered section in 2D and 3D. In 2D it is on the concept's page, reached from that section of the tradition page. In 3D it is on the concept's exhibit panel, in the room of the same name in the tradition's wing. Both draw it with the same `KnowledgeFigure` component, so caption, credit and size are identical.

| Tradition | Section 1 "Tradition and context": V&A textile | Section 2 "Materials and tools": printing blocks |
| --- | --- | --- |
| Ajrakh | `ajrakh.historical_context.sindh-indus-origins` (V&A 5473A(IS)) | `ajrakh.tool.wooden-blocks` (Rick Bradley, Flickr, CC BY 2.0) |
| Machilipatnam Kalamkari | `machilipatnam-kalamkari.historical_context.persian-export-trade` (V&A IS.1765-1883, cropped) | `machilipatnam-kalamkari.tool.teak-printing-blocks` (Sahapedia, CC BY-NC-SA 4.0 with permission) |
| Sanganeri | `sanganeri.historical_context.eighteenth-century-records` (V&A 4497(IS)) | `sanganeri.tool.bunta-wooden-block` (Eric Parker, Flickr, CC BY-NC 2.0) |

Bagh, Bagru and Dabu have no photographs. The PARI photographs are permitted but not ingested (no balanced kind across the three traditions).

## The Gate

`servableSql` in `src/server/cms/media/service.ts`, read by `photoFiguresByConcept` in `src/server/knowledge/read-model.ts`, serves a photo only when **all** of these hold:

1. the asset is `verified` (or `published`) and has a non-empty credit, caption and alt text;
2. its concept is in a **published, non-demo release** (`content_snapshots.kind = 'release'`, `status = 'published'`);
3. its licence is valid on that day, its long edge is within its cap (768 px), and, for a term counted from first publication (60 months), `first_published_on` is set;
4. the study's protocol switch `figures.photos` is on (default `true`, `src/features/study/contracts.ts`).

`/figures/<assetId>` re-checks the licence on every request, so an expired licence or a reviewer's withdrawal removes the photo from both conditions at once.

Publishing a release (`publishRelease`, `src/server/cms/release.ts`) calls `stampFirstPublication`, which records `first_published_on` and so **starts the five-year licence terms** (V&A, Sahapedia). That is why the gate is kept until the PI approves a release (DR-063).

## Steps on a Deployed Site

Run every command with the production environment file through `scripts/deploy/with-env.ts`, as in RUNBOOK 7.1. Content (`content:bootstrap:remote`) must already be imported.

1. **Accounts.** The first platform admin creates at least **two** curator-level accounts in **Admin → Users**: one uploads (content editor or curator), a different one verifies (curator; permission `media.review`, and `content.verify` for concepts). Never a shared or test account.
2. **Verify the concepts** (a curator; RUNBOOK 7.1): `verify-concepts.ts --as <curator email> --keys <keys.json> --evidence <record> --reason "<why>" --dry-run`, read it, then `--apply`. The six photographed concepts must end up `verified`.
3. **Upload the photos** (the uploader): `ingest-study-photos.ts --uploader <uploader email> --dry-run`, then without `--dry-run`. The line `[photos] storage: ...` must name the production bucket (S3 or R2), **not** `local`; if it says `local`, stop. The photos are now **Under Review**.
4. **Review the photos** (the second curator, not the uploader): in **CMS → Media**, open each photo marked "Under review" and verify it, or run `review-study-photos.ts --as <reviewer email> --reason "<why>" --dry-run`, then `--apply`. The service refuses the uploader or anyone who edited or linked the asset ("another reviewer must verify it"), and any photo with a missing credit, caption, alt text or provenance, or over its cap. Note: photos under review appear in CMS → Media, **not** on the CMS Review page.
5. **Publish the release** (a user with `content.publish`, in **CMS → Datasets**), **only with the PI's approval** (see the release package; open rulings are recorded there). This stamps `first_published_on` and the photos appear in both conditions.
6. **Check.** In both conditions, each of the six concepts shows its photo with the same caption, credit and size; `SELECT count(*) FROM assets WHERE first_published_on IS NOT NULL` is 6.

## Never

- Never publish a release, set `first_published_on`, or change `servableSql`, the read model or `figures.photos` just to make photos appear (for a demo, a screenshot or a video). It starts licence terms without the PI's decision. For a preview, use a throwaway copy of the database (`CREATE DATABASE <name> TEMPLATE <db>`), publish there, and drop it afterwards.
- Never verify a photo or a concept with the account that uploaded or edited it, and never with a test account.
- Never upscale, crop or edit a photo beyond what its proposal records; PARI and Sahapedia allow no alteration.
- Never ingest the PARI photographs without a balanced kind for all three traditions, and never change a credit line: the Sahapedia credit ("Courtesy J. Niranjan, Srikalahasti / Sahapedia, CC BY-NC-SA 4.0") is replaced only when Sahapedia names the photographer.
