#!/usr/bin/env python3
"""label.py <run> <case-id> '<idx:grade,idx:grade,...>'  -- grades for the pool shown by view.py (unlisted = 0)"""
import json, sys, os, subprocess
here = os.path.dirname(os.path.abspath(__file__))
run, cid, spec = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(f'{here}/runs/{run}/{cid}.json'))
rows = d['debug']
byfinal = sorted(rows, key=lambda r: -(r['final'] if r['final'] is not None else -1))[:25]
bysim = sorted(rows, key=lambda r: -(r['sim'] or 0))[:20]
byrr = sorted(rows, key=lambda r: -(r.get('rr') or 0))[:25]
seen, pool = set(), []
for r in byrr + byfinal + bysim:
    if r['jobId'] not in seen: seen.add(r['jobId']); pool.append(r)
pool = pool[:int(os.environ.get('N', 45))]
grades = {}
for part in spec.split(','):
    part = part.strip()
    if not part: continue
    if '-' in part.split(':')[0]:            # range a-b:g
        rng, g = part.split(':'); a, b = rng.split('-')
        for i in range(int(a), int(b) + 1): grades[i] = int(g)
    else:
        i, g = part.split(':'); grades[int(i)] = int(g)
path = f'{here}/labels.json'
labels = json.load(open(path)) if os.path.exists(path) else {}
lab = labels.setdefault(cid, {})
for r in pool:            # every pooled job gets a grade (0 default)
    lab[r['jobId']] = 0
for i, g in grades.items():
    lab[pool[i]['jobId']] = g
labels[cid] = lab
json.dump(labels, open(path, 'w'), ensure_ascii=False, indent=0)
print(cid, 'labelled', len(pool), 'nonzero', sum(1 for v in lab.values() if v))
