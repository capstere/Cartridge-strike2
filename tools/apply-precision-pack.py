#!/usr/bin/env python3
"""One-time, fail-closed integration patch for Cartridge Strike 0.14.0.
Run by the feature-build workflow. New modules are maintained as normal source.
Every replacement must match exactly once; never rewrite Frontline or geometry.
"""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
def read(name): return (ROOT / name).read_text(encoding='utf-8')
def write(name, data):
    path = ROOT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data, encoding='utf-8')
def once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError(f'Expected one match, got {text.count(old)}: {old[:150]!r}')
    return text.replace(old, new)

app = read('src/fps/app.mjs')
if "import { TacticalControls }" in app:
    print('Precision integration already applied; source files are authoritative.')
    raise SystemExit(0)
app = once(app, "import { PlayerRecoil } from './riposte-recoil.mjs';", "import { PlayerRecoil } from './riposte-recoil.mjs';\nimport { TacticalControls } from './tactical-controls.mjs';")
app = once(app, 'const mobile=new MobileControls({', 'let tactical=null;\nconst mobile=new MobileControls({')
app = once(app, 'const k=settings.sensitivity*2.15;const before=pitch;', 'const k=settings.sensitivity*2.15*(tactical?.lookScale(true,yaw,pitch)??1);const before=pitch;')
app = once(app, "else if(action==='weapon')game.select('last');", "else if(action==='weapon')tactical.cycleWeapon();")
app = once(app, 'mobile.setAutoFire(settings.mobileAutoFire);\nconst combatHud=', '''mobile.setAutoFire(settings.mobileAutoFire);
tactical=new TacticalControls({settings,mobile,getGame:()=>game,getModal:()=>modal,
  isInteracting:()=>keys.has('KeyE')||mobile.state.interact,onAimChange:resetAutoAim});
const combatHud=''')
app = once(app, "$(target).querySelectorAll('[data-setting]').forEach", "$(target).insertAdjacentHTML('beforeend',tactical.settingsMarkup());\n$(target).querySelectorAll('[data-setting]').forEach")
app = once(app, 'function clearInput(){keys.clear();fire=false;mobile.clear();', 'function clearInput(){keys.clear();fire=false;mobile.clear();tactical?.reset();')
app = once(app, 'lastFrame=now;\n if(!modal', 'lastFrame=now;\n tactical.update(dt);\n if(!modal')
app = once(app, 'consumeEvents();renderer.render(game,viewActor(),dt);const p=viewActor();', 'consumeEvents();tactical.render(renderer);renderer.render(game,viewActor(),dt);const p=viewActor();')
app = once(app, "autoFire=game.player.weapon!=='sniper'||game.state.time-autoTargetSince>=.26;", "autoFire=game.player.weapon!=='sniper'||(game.player.aimAmount>.9&&game.state.time-autoTargetSince>=.26);")
app = once(app, 'yaw-=e.movementX*settings.sensitivity;const before=pitch;pitch=Math.max(-1.49,Math.min(1.49,pitch-e.movementY*settings.sensitivity));', 'const k=settings.sensitivity*tactical.lookScale(false,yaw,pitch);yaw-=e.movementX*k;const before=pitch;pitch=Math.max(-1.49,Math.min(1.49,pitch-e.movementY*k));')
app = once(app, 'step(controls=null,dt=1/60){game.update(dt,controls??input(dt));', 'step(controls=null,dt=1/60){tactical.update(dt);game.update(dt,controls??input(dt));')
app = once(app, 'consumeEvents();renderer.render(game,viewActor(),dt);updateHud();return this.snapshot();', 'consumeEvents();tactical.render(renderer);renderer.render(game,viewActor(),dt);updateHud();return this.snapshot();')
app = once(app, 'render(){renderer.render(game,viewActor(),1/60);updateHud();}', 'render(){tactical.render(renderer);renderer.render(game,viewActor(),1/60);updateHud();}')
app = once(app, 'get modal(){return modal;},mobile,recoil};', 'get modal(){return modal;},mobile,recoil,tactical};')
write('src/fps/app.mjs', app)

game = read('src/fps/game.mjs')
game = "import { shotSpread } from './tactical-rules.mjs';\n" + game
game = once(game, "const origin = eye(actor), spread = (actor.moving > .3 ? w.movingSpread : w.spread) + actor.recoil * .18 + actor.flash * .12;", "const origin = eye(actor), spread = shotSpread(actor, w);")
write('src/fps/game.mjs', game)

rec = read('src/fps/riposte-recoil.mjs')
rec = once(rec, 'let mult = k.mul * (actor.crouching ? RECOIL.crouch : 1) * (RECOIL.input[device] || 1);', 'let mult = k.mul * lerp(1, .66, clamp(actor.aimAmount || 0, 0, 1)) * (actor.crouching ? RECOIL.crouch : 1) * (RECOIL.input[device] || 1);')
write('src/fps/riposte-recoil.mjs', rec)

engine = read('src/fps/render-engine.mjs')
engine = once(engine, 'Math.sin(t*11)*(p.moving?.018:0)', 'Math.sin(t*11)*(p.moving?.018:0)*(1-(p.aimAmount||0)*.9)')
engine = once(engine, "this.weaponModel.visible=p.alive!==false&&s.phase!=='menu';", "this.weaponModel.visible=p.alive!==false&&s.phase!=='menu'&&!(p.weapon==='sniper'&&p.aimAmount>.92);")
write('src/fps/render-engine.mjs', engine)

html = read('fps/index.html')
html = once(html, 'CARTRIDGE STRIKE / VERSION 0.13.5', 'CARTRIDGE STRIKE / VERSION 0.14.0')
html = once(html, 'Klicka för att aktivera mus och ljud. Esc pausar.', 'Dator: högerklick för sikte. Mobil: SIKTA eller dubbeltryck till höger. Esc / PAUS pausar.')
html = once(html, '<span>Mus / R <b>Skjut / ladda om</b></span>', '<span>Mus / R <b>Skjut / ladda om</b></span><span>Högerklick / F <b>Siktesläge / zoom</b></span>')
write('fps/index.html', html)

css = read('fps/style.css') + '''
/* Precision Pack 0.14.0: all visuals authored here; no imported scope assets. */
#precision-scope{position:fixed;inset:0;z-index:1;pointer-events:none;overflow:hidden}
#precision-scope[hidden]{display:none!important}
.precision-lens{position:absolute;left:50%;top:50%;width:78vmin;height:78vmin;transform:translate(-50%,-50%);border-radius:50%;border:2px solid #101819;box-shadow:0 0 0 100vmax #030706ef,inset 0 0 18px #0009;overflow:hidden}
.precision-lens i,.precision-lens b{position:absolute;background:#091819d9;display:block;font-weight:normal}
.precision-lens i{left:0;top:calc(50% - .5px);width:100%;height:1px}
.precision-lens b{top:0;left:calc(50% - .5px);height:100%;width:1px}
.precision-lens:after{content:'';position:absolute;left:calc(50% - 2px);top:calc(50% - 2px);height:4px;width:4px;background:#df3c25;border-radius:50%}
.precision-lens span{position:absolute;bottom:15%;left:50%;transform:translateX(-50%);font:9px monospace;color:#a1b5b1;letter-spacing:.2em}
#hud{z-index:3}
body.fps-scoped #crosshair,body.fps-scoped #prompt{visibility:hidden}
body.fps-aiming:not(.fps-scoped) #crosshair{transform:scale(.7)}
#mobile-controls .mobile-aim{right:3%;bottom:68%;width:48px;height:48px;min-height:44px}
#mobile-controls.mobile-auto-fire .mobile-aim{right:3%;bottom:19%;width:80px;height:80px;font-size:13px;background:#244a53d4}
#mobile-controls .mobile-aim[hidden]{display:none!important}
#mobile-controls .mobile-aim[aria-pressed=true]{border-color:#b5ffdd;background:#36806fe0}
@media(orientation:portrait) and (pointer:coarse){#mobile-controls.mobile-auto-fire .mobile-aim{bottom:23%}}
'''
write('fps/style.css', css)

ci = read('.github/workflows/mobile-original-fps.yml')
ci = once(ci, '          node --check src/fps/game.mjs\n', '          node --check src/fps/game.mjs\n          node --check src/fps/tactical-rules.mjs\n          node --check src/fps/tactical-controls.mjs\n')
ci = once(ci, 'run: node --test tools/recoil-autofire.test.mjs', 'run: node --test tools/recoil-autofire.test.mjs tools/precision.test.mjs')
ci = once(ci, '          node tools/mobile-smoke.cjs\n', '          node tools/mobile-smoke.cjs\n          node tools/precision-smoke.cjs\n')
write('.github/workflows/mobile-original-fps.yml', ci)

# Do not silently preserve a stale visible version from 0.13.3.
info = json.loads(read('build-info.json'))
info['gameVersion'] = '0.14.0'
info['precisionPack'] = {'version': '0.14.0', 'sourceReference': 'BenDBSS/Riposte-Frontline-Source@31ca050d', 'note': 'Prior release provenance remains historical; see docs/precision-pack.md for this patch.'}
write('build-info.json', json.dumps(info, ensure_ascii=False, indent=2) + '\n')
print('Applied precision pack to original FPS; Frontline and floor geometry left unchanged.')
