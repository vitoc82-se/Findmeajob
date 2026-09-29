#!/usr/bin/env python3
"""run_personas.py <run> [persona ids...] [--exp]  parse each CV via the live endpoint, then run debug search"""
import json, sys, os, time, urllib.request, concurrent.futures as cf
KEY = open(os.path.expanduser('~/.gstack/projects/vitoc82-se-Findmeajob/eval_key.txt')).read().strip()
BASE = 'https://www.findmeajob.online/api/v1/preview/'
here = os.path.dirname(os.path.abspath(__file__))
name = sys.argv[1]; args = [a for a in sys.argv[2:] if not a.startswith('--')]; exp = '--exp' in sys.argv
personas = [p for p in json.load(open(f'{here}/personas.json')) if not args or p['id'] in args]
out = f'{here}/runs/{name}'; os.makedirs(out, exist_ok=True)
LV = {'junior','mid','senior','lead'}

def post(path, body, hdr=None):
    h = {'content-type':'application/json'}; h.update(hdr or {})
    req = urllib.request.Request(BASE + path, json.dumps(body).encode(), h)
    return json.load(urllib.request.urlopen(req, timeout=170))

def rr_experiments(profile, cv):
    titles = ', '.join(profile['titles'][:4]); skills = ', '.join(profile.get('skills', [])[:12])
    q = {
      'q_summary': f"{titles}. {profile['summary']} Färdigheter: {skills}",
      'q_cv': f"Hitta jobb som passar den här personen:\n{cv[:1800]}",
      'q_target': f"Söker jobb som {titles}. {profile['summary']}",
    }
    ex = []
    for qn, qt in q.items():
        for dm in ('tgd', 'tgdf'):
            ex.append({'name': f'{qn}|{dm}', 'query': qt, 'docMode': dm})
    ex.append({'name': 'q_cv|tgd|lite', 'query': q['q_cv'], 'docMode': 'tgd', 'model': 'rerank-2.5-lite'})
    ex.append({'name': 'q_cv|tgd2', 'query': q['q_cv'], 'docMode': 'tgd2'})
    return ex

def run(p):
    for attempt in range(3):
        try:
            prof = post('parse', {'cvText': p['cv']})['profile']
            lvl = prof.get('seniority') if prof.get('seniority') in LV else ''
            prof['seniority'] = lvl
            body = {'profile': prof, 'titles': prof['titles'], 'regions': [p['region']] if p['region'] else [], 'remote': False, 'country': 'se', 'lang': 'sv', 'pool': 60}
            if exp: body['rrExp'] = rr_experiments(prof, p['cv'])
            t = time.time(); d = post('run', body, {'x-eval-key': KEY}); d['_secs'] = round(time.time() - t, 1); d['_profile'] = prof
            json.dump(d, open(f"{out}/{p['id']}.json", 'w'), ensure_ascii=False)
            return p['id'], len(d.get('debug') or []), prof['titles'][:3], lvl
        except Exception as e:
            err = str(e)[:80]; time.sleep(4)
    return p['id'], -1, err

with cf.ThreadPoolExecutor(3) as ex:
    for r in ex.map(run, personas): print(r, flush=True)
