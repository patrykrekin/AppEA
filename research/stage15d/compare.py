"""Offline descriptive audit. No model fitting, network or production writes."""
import csv
import hashlib
import json
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
P = json.loads((HERE / 'protocol.json').read_text())


def closest(points, target, tolerance, before=None):
    candidates = [p for p in points if abs(p[0]-target) <= tolerance
                  and (before is None or p[0] < before)]
    return min(candidates, key=lambda p: (abs(p[0]-target), p[0]), default=None)


def peer_stats(rows, own, field):
    peers = [r[field] for r in rows if r['key'] != own['key']
             and r['rating'] == own['rating'] and r[field] is not None]
    return {'n': len(peers), 'median': median(peers) if len(peers) >= P['minimumPeers'] else None,
            'min': min(peers, default=None), 'max': max(peers, default=None)}


def run(history, snapshot):
    t = snapshot['czasOdczytuStart']
    output = {}
    for side in ['ps', 'pc']:
        rows = []
        for r in snapshot[side]:
            key = f'{r[0]}|{r[1]}|{r[17]}'
            entry = history[side].get(key)
            points = entry['punkty'] if entry else []
            if entry:
                assert (entry['rating'], entry['id'], entry['nazwa']) == (r[0], r[1], r[17])
            prev = 0
            for at, price in points:
                step = 50 if price <= 1000 else 100 if price <= 10000 else 250 if price <= 50000 else 500 if price <= 100000 else 1000
                assert isinstance(at, int) and prev < at <= history['at']
                assert isinstance(price, int) and price > 0 and price % step == 0
                prev = at
            prior = closest(points, t-P['priorHorizonSeconds'], P['toleranceSeconds'], before=t)
            post = closest(points, t+P['posteriorHorizonSeconds'], P['toleranceSeconds'])
            for point in [prior, post]:
                if point:
                    assert any(m[0] == point[0] and r[0] in m[1] for m in history['migawki'][side])
            rows.append({'key': key, 'rating': r[0], 'investment': bool(r[14]),
                         'fast': bool(r[13]), 'inReach': r[2] <= r[16] if r[14] else None,
                         'price': r[2], 'priorAt': prior[0] if prior else None,
                         'priorPrice': prior[1] if prior else None,
                         'postAt': post[0] if post else None, 'postPrice': post[1] if post else None,
                         'priorReturnPct': 100*(r[2]/prior[1]-1) if prior else None,
                         'postReturnPct': 100*(post[1]/r[2]-1) if post else None,
                         'dailyEmaPremiumPct': 100*(r[7]/r[2]-1) if r[7] else None,
                         'fastEmaPremiumPct': 100*(r[3]/r[2]-1) if r[3] else None})
        assert len({r['key'] for r in rows}) == len(rows)
        for row in rows:
            for period, field in [('prior', 'priorReturnPct'), ('post', 'postReturnPct')]:
                peers = peer_stats(rows, row, field)
                row[period+'PeersN'] = peers['n']
                row[period+'PeersMedianPct'] = peers['median']
                row[period+'PeersMinPct'] = peers['min']
                row[period+'PeersMaxPct'] = peers['max']
                row[period+'ExcessPp'] = row[field]-peers['median'] if row[field] is not None and peers['median'] is not None else None
        output[side] = rows
    return output


def main():
    raw = (ROOT / 'historia-kart.json').read_bytes()
    blob = hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
    assert blob == P['sourceHistoryBlob']
    snapshot_raw = (ROOT / P['decisionSnapshot']).read_bytes()
    assert hashlib.sha256(snapshot_raw).hexdigest() == 'b5c5362f9be8da99d9f48de9e2f4aa89c7791f73853a22f4e3ae60a0e16f3b6e'
    history = json.loads(raw)
    snapshot = json.loads(snapshot_raw)['migawka']
    rows = run(history, snapshot)
    # Causal check: delete all future prices, then recompute. Prior metrics must stay identical.
    past = json.loads(raw)
    for side in ['ps', 'pc']:
        for v in past[side].values():
            v['punkty'] = [p for p in v['punkty'] if p[0] < snapshot['czasOdczytuStart']]
    past_rows = run(past, snapshot)
    prior_fields = ['priorAt', 'priorPrice', 'priorReturnPct', 'priorPeersN', 'priorPeersMedianPct', 'priorExcessPp']
    for side in rows:
        for a, b in zip(rows[side], past_rows[side]):
            assert all(a[f] == b[f] for f in prior_fields)
    assert closest([[90, 1], [110, 2]], 100, 10) == [90, 1]
    assert closest([[101, 1]], 101, 10, before=100) is None
    assert closest([[89, 1]], 100, 10) is None
    toy = [{'key': 'a', 'rating': 89, 'x': 1000}, {'key': 'b', 'rating': 89, 'x': 1},
           {'key': 'c', 'rating': 89, 'x': 2}, {'key': 'd', 'rating': 89, 'x': 3},
           {'key': 'e', 'rating': 88, 'x': -1000}]
    assert peer_stats(toy, toy[0], 'x')['median'] == 2  # no self or other-rating contamination
    assert peer_stats(toy[:3], toy[0], 'x')['median'] is None
    summary = {'protocol': P, 'origin': snapshot['czasOdczytuStart'], 'platforms': {}}
    for side, group in rows.items():
        coverage = {}
        for rating in range(83, 90):
            a = [r for r in group if r['rating'] == rating]
            coverage[rating] = {'cohort': len(a), 'priorAvailable': sum(r['priorPrice'] is not None for r in a),
                                'postAvailable': sum(r['postPrice'] is not None for r in a)}
        selected = [r for r in group if r['investment']]
        # Exploratory robustness after the primary result: drop each peer in turn,
        # not just the extreme observation; never modify source data or primary medians.
        sensitivity = []
        for own in selected:
            peers = [r['postReturnPct'] for r in group if r['key'] != own['key']
                     and r['rating'] == own['rating'] and r['postReturnPct'] is not None]
            vals = [own['postReturnPct']-median(peers[:i]+peers[i+1:])
                    for i in range(len(peers)) if own['postReturnPct'] is not None
                    and len(peers)-1 >= P['minimumPeers']]
            sensitivity.append({'key': own['key'], 'minExcessPp': min(vals, default=None),
                                'maxExcessPp': max(vals, default=None)})
        summary['platforms'][side] = {'coverageByRating': coverage, 'investments': selected,
            'exploratorySinglePeerRemoval': sensitivity,
            'selectedPriorDown': sum(r['priorReturnPct'] is not None and r['priorReturnPct'] < 0 for r in selected),
            'selectedPostExcessNegative': sum(r['postExcessPp'] is not None and r['postExcessPp'] < 0 for r in selected)}
    with (HERE / 'rows.csv').open('w', newline='') as f:
        writer = csv.DictWriter(f, ['platform']+list(rows['ps'][0]))
        writer.writeheader()
        for side, group in rows.items():
            writer.writerows({'platform': side, **r} for r in group)
    (HERE / 'result.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n')
    assert (ROOT / 'historia-kart.json').read_bytes() == raw
    assert (ROOT / P['decisionSnapshot']).read_bytes() == snapshot_raw
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print('PASS: frozen hashes, identity, grid, chronology, rating metadata, no-look-ahead, leave-one-out, tolerance guards, unchanged inputs')


if __name__ == '__main__':
    main()
