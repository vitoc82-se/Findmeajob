# Design System — Findmeajob

> North star: **"Calm control, sharply executed."** The still, precise place that
> turns the job-hunt chaos into a short, ranked list. Calm is the feeling;
> sharpness is the execution. Whitespace and restraint carry the calm; crisp type,
> hairlines, tight radii, and fast motion carry the sharp.

## Product Context
- **What this is:** a CV-driven job matcher — upload/describe your CV, get a ranked
  list of fitting jobs with reasons, plus tailored CV + cover letter and a daily digest.
- **Who it's for:** active Swedish job seekers (tech-leaning, bilingual sv/en).
- **Space:** job tools (Jobscan, Teal, LinkedIn, Arbetsförmedlingen) — mostly generic,
  safe, forgettable blue SaaS. The gap: calm + sharp + trustworthy.
- **Project type:** web app (Next.js 15 + Tailwind).

## Aesthetic Direction
- **Direction:** calm-modern / minimal-precise (Linear/Vercel lineage).
- **Decoration level:** minimal — type, whitespace, and hairlines do the work.
- **Mood:** composed, credible, quietly confident. Never loud, never busy.

## Typography
- **UI + headings:** **Geist Sans** (`geist/font/sans`) — the sharpest modern neutral
  grotesque; clean and confident with zero fuss.
- **Data / numbers / micro-labels:** **Geist Mono** (`geist/font/mono`) — score badges,
  uppercase section labels, dates. Mono on the data points is what reads "in control."
- **Loading:** the `geist` npm package via next/font (self-hosted, no CDN).
- **No** Inter/Roboto/system as primary.

## Color
- **Approach:** restrained — near-black actions + ONE calm-blue accent, used sparingly.
- **Ink (text + primary buttons):** `#111114`. Primary actions are near-black, not the accent.
- **Accent (calm blue):** `#2f5bea` — links, active states, selected chips, highlights.
  Rare and meaningful. Never the loudest thing on screen.
- **Accent soft:** `#eef2ff` — faint tinted surfaces/borders.
- **Background:** `#fafafa`. **Surface:** `#ffffff`. **Muted text:** `#6b7280`.
  **Hairline:** `#eaeaea`.
- **Semantic (score badges):** green `#e0e7ff→green-100/800`, amber for mid, neutral for low.
- CSS variables live in `globals.css` (`--ink --accent --bg --surface --muted --line`);
  Tailwind tokens: `ink`, `accent`, `accent-soft`.

## Spacing
- **Base unit:** 4px, sections breathe on an 8/16/24 rhythm.
- **Density:** spacious — whitespace is the calm. Group content into labeled blocks
  separated by hairlines; never one flat list of controls.
- **Section labels:** Geist Mono, 11px, uppercase, tracked, `neutral-400`.

## Layout
- **Approach:** grid-disciplined app; the landing is hybrid (a poster hero).
- **Max content width:** app 48rem (`max-w-3xl`), landing 64rem.
- **Border radius:** sharp, not soft — 6px inputs/buttons, 8–10px cards. No full pills.
- **Borders:** 1px hairline (`--line`). **Shadow:** one whisper (`0 1px 2px rgba(0,0,0,.04)`).

## Motion
- **Approach:** minimal-functional, fast and precise.
- **Easing:** ease-out on enter/hover.
- **Duration:** 140ms on hovers/toggles/color changes. Nothing bouncy.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-25 | Initial design system | /design-consultation. Memorable thing "calm control, sharply executed" (calm + sharp/modern). Geist Sans+Mono, near-black actions, single calm-blue accent, hairlines, 8px rhythm, 140ms motion. Replaced loud indigo-everywhere. |
| 2026-08-26 | Search loading overlay | ~30s searches left only a grey button (reads as broken). Added a full-screen overlay: white/70 backdrop + blur, hairline card, ONE accent progress bar easing toward ~95% (never completes early), live elapsed counter, status text stepping through real pipeline stages. Calm+sharp — no spinner circus. |
| 2026-08-26 | "We found X jobs for you" | Replaced the per-source fetch counts (dev noise: "jobtech: 15…") with one calm summary line (mono numeral). Amber source-outage warnings kept — a real outage should stay visible. |
| 2026-08-26 | Admin dashboard (`/admin`) | Owner-only usage funnel. Reusable **stat-tile** pattern: hairline card, mono uppercase micro-label, big mono tabular-nums value. Simple accent bar chart for searches/day. All within the system. |
| 2026-08-26 | Cookie-consent banner | GDPR gate for the FB Pixel. Bottom-fixed hairline card, ink Accept / ghost Decline — same button language as the rest of the app. Privacy-preserving default (nothing loads until Accept). |
| 2026-08-26 | Apply-assist voice | Cover letters now plain & grounded, scaled to the job's level, anti-slop (banned-cliché list), Swedish-understated. Content/tone decision, not visual — logged here as the product's written voice. |
