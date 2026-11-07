#!/usr/bin/env python3
"""Guarded 0.15.1 -> 0.15.2 presentation integration. No Game/physics edits."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
def once(text,before,after):
    if text.count(before)!=1: raise RuntimeError(f'Expected one integration marker: {before[:100]!r}')
    return text.replace(before,after,1)
def main():
    p=ROOT/'src/fps/app.mjs';s=p.read_text()
    if "import { RenderBudget }" not in s:
        s="import { RenderBudget } from './render-budget.mjs';\nimport { MinimapCache } from './minimap-cache.mjs';\n"+s
        s=once(s,"const touchDevice=isTouchDevice();","const touchDevice=isTouchDevice();\nconst renderBudget=new RenderBudget();\nconst minimapCache=new MinimapCache($('minimap'));\nconst minimapPanel=$('minimap').closest('.map-panel');")
        start=s.index('function minimap(){');end=s.index('\nfunction updateHud()',start)
        s=s[:start]+"function minimap(){\n const visible=!document.hidden&&!$('hud').hidden&&!!minimapPanel.getClientRects().length;\n minimapCache.draw(world,game,mapExpanded,visible);\n}\n"+s[end:]
        s=once(s,"$('score-tables').innerHTML=Object.entries(TEAMS).map","setHtml('score-tables',Object.entries(TEAMS).map")
        s=once(s,"</tbody></table>`).join('');}","</tbody></table>`).join(''));}")
        s=once(s,"function frame(now){try{const dt=","function frame(now){try{if(!renderBudget.shouldRender(now,document.hidden,!!modal||game.state.paused)){lastFrame=now;raf=requestAnimationFrame(frame);return;}const dt=")
        s=once(s,'grenadeAssist,focusHud};','grenadeAssist,focusHud,renderBudget,minimapCache};')
        p.write_text(s)
    p=ROOT/'src/fps/render-engine.mjs';s=p.read_text()
    if "import { TracerBatch }" not in s:
        s="import { TracerBatch } from './tracer-batch.mjs';\n"+s
        s=once(s,'this.effects=[];this.combatEffects=new CombatEffects','this.effects=[];this.tracerBatch=new TracerBatch(this.scene);this.combatEffects=new CombatEffects')
        start=s.index("if(e.type==='tracer'&&");end=s.index("if(e.type==='shot'||e.type==='knife')",start)
        s=s[:start]+"if(e.type==='tracer'&&e.from&&e.to&&e.weapon!=='knife')this.tracerBatch.add(e.from,e.to,game.state.time);"+s[end:]
        s=once(s,'this.updateLights(p,t);this.combatEffects.update','this.tracerBatch.update(t);this.updateLights(p,t);this.combatEffects.update')
        s=once(s,'resetTransient(){this.combatEffects.clear();','resetTransient(){this.tracerBatch.clear();this.combatEffects.clear();')
        s=once(s,"dispose(){window.removeEventListener('resize',this.onResize);","dispose(){this.tracerBatch.dispose();window.removeEventListener('resize',this.onResize);")
        p.write_text(s)
    p=ROOT/'fps/index.html';s=p.read_text()
    if 'VERSION 0.15.1' in s:p.write_text(once(s,'VERSION 0.15.1','VERSION 0.15.2'))
    p=ROOT/'build-info.json';s=p.read_text()
    if json.loads(s)['gameVersion']=='0.15.1':p.write_text(once(s,'"gameVersion": "0.15.1"','"gameVersion": "0.15.2"'))
    print('Render efficiency integrated; Game, physics, AI, active cadence and resolution unchanged.')
if __name__=='__main__':main()
