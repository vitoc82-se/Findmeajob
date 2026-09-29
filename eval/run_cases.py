#!/usr/bin/env python3
"""Run the benchmark cases against the live debug endpoint and save the raw candidates.
usage: run_cases.py <run-name> [case-id ...]"""
import json, sys, time, urllib.request, concurrent.futures as cf, os
KEY = open(os.path.expanduser('~/.gstack/projects/vitoc82-se-Findmeajob/eval_key.txt')).read().strip()
URL = 'https://www.findmeajob.online/api/v1/preview/run'
here = os.path.dirname(os.path.abspath(__file__))
name = sys.argv[1]; only = set(sys.argv[2:])
cases = [c for c in json.load(open(f'{here}/cases.json')) if not only or c['id'] in only]
out = f'{here}/runs/{name}'; os.makedirs(out, exist_ok=True)

def run(c):
    body = {"profile":{"titles":[c['title']],"seniority":c['level'],"skills":[],"locations":[],"languages":[],"remotePref":"any","mustHaves":[],"summary":c['title']},
            "titles":[c['title']],"regions":[c['region']] if c['region'] not in ('','remote') else [],"remote":c['region']=='remote',"country":"se","lang":"sv","pool":60}
    req = urllib.request.Request(URL, json.dumps(body).encode(), {'content-type':'application/json','x-eval-key':KEY})
    for attempt in range(3):
        try:
            t=time.time(); d = json.load(urllib.request.urlopen(req, timeout=150)); d['_secs']=round(time.time()-t,1)
            json.dump(d, open(f"{out}/{c['id']}.json",'w'), ensure_ascii=False)
            return c['id'], len(d.get('debug') or []), d['_secs']
        except Exception as e:
            err = str(e)[:80]; time.sleep(5)
    return c['id'], -1, err

with cf.ThreadPoolExecutor(3) as ex:
    for r in ex.map(run, cases): print(r, flush=True)
