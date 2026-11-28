// Riposte 06ga-tenues and 06gc-tenues-defi. Keys are independent of weapons.
export const OUTFITS = Object.freeze([
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
const key = 'cartridge-operator-outfit';
const find = id => OUTFITS.find(outfit => outfit.id === id);
// Only built-in issued choices may cross a room boundary. Saved GLBs stay on-device.
export function publicOutfitId(id) {
  return find(id)?.id ?? OUTFITS[0].id;
}
export function readOutfit(storage) {
  try { return find(storage.getItem(key)) || OUTFITS[0]; } catch { return OUTFITS[0]; }
}
export function saveOutfit(id,storage) {
  const outfit = find(id);
  if (!outfit) throw Error('Choose an available outfit.');
  storage.setItem(key, id);
  return outfit;
}
