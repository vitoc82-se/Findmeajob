## What it is and who it is for
Findmeajob is a Swedish-first job matcher. A visitor types a job title and a region (or uploads a CV) and gets real job ads ranked with a 0-100 "fit" score, a one-line reason and what is missing. It is for ordinary job seekers, mostly on phones, reached through Facebook ad campaigns. Signed-in users also get saved matches, a daily email digest and an "apply-assist" that writes a tailored CV and cover letter as PDFs. The live site is findmeajob.online.

## Technology
- TypeScript, Next.js 15 (App Router), React 19, Tailwind CSS 3. Fonts: Bricolage Grotesque and Figtree.
- Postgres on Neon, accessed with Prisma 7 (`@prisma/adapter-pg`), with the pgvector extension for embeddings.
- Clerk for sign-in (`@clerk/nextjs`).
- Anthropic SDK for the AI: Haiku for CV parsing and fast re-ranking, Sonnet for scoring and apply-assist (`src/lib/anthropic.ts`). Voyage AI for embeddings and the rerank-2.5 re-ranker.
- Job sources: Platsbanken/JobTech, JobLinks, Remotive, and Adzuna (dormant until its keys are set).
- Resend for email, `pdf-lib` and `unpdf` for PDFs, Vercel hosting, analytics and cron jobs.

## How it is organised
- `src/app/(site)`: public pages: landing `/`, `/try` (search without an account), `/privacy`.
- `src/app/app`: the signed-in app. `src/app/admin`: usage dashboard (limited to `ADMIN_EMAILS`). `sign-in`, `sign-up`: Clerk hand-off pages.
- `src/app/api`: `v1/preview/*` (public search, CV parse, feedback, funnel events), `v1/*` (signed-in), `cron/{crawl,prewarm,digest}`, `health`.
- `src/lib/matching`: the engine (`runSearch.ts`, `rank.ts`, `scoreJobs.ts`, `searchCache.ts`, `parseCv.ts`, `applyAssist.ts`). `src/lib/sources`: one file per job source.
- `src/components`: UI. `src/lib/i18n.ts`: Swedish/English text.
- `prisma/schema.prisma`: Profile, Job, Match, ApplyDoc, UsageEvent, SearchCache, SourceRun, ResultFeedback.
- `eval/`: ranking benchmark (Python scripts, hand-graded labels).
- `CHANGELOG.md`: dated history of what changed and why. `DESIGN.md`: the design system.

## How to run, test and ship
- `npm install` (also runs `prisma generate`), then `npm run dev`. Copy `.env.example` to set `DATABASE_URL`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, Clerk keys and others.
- `npm run build` runs `prisma generate`, `prisma db push` (needs a direct, non-pooled Neon URL) and `next build`. Other scripts: `npm run lint`, `npm run db:push`, `npm run db:studio`.
- I found no automated test suite. Quality is checked with the benchmark in `eval/` (see `eval/README.md`).
- Per `CHANGELOG.md`, `main` auto-deploys to findmeajob.online via Vercel. `vercel.json` pins region `fra1` and schedules the three crons (05:00, 05:30, 06:00 UTC).
- I could not tell how the Vercel project itself is configured.

## Rules and things not to touch
- Read `DESIGN.md` before any visual change. Warm leaf green, butter-yellow score stamps, warm paper. No mono type, gradients, blobs, emoji or near-black buttons. `DESIGN.old.md` is retired. Do not deviate without approval.
- Swedish is the default language. Phone first.
- Before working, `git fetch` and `git pull --ff-only origin main` (cloud sessions also merge PRs).
- After any scoring change, bump `v:` in `src/lib/matching/searchCache.ts` and check `eval/`.
- Benchmark runs call the live API: use `noLlm`, and never loop the full set with the AI on without telling the owner.
- Never commit secrets. Do not edit `.github/workflows`.
- Gate actions, not value: do not hide the best results behind sign-up.

## Known quirks and lessons
- The Clerk middleware (`src/middleware.ts`) blocks API paths it does not list as public, so public endpoints live under `/api/v1/preview/`.
- Functions once ran in the US while the database is in the EU, which cost ~500 ms per query. `fra1` in `vercel.json` fixes it; `/api/health` shows both regions.
- A night of full benchmark runs with the AI on drained the Anthropic credit and broke CV parsing.
- Embeddings live in a pgvector column Prisma cannot read or write, so they use raw SQL.
- Cost protection: per-device and per-IP rate limits plus a global daily budget (`src/lib/rateLimit.ts`). `LLM_KILL_SWITCH=1` stops all AI calls.
- Schema defaults `userId` to "niklas" (originally single-user).
- Search results are cached for 26 h, so scoring changes need the version bump.
