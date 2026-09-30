# Ranking benchmark

Hand-graded relevance labels (0-3) for search results; used to compare ranking variants.

- `cases.json` title searches (title, JobTech region id, level); `personas.json` CV-style profiles.
- `labels.json` job id -> grade per case. `runs/<name>/` raw debug output per case.
- `run_cases.py`, `run_personas.py` call the live `/api/v1/preview/run` in research mode
  (needs the eval key; header `x-eval-key`). Pass `noLlm` to skip Anthropic (free); LLM runs cost real money.
- `unlabeled.py <run> <k>` lists unlabeled top-k jobs; `label2.py <run> <case> <k> 'idx:grade,...'` grades them
  (unlisted = 0). `analyze.py`, `compare.py`, `blend.py` compute nDCG@10 / P@5 and grid-search blend weights.
- Last numbers (reranker only): personas 0.924 (old 0.880), title cases 0.937 (old 0.958).
