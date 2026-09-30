# Findmeajob

## Design System
Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
North star: "a helpful person on your side." Warm leaf green + butter-yellow score
stamps on warm paper, Bricolage Grotesque + Figtree, Swedish first, phone first.
The previous system (Geist, near-black, calm blue; see `DESIGN.old.md`) is retired.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Repo sync
Before working, `git fetch` and `git pull --ff-only origin main`: cloud sessions also merge PRs here.

## Matching engine
Pipeline and blend weights: `src/lib/matching/rank.ts` + `runSearch.ts`. After any scoring change, bump
`v:` in `src/lib/matching/searchCache.ts` and check `eval/` (see `eval/README.md`).
LLM cost: the benchmark calls the live API. Use `noLlm` runs; never loop the full set with the LLM on
without telling the owner (a night of this once drained the Anthropic credit and broke CV parsing).
