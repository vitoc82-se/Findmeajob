# Changelog

All notable changes to Findmeajob. Dates are the day the work landed on `main`
(which auto-deploys to findmeajob.online via Vercel).

## 2026-10-05 — Cost breaker, CV follows you into signup, faster first fetch

- **Global cost circuit breaker** (`src/lib/rateLimit.ts`): on top of the per-user / per-IP limits, a shared
  24 h budget per kind of costly call (parse 1500, run 2500, apply 800, preview parse 2000, preview run 3000).
  When it is spent the endpoints answer 503 with a plain "temporarily paused" message. Override with
  `GLOBAL_CAP_<KIND>` (0 = off); `LLM_KILL_SWITCH=1` refuses everything at once. New index `UsageEvent(kind, at)`.
- **CV continuity:** a CV read on `/try` is kept in the visitor's own browser (`fmaj-handoff`, 24 h) and handed to
  the new account on first `/app` load via `POST /api/v1/profile/adopt` (sanitized, never overwrites an existing
  profile, no LLM call). `/preview/parse` now returns the extracted text for this. Privacy page updated.
- **Speed:** a typed title is fetched while its neighbouring titles are being worked out (title expansion no
  longer delays the first fetch); the extra titles are fetched afterwards and merged.
- **Apply-assist:** checked with stubbed model calls (CV and letter run in parallel, fenced JSON parsed, PDF
  renders); CV call token cap raised 3000 -> 4500 so long CVs are not cut off. Not exercised against the live API.
- **Benchmark, AI-scored v2** (re-measured today, 7 LLM shortlist calls per set, pennies; 30 + 0 new jobs hand-graded
  for personas): personas nDCG@10 reranker only 0.852 -> final 0.876 (P@5 0.857 -> 0.871). Title cases
  (93 unlabeled jobs counted as 0, so absolute numbers are low): 0.746 -> 0.770 (P@5 0.760 -> 0.820).
  The AI layer helps a little, as intended.

## 2026-09-30 — Honest scores, result feedback

- **Scores:** on the benchmark, raw blend >= 115 was a perfect fit 99% of the time, but the old display curve
  gave 94-99 from 100 up, so most good matches showed the same number. New curve spreads the top (99 needs a
  blend of 135, almost never), and jobs the AI did not read are capped at 89. Cache key `v: 15`.
- **Feedback:** "Passar jobbet? Ja / Nej" on every result (`/try` and `/app`), stored anonymously in
  `ResultFeedback` (job, shown score, search terms, level, region) via `POST /api/v1/preview/feedback`.
  Use it as real labels for tuning. (Under `/preview/` on purpose: the Clerk middleware 404s other API paths.)
- Removed the temporary rate-limit relaxation.

## 2026-09-30 — Ranking v2, search speed, CV level detection

- **Ranking v2** (`src/lib/matching/rank.ts`, `runSearch.ts`): candidates come from strict/loose keyword
  search, expanded titles, occupation-group expansion (JobTech `occupation-group`) and pgvector recall;
  deduped, similarity floor, pool of 90 -> Voyage `rerank-2.5` cross-encoder -> shortlist of 12 read by the
  fast LLM (same occupation, level, rationale, gaps) -> blend
  `0.75*rerank + 0.25*llm + 0.25*sim + level + geo`, minus 30 if not the same occupation -> `displayScore`
  calibration -> matches under 40 hidden. Cache key version `v: 14` (bump on every scoring change).
- **Benchmark** in `eval/` (see `eval/README.md`): 37 title cases + 7 personas, hand-graded labels, nDCG@10 / P@5.
  Reranker-only numbers: personas 0.924 vs 0.880 before; title cases 0.937 vs 0.958 before. The AI-scored v2 has
  not been re-measured (credit ran out mid-run).
- **Research mode** on `/api/v1/preview/run` (secret `x-eval-key`, hashed in `EVAL_KEY_SHA256`) exposes every
  candidate with all signals; `noLlm` skips Anthropic entirely.
- **Speed:** cold search ~10 s -> ~6-8 s (repeat ~0.3 s). Shortlist scored by the fast model; embedding of new
  jobs runs in `after()` with a neutral similarity fallback.
- **CV reader:** the prompt defines junior/mid/senior/lead (a manager, or someone aiming for a manager role,
  is `lead`) and asks for Swedish titles.
- **Resilience:** if the LLM is unavailable (e.g. no API credit) search still ranks with the reranker.

## 2026-09-29 — Seniority picker, location and relevance fixes

- **Seniority picker** ("Vilken nivå?": Alla / Nybörjare / Erfaren / Senior / Chef) on the landing form,
  `/try` and the `/app` filters, with a plain-words hint under the pills. The AI now also reports each
  job's level; a mismatch costs points deterministically (1 step -6, 2 steps -18, 3 steps -28) with a note
  in "gaps", and result cards carry a level tag. Level also steers title expansion, the search cache and the
  saved digest search. CV searches preselect the level the CV suggests.
- **Location:** JobLinks is filtered by region; out-of-region jobs lose 30 (was 15); ads that name no
  place lose 10; every workplace of an ad is kept; results say "Jobb i {region} kommer först".
- **Relevance:** neighbouring titles are searched for typed titles ("IT chef" -> IT-ansvarig ...); a typed
  "it" becomes "IT"; multi-word titles search strictly first; unrelated candidates are dropped by a similarity
  floor; matches under 40 are hidden; the AI must first say whether the job is the same occupation (capped in
  code) and gives structured output via a forced tool call; embedding similarity penalises outliers.
  Title-only searches are scored by Sonnet (cached), CV searches by Haiku.
- Cache hits no longer count against the anonymous rate limit. The digest email's "why it fits" is now Swedish.

## 2026-09-29 — Speed pass + matching upgrade

- **Region fix (biggest win):** functions ran in `iad1` (US East) while the Neon database is in
  `eu-central-1`, so every query crossed the Atlantic (~500 ms round trip). `vercel.json` now pins
  `fra1` (~3 ms). `/api/health` reports both regions so a mismatch is visible.
- **Search: 26-31 s -> ~6 s** (measured live via a new `Server-Timing` header). The AI re-ranker
  was 20 s+ of it: now nine parallel calls of three jobs each with compact output. Also: profile
  embedding starts alongside the job fetch, jobs that already have a stored embedding are not
  re-embedded, embedding batches run in parallel, jobs are saved in bulk instead of one upsert each.
- **Repeat searches are instant:** title-only preview searches are cached for 12 h (`SearchCache`);
  a nightly cron (`/api/cron/prewarm`, 05:30 UTC) pre-computes the landing-page chips. Hit = ~0.3 s.
  CV-based searches are never cached.
- **CV rewrite:** CV and cover letter are now generated in parallel (CV on the fast model, letter on
  Sonnet) instead of one long call; job language is detected in code so both agree.
- **Site speed:** landing, `/try` and `/privacy` are pre-rendered (CDN) and no longer load the auth
  SDK (~250 kB) or run auth middleware; Clerk loads only for `/app`, `/admin` and the new
  `/sign-in` / `/sign-up` hand-off pages. Language switch is client-side (Swedish is the default).
  Live: first paint ~0.4 s (was ~1.7 s), 0 auth requests on the landing page.
- **Matching:** CV parse now returns job titles as Swedish employers word them (was English, which
  starved the Swedish job APIs); wider fetch (25 per title), shortlist 30, longer job snippets,
  and a rule that caps the score when a hard requirement (license, degree) is clearly missing.
  On a warehouse CV: 22 of 27 matches now score 60+ (before: 4 of 25 scored 76+).

## 2026-09-29 — New look (warm & human) + launch hardening

- **New design system** (`DESIGN.md`, old one kept as `DESIGN.old.md`): leaf green,
  butter-yellow score stamps, warm paper, Bricolage Grotesque + Figtree. Landing page,
  `/try`, `/app`, admin and privacy restyled; mono labels and near-black buttons gone.
- **SEO and sharing:** per-page titles/descriptions/canonical URLs (canonical host is
  `www.findmeajob.online`), Open Graph + Twitter card image (generated), favicon and
  Apple touch icon (generated), `sitemap.xml`, `robots.txt`, `noindex` on `/app` and `/admin`.
- **Errors:** custom 404, error boundary and global error page; API 500s no longer leak
  exception text (logged server-side instead); `/try` shows localized messages only; the
  funnel endpoint never errors in the visitor's console.
- **Structure:** `/try` now has an `<h1>` (page split into a server wrapper + client component).
- **Build hygiene:** no browser source maps, `X-Powered-By` off, basic security headers.
- Privacy policy now covers the anonymous IP-keyed usage counter.

## 2026-09-29 — Conversion pass: Swedish first, one-screen start, results first

Facebook campaign: ~1000 page views, 0 uses. A phone walkthrough showed cold
visitors faced English copy, a CV-first form, ~15s parse, a 17-county refine
screen, ~30s search, and only then results. This pass removes those steps.

- **Swedish by default** (`src/lib/i18n.ts`, cookie `fmaj-lang`, SV/EN toggle in
  the header). Landing, `/try`, progress copy, and the consent banner are
  translated; `<html lang>` and metadata follow. Swedish is the default for
  everyone (Swedes often run English phones, so Accept-Language is unreliable).
  The reranker now writes rationale/gaps in Swedish when `lang=sv`
  (`SearchFilters.lang`, `scoreJobs`).
- **One-screen start.** The landing hero is now the search form (job title +
  region, plus one-tap example chips) and lands on `/try?q=&r=`, which runs the
  search on arrival. No CV needed: the title alone builds the profile, which
  removes the ~15s parse from the first-run path.
- **Results first.** `/try` is a single screen: search bar on top, results below.
  The 17-checkbox refine step is gone (friendly single-region picker: "Malmö /
  Skåne"). The CV is an optional, collapsed upgrade that re-runs the search.
  Progress is an inline card instead of a full-screen overlay.
- **Landing redesigned to `DESIGN.md`**: removed the gradient/blur blob, pill
  badge, emoji icons, tilted shadow card, and the dark CTA block; added a
  labelled example result and a trust row (no CV stored, no account).
- **Visitor funnel, independent of the cookie banner**
  (`/api/v1/preview/event`, `src/lib/funnel.ts`): cookie-free, allowlisted step
  names + coarse source (`fb`/`other`), per-IP capped. Shown on `/admin` as
  "Visitor funnel (7d)". "Active users" now excludes anonymous `ip:` rows.

Not done yet: streaming/faster first results (search is still ~30s), Swedish
`/app` and `/privacy`, per-search caching.

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
