# Changelog

All notable changes to Findmeajob. Dates are the day the work landed on `main`
(which auto-deploys to findmeajob.online via Vercel).

## 2026-08-26 — Apply-assist: professional PDF CV + cover letter

The CV helper now produces polished PDFs instead of bare Word files.

- **Structured CV, not a text blob** — `generateApplyAssist` now emits structured
  CV data (name, contact, tailored summary, skills, experience with bullets,
  education, languages) so a real template can lay it out. Honesty rules
  unchanged; stored in new `ApplyDoc.cvJson`, with a plain-text rendering kept in
  `tailoredCv` for the on-screen preview/copy.
- **Styled PDF renderer** (`src/lib/cvPdf.ts`, pdf-lib) — single-column, brand
  accent (#2f5bea), hairline-separated sections; right-aligned dates/periods; a
  cover-letter letterhead. Pure-JS, serverless-safe; WinAnsi-sanitized so no
  glyph can break the download. New endpoint `POST /api/v1/apply-assist/[id]/pdf
  ?type=cv|letter`.
- **Optional headshot** (Sweden-standard on CVs) — uploaded at download time,
  embedded into the PDF, and **never stored** (same parse-then-discard promise as
  the CV upload). Aspect-fit, framed, top-right.
- Removed the DOCX export (`docx` dependency, `lib/docx.ts`, `/export` route).
  Old ApplyDocs without `cvJson` fall back to a clean text-PDF render.

## 2026-08-26 — Try-before-signup (public preview flow)

Removes the sign-in wall for cold traffic: visitors can now see real matches
before creating an account — the highest-leverage fix for the activation gap.

- **Public `/try` page** (`src/app/try/page.tsx`) — paste a CV / upload a PDF /
  describe intent, then see ranked matches immediately. No account, nothing
  stored. Design: value shown, actions gated. The **top 3 matches are fully
  visible** (headline, employer, score, why-it-fits); the rest are returned as
  **score-only stubs the UI blurs behind one free-signup unlock** ("N more
  matches waiting"). Save and the AI Helper (apply-assist) render **grayed with a
  lock** as signup incentives. Deliberately NOT hiding the best results — that
  would bury the proof-of-value and contradicts our "no dark patterns" promise.
- **Preview API** (`/api/v1/preview/parse`, `/api/v1/preview/run`) — public,
  **IP-rate-limited** (6 parses / 12 runs per hour, `ANON_LIMITS` in
  `rateLimit.ts`), and **fully non-persistent**: no Profile or Match rows, PDF
  bytes discarded in-memory. Anon usage events use distinct `preview_*` kinds so
  they don't pollute the authed funnel metrics on `/admin`.
- **Shared scoring core** — `runSearch.ts` refactored to extract
  `computeScoredMatches` (fetch → dedup → embed-rank → LLM rerank → geo weight,
  no user-scoped writes). `executeSearch` (persists Match) and the new
  `previewSearch` (display only) both build on it — identical matching, one code
  path. Job rows + embeddings are still persisted (no PII; grows the corpus).
- **Landing CTA** now sends visitors to `/try` ("Try it free — no sign-up")
  instead of the Clerk signup wall.

## 2026-08-26 — Corpus crawl (Phase 2b) + privacy policy

### Matching corpus
- **Scheduled Swedish-market crawl (Phase 2b)** — new daily cron
  (`/api/cron/crawl`, 05:00 UTC, ahead of the digest) that ingests a broad,
  user-independent slice of Arbetsförmedlingen across ~40 sector queries and
  embeds the new postings (`src/lib/matching/crawl.ts`). This grows the pgvector
  corpus beyond whatever any single user's keyword search happens to fetch, so
  `executeSearch`'s cross-run recall can surface strong matches nobody searched
  for directly. Ingest and embedding are decoupled and time-budgeted: a Voyage
  outage (or unset key) still grows the corpus; the backlog is embedded across
  successive runs. CRON_SECRET-gated, mirrors the digest cron.

### Privacy / GDPR
- **Privacy policy page (`/privacy`)** — public route (added to middleware),
  linked from the landing footer and the cookie consent banner. Documents what we
  collect (CV text — PDFs parsed then discarded, preferences, account email,
  activity, analytics), how it's used, every processor (Clerk, Neon, Anthropic,
  Voyage, job APIs, Resend, Vercel, Meta), the cookie/consent model, retention,
  and GDPR rights. Closes the disclosure gap left when the consent-gated Meta
  Pixel went live.

## 2026-08-26 — Semantic matching, launch instrumentation, voice fix

### Matching quality
- **Deterministic location weighting** (`src/lib/matching/location.ts`). The LLM
  reranker now scores role/seniority/skills fit only; geography is applied after,
  in `executeSearch`, when a Swedish region is selected and the search isn't
  remote: in-region **+8**, out-of-region **−15** (clamped), with "Outside your
  selected region." noted in the gap. Fixes strong-but-far jobs outranking
  near-perfect in-region ones. (`c9ad6b7`)
- **Reranker calibration** — added explicit 0–39 / 40–59 / 60–84 / 85–100 score
  bands to reduce scoring variance. (`c9ad6b7`)
- **Semantic candidate ranking + cross-run recall (Phase 2a)** — Voyage AI
  embeddings (`voyage-3.5`, 1024d) + pgvector on Neon. Candidates that reach the
  LLM are now ranked by meaning-similarity to the profile instead of source sort
  order, augmented with a guarded pgvector recall of similar jobs the keyword
  fetch missed. Fully fallback-guarded — any embedding failure reverts to the old
  interleave, so search never breaks. Backfill endpoint at
  `/api/admin/embed-backfill` (CRON_SECRET-gated). (`7db4d11`)
- **Rate-limit hardening** — batch size 8 + 429 retry/backoff for Voyage's
  free-tier limits. (`ab478eb`)

### Apply-assist
- **Register-aware, anti-slop voice** (`src/lib/matching/applyAssist.ts`). Cover
  letters now read the job's level first and write proportionately — plain and
  grounded, banned-cliché list, length scaled to the role, Swedish-understated
  for `personligt brev`. Honesty rule unchanged. (`3b0ed21`)

### UI
- **Active search overlay** during the ~30s search — elapsed counter, accent
  progress bar easing toward ~95%, status text stepping through the real pipeline
  stages. (`1ea15db`)
- **"We found X jobs for you"** — replaced the per-source fetch counts with one
  calm summary; source-outage warnings kept. (`225ec0e`)

### Marketing & analytics (Facebook launch)
- **`/admin` usage dashboard** — owner-only funnel (onboarded, searches,
  apply-assist, digest, 7-day actives/new, 14-day searches/day, corpus counts)
  from existing data. Gated by `ADMIN_EMAILS`. (`b325744`)
- **Vercel Web Analytics** — visitors, referrers (Facebook), countries.
  (`b325744`)
- **Consent-gated Meta (Facebook) Pixel** — loads only after cookie consent;
  events PageView / CompleteRegistration (signup) / Search. Env
  `NEXT_PUBLIC_FB_PIXEL_ID`. (`aa6576d`)

### New env vars
`VOYAGE_API_KEY`, `ADMIN_EMAILS`, `NEXT_PUBLIC_FB_PIXEL_ID` (public, build-time —
changing it needs a redeploy). See `.env.example`.

### Known follow-ups
- `/privacy` page to complete the GDPR picture now the Pixel is live.
- Pixel fires PageView on full load only, not SPA route changes.

## 2026-08-24 → 2026-08-25 — Initial build (pre-changelog)

Shipped before this file existed: CV paste + PDF upload + free-text intent →
structured profile; multi-source search (jobtech, joblinks, remotive, adzuna)
with cross-source dedup; LLM match with score + rationale + gaps; save / applied /
dismiss + saved tab; apply-assist (tailored CV + cover letter, docx export);
daily digest email (Vercel Cron + Resend); multi-user (Clerk) + rate limiting;
and the "calm control, sharply executed" design system (see `DESIGN.md`).
