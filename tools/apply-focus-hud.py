#!/usr/bin/env python3
"""One-time guarded HUD integration; simulation, renderer and map stay unchanged."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
path = root / 'src/fps/app.mjs'
s = path.read_text(encoding='utf-8')
if "from './focus-hud.mjs'" in s:
    print('Focus HUD already integrated; leaving source untouched.')
    raise SystemExit(0)

def replace(before, after, label):
    global s
    if s.count(before) != 1:
        raise RuntimeError(f'{label}: expected one occurrence, got {s.count(before)}')
    s = s.replace(before, after)

s = "import { FocusHud, focusHudSettings } from './focus-hud.mjs';\n" + s
replace('let tactical=null,grenadeAssist=null;', 'let tactical=null,grenadeAssist=null,focusHud=null;', 'controller declaration')
replace('const combatHud=new CombatHUD(settings);', '''const combatHud=new CombatHUD(settings);
focusHud=new FocusHud({settings,mobile,getGame:()=>game,getModal:()=>modal,onMap:toggleMap,onStats:showPause});
function toggleMap(){
 mapExpanded=!mapExpanded;
 document.documentElement.classList.toggle('hud-map-open',mapExpanded);
 $('minimap').width=mapExpanded?448:224;$('minimap').height=mapExpanded?316:158;
 if(game?.player)minimap();
}''', 'controller creation')
replace("tactical.settingsMarkup()+grenadeSettingsMarkup(settings)", "tactical.settingsMarkup()+grenadeSettingsMarkup(settings)+focusHudSettings(settings)", 'preferences')
replace("function saveSettings(){try{", "function saveSettings(){focusHud?.applyMode();try{", 'live layout preference')
replace("mobile.clear();tactical?.reset();grenadeAssist?.reset();", "mobile.clear();tactical?.reset();grenadeAssist?.reset();focusHud?.reset();", 'modal cleanup')
replace("minimap();setText('perf',`${renderer.stats.fps} FPS`);", "minimap();setText('perf',`${renderer.stats.fps} FPS`);focusHud.update();", 'HUD update')
replace("if(mobile.enabled&&settings.mobileAutoFire&&!touch?.fire&&game.phase==='active'){", "if(mobile.enabled&&settings.mobileAutoFire&&!focusHud?.expanded&&!touch?.fire&&game.phase==='active'){", 'do not auto-shoot while choosing utility action')
replace("if(e.code==='KeyM'){mapExpanded=!mapExpanded;$('minimap').width=mapExpanded?448:224;$('minimap').height=mapExpanded?316:158;minimap();}", "if(e.code==='KeyM')toggleMap();", 'shared map control')
replace('mobile,recoil,tactical,grenadeAssist};', 'mobile,recoil,tactical,grenadeAssist,focusHud};', 'test handle')
path.write_text(s, encoding='utf-8')
p = root / 'fps/index.html'
html = p.read_text(encoding='utf-8')
old = '<link rel="stylesheet" href="style.css">'
assert html.count(old) == 1
html = html.replace(old, old + '\n  <link rel="stylesheet" href="focus-hud.css">')
assert 'VERSION 0.14.1' in html
html = html.replace('VERSION 0.14.1', 'VERSION 0.15.0')
p.write_text(html, encoding='utf-8')
p = root / 'build-info.json'
info = json.loads(p.read_text(encoding='utf-8'))
info['gameVersion'] = '0.15.0'
p.write_text(json.dumps(info, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Focus HUD integrated; simulation, controls contracts, geometry and Frontline unchanged.')
