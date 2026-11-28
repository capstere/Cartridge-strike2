// Riposte 06ga-tenues and 06gc-tenues-defi. Keys are independent of weapons.
import installed from '../../assets/fps/outfit-packs.json' with {type:'json'};
import {installedPalettes} from './appearance-package.mjs';
const originalOutfits = Object.freeze([
  {id:'issued',name:'Issued uniform',role:'Team colors'},
  {id:'assault',name:'Assault',role:'Frontline, flexible',shirt:0x8a8462,vest:0x9a8865,glove:0x4f4f46},
  {id:'smg',name:'Commando',role:'Close range, aggressive',shirt:0x4a4f58,vest:0x33363c,glove:0x2c2e33},
  {id:'sniper',name:'Ghillie',role:'Long range, precision',shirt:0x545641,vest:0x3f403a,glove:0x3a3b35},
  {id:'shotgun',name:'Breacher',role:'Breach, close quarters',shirt:0x7f6c50,vest:0x4a463e,glove:0x4a463e}
]);
// Challenge descriptions mirror 06s-defis. CS3-10 owns the trusted counters.
export const CHALLENGE_OUTFITS = Object.freeze([
  ['nomad','Nomad',['100 shotgun eliminations','20 knife or grenade eliminations','5 top-three free-for-all finishes']],
  ['tempest','Tempest',['100 sniper eliminations','15 eliminations at 50 metres or more','5 UAV activations']],
  ['verdant','Verdant Phantom',['75 suppressed weapon eliminations','40 crouched eliminations','Finish a match on each qualified map']],
  ['raptor','Raptor',['150 submachine gun eliminations','25 eliminations while sliding or airborne','15 double eliminations']],
  ['void','Void',['200 assault rifle eliminations','50 pistol eliminations','25 Domination captures']],
  ['gilet','Yellow Vest',['12 matches on qualifying French maps','5 wins on those maps','150 eliminations on those maps']]
]);
// 06gc-tenues-defi recognition details share each kit's existing skinned draw.
const styles = [
  ['shotgun',0x96735a,0x665447,0x403b33,0xbc7947],
  ['sniper',0x34485a,0x273649,0x252f36,0x64b6dc],
  ['sniper',0x3d5136,0x354833,0x353e32,0xe0aa50],
  ['smg',0x423842,0x302934,0x453340,0xdf559c],
  ['assault',0x34333f,0x272833,0x34303b,0xa58ded],
  ['assault',0x343a37,0xd0c544,0x303532,0xe0e4c6]
];
export const EARNED_OUTFITS = Object.freeze(CHALLENGE_OUTFITS.map(([id,name],i)=>{
  const [kit,shirt,vest,glove,accent]=styles[i];
  return Object.freeze({id,name,role:'Challenge outfit',kit,shirt,vest,glove,accent});
}));
export const reservedOutfitIds=Object.freeze([...originalOutfits,...EARNED_OUTFITS].map(o=>o.id));
export const OUTFITS=Object.freeze([...originalOutfits,...installedPalettes(installed,reservedOutfitIds)]);
const earnedIds=new Set(EARNED_OUTFITS.map(o=>o.id));
const catalog=new Map([...OUTFITS,...EARNED_OUTFITS].map(item=>[item.id,item]));
const key='cartridge-operator-outfit';
export const outfitDefinition=id=>catalog.get(id);
export function publicOutfitId(id,unlocked=[]) {
  const outfit=catalog.get(id);
  return outfit && (!earnedIds.has(id) || Array.from(unlocked).includes(id)) ? id : 'issued';
}
export function readOutfit(storage,unlocked=[]) {
  try { return catalog.get(publicOutfitId(storage.getItem(key),unlocked)); } catch { return OUTFITS[0]; }
}
export function saveOutfit(id,storage,unlocked=[]) {
  if (!catalog.has(id) || publicOutfitId(id,unlocked)!==id) throw Error('Choose an available outfit.');
  storage.setItem(key,id);
  return catalog.get(id);
}
