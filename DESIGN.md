---
# gstack: design-md-format=spec
name: Findmeajob
description: Warm, human, Swedish-daylight job matcher. A helpful person on your side, not a dev tool.
colors:
  primary: "#1E6B52"
  primary-dark: "#175440"
  on-primary: "#FFFFFF"
  sun: "#FFD25A"
  sun-soft: "#F3E6BE"
  surface: "#FFFFFF"
  paper: "#FBF8F3"
  mint: "#E4F1E8"
  mint-border: "#C9D8CD"
  text: "#1D2B24"
  text-muted: "#5B6B62"
  line: "#E6E0D4"
  success: "#1E6B52"
  warning: "#B7791F"
  error: "#B4382F"
typography:
  display:
    fontFamily: Bricolage Grotesque
    fontWeight: 800
    fontSize: clamp(2rem, 8vw, 3.25rem)
    letterSpacing: -0.02em
  heading:
    fontFamily: Bricolage Grotesque
    fontWeight: 700
    fontSize: 1.5rem
    letterSpacing: -0.02em
  body:
    fontFamily: Figtree
    fontSize: 1rem
    lineHeight: 1.5
  label:
    fontFamily: Figtree
    fontWeight: 600
    fontSize: 0.875rem
rounded:
  input: 12px
  row: 16px
  stamp: 14px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
  input:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.mint-border}"
    rounded: "{rounded.input}"
  result-row:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    rounded: "{rounded.row}"
  score-stamp:
    backgroundColor: "{colors.sun}"
    textColor: "{colors.text}"
    rounded: "{rounded.stamp}"
---

# Findmeajob

## Overview

**Creative North Star:** "A helpful person on your side." Warm, plain-spoken and Swedish, the opposite of a cold job board or a developer tool.
**Product context:** Swedish-first CV/title-to-job matcher for ordinary job seekers (not just tech), arriving cold from Facebook on phones. Title in, ranked jobs out. Bilingual SV/EN, Swedish default.
**Mode per surface:** Landing = Persuade. Search/results/saved = Operate. Cover letter and CV preview = Read.
**Reference sites:** Platsbanken (navy box + stock photo) and Teal (white, black headline, yellow button). Both generic; we differentiate on warmth and color.
**Key characteristics:**
- Green-drenched personality on a warm paper ground, not white and black.
- Match score is a yellow stamp with one human sentence beside it.
- The search field is the hero. Phone first, one column, left-aligned.
- A real signed note from the founder (20-year hiring manager) as the trust anchor.

## Colors

**Strategy:** Committed. Leaf green owns the page (buttons, the note block); butter yellow is reserved for score stamps and small highlights; neutrals are warm (paper, mint tint), never grey.
**Light or dark:** Light only. The use scene is a person on a phone in daylight or an evening scroll; warmth reads better light. No dark mode for now.
Yellow never carries white text; stamps use ink text. Muted text `text-muted` is for secondary lines only. Mint panels group the search; `line` borders separate rows. Score bands: 80+ `sun`, 60-79 `sun-soft`, below that a plain outline stamp.

## Typography

- **Display and headings:** Bricolage Grotesque (Google Fonts, 700/800). Characterful, friendly, opsz-aware; chosen because it is not the usual neutral grotesque. Headlines are large, tight and left-aligned.
- **Body and UI:** Figtree (Google Fonts, 400-700). Soft geometric, very legible on phones, handles å ä ö well.
- **No monospace and no uppercase micro-labels.** They read "dev tool". Numbers use Figtree tabular figures where alignment matters; score stamps use Bricolage 800.
- **Loading:** `next/font/google` (self-hosted at build). Replaces Geist.
- **Scale:** display 32-52px, heading 24px, row title 18px, body 16px (never below 14px). Levels differ by more than weight.

## Layout

One column on phone, max readable width ~40rem on desktop for results, hero copy left-aligned. The landing hero is the search form on a mint block (job title, region, one round green button, example chips). Results appear directly below an always-visible search bar. Roomy rows, not stacked drop-shadow cards. 16px base gutter, 8px spacing unit. Tap targets at least 48px tall.

## Elevation & Depth

Flat. Depth comes from tint (paper vs mint vs white) and 1px `line` borders. If a shadow is needed, offset and soft (0 12px 28px rgba(29,43,36,.10)) for floating layers only. No glows.

## Shapes

Inputs 12px, result rows 16px, score stamps 14px (tilted -4deg), primary buttons fully round. Radius steps down with nesting (inner = outer minus gap). Not one bubbly radius everywhere.

## Components

- **Primary button:** green pill, white bold text, hover `primary-dark`, focus ring 3px green at 25% alpha, disabled 50% opacity.
- **Input:** white, 1.5px mint-border, 17px text (prevents iOS zoom), focus border green plus ring.
- **Result row:** stamp on the left, title, employer and place, one "why it fits" sentence, optional muted gap line, text actions in green. No card inside a card.
- **Score stamp:** sun yellow, ink text, slight tilt; it "stamps in" on arrival.
- **Founder note:** solid green block, white Bricolage text, name and role below. Real quote and real person only.
- **Chips:** white pill with mint-border for example searches.

## Do's and Don'ts

- Do: keep Swedish first; write like a person ("Visa mina jobb"), not a slogan.
- Do: put the search field above the fold on a 375px phone.
- Do: use yellow only for scores and a rare highlight.
- Don't: use mono type, uppercase tracking labels or near-black buttons.
- Don't: add blobs, gradients, emoji, stock photos, fake testimonials or "seamless/effortless" copy.
- Don't: hide the best results behind a wall; gate actions, not value.

## Motion

- **Approach:** minimal-functional.
- **Easing:** enter ease-out, exit ease-in, move ease-in-out.
- **Duration:** micro 100ms, short 150-250ms.
- **The one authored moment:** score stamps land with a quick 200ms scale-and-settle when results arrive. Respect `prefers-reduced-motion`.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-29 | Replaced "calm control, sharply executed" system (Geist, near-black, calm blue, hairlines) | Owner found it boring and dev-tool-like for ordinary Swedish job seekers arriving from Facebook. Old file kept as DESIGN.old.md. |
| 2026-09-29 | Warm green + butter yellow, Bricolage Grotesque + Figtree | Committed color, friendly type, memorable yellow score stamp. Approved from HTML preview (AI mockups unavailable: no OpenAI key). |
