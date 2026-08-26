# Changelog

All notable changes to Findmeajob. Dates are the day the work landed on `main`
(which auto-deploys to findmeajob.online via Vercel).

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
