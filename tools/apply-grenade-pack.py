#!/usr/bin/env python3
"""Guarded one-time integration for the 0.14.1 grenade-awareness release.
Used by the feature CI only. Runtime modules are plain checked-in JavaScript.
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

def once(s, old, new, label):
    if s.count(old) != 1:
        raise RuntimeError(f'{label}: expected one marker, found {s.count(old)}')
    return s.replace(old, new)

p = ROOT / 'src/fps/game.mjs'
s = p.read_text()
if "from './grenade-physics.mjs'" not in s:
    s = "import { grenadeLaunch, advanceGrenade } from './grenade-physics.mjs';\n" + s
    start = s.index('    const origin = eye(actor), dir = direction(actor.yaw, actor.pitch + .15);')
    end = s.index("    this.emit('throw', actor,", start)
    old = s[start:end]
    if 'grenadeSpeed' not in old or 'lastBounce: -Infinity' not in old:
        raise RuntimeError('Unexpected grenade launch implementation')
    s = s[:start] + "    this.state.grenades.push({ ...grenadeLaunch(actor, this.config, this.state.time, type), id: `grenade-${++this.eventSerial}` });\n" + s[end:]
    start = s.index('  updateGrenades(dt) {')
    end = s.index('  detonateGrenade(grenade) {', start)
    old = s[start:end]
    if 'grenade.vy -= this.config.gravity * dt;' not in old:
        raise RuntimeError('Unexpected grenade integration implementation')
    s = s[:start] + '''  updateGrenades(dt) {
    const remaining = [];
    for (const grenade of this.state.grenades) {
      const hit = advanceGrenade(grenade, this.world, this.config.gravity, dt);
      if (hit && this.state.time - grenade.lastBounce > .12) {
        this.emit('bounce', null, { ...point(grenade), grenade: grenade.type }); grenade.lastBounce = this.state.time;
      }
      if (this.state.time + EPS >= grenade.deadline) this.detonateGrenade(grenade); else remaining.push(grenade);
    }
    this.state.grenades = remaining;
  }
''' + s[end:]
    p.write_text(s)

p = ROOT / 'src/fps/app.mjs'
s = p.read_text()
if "from './grenade-assist.mjs'" not in s:
    s = "import { GrenadeAssist, grenadeSettingsMarkup } from './grenade-assist.mjs';\n" + s
    s = once(s,'const settings={mobileAutoFire:true,','const settings={grenadeGuide:true,grenadeWarning:true,mobileAutoFire:true,','settings')
    s = once(s,'let tactical=null;','let tactical=null,grenadeAssist=null;','lifecycle variable')
    s = once(s,"$(target).insertAdjacentHTML('beforeend',tactical.settingsMarkup());","$(target).insertAdjacentHTML('beforeend',tactical.settingsMarkup()+grenadeSettingsMarkup(settings));",'checkboxes')
    s = once(s,'mobile.clear();tactical?.reset();resetAutoAim();','mobile.clear();tactical?.reset();grenadeAssist?.reset();resetAutoAim();','modal reset')
    s = once(s,'await renderer.assetsReady;','await renderer.assetsReady;grenadeAssist=new GrenadeAssist(renderer,settings);','startup')
    before = 'tactical.render(renderer);renderer.render('
    if s.count(before) != 3:
        raise RuntimeError(f'Expected three render hooks, found {s.count(before)}')
    s = s.replace(before,'tactical.render(renderer);grenadeAssist.update(game,viewActor(),modal);renderer.render(')
    s = once(s,'mobile,recoil,tactical};','mobile,recoil,tactical,grenadeAssist};','test diagnostics')
    s = once(s,'function fatal(error){cancelAnimationFrame(raf);','function fatal(error){cancelAnimationFrame(raf);grenadeAssist?.reset();','error cleanup')
    p.write_text(s)

p = ROOT / 'fps/style.css'
s = p.read_text()
if 'Grenade awareness 0.14.1' not in s:
    s += '''
/* Grenade awareness 0.14.1: passive HUD, no touch interception or flashing. */
#grenade-assist-hud{position:fixed;inset:0;z-index:7;pointer-events:none;font-family:inherit}
#grenade-assist-hud [hidden]{display:none!important}
#grenade-preview-note{position:absolute;left:50%;top:calc(50% + 40px);transform:translateX(-50%);text-align:center;padding:6px 10px;border-radius:5px;background:#0a202bdd;color:#b7eee2;max-width:240px}
#grenade-preview-note strong{display:block;font-size:10px;letter-spacing:.08em}
#grenade-preview-note span{display:block;font-size:9px;margin-top:3px;color:#bed0d4}
#grenade-danger{position:absolute;left:50%;top:calc(50% - 92px);transform:translateX(-50%);display:flex;align-items:center;gap:8px;border:1px solid #edb67799;border-radius:7px;padding:6px 11px;background:#341c14ed;color:#ffe3bd;box-shadow:0 3px 12px #0006}
#grenade-danger i{display:block;font-style:normal;font-weight:900;font-size:25px;line-height:1;width:27px;text-align:center}
#grenade-danger strong{display:block;font-size:10px;letter-spacing:.09em}
#grenade-danger span{display:block;font-size:10px;font-variant-numeric:tabular-nums;margin-top:2px}
#grenade-danger[data-kind=flash]{border-color:#ede7ac;color:#fff6c5;background:#2e2b18ed}
#grenade-danger.urgent{border-width:2px;box-shadow:0 0 0 2px #edb67733}
@media(pointer:coarse){#grenade-preview-note{top:calc(50% + 30px);padding:4px 7px;max-width:180px}#grenade-preview-note strong{font-size:9px}#grenade-preview-note span{font-size:8px}#grenade-danger{top:calc(50% - 65px);padding:4px 8px}#grenade-danger i{font-size:22px}}
'''
    p.write_text(s)

p = ROOT / 'fps/index.html'
s = p.read_text()
if 'VERSION 0.14.1' not in s:
    s = once(s,'CARTRIDGE STRIKE / VERSION 0.14.0','CARTRIDGE STRIKE / VERSION 0.14.1','release footer')
    p.write_text(s)
p = ROOT / 'build-info.json'
info=json.loads(p.read_text());info['gameVersion']='0.14.1'
p.write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n')
print('Grenade awareness integrated. Map, AI, damage, fuse and throw speed unchanged.')
