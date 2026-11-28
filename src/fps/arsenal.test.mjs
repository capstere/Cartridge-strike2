import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from './game.mjs';
import {WEAPONS} from './config.mjs';
import {createWorld} from './world.mjs';
import {respawnActor} from './action-rules.mjs';
import {ATTACHMENTS,CAMOS,PRESETS,CUSTOM_LEVELS,BASE_ENTITLEMENTS,defaultArsenal,hasSavedArsenal,
  readArsenal,saveArsenal,validateArsenal,resolveClass,weaponFits,weaponLevelFromXP,weaponDefinition,
  equippedDefinition,quoteClass,decodeEquipment,equipmentKey} from './arsenal.mjs';

const rights={playerLevel:20,weaponLevels:{ar47:30,cr4:30,smg:30,p9:30,p12:30,shotgun:30}};
const gun=(id,attachments=[],camo=null)=>({id,attachments,camo});
const slot=()=>({name:'Patrol',primary:gun('rifle',['red','vgrip','xmag','sil'],'foret'),secondary:gun('sidearm',['fmag']),equipment:'smoke'});
function profile(index=0){
  const p=defaultArsenal();p.selected='custom-'+(index+1);p.slots[index]=slot();return p;
}
const demo=JSON.parse(readFileSync(new URL('../../levels/synthetic-demo.json',import.meta.url)));
function start(mode,kit){
  const world=createWorld({fresh:true,levelProject:structuredClone(demo)});
  return new Game(world,{controllers:{'analysts-0':'human','counterAnalysts-0':'human'},localPlayerId:'analysts-0',
    config:{mode,arsenalClass:kit,zombies:false,wanderers:false,firefight:false}}).start();
}

test('all four issued classes resolve for both teams and the five custom slots enforce separate unlocks',()=>{
  for(const {id} of PRESETS)for(const team of ['analysts','counterAnalysts']){
    const kit=resolveClass({...defaultArsenal(),selected:id},team);
    assert.ok(WEAPONS[kit.primary.id]);assert.equal(kit.secondary.id,team==='analysts'?'p9':'p12');
  }
  for(const [index,threshold] of CUSTOM_LEVELS.entries()){
    assert.throws(()=>validateArsenal(profile(index),{...rights,playerLevel:threshold-1}),/slot is locked/);
    assert.doesNotThrow(()=>validateArsenal(profile(index),{...rights,playerLevel:threshold}));
  }
  const direct=profile();direct.slots[0].primary=gun('ar47');
  assert.throws(()=>resolveClass(direct,'counterAnalysts',rights),/other team/);
  assert.throws(()=>validateArsenal({...profile(),entitlements:rights},rights));
  for(const attachments of [['xmag','fmag'],['red','red'],['red','choke'],['slug'],['red','sil','bipod','laser','fmag'],['constructor'],[{},null]]){
    const p=profile();p.slots[0].primary=gun('smg',attachments);
    assert.throws(()=>validateArsenal(p,rights));
  }
  const mixed=profile();mixed.slots[0].primary=gun('rifle',['red']);
  assert.throws(()=>validateArsenal(mixed,{...rights,weaponLevels:{...rights.weaponLevels,ar47:1}}),/locked/);
  assert.throws(()=>validateArsenal(profile(),BASE_ENTITLEMENTS),/locked/);
  assert.ok(Object.values(ATTACHMENTS).every(a=>Object.keys(WEAPONS).some(id=>weaponFits(id,a.id))));
  assert.equal(Object.keys(CAMOS).length,10);
  assert.equal(weaponLevelFromXP('smg',449),1);assert.equal(weaponLevelFromXP('p9',270),2);
  assert.equal(weaponLevelFromXP('smg',1e7),30);
});
test('valid choices persist while malformed data and denied changes preserve a usable profile',()=>{
  const map=new Map(),storage={getItem:key=>map.get(key)??null,setItem:(k,v)=>map.set(k,v)};
  assert.equal(hasSavedArsenal(storage),false);assert.deepEqual(readArsenal(storage),defaultArsenal());
  const p=profile();saveArsenal(p,storage,rights);assert.equal(hasSavedArsenal(storage),true);
  assert.throws(()=>saveArsenal(profile(4),storage,BASE_ENTITLEMENTS));
  assert.deepEqual(readArsenal(storage,rights),p);
  storage.setItem([...map.keys()][0],'{');assert.deepEqual(readArsenal(storage),defaultArsenal());
});
test('Solo Endless issues the selected configuration, fires derived damage and reloads its actual magazine',()=>{
  const kit=resolveClass(profile(),'analysts',rights),g=start('endless',kit),a=g.player,item=a.inventory.primary;
  assert.deepEqual(decodeEquipment(equipmentKey(item)),{attachments:kit.primary.attachments,camo:'foret'});
  assert.equal(a.weapon,'ar47');assert.equal(a.inventory.smoke,1);assert.equal(a.inventory.flash,0);
  const def=equippedDefinition(a),base=WEAPONS.ar47;
  assert.equal(item.ammo,Math.round(base.magazine*1.5));assert.equal(def.damage,base.damage*.97);
  assert.equal(def.silent,true);assert.ok(def.mobility<1);assert.ok(def.zoom>1);
  const enemy=g.actors.find(other=>other.team!==a.team);
  let distance;
  g.hitscanQuery=(shooter,origin,dir,range)=>{distance=range;return {point:origin,victim:enemy,head:false};};
  g.state.time=a.nextShot;
  assert(g.fire(a));assert.equal(g.pendingDamage.at(-1).amount,def.damage);assert.equal(distance,def.range);
  assert.equal(item.ammo,def.magazine-1);assert.equal(g.events.findLast(e=>e.type==='shot').suppressed,true);
  assert.equal(g.events.filter(e=>e.type==='tracer').length,0);
  assert(g.reload(a));assert.equal(a.reloadDuration,def.reload);
  g.state.time=a.reloadUntil;g.completeReloadIfDue(a);assert.equal(item.ammo,def.magazine);
  a.alive=false;assert(respawnActor(g,a));assert.equal(a.inventory.primary.camo,'foret');
  assert.equal(weaponDefinition('shotgun',['slug']).pellets,1);
  assert.equal(weaponDefinition('shotgun',['xmag']).magazine,WEAPONS.shotgun.magazine+2);
  const legacy=start('endless').player;assert.equal(legacy.inventory.flash,1);assert.equal(legacy.inventory.he,1);
});
test('Classic charges the complete issued kit atomically, preserves spent ammo and applies survival and death carry',()=>{
  const kit=resolveClass(profile(),'analysts',rights),g=start('classic',kit),a=g.player;
  const price=quoteClass(a);assert.equal(a.inventory.primary,null);
  assert.equal(price.cost,WEAPONS.ar47.cost+5*150+WEAPONS.smoke.cost);
  a.money=price.cost-1;assert.equal(g.buy('class').reasonId,'credits');assert.equal(a.inventory.primary,null);
  a.money=price.cost+27;assert(g.buy('class').ok);assert.equal(a.money,27);
  assert.equal(g.buy('class').reasonId,'alreadyOwned');
  a.inventory.primary.ammo=5;a.inventory.primary.reserve=9;
  kit.primary.attachments=kit.primary.attachments.filter(id=>id!=='vgrip');
  assert(g.buy('class').ok);assert.equal(a.inventory.primary.ammo,5);assert.equal(a.inventory.primary.reserve,9);
  assert.equal(a.money,27);
  g.beginRound();assert.equal(a.inventory.primary.ammo,5);assert.equal(a.inventory.primary.camo,'foret');
  a.alive=false;g.beginRound();assert.equal(a.inventory.primary,null);assert.equal(a.money,27);
});
