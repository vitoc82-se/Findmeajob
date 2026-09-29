#!/usr/bin/env python3
"""List unlabeled jobs in the top-K by `final` for a run: unlabeled.py <run> <k> [case ...]"""
import json, sys, os
here = os.path.dirname(os.path.abspath(__file__))
run, k = sys.argv[1], int(sys.argv[2]); only = set(sys.argv[3:])
labels = json.load(open(f'{here}/labels.json'))
tot = 0
for f in sorted(os.listdir(f'{here}/runs/{run}')):
    cid = f[:-5]
    if only and cid not in only: continue
    d = json.load(open(f'{here}/runs/{run}/{f}')); rows = d['debug']
    lab = labels.get(cid, {})
    top = sorted(rows, key=lambda r: -(r['final'] if r['final'] is not None else -1))[:k]
    un = [r for r in top if r['jobId'] not in lab]
    if not un: continue
    tot += len(un)
    print(f"### {cid}  (unlabeled in top-{k}: {len(un)})")
    for i, r in enumerate(un):
        ft = r.get('feat') or {}
        print(f"{i:2d}|{r['headline'][:52]}|{(r['employer'] or '')[:14]}|{(ft.get('group') or '-')[:26]}|{(r['location'] or '').split(',')[0][:9]}")
print('TOTAL unlabeled', tot)
