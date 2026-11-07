#!/usr/bin/env python3
"""Guarded 0.15.2 -> 0.15.3 integration, presentation only."""
from pathlib import Path
import json
ROOT = Path(__file__).resolve().parents[1]
def once(text, before, after):
    if text.count(before) != 1:
        raise RuntimeError(f'Expected one integration marker: {before[:100]!r}')
    return text.replace(before, after, 1)
def main():
    updates = {}
    p = ROOT / 'src/fps/grenade-assist.mjs'; s = p.read_text()
    if 'new TrajectoryCache()' not in s:
        s = "import { TrajectoryCache } from './trajectory-cache.mjs';\n" + s
        s = once(s, 'GRENADE_TYPES, predictGrenade, grenadeThreat', 'GRENADE_TYPES, grenadeThreat')
        s = once(s, 'this.renderer=renderer;this.settings=settings;', 'this.renderer=renderer;this.settings=settings;this.predictionCache=new TrajectoryCache();')
        s = once(s, 'this.arrow=this.danger.querySelector(\'i\');', "this.arrow=this.danger.querySelector('i');\n    this.noteTitle=this.note.querySelector('strong');this.noteDetail=this.note.querySelector('span');\n    this.dangerTitle=this.danger.querySelector('strong');this.dangerDetail=this.danger.querySelector('span');")
        s = once(s, '  reset() {\n', '  reset() {\n    this.predictionCache.clear();\n')
        s = once(s, 'this.group.visible=false;this.note.hidden=true;this.preview=null;this.weapon=null;', 'this.group.visible=false;this.note.hidden=true;this.preview=null;this.weapon=null;this.predictionCache.clear();')
        s = once(s, '        this.pathAt=time;this.weapon=p.weapon;\n        this.preview=predictGrenade(p,game.config,game.world);\n        if (this.preview) this.drawPreview(p);', '''        if(time<this.pathAt)this.predictionCache.clear();
        this.pathAt=time;this.weapon=p.weapon;
        const previous=this.preview;
        this.preview=this.predictionCache.read(p,game.config,game.world);
        if (this.preview && this.preview!==previous) this.drawPreview(p);''')
        # Keep construction-time selectors, remove only repeated update selectors.
        s = once(s, "this.text(this.danger.querySelector('strong'),", 'this.text(this.dangerTitle,')
        s = once(s, "this.text(this.danger.querySelector('span'),", 'this.text(this.dangerDetail,')
        s = once(s, "this.text(this.note.querySelector('strong'),", 'this.text(this.noteTitle,')
        s = once(s, "this.text(this.note.querySelector('span'),", 'this.text(this.noteDetail,')
        s = once(s, 'this.positions.set([q.x,q.y,q.z],i*3);this.distances[i]=distance;', 'const offset=i*3;this.positions[offset]=q.x;this.positions[offset+1]=q.y;this.positions[offset+2]=q.z;this.distances[i]=distance;')
        s = once(s, '  dispose() {\n', '  dispose() {\n    this.predictionCache.clear();\n')
        updates[p] = s
    p = ROOT / 'src/fps/render-engine.mjs'; s = p.read_text()
    if 'new FrameTimeWindow()' not in s:
        s = "import { FrameTimeWindow } from './frame-time-window.mjs';\n" + s
        s = once(s, 'this.frameTimes=[];this.stats=', 'this.frameTimes=new FrameTimeWindow();this.stats=')
        s = once(s, 'this.frameTimes.push(now-this.lastFrame);this.lastFrame=now;if(this.frameTimes.length>120)this.frameTimes.shift();this.stats.fps=Math.round(1000/(this.frameTimes.reduce((a,b)=>a+b,0)/this.frameTimes.length));', 'this.stats.fps=this.frameTimes.push(now-this.lastFrame);this.lastFrame=now;')
        s = once(s, "this.lastWeapon='';this.frameTimes=[];this.lastFrame=performance.now();", "this.lastWeapon='';this.frameTimes.clear();this.lastFrame=performance.now();")
        updates[p] = s
    p = ROOT / 'fps/index.html'; s = p.read_text()
    if 'VERSION 0.15.2' in s: updates[p] = once(s, 'VERSION 0.15.2', 'VERSION 0.15.3')
    p = ROOT / 'build-info.json'; s = p.read_text()
    if json.loads(s)['gameVersion'] == '0.15.2': updates[p] = once(s, '"gameVersion": "0.15.2"', '"gameVersion": "0.15.3"')
    for path, text in updates.items(): path.write_text(text)
    print('Detail efficiency integrated: exact-input trajectory cache and bounded frame statistics. No Game/physics changes.')
if __name__ == '__main__': main()
