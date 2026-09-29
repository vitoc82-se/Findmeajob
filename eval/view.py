#!/usr/bin/env python3
"""Print a case's candidates compactly for labelling: view.py <run> <case-id> [n]"""
import json, sys, os
here = os.path.dirname(os.path.abspath(__file__))
run, cid = sys.argv[1], sys.argv[2]; n = int(sys.argv[3]) if len(sys.argv) > 3 else 40
d = json.load(open(f'{here}/runs/{run}/{cid}.json'))
rows = d['debug']
byfinal = sorted(rows, key=lambda r: -(r['final'] if r['final'] is not None else -1))[:25]
bysim = sorted(rows, key=lambda r: -(r['sim'] or 0))[:25]
seen, pool = set(), []
for r in byfinal + bysim:
    if r['jobId'] not in seen: seen.add(r['jobId']); pool.append(r)
labels = json.load(open(f'{here}/labels.json')) if os.path.exists(f'{here}/labels.json') else {}
lab = labels.get(cid, {})
cases = {c['id']: c for c in json.load(open(f'{here}/cases.json'))}
c = cases[cid]
print(f"### {cid}: '{c['title']}' level={c['level'] or 'any'} region={c['region'] or 'all'}  ({len(rows)} candidates, showing {min(n,len(pool))})")
for i, r in enumerate(pool[:n]):
    f = r.get('feat') or {}
    tag = lab.get(r['jobId'])
    print(f"{i:2d}|{'*' if tag is not None else ' '}{r['headline'][:46]}|{(r['employer'] or '')[:16]}|{(f.get('group') or '-')[:30]}|{f.get('ssyk') or '-'}|{(r['location'] or '').split(',')[0][:10]}")
