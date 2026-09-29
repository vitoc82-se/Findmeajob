#!/usr/bin/env python3
"""Compare rankers on the labelled benchmark.  analyze.py <run> [-v]"""
import json, sys, os, math
here = os.path.dirname(os.path.abspath(__file__))
run = sys.argv[1]; verbose = '-v' in sys.argv
labels = json.load(open(f'{here}/labels.json'))
cases = {c['id']: c for c in json.load(open(f'{here}/cases.json'))}

def load(cid):
    return json.load(open(f'{here}/runs/{run}/{cid}.json'))['debug']

def g(r): return r.get('llm') or {}
RANKERS = {
  'sim':      lambda r: r['sim'] or 0,
  'rr':       lambda r: r.get('rr') or 0,
  'llm_raw':  lambda r: (g(r).get('score') if g(r).get('score') is not None else -1),
  'final':    lambda r: (r['final'] if r['final'] is not None else -1),
}
def dcg(grades): return sum((2**x - 1) / math.log2(i + 2) for i, x in enumerate(grades))
def ndcg(rows, lab, key, k=10):
    ranked = sorted(rows, key=lambda r: -key(r))[:k]
    got = dcg([lab.get(r['jobId'], 0) for r in ranked])
    ideal = dcg(sorted(lab.values(), reverse=True)[:k])
    return got / ideal if ideal else None
def prec(rows, lab, key, k=5, thr=2):
    ranked = sorted(rows, key=lambda r: -key(r))[:k]
    return sum(1 for r in ranked if lab.get(r['jobId'], 0) >= thr) / k
def inregion(rows, key, k=10):
    ranked = sorted(rows, key=lambda r: -key(r))[:k]
    return sum(1 for r in ranked if (r.get('adj') or {}).get('fit') in ('in', 'n/a')) / max(1, len(ranked))

def evaluate(rankers, quiet=False):
    res = {n: {'ndcg': [], 'p5': [], 'inreg': []} for n in rankers}
    for cid in labels:
        if not os.path.exists(f'{here}/runs/{run}/{cid}.json'): continue
        rows = load(cid); lab = labels[cid]
        for n, key in rankers.items():
            v = ndcg(rows, lab, key)
            if v is None: continue
            res[n]['ndcg'].append((cid, v)); res[n]['p5'].append(prec(rows, lab, key)); res[n]['inreg'].append(inregion(rows, key))
    if not quiet:
        print(f"{'ranker':22s} nDCG@10  P@5(>=2)  inRegion@10   (n={len(next(iter(res.values()))['ndcg'])})")
        for n, r in res.items():
            m = lambda xs: sum(xs) / len(xs) if xs else 0
            print(f"{n:22s} {m([v for _, v in r['ndcg']]):.3f}    {m(r['p5']):.3f}      {m(r['inreg']):.3f}")
    return res

if __name__ == '__main__':
    res = evaluate(RANKERS)
    if verbose:
        print('\nper case nDCG@10:' + ''.join(f"  {n}" for n in RANKERS))
        for i, (cid, _) in enumerate(res['final']['ndcg']):
            print(f"{cid:32s}" + ''.join(f"  {res[n]['ndcg'][i][1]:.2f}" for n in RANKERS))
