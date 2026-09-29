#!/usr/bin/env python3
"""Grid over blends of rr / llm / sim + level & geo adjustments.  blend.py"""
import json, os, math, itertools, sys
here = os.path.dirname(os.path.abspath(__file__))
labels = json.load(open(f'{here}/labels.json'))
sets = [('base2', [c for c in labels if not c.startswith('p-')]), ('pers1', [c for c in labels if c.startswith('p-')])]
data = {}
for run, ids in sets:
    for cid in ids:
        f = f'{here}/runs/{run}/{cid}.json'
        if os.path.exists(f): data[cid] = (run, json.load(open(f))['debug'], labels[cid])
def dcg(gs): return sum((2**x - 1) / math.log2(i + 2) for i, x in enumerate(gs))
def ndcg(rows, lab, key, k=10):
    rk = sorted(rows, key=lambda r: -key(r))[:k]
    ideal = dcg(sorted(lab.values(), reverse=True)[:k])
    return dcg([lab.get(r['jobId'], 0) for r in rk]) / ideal if ideal else None
def mean_ndcg(key, only=None):
    v = []
    for cid, (run, rows, lab) in data.items():
        if only == 'title' and cid.startswith('p-'): continue
        if only == 'pers' and not cid.startswith('p-'): continue
        x = ndcg(rows, lab, key)
        if x is not None: v.append(x)
    return sum(v) / len(v)
def feats(r):
    l = r.get('llm') or {}; a = r.get('adj') or {}
    return dict(rr=(r.get('rr') or 0) * 100, sim=(r['sim'] or 0) * 100, llm=(l.get('score') if l.get('score') is not None else 0),
                same=l.get('same'), lvl=a.get('lvl', 0), geo=a.get('geo', 0), simpen=a.get('simPen', 0), final=r['final'] if r['final'] is not None else -1)
best = []
for wrr, wllm, wsim in itertools.product([0, .25, .5, .75, 1], [0, .25, .5, .75, 1], [0, .25, .5]):
    if wrr + wllm + wsim == 0: continue
    def key(r, wrr=wrr, wllm=wllm, wsim=wsim):
        f = feats(r)
        s = wrr * f['rr'] + wllm * f['llm'] + wsim * f['sim'] + f['lvl'] + f['geo']
        if f['same'] is False: s -= 30
        return s
    best.append((mean_ndcg(key), mean_ndcg(key, 'title'), mean_ndcg(key, 'pers'), wrr, wllm, wsim))
best.sort(reverse=True)
print('overall  title  pers   w_rr w_llm w_sim')
for b in best[:12]: print(f"{b[0]:.4f}  {b[1]:.4f} {b[2]:.4f}   {b[3]} {b[4]} {b[5]}")
print('baseline final:', round(mean_ndcg(lambda r: feats(r)['final']),4), ' rr only:', round(mean_ndcg(lambda r: feats(r)['rr']),4))

# ---- error analysis for the best blend
wrr, wllm, wsim = 0.75, 0.25, 0.25
def bkey(r):
    f = feats(r); s = wrr * f['rr'] + wllm * f['llm'] + wsim * f['sim'] + f['lvl'] + f['geo']
    if f['same'] is False: s -= 30
    return s
rows_out = []
for cid, (run, rows, lab) in data.items():
    rows_out.append((ndcg(rows, lab, bkey), cid))
rows_out.sort()
print('\nweakest cases under best blend:')
for v, cid in rows_out[:10]: print(f"  {v:.2f} {cid}")
if len(sys.argv) > 1:
    cid = sys.argv[1]; run, rows, lab = data[cid]
    rk = sorted(rows, key=lambda r: -bkey(r))[:12]
    print(f"\n{cid} top-12 by blend (grade | blend | rr | llm | headline):")
    for r in rk:
        f = feats(r)
        print(f"  g={lab.get(r['jobId'],'?')} {bkey(r):6.1f} rr={f['rr']:.0f} llm={f['llm']} lvl={f['lvl']} | {r['headline'][:46]} | {(r['feat'] or {}).get('group','')[:22]}")
    best_missing = sorted([(g, r) for r in rows for g in [lab.get(r['jobId'], 0)] if g >= 3 and r not in rk], key=lambda x: -x[0])[:5]
    print('  grade-3 jobs NOT in top-12:')
    for g, r in best_missing:
        f = feats(r); print(f"   rank {sorted(rows,key=lambda x:-bkey(x)).index(r)}  blend={bkey(r):.1f} rr={f['rr']:.0f} llm={f['llm']} lvl={f['lvl']} | {r['headline'][:50]}")
