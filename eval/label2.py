#!/usr/bin/env python3
"""label2.py <run> <case> <k> '<idx:grade,...>'  grade the unlabeled top-k items shown by unlabeled.py (unlisted = 0)"""
import json, sys, os
here = os.path.dirname(os.path.abspath(__file__))
run, cid, k, spec = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
labels = json.load(open(f'{here}/labels.json')); lab = labels.setdefault(cid, {})
rows = json.load(open(f'{here}/runs/{run}/{cid}.json'))['debug']
top = sorted(rows, key=lambda r: -(r['final'] if r['final'] is not None else -1))[:k]
un = [r for r in top if r['jobId'] not in lab]
g = {}
for part in spec.split(','):
    part = part.strip()
    if not part: continue
    a, b = part.split(':')
    if '-' in a:
        x, y = a.split('-'); [g.__setitem__(i, int(b)) for i in range(int(x), int(y) + 1)]
    else: g[int(a)] = int(b)
for r in un: lab[r['jobId']] = 0
for i, v in g.items(): lab[un[i]['jobId']] = v
json.dump(labels, open(f'{here}/labels.json', 'w'), ensure_ascii=False, indent=0)
print(cid, 'labelled', len(un))
