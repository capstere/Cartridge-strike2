#!/usr/bin/env python3
"""Guarded, idempotent one-time visual integration for Cartridge Strike 0.15.1."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def replace(text, before, after, label):
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f'{label}: expected one marker, found {count}')
    return text.replace(before, after)

primitive_path = ROOT / 'src/fps/model-primitives.mjs'
engine_path = ROOT / 'src/fps/render-engine.mjs'
primitive = primitive_path.read_text(encoding='utf-8')
engine = engine_path.read_text(encoding='utf-8')
# Existing regression workflows still call this one-time migration. A later
# integrated release must not be rejected or have its version downgraded.
current = json.loads((ROOT / 'build-info.json').read_text(encoding='utf-8')).get('gameVersion', '')
version = tuple(int(part) for part in current.split('.'))
complete = all(marker in primitive for marker in (
    "from './throwable-cartridge.mjs'", 'createThrowableCartridge(type, scale)',
    'object.geometry.userData.sharedThrowableCartridge', 'disposeThrowableCartridges();'))
complete = complete and all(marker in engine for marker in (
    "from './throwable-cartridge.mjs'", 'createThrownCartridge(g,t)', 'updateThrownCartridge(model,g,t)'))
if version >= (0, 15, 1) and complete and f'VERSION {current}' in (ROOT / 'fps/index.html').read_text(encoding='utf-8'):
    print(f'Cartridge integration already complete at {current}; leaving every file unchanged.')
    raise SystemExit(0)
if "from './throwable-cartridge.mjs'" not in primitive:
    primitive = "import { createThrowableCartridge, disposeThrowableCartridges } from './throwable-cartridge.mjs';\n" + primitive
    primitive = replace(primitive,
        "export function cartridge(type = 'he', scale = 1) {",
        "export function cartridge(type = 'he', scale = 1) {\n  if (['he', 'flash', 'smoke'].includes(type)) return createThrowableCartridge(type, scale);",
        'throwable cartridge factory')
    primitive = replace(primitive,
        "for (const template of worldWeaponTemplates.values()) template.traverse(object => {\n    if (!object.isMesh) return;",
        "for (const template of worldWeaponTemplates.values()) template.traverse(object => {\n    if (!object.isMesh || object.geometry.userData.sharedThrowableCartridge) return;",
        'shared resources have one disposer')
    primitive = replace(primitive,
        "  worldWeaponTemplates.clear();\n}",
        "  worldWeaponTemplates.clear();\n  disposeThrowableCartridges();\n}",
        'final cache teardown')
if "from './throwable-cartridge.mjs'" not in engine:
    engine = "import { createThrownCartridge, updateThrownCartridge } from './throwable-cartridge.mjs';\n" + engine
    old = "for(const g of s.grenades){let model=this.grenades.get(g.id);if(!model){model=cartridge(g.type||g.kind,1.1);this.grenades.set(g.id,model);this.scene.add(model);}model.position.set(g.x,g.y,g.z);model.rotation.set(t*4,t*3,0);}"
    new = "for(const g of s.grenades){let model=this.grenades.get(g.id);if(!model){model=createThrownCartridge(g,t);this.grenades.set(g.id,model);this.scene.add(model);}updateThrownCartridge(model,g,t);}"
    engine = replace(engine, old, new, 'independent cartridge tumble and floor rest')
assert 'createThrowableCartridge(type, scale)' in primitive
assert 'updateThrownCartridge(model,g,t)' in engine
primitive_path.write_text(primitive, encoding='utf-8')
engine_path.write_text(engine, encoding='utf-8')
html_path = ROOT / 'fps/index.html'
html = html_path.read_text(encoding='utf-8')
if 'VERSION 0.15.1' not in html:
    html = replace(html, 'VERSION 0.15.0', 'VERSION 0.15.1', 'version footer')
    html_path.write_text(html, encoding='utf-8')
info_path = ROOT / 'build-info.json'
info = json.loads(info_path.read_text(encoding='utf-8'))
if info.get('gameVersion') not in ('0.15.0', '0.15.1'):
    raise RuntimeError('Unexpected base release; review before changing metadata')
info['gameVersion'] = '0.15.1'
info_path.write_text(json.dumps(info, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Cartridge 0.15.1 visual integration ready. Game, physics, HUD, map and Frontline are untouched.')
