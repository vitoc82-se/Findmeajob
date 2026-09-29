#!/usr/bin/env python3
"""compare.py <run> [<run> ...]: nDCG@10 / P@5 of the pipeline's own `final` ordering on each run (labels shared)"""
import json, sys, os, math
here = os.path.dirname(os.path.abspath(__file__))
labels = json.load(open(f'{here}/labels.json'))
def dcg(gs): return sum((2**x - 1) / math.log2(i + 2) for i, x in enumerate(gs))
for run in [a for a in sys.argv[1:] if not a.startswith('-')]:
    t = []; p5 = []; per = {}
    for f in sorted(os.listdir(f'{here}/runs/{run}')):
        cid = f[:-5]
        if cid not in labels: continue
        rows = json.load(open(f'{here}/runs/{run}/{f}'))['debug']; lab = labels[cid]
        rk = sorted(rows, key=lambda r: -(r['final'] if r['final'] is not None else -1))
        ideal = dcg(sorted(lab.values(), reverse=True)[:10])
        if not ideal: continue
        v = dcg([lab.get(r['jobId'], 0) for r in rk[:10]]) / ideal
        per[cid] = v; t.append(v); p5.append(sum(1 for r in rk[:5] if lab.get(r['jobId'], 0) >= 2) / 5)
    print(f"{run:10s} n={len(t)} nDCG@10={sum(t)/len(t):.3f}  P@5(>=2)={sum(p5)/len(p5):.3f}")
    if '-v' in sys.argv:
        for k, v in sorted(per.items(), key=lambda x: x[1])[:8]: print(f"     weak: {v:.2f} {k}")
