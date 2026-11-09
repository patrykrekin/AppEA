"""Read-only input audit; writes only research/stage15e outputs."""
import csv
import hashlib
import json
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
P = json.loads((HERE/'protocol.json').read_text())


def evaluate(points, rating_times, t, horizon, tolerance, target, asof, gap_limit):
    end = t+horizon
    available = [p for p in points if p[0] <= asof]
    candidates = [p for p in available if abs(p[0]-end) <= tolerance]
    endpoint = min(candidates, key=lambda p: (abs(p[0]-end), p[0]), default=None)
    closed = asof >= end+tolerance
    valid_endpoint_samples = [at for at in rating_times if abs(at-end) <= tolerance and at <= asof]
    status = 'pending' if not closed else 'observed' if endpoint else 'absent-in-sampled-slice' if valid_endpoint_samples else 'unobserved'
    path = [p for p in available if t < p[0] <= end]
    hits = [p for p in path if target is not None and p[1] >= target]
    times = [t]+[p[0] for p in path]+[min(end, asof)]
    gaps = [b-a for a,b in zip(times,times[1:])]
    samples = [at for at in rating_times if t < at <= min(end, asof)]
    seen = {p[0] for p in path}
    return {'endpointStatus': status, 'endpointAt': endpoint[0] if endpoint else None,
            'endpointPrice': endpoint[1] if endpoint else None,
            'endpointOffsetSeconds': endpoint[0]-end if endpoint else None,
            'endpointAtTarget': endpoint[1] >= target if endpoint and target is not None and closed else None,
            'pathPrices': len(path), 'validRatingSamples': len(samples),
            'samplesWithoutCard': sum(at not in seen for at in samples),
            'maxGapSeconds': max(gaps, default=horizon), 'gapsOverLimit': sum(g > gap_limit for g in gaps),
            'observedMinPrice': min((p[1] for p in path), default=None),
            'observedMaxPrice': max((p[1] for p in path), default=None),
            'targetObservationStatus': None if target is None else 'observed-at-or-above' if hits else 'pending-no-observed-target' if not closed else 'not-observed-in-samples',
            'targetObservations': len(hits) if target is not None else None,
            'firstObservedTargetAt': hits[0][0] if hits else None,
            'firstObservedTargetSeconds': hits[0][0]-t if hits else None}


def checks():
    # An endpoint inside the tolerance tail must not be a strict-horizon path hit.
    e = evaluate([[111, 200]], [111], 10, 100, 5, 150, 120, 20)
    assert e['endpointAtTarget'] is True and e['targetObservations'] == 0
    assert e['pathPrices'] == 0 and e['maxGapSeconds'] == 100
    # Exact horizon is included; origin is excluded; closest tie picks earlier.
    e = evaluate([[10, 200], [105, 100], [110, 150], [115, 160]], [10,105,110,115], 10, 100, 5, 150, 120, 20)
    assert e['targetObservations'] == 1 and e['firstObservedTargetAt'] == 110
    e = evaluate([[105, 100], [115, 200]], [105,115], 10, 100, 5, 150, 120, 20)
    assert e['endpointAt'] == 105 and e['endpointAtTarget'] is False
    e = evaluate([], [100], 10, 100, 10, 150, 130, 20)
    assert e['endpointStatus'] == 'absent-in-sampled-slice' and e['endpointPrice'] is None
    e = evaluate([[111, 200]], [111], 10, 100, 10, 150, 105, 20)
    assert e['endpointStatus'] == 'pending' and e['endpointAt'] is None
    e = evaluate([], [], 10, 100, 5, None, 120, 20)
    assert e['endpointStatus'] == 'unobserved' and e['targetObservations'] is None


def main():
    checks()
    raw = (ROOT/'historia-kart.json').read_bytes()
    blob = hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
    assert blob == P['historyBlob']
    snap_raw = (ROOT/'research/stage15b/input/shadow-stage8.json').read_bytes()
    assert hashlib.sha256(snap_raw).hexdigest() == P['snapshotSha256']
    h = json.loads(raw)
    s = json.loads(snap_raw)['migawka']
    t = s['czasOdczytuStart']
    assert h['at'] >= t+P['horizonSeconds']+P['endpointToleranceSeconds']
    rows = []
    out = {'protocol': P, 'origin': t, 'historyAt': h['at'], 'platforms': {}}
    for side in ['ps', 'pc']:
        snaps = h['migawki'][side]
        assert all(a[0] < b[0] for a,b in zip(snaps,snaps[1:]))
        seen_keys = set()
        for r in s[side]:
            key = f'{r[0]}|{r[1]}|{r[17]}'
            assert key not in seen_keys
            seen_keys.add(key)
            w = h[side].get(key)
            points = w['punkty'] if w else []
            if w:
                assert (w['rating'],w['id'],w['nazwa']) == (r[0],r[1],r[17])
            ratings = [m[0] for m in snaps if r[0] in m[1]]
            rating_set = set(ratings)
            prev = 0
            for at,price in points:
                step = 50 if price <= 1000 else 100 if price <= 10000 else 250 if price <= 50000 else 500 if price <= 100000 else 1000
                assert isinstance(at,int) and prev < at <= h['at']
                assert isinstance(price,int) and price > 0 and price % step == 0
                assert at in rating_set
                prev = at
            target = r[15] if r[14] else None
            if target is not None:
                assert target > r[2] and r[16] > 0
            x = evaluate(points,ratings,t,P['horizonSeconds'],P['endpointToleranceSeconds'],target,h['at'],P['largeGapSeconds'])
            row = {'platform':side, 'key':key, 'rating':r[0], 'investment':bool(r[14]),
                   'fast':bool(r[13]), 'inReach':r[2] <= r[16] if r[14] else None,
                   'originPrice':r[2], 'target':target, 'buyLimit':r[16] if r[14] else None, **x}
            row['endpointChangePct'] = 100*(x['endpointPrice']/r[2]-1) if x['endpointStatus'] == 'observed' else None
            row['conditionalNetReturnPct'] = 100*(0.95*x['endpointPrice']/r[2]-1) if x['endpointStatus'] == 'observed' else None
            rows.append(row)
        a = [r for r in rows if r['platform'] == side]
        summary = {}
        for name, group in [('all',a),('investments',[r for r in a if r['investment']]),
                            ('investmentsInReach',[r for r in a if r['investment'] and r['inReach']]),
                            ('fast',[r for r in a if r['fast']])]:
            obs = [r for r in group if r['endpointStatus'] == 'observed']
            summary[name] = {'n':len(group), 'endpointObserved':len(obs),
                'endpointAbsentInSlice':sum(r['endpointStatus']=='absent-in-sampled-slice' for r in group),
                'endpointUnobserved':sum(r['endpointStatus']=='unobserved' for r in group),
                'targetObservedInPath':sum(r['targetObservationStatus']=='observed-at-or-above' for r in group),
                'endpointAtTarget':sum(r['endpointAtTarget'] is True for r in group),
                'medianEndpointChangePct':median(r['endpointChangePct'] for r in obs) if obs else None}
        out['platforms'][side] = {'summary':summary, 'investments':[r for r in a if r['investment']]}
    assert len(rows) == 154
    with (HERE/'rows.csv').open('w',newline='') as f:
        writer = csv.DictWriter(f,list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    (HERE/'result.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    assert (ROOT/'historia-kart.json').read_bytes() == raw
    assert (ROOT/'research/stage15b/input/shadow-stage8.json').read_bytes() == snap_raw
    print(json.dumps(out,ensure_ascii=False,indent=2))
    print('PASS: frozen inputs, identities, chronologies, price grid, rating metadata, endpoint/path boundary tests, missing/pending tests, 154 rows, no input mutation')


if __name__ == '__main__':
    main()
