"""Verify and summarize paired native door timing runs. Pass original and candidate directories."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys


def load_reducer(path):
    spec = importlib.util.spec_from_file_location(path.parent.name + '_reducer', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


here = Path(__file__).resolve().parent
latency = load_reducer(here / 'summarize.py')
baseline = load_reducer(here.parents[2] / 'baseline/performance/summarize.py')
original_doors = '33a6ee0b2a8dd7bd962c66b3cd73aed6da94192a'


def timings(values):
    ordered = sorted(values)
    return {'n': len(ordered), **{name: round(ordered[math.ceil(len(ordered) * q) - 1], 2)
            for name, q in [('p50', .5), ('p95', .95), ('p99', .99), ('max', 1)]},
            'over50': sum(x > 50 for x in ordered), 'over100': sum(x > 100 for x in ordered)}


def presentation(data):
    """Associate the marked submitted frame with actual same-ID compositor feedback."""
    trial = data.get('presentationTrial')
    if trial is None:
        return None
    events = trial['events']
    marks = [e for e in events if e['name'] == 'cs3-rush-submitted']
    if not marks:
        renders = trial['action']['renders']
        max_weight = max(r['weight'] for r in renders)
        assert max_weight <= .02, 'A submitted Rush pose is missing its trace marker'
        return {'matchedFrame': False, 'reason': 'The additional gesture produced no Rush pose.',
                'observedRenderFrames': len(renders), 'maxRushWeight': round(max_weight, 4)}
    mark, = marks
    frames = sorted((e for e in events if e['name'] == 'AnimationFrame' and
                     e['ph'] in ('b', 'e') and e['tid'] == mark['tid'] and e['pid'] == mark['pid']),
                    key=lambda e: e['ts'])
    i = next(i for i, e in enumerate(frames) if e['ts'] > mark['ts'])
    start, end = frames[i - 1:i + 1]
    assert start['ph'] == 'b' and end['ph'] == 'e' and start['id2'] == end['id2']
    feedback = [e for e in events if e['name'] == 'AnimationFrame::Presentation'
                and e.get('id') == start['id'] and e['id2'] == start['id2'] and e['pid'] == start['pid']]
    if not feedback:
        return {'matchedFrame': False}
    result, = feedback
    action = trial['action']
    if data['profile'] == 'touch':
        walking, rush = [e for e in action['events'] if e['type'] == 'touchmove']
    else:
        rush = next(e for e in action['events'] if e['type'] == 'keydown' and e['code'] == 'KeyX')
    render = next(r for r in action['renders'] if r['weight'] > .02)
    assert render['begin'] > rush['stamp'] and render['alive'] and render['pose']
    submitted = render['end'] - rush['stamp']
    latency_ms = (result['ts'] - mark['ts']) / 1000
    assert latency_ms >= 0
    return {'matchedFrame': True, 'sourceToSubmittedMs': round(submitted, 2),
            'submittedToPresentedMs': round(latency_ms, 2), 'sourceToPresentedMs': round(submitted + latency_ms, 2)}


def reduce_run(path, condition, profile, repeat):
    d = json.loads(path.read_bytes())
    trace = latency.row(path)
    row = baseline.browser(path)
    assert row['input'] == profile and row['repeat'] == repeat
    assert d['before']['sha'] == d['after']['sha'] and d['doorSource'] == condition
    r = row['identity']
    assert r['actors'] == 10 and r['map'] == 'lvl-floor5-preppad-20261105'
    assert r['mode'] == 'endless' and r['phase'] == 'active' and r['weapon'] == 'ar47' and r['quality'] == 'low'
    assert all(v == 'throttled=0x0' for v in row['throttle']) and not row['pageErrors']
    actions = row['actions']
    assert actions['aliveSamples'] == actions['observedRenderFrames'] and actions['travelPathM'] > 0
    assert actions['rushToFirstPoseAbove2PctMs'] > 0 and actions['maxRushBlend'] > .95
    assert all(actions[k] for k in ('fireToFirstAmmoDropRenderMs','fireToAudioCommandMs','reloadToRefilledRenderMs'))
    rendered = d['rushTrace']['renders']
    assert all(frame['world'] and frame['view'] for frame in rendered)
    intervals = [b['begin'] - a['begin'] for a, b in zip(rendered,rendered[1:])]
    steps = [s['end'] - s['at'] for s in d['rushTrace']['activities'] if s['type'] == 'gameUpdate']
    row.update(doorSource=d['doorSource'], rawSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
               renderTargets=d['rushTrace']['passDraws'],
               actionFrameIntervalMs=timings(intervals), localSoloUpdateMs=timings(steps),
               samePixelRatio=d['pacingAtSamePixelRatio'], additionalTracedPresentation=presentation(d),
               actionTrace={k:trace[k] for k in (
                   'pointerOrKeyCallback', 'gameRead', 'firstMovedStep', 'worldSubmit', 'weaponSubmit',
                   'firstMovedRenderEnd', 'presentation', 'firstWeight', 'actionBuffer', 'actionPixelRatio',
                   'weaponYAndRoll', 'unshiftedRendersAfterInput')})
    for group in row['samePixelRatio'].values():
        group['drawCalls'] = {key:v for key,v in group['drawCalls'].items() if not key.startswith('over')}
    return row


def fresh_presentation(path, condition, profile):
    data = json.loads(path.read_bytes())
    assert data['presentationScenario'] == 'fresh spawn, primary action with Chromium tracing'
    result = reduce_run(path, condition, profile, 0)
    r = result['additionalTracedPresentation']
    assert r and r['matchedFrame'], 'Fresh-spawn first Rush needs actual compositor feedback'
    assert abs(r['sourceToSubmittedMs'] - result['actionTrace']['firstMovedRenderEnd']) < .5
    return {**{k: result[k] for k in ('git','stamp','rawSha256','doorSource','browser','device',
                                      'node','input','temperatureC','throttle','identity','actions','actionTrace')},
            'scenario': data['presentationScenario'], 'tracedFirstRush': r}


if __name__ == '__main__':
    fresh = sys.argv[1:2] == ['--fresh-presentation']
    original, candidate = map(Path, sys.argv[2:] if fresh else sys.argv[1:])
    cases = ((original,original_doors),(candidate,'checkout'))
    if fresh:
        runs = [fresh_presentation(directory / f'candidate-{profile}-0.json',condition,profile)
                for directory,condition in cases for profile in ('touch','desktop')]
    else:
        runs = [reduce_run(directory / f'candidate-{profile}-{i}.json',condition,profile,i)
                for directory,condition in cases for profile in ('touch','desktop') for i in range(3)]
    assert len({(r['git'],r['browser'],r['device'],r['node']) for r in runs}) == 1
    print(json.dumps(runs, indent=2))
