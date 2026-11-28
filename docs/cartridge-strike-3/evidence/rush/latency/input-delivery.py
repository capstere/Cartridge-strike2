"""Measure main-thread occupancy before the scored input callback in the saved Pi runs."""
import argparse
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def input_pair(trace, profile):
    events = trace['events']
    if profile == 'desktop':
        key, = [e for e in events if e['type'] == 'keydown' and e['code'] == 'KeyX']
        return key, key
    walking, rush = [e for e in events if e['type'] == 'touchmove']
    assert walking['y'] > rush['y']
    pointer, = [e for e in events if e['type'] == 'pointermove' and
                e['stamp'] == rush['stamp'] and abs(e['y'] - rush['y']) < 1 and abs(e['x'] - rush['x']) < 1]
    return pointer, rush


def clipped(intervals, start, stop):
    return sorted((max(a, start), min(b, stop)) for a, b in intervals if a < stop and b > start)


def duration(intervals):
    return sum(b - a for a, b in intervals)


def measure(data, reference):
    trace = data['rushTrace']
    pointer, companion = input_pair(trace, data['profile'])
    start, stop = pointer['stamp'], pointer['delivered']
    assert stop >= start and abs(stop - start - reference['actionTrace']['pointerOrKeyCallback']) < .02
    draws = trace['renders']
    updates = [a for a in trace['activities'] if a['type'] == 'gameUpdate']
    all_draws = clipped([(r['begin'], r['end']) for r in draws], start, stop)
    world = clipped([r['world'] for r in draws], start, stop)
    simulation = clipped([(u['at'], u['end']) for u in updates], start, stop)
    intervals = sorted(all_draws + simulation)
    assert all(a <= b for a, b in intervals)
    assert all(previous[1] <= current[0] for previous, current in zip(intervals, intervals[1:]))
    assert all(r['weight'] <= .02 for r in draws if r['begin'] < stop and r['end'] > start)
    samples = [u['pending'] for u in updates if start <= u['at'] < stop]
    assert all(isinstance(sample, bool) for sample in samples)
    return {
        'profile': data['profile'],
        'repeat': data['repeat'],
        'sourceToCallbackMs': round(stop - start, 1),
        'touchMinusPointerMs': round(companion['delivered'] - stop, 1) if data['profile'] == 'touch' else None,
        'unshiftedRenderIntervalsMs': [[round(a - start, 1), round(b - start, 1)] for a, b in all_draws],
        'renderMs': round(duration(all_draws), 1),
        'worldWithinRenderMs': round(duration(world), 1),
        'gameUpdateMs': round(duration(simulation), 1),
        'outsideBothMs': round(stop - start - duration(intervals), 1),
        'isInputPendingAtUpdateBegins': samples,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('presentation_root', type=Path, help='Private original/ and candidate/ traced directories')
    parser.add_argument('timing_root', type=Path, help='Private original/ and candidate/ untraced directories')
    args = parser.parse_args()
    output = []
    for summary, root, traced in [('door-presentation.json', args.presentation_root, True),
                                  ('door-timing.json', args.timing_root, False)]:
        for ref in json.loads((HERE / summary).read_bytes()):
            doors = 'candidate' if ref['doorSource'] == 'checkout' else 'original'
            name = f"candidate-{ref['input']}-{ref.get('repeat', 0)}.json"
            raw = (root / doors / name).read_bytes()
            assert hashlib.sha256(raw).hexdigest() == ref['rawSha256'], f'Unexpected raw run {doors}/{name}'
            data = json.loads(raw)
            if traced:
                names = {e['name'] for e in data['presentationTrial']['events']}
                assert names == {'cs3-rush-submitted', 'AnimationFrame', 'AnimationFrame::Presentation'}
            output.append({'freshCompositorTrace': traced, 'doorGeometry': doors, **measure(data, ref)})
    print(json.dumps(output, indent=2))


if __name__ == '__main__':
    main()
