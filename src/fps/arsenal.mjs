import {WEAPONS} from './config.mjs';

// Adapted from Riposte 06p-accessoires, 06q-camos and 06r-arsenal.
// Copyright (c) 2026 BenDBSS. See licenses/riposte-MIT.txt.
// Persist choices only. The simulation derives all effects from its own catalog.
const firearms={ar47:'rifle',cr4:'rifle',smg:'smg',shotgun:'shotgun',sniper:'sniper',p9:'pistol',p12:'pistol',bazooka:'launcher'};
const long=['rifle','smg'],pistol=[...long,'pistol'],marks=[...long,'sniper'],all=[...marks,'shotgun','pistol'];
const attachment=(id,name,group,level,families,mods)=>Object.freeze({id,name,group,level,families,mods});
export const ATTACHMENTS=Object.freeze(Object.fromEntries([
  attachment('red','Red dot','optic',2,[...pistol,'shotgun'],{ads:1.03,zoom:1.1,adsAcc:.95}),
  attachment('holo','Holographic sight','optic',8,[...long,'shotgun'],{ads:1.06,zoom:1.2,adsAcc:.9}),
  attachment('acog','Combat optic','optic',12,long,{ads:1.16,zoom:1.55,adsAcc:.85,mob:.98}),
  attachment('sil','Suppressor','barrel',4,all,{rng:.86,dmg:.97,vrec:.95,mob:.98,silent:true}),
  attachment('comp','Compensator','barrel',6,[...marks,'pistol'],{vrec:.8,hrec:1.08,ads:1.04}),
  attachment('brake','Muzzle brake','barrel',14,marks,{vrec:.9,hrec:.82,kick:.85}),
  attachment('choke','Tight choke','barrel',4,['shotgun'],{hip:.75,adsAcc:.75,rng:1.12}),
  attachment('long','Long barrel','barrel',13,long,{rng:1.2,adsAcc:.88,ads:1.08,mob:.96}),
  attachment('short','Short barrel','barrel',7,long,{rng:.82,ads:.88,mob:1.04,hip:.9,vrec:1.08}),
  attachment('vgrip','Vertical grip','under',3,long,{vrec:.84,hrec:.9,ads:1.05}),
  attachment('agrip','Angled grip','under',9,long,{ads:.94,hip:.9,hrec:.9,vrec:1.03}),
  attachment('bipod','Bipod','under',3,['rifle','sniper'],{ads:1.05,mob:.97,bipod:true}),
  attachment('laser','Laser sight','side',10,[...pistol,'shotgun'],{hip:.68,mob:.99,laser:true}),
  attachment('fmag','Fast magazine','magazine',5,[...marks,'pistol'],{reload:.72,mob:.99}),
  attachment('xmag','Extended magazine','magazine',11,all,{mag:1.5,reload:1.12,mob:.97}),
  attachment('hstock','Reinforced stock','stock',15,marks,{vrec:.9,hrec:.88,adsAcc:.92,ads:1.05,mob:.97}),
  attachment('nostock','Stock removal','stock',17,long,{mob:1.05,ads:.9,hip:.9,vrec:1.12,hrec:1.15,adsAcc:1.15}),
  attachment('hp','Hollow-point cartridge','magazine',16,pistol,{dmg:1.12,rng:.82}),
  attachment('slug','Slug cartridge','magazine',12,['shotgun'],{slug:true}),
].map(a=>[a.id,a])));
export const CAMOS=Object.freeze(Object.fromEntries([
  ['desert','Desert',3,11],['foret','Woodland',5,23],['urbain','Urban',7,37],['neige','Snow',9,41],
  ['tigre','Tiger',11,53],['cobalt','Cobalt',13,67],['braise','Ember',15,71],['or','Gold',18,83],
  ['diamant','Diamond',20,97],['holo','Holographic',30,101],
].map(([id,name,level,seed])=>[id,Object.freeze({id,name,level,seed})])));
export const CUSTOM_LEVELS=Object.freeze([3,6,10,15,20]);
export const PRESETS=Object.freeze([
  ['assault','Assault','A service rifle for medium-range engagements.','rifle','he'],
  ['raider','Raider','A mobile close-range class with a flash cartridge.','smg','flash'],
  ['scout','Scout','A scoped rifle and smoke for longer sightlines.','sniper','smoke'],
  ['breacher','Breacher','A shotgun and explosive cartridge for tight rooms.','shotgun','he'],
].map(([id,name,description,primary,equipment])=>Object.freeze({id,name,description,primary,secondary:'sidearm',equipment})));
export const BASE_ENTITLEMENTS=Object.freeze({playerLevel:1,weaponLevels:Object.freeze({})});
export const ARSENAL_KEY='cartridge-arsenal-v1';
export const defaultArsenal=()=>({version:1,selected:'assault',slots:CUSTOM_LEVELS.map(()=>null)});
const classSlot=id=>typeof id==='string' && /^custom-[1-5]$/.test(id)?Number(id.at(-1))-1:-1;
const primaryIds=['rifle','ar47','cr4','shotgun','sniper','bazooka','smg'],secondaryIds=['sidearm','p9','p12'];
const teamWeapon=(id,team)=>id==='rifle'?(team==='analysts'?'ar47':'cr4'):id==='sidearm'?(team==='analysts'?'p9':'p12'):id;
const loadout=id=>({id,attachments:[],camo:null});
const fieldSet=(v,fields)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k));
export const weaponFits=(weapon,id)=>Object.hasOwn(firearms,weapon)&&Object.hasOwn(ATTACHMENTS,id)&&ATTACHMENTS[id].families.includes(firearms[weapon]);
export function weaponLevel(entitlements,id){return Math.max(1,Math.trunc(entitlements?.weaponLevels?.[id]||1));}
export function playerLevelFromXP(xp){let level=1;while(level<100 && xp>=Math.round(250*level**1.6))level++;return level;}
const bad=message=>{throw new RangeError(message);};
function inspectWeapon(spec,primary,entitlements){
  if(!fieldSet(spec,['id','attachments','camo'])||!(primary?primaryIds:secondaryIds).includes(spec.id)||
    !Array.isArray(spec.attachments)||spec.attachments.length>4)bad('Invalid weapon configuration.');
  const weapons=[teamWeapon(spec.id,'analysts'),teamWeapon(spec.id,'counterAnalysts')];
  const used=new Set();
  for(const id of spec.attachments){
    const a=typeof id==='string'&&Object.hasOwn(ATTACHMENTS,id)&&ATTACHMENTS[id];
    if(!a||!weapons.every(w=>weaponFits(w,id))||used.has(a.group))bad('These attachments cannot be mounted together.');
    if(weapons.some(w=>weaponLevel(entitlements,w)<a.level))bad('An attachment is locked.');
    used.add(a.group);
  }
  if(spec.camo!==null && (typeof spec.camo!=='string'||!Object.hasOwn(CAMOS,spec.camo)||
    weapons.some(w=>weaponLevel(entitlements,w)<CAMOS[spec.camo].level)))bad('This camouflage is locked or unavailable.');
}
export function validateArsenal(profile,entitlements=BASE_ENTITLEMENTS){
  if(!fieldSet(profile,['version','selected','slots'])||profile.version!==1||!Array.isArray(profile.slots)||profile.slots.length!==5)
    bad('Invalid arsenal profile.');
  for(let i=0;i<5;i++){
    const slot=profile.slots[i];if(slot===null)continue;
    if((entitlements.playerLevel||1)<CUSTOM_LEVELS[i])bad('This custom class slot is locked.');
    if(!fieldSet(slot,['name','primary','secondary','equipment'])||typeof slot.name!=='string'||
      !slot.name.trim()||slot.name!==slot.name.trim()||[...slot.name].length>16||/[\p{C}<>]/u.test(slot.name)||
      !['smoke','flash','he'].includes(slot.equipment))bad('Invalid custom class.');
    inspectWeapon(slot.primary,true,entitlements);inspectWeapon(slot.secondary,false,entitlements);
  }
  const slot=classSlot(profile.selected);
  if(!PRESETS.some(p=>p.id===profile.selected)&&!(slot>=0&&profile.slots[slot]))bad('Choose an available class.');
  return profile;
}
export function resolveClass(profile,team,entitlements=BASE_ENTITLEMENTS){
  validateArsenal(profile,entitlements);
  if(!['analysts','counterAnalysts'].includes(team))bad('Choose a valid team.');
  const preset=PRESETS.find(p=>p.id===profile.selected);
  const c=preset?{...preset,primary:loadout(preset.primary),secondary:loadout(preset.secondary)}:profile.slots[classSlot(profile.selected)];
  const resolve=spec=>{
    const id=teamWeapon(spec.id,team);
    if(WEAPONS[id].team&&WEAPONS[id].team!==team)bad('This weapon belongs to the other team.');
    return {...spec,id,attachments:[...spec.attachments]};
  };
  return {id:profile.selected,name:c.name,primary:resolve(c.primary),secondary:resolve(c.secondary),equipment:c.equipment};
}
export function readArsenal(storage,entitlements=BASE_ENTITLEMENTS){
  try{return validateArsenal(JSON.parse((storage??globalThis.localStorage).getItem(ARSENAL_KEY)),entitlements);}
  catch{return defaultArsenal();}
}
export function saveArsenal(profile,storage,entitlements=BASE_ENTITLEMENTS){
  validateArsenal(profile,entitlements);(storage??globalThis.localStorage).setItem(ARSENAL_KEY,JSON.stringify(profile));return profile;
}
export function weaponDefinition(id,attachments=[]){
  const base=WEAPONS[id];
  if(!base||!attachments?.length)return base;
  const groups=new Set(),m={dmg:1,rng:1,hip:1,adsAcc:1,vrec:1,hrec:1,kick:1,ads:1,zoom:1,reload:1,mag:1,mob:1};
  for(const aid of attachments){
    if(!weaponFits(id,aid)||groups.has(ATTACHMENTS[aid].group)||groups.size>=4)continue;
    groups.add(ATTACHMENTS[aid].group);
    for(const [k,v] of Object.entries(ATTACHMENTS[aid].mods))if(v===true)m[k]=true;else m[k]*=v;
  }
  return {...base,damage:(m.slug?86:base.damage)*m.dmg,range:(m.slug?52:base.range)*m.rng,
    pellets:m.slug?1:base.pellets,spread:(m.slug ? .03 : base.spread)*m.hip,movingSpread:base.movingSpread*m.hip,
    adsAccuracy:m.adsAcc/m.hip,verticalRecoil:m.vrec,recoil:base.recoil*m.vrec,horizontalRecoil:m.hrec,kick:m.kick,
    magazine:id==='shotgun'&&m.mag!==1?base.magazine+2:Math.round(base.magazine*m.mag),reload:base.reload*m.reload,
    mobility:m.mob,adsTime:m.ads,zoom:m.zoom,laser:!!m.laser,bipod:!!m.bipod,silent:!!m.silent};
}
const cached=new WeakMap();
export function equippedDefinition(actor,id=actor?.weapon){
  const base=WEAPONS[id],item=actor?.inventory?.[base?.slot];
  if(!item?.attachments?.length||item.id!==id)return base;
  let def=cached.get(item);
  if(!def){def=weaponDefinition(id,item.attachments);cached.set(item,def);}
  return def;
}
export function classWeaponItem(id,spec){
  const attachments=spec?.id===id?spec.attachments:[],w=weaponDefinition(id,attachments);
  const item={id,ammo:w.magazine,reserve:w.reserve};
  if(attachments?.length)item.attachments=[...attachments];
  if(spec?.id===id&&spec.camo)item.camo=spec.camo;
  return item;
}
export function hasSavedArsenal(storage){
  try{return (storage??globalThis.localStorage).getItem(ARSENAL_KEY)!==null;}catch{return false;}
}
export const attachmentCost=150;
export function quoteClass(actor){
  const kit=actor?.arsenalClass;
  if(!kit)return {cost:0,items:[]};
  const items=[];
  for(const [key,slot] of [['primary','primary'],['secondary','pistol']]){
    const spec=kit[key],current=actor.inventory?.[slot],same=current?.id===spec.id;
    const additions=spec.attachments.filter(id=>!same||!current.attachments?.includes(id));
    const price=(same?0:WEAPONS[spec.id].cost)+attachmentCost*additions.length;
    if(!same||additions.length||(current.attachments?.length||0)!==spec.attachments.length||(current.camo??null)!==spec.camo)
      items.push({slot,id:spec.id,cost:price});
  }
  if(!(actor.inventory?.[kit.equipment]>0))items.push({slot:'grenade',id:kit.equipment,cost:WEAPONS[kit.equipment].cost});
  return {items,cost:items.reduce((sum,item)=>sum+item.cost,0)};
}
export function applyClassPurchase(game,actor,quote){
  for(const {slot,id} of quote.items){
    if(slot==='grenade'){actor.inventory[id]++;continue;}
    const spec=actor.arsenalClass[slot==='primary'?'primary':'secondary'];
    const previous=actor.inventory[slot],item=classWeaponItem(id,spec);
    if(previous?.id===id){
      // Reconfiguring the same magazine must never generate ammunition.
      item.ammo=Math.min(previous.ammo,item.ammo);item.reserve=previous.reserve;
    }else if(previous)game.dropItem(actor,previous);
    actor.inventory[slot]=item;
  }
  actor.loadout=actor.arsenalClass.primary.id;game.select('primary',actor);
}
export const equipmentKey=item=>item?.attachments?.length||item?.camo?(item.attachments||[]).join(',')+':'+(item.camo||''):'';
export function decodeEquipment(key){
  if(!key)return {};
  const [ids,camo]=key.split(':');
  return {attachments:ids?ids.split(','):[],camo:camo||null};
}
// Riposte's weapon curve grows linearly above level 20 and caps at 30.
export function weaponLevelFromXP(id,xp){
  const curve=n=>450*(n-1)**1.7;
  const factor=WEAPONS[id]?.slot==='pistol' ? .6 : 1;
  let level=1;
  while(level<30){
    const next=level+1,threshold=next<=20?curve(next):curve(20)+(next-20)*(curve(20)-curve(19));
    if(xp<Math.round(threshold*factor))break;
    level=next;
  }
  return level;
}
