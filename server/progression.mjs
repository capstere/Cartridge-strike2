// Riposte 06r-arsenal and 06s-defis, adapted for authoritative match receipts.
// Copyright (c) 2026 BenDBSS. See licenses/riposte-MIT.txt.
import {NETWORK_MAPS,networkMap} from '../shared/multiplayer/maps.mjs';
import {WEAPONS} from '../src/fps/config.mjs';
import {CHALLENGE_OUTFITS} from '../src/fps/operator-outfits.mjs';

const targets={
  nomad:[['nPompe',100],['nBrut',20],['nFfa',5]],
  tempest:[['tPrec',100],['tLoin',15],['tUav',5]],
  verdant:[['fSil',75],['fAcc',40],['fCartes',NETWORK_MAPS.length]],
  raptor:[['rPm',150],['rMouv',25],['rDouble',15]],
  void:[['vFa',200],['vPist',50],['vDom',25]],
  gilet:[['gParties',12],['gVict',5],['gElim',150]],
};
export const challenges=CHALLENGE_OUTFITS.flatMap(([outfit,,labels])=>targets[outfit].map(([id,goal],i)=>({id,goal,outfit,label:labels[i]})));
const goals=Object.fromEntries(challenges.map(c=>[c.id,c.goal]));
export function challengeList(counts){
  return challenges.map(c=>({...c,count:Math.min(c.goal,counts[c.id]||0)}));
}
export function earnedOutfits(list){
  return Object.keys(targets).filter(outfit=>list.filter(c=>c.outfit===outfit).every(c=>c.count>=c.goal));
}
export const firearm=id=>Object.hasOwn(WEAPONS,id)&&['primary','pistol'].includes(WEAPONS[id].slot);
const qualifiedFrench=id=>['givre','embruns','lotissement'].includes(id)&&!!networkMap(id);
export const tally=()=>({kills:0,deaths:0,win:false,assists:0,headshots:0,weapons:{},challenges:{},completed:false});
export const playerXP=p=>p.kills*10+p.assists*5+p.headshots*5+(p.win?25:0);
const add=(record,key,n=1)=>{record[key]=(record[key]||0)+n;};
export function fold(parts){
  const total=tally();
  for(const p of parts){
    for(const key of ['kills','deaths','assists','headshots'])total[key]+=p[key]||0;
    for(const [id,xp] of Object.entries(p.weapons||{}))if(firearm(id))add(total.weapons,id,xp);
    for(const [id,count] of Object.entries(p.challenges||{}))if(Object.hasOwn(goals,id))add(total.challenges,id,count);
    total.win=p.win;total.completed||=!!p.completed;
  }
  return total;
}
const family={shotgun:'nPompe',sniper:'tPrec',smg:'rPm',ar47:'vFa',cr4:'vFa',p9:'vPist',p12:'vPist'};
export function elimination(p,event,actor,victim,chain,mapId){
  const weapon=event.weapon,gun=firearm(weapon);
  const head=gun&&event.head===true&&victim.deathVariant==='headshot';
  p.kills++;
  if(head)p.headshots++;
  if(weapon==='knife'||weapon==='he')add(p.challenges,'nBrut');
  if(chain===2)add(p.challenges,'rDouble');
  if(qualifiedFrench(mapId))add(p.challenges,'gElim');
  if(gun){
    add(p.weapons,weapon,head?150:100);
    if(family[weapon])add(p.challenges,family[weapon]);
    const source=event.sourcePosition,hit=event.point;
    if(source&&hit&&Math.hypot(source.x-hit.x,source.y-hit.y,source.z-hit.z)>=50)add(p.challenges,'tLoin');
    const item=actor.inventory?.[WEAPONS[weapon].slot];
    if(item?.id===weapon&&item.attachments?.includes('sil'))add(p.challenges,'fSil');
    const slide=actor.slideUntil>event.time;
    if(actor.crouching&&!slide)add(p.challenges,'fAcc');
    if(slide||actor.onGround===false)add(p.challenges,'rMouv');
  }
  return {kind:head?'headshot':'kill',xp:head?15:10,weapon,weaponXp:gun?(head?150:100):0};
}
export function completion(p,mode,map,rank,win){
  p.completed=true;
  if(mode==='ffa'&&rank>=1&&rank<=3)add(p.challenges,'nFfa');
  if(networkMap(map))p.challenges.fCartes=1;
  if(qualifiedFrench(map)){add(p.challenges,'gParties');if(win)add(p.challenges,'gVict');}
}
export const deltas=record=>Object.entries(record).map(([id,count])=>({id,count}));
