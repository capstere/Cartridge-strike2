"""Reduce a native trace to the one physical Rush gesture used by compare.cjs."""
import json
import sys
from pathlib import Path

def row(path):
    data = json.loads(Path(path).read_text())
    if data['status'] != 'measured':
        raise ValueError(str(path) + ' did not finish')
    trace = data['rushTrace']
    candidate = data['kind'] == 'candidate'
    desktop = data['profile'] == 'desktop'
    events = trace['events']
    if desktop:
        key = 'KeyX' if candidate else 'ShiftLeft'
        event = next(e for e in events if e['type'] == 'keydown' and e['code'] == key)
        pointer = event
        raw = None
    else:
        moves = [e for e in events if e['type'] == 'touchmove']
        assert len(moves) == 2, 'Expected walking move, then crossing the Rush ring'
        event = moves[-1]
        def corresponding(kind):
            return next((e for e in events if e['type'] == kind and abs(e['y'] - event['y']) < 1 and abs(e['stamp']-event['stamp'])<8),None)
        pointer = corresponding('pointermove')
        raw = corresponding('pointerrawupdate')
        assert pointer, 'Missing real stick pointer move'
    origin = event['stamp']
    steps = [s for s in trace['steps'] if s['end'] >= origin]
    step = next(s for s in steps if s['weight'] > .02 and (s['sprint'] or s.get('active')))
    rendered = next(r for r in trace['renders'] if r['begin'] >= step['begin'] and r['weight'] > .02)
    assert rendered['alive'] and rendered['pose']
    handle = next((a for a in trace['activities'] if a['type'] == 'gameUpdate' and a['sprint'] and a['at']>=origin),None)
    native = next((c for c in trace['compositor'] if c['render'] <= rendered['begin'] and c['end'] >= rendered['end']-.5),None)
    ms = lambda t: round(t-origin,2) if t is not None else None
    span = lambda pair: [ms(t) for t in pair] if pair else None
    return dict(build=data['before']['sha'],game=data['kind'],profile=data['profile'],repeat=data['repeat'],
        cache=data['cache'],at=data['stamp'],browser=data['version'],map=data['identity']['map'],buffer=data['identity']['buffer'],
        mode=data['identity']['mode'],quality=data['identity']['quality'],actors=data['identity']['actors'],
        localWeapon=data['identity']['weapon'],residents=data['identity']['residents'],thermalC=[data['before']['thermalC'],data['after']['thermalC']],
        throttle=[data['before']['throttled'],data['after']['throttled']],frameMs=data['frameIntervalMs'],renderMs=data['renderSubmissionMs'],
        draws=data['drawCalls'],tris=data['triangles'],census=trace['drawCensus'],
        rawCallback=ms(raw['delivered']) if raw else None, pointerOrKeyCallback=ms(pointer['delivered']),
        touchOrKeyCallback=ms(event['delivered']), gameRead=ms(handle['at']) if handle else None,
        firstMovedStep=ms(step['end']),firstMovedRenderBegin=ms(rendered['begin']),worldSubmit=span(rendered.get('world')),
        weaponSubmit=span(rendered.get('view')),firstMovedRenderEnd=ms(rendered['end']),
        presentation=ms(native['present']) if native and native['present'] else None,
        firstWeight=round(rendered['weight'],4),weaponYAndRoll=[round(x,5) for x in rendered['pose']],
        unshiftedRendersAfterInput=sum(r['end'] >= origin and r['end'] <= rendered['end'] and r['weight']<=.02 for r in trace['renders']))
if __name__ == '__main__':
    print(json.dumps([row(p) for p in sys.argv[1:]], indent=2))
