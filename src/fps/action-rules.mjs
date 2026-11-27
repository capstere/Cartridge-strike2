import {controlObjective,combatSpawnCandidates,activeControl} from './combat-flow.mjs';
/** Arcade rules. Simulation time only; visual/audio systems never own damage or respawns. */
import {seededRandom, WEAPONS} from './config.mjs';
import {zombiePosition} from './zombie-poses.mjs';
import {BotController} from './bots.mjs';
export const MODES=Object.freeze({classic:'Klassiska rundor',endless:'Endless Action · auto-respawn'});
export const RADIO=Object.freeze([
 {id:'together',text:'Stick together team',label:'Håll ihop'},
 {id:'fallback',text:'Fall back',label:'Dra er tillbaka'},
 {id:'incoming',text:'Incoming!',label:'Fiende på väg'},
 {id:'cover',text:'Cover me',label:'Täck mig'},
 {id:'go',text:'Go, go, go!',label:'Framåt'},
 {id:'backup',text:'Need backup!',label:'Behöver understöd'},
]);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const pos=a=>({x:a.x,y:a.y||0,z:a.z});
const eye=a=>({...pos(a),y:(a.y||0)+(a.height||1.7)-.12});
const rocketOwners=new WeakMap();
export const isEndless=g=>g.state.mode==='endless';
const aliveBodies=g=>[...g.actors,...g.hostages,...(g.state.zombies||[]),...(g.config.wanderers?g.state.wanderers||[]:[])].filter(a=>a.alive!==false&&!a.rescued);

export function prepareActionRound(g){
 g.world.doors?.reset();
 const s=g.state;s.mode=MODES[g.config.mode]?g.config.mode:'classic';s.projectiles=[];s.orders={};
 s.radioAt=-Infinity;s.radioLog=[];
 for(const h of s.hostages)Object.assign(h,{alive:true,hp:100,armor:0,deaths:0,deathAt:null,kind:'hostage',respawnAt:null});
 for(const a of g.actors){a.respawnAt=null;a.spawnProtectedUntil=0;a.teamKills??=0;}
 initializeWanderers(g);
 if(!isEndless(g))return;
 s.phase='active';s.buyDeadline=s.time;s.roundStartedAt=s.time;s.deadline=Infinity;
 Object.assign(s.bomb,{status:'inactive',carrierId:null,deadline:Infinity,nextBeep:Infinity});
 for(const a of g.actors){equipEndless(g,a);a.spawnProtectedUntil=s.time+g.config.spawnProtection;}
 g.emit('start',null,{mode:'endless'});
}
export const onlinePrimaries=team=>['smg',team==='analysts'?'ar47':'cr4','shotgun','sniper','bazooka'];
function equipEndless(g,a){
 if(g.config.networkSlice){
  const primary=onlinePrimaries(a.team).includes(a.loadout)?a.loadout:'smg';
  a.inventory=g.startInventory(a.team);a.inventory.primary=g.weaponItem(primary);a.inventory.he=WEAPONS.he.limit;
  a.weapon=primary;a.lastWeapon=a.inventory.pistol.id;a.aimAmount=0;a.aiming=false;a.armor=0;a.money=0;return;
 }
 const defaultWeapon=a.team==='analysts'?'ar47':'cr4';
 const selection=(a.isPlayer||a.controllerType==='human')?(a.loadout||g.config.loadout||defaultWeapon):a.index===2?'smg':a.index===3?'shotgun':defaultWeapon;
 const id=WEAPONS[selection]?.slot==='primary'?selection:defaultWeapon;
 a.inventory=g.startInventory(a.team);a.inventory.primary=g.weaponItem(id);a.inventory.smoke=1;a.inventory.flash=1;a.inventory.he=1;
 a.weapon=id;a.lastWeapon=a.inventory.pistol.id;a.armor=60;a.money=g.config.maxMoney;a.loadout=id;
}
/** Stay on the accepted connected floor; maximize distance and break sight, never open a room. */
export function respawnPoint(g,a){
 const anchors=g.world.anchors[a.team]||g.world.anchors.hostages;
 const home=anchors[a.index%anchors.length]||anchors[0];
 const nodes=g.world.navigation?.nodes||[];
 const candidates=[...combatSpawnCandidates(g,a),...anchors,...nodes.filter(n=>anchors.some(h=>dist(n,h)<7)).filter((_,i)=>i%3===0)].slice(0,180);
 const living=aliveBodies(g).filter(o=>o!==a);
 let best=null,bestScore=-Infinity;
 for(const p of candidates){
  if(g.world.canOccupy&&!g.world.canOccupy(p.x,p.z,a.radius+.015,a.height,p.y??0))continue;
  if(living.some(o=>dist(o,p)<(o.radius||.2)+a.radius+.12))continue;
  if(p.frontline&&living.some(o=>o.team&&o.team!==a.team&&dist(o,p)<7))continue;
  const control=activeControl(g);
  let score=-dist(p,home)*.08-(control?dist(p,control)*.22:0);
  for(const e of living.filter(o=>o.team&&o.team!==a.team)){
   // Visibility cannot affect this score at 18 m or farther.
   const d=dist(e,p),visible=d<18&&g.world.segmentClear({...p,y:(p.y??0)+1.4},eye(e),{vision:true});
   score+=Math.min(d,22)*.025-(visible?Math.max(0,18-d)*1.1:0);
  }
  if(score>bestScore){best=p;bestScore=score;}
 }
 return best?{x:best.x,y:best.y??0,z:best.z,yaw:home.yaw??0}:null;
}
export function respawnActor(g,a){
 const p=respawnPoint(g,a);if(!p)return false; // retry next tick, never overlap another capsule
 Object.assign(a,p,{hp:g.config.health,alive:true,height:g.config.standingHeight,vy:0,onGround:true,crouching:false,
  reloadUntil:0,nextShot:g.state.time+.15,flashUntil:0,flash:0,flashStart:0,action:null,moving:0,distanceWalked:0,recoil:0,
  lastStep:g.state.time,fireHeld:false,interactHeld:false,jumpHeld:false,hurtTime:-Infinity,hurtDirection:null,deathAt:null,deathCause:null,deathVariant:'',
  respawnAt:null,spawnProtectedUntil:g.state.time+g.config.spawnProtection,blockedBy:null});
 if(g.config.networkSlice)a.lifeId=(a.lifeId||0)+1;
 equipEndless(g,a);a.bot=a.controllerType==='bot'?new BotController(g,a):null;
 for(const other of g.actors){const memory=other.bot?.memory;if(memory?.hasRecord(a))memory.deleteRecord(a);}
 g.emit('respawn',a,{protection:g.config.spawnProtection});return true;
}
export function tickActionState(g,dt){
 const s=g.state;
 if(isEndless(g)){
  for(const a of g.actors)if(!a.alive&&Number.isFinite(a.respawnAt)&&s.time>=a.respawnAt)respawnActor(g,a);
  for(const h of s.hostages)if((!h.alive||h.rescued)&&s.time>=h.respawnAt){
   const p=g.world.anchors.hostages[Number(h.id.split('-').at(-1))];
   if(!aliveBodies(g).some(a=>dist(a,p)<.55))Object.assign(h,p,{y:0,hp:100,alive:true,rescued:false,deathAt:null,respawnAt:null,escortId:null,path:[],moving:0,distanceWalked:0});
  }
  s.drops=s.drops.filter(d=>s.time-(d.createdAt??s.time)<25).slice(-24);
 }
 if(g.config.wanderers){if(!s.wanderers?.length&&g.world.navigation?.nodes?.length)initializeWanderers(g);updateWanderers(g,dt);}
}
export function recordActionDeath(g,target,source,sourceTeam=source?.team){
 if(isEndless(g)){
  target.respawnAt=g.state.time+(['hostage','dwarf'].includes(target.kind)?10:g.config.respawnDelay);
  if(target.team&&sourceTeam&&source!==target&&target.team!==sourceTeam)g.state.score[sourceTeam]++;
 }
 if(source&&source!==target&&sourceTeam===target.team)source.teamKills=(source.teamKills||0)+1;
}
export function sendRadio(g,id,actor=g.player){
 const phrase=RADIO.find(p=>p.id===id),s=g.state;
 if(!phrase||!actor?.alive||s.paused||!['active','buy'].includes(s.phase)||s.time-s.radioAt<2)return false;
 s.radioAt=s.time;const origin=pos(actor),back=id==='fallback';
 let target={x:origin.x-Math.sin(actor.yaw)*(back?-4:6),y:origin.y??0,z:origin.z-Math.cos(actor.yaw)*(back?-4:6)};
 if(!['go','incoming','fallback'].includes(id))target=origin;
 const node=g.world.navigation?.nearest(target);if(node)target={x:node.x,y:node.y??0,z:node.z};else target=origin;
 s.orders[actor.team]={id,point:target,issuerId:actor.id,until:s.time+8};
 const event=g.emit('radio',actor,{command:id,text:phrase.text,global:true});
 s.radioLog.push({text:phrase.text,at:s.time,actor:actor.name});s.radioLog=s.radioLog.slice(-6);return event;
}
export function actionObjective(bot){
 const g=bot.game,a=bot.actor,s=g.state,order=s.orders?.[a.team];
 if(order&&order.until>s.time&&order.issuerId!==a.id){
  bot.setGoal(order.point);a.aiState=order.id==='fallback'?'drar sig tillbaka':'radioorder';
  if(dist(a,order.point)<1+(.25*a.index))bot.setGoal(null);return true;
 }
 if(!isEndless(g))return false;
 if(controlObjective(bot))return true;
 // Shared public patrol destinations, not enemy coordinates. Perception still needs sight/hearing.
 const w=g.world;
 const points=w.tactical?.patrolPoints?.length?w.tactical.patrolPoints:[w.anchors.bomb,w.tactical?.guardPoints?.south,w.anchors.rescue,w.tactical?.guardPoints?.north,...w.anchors.hostages].filter(Boolean);
 const phase=Math.floor((s.time+a.index*4)/18),target=points[(phase+a.index)%points.length];
 if(dist(a,target)>.7){bot.setGoal(target);a.aiState='söker strid';}
 else {bot.setGoal(points[(phase+a.index+1)%points.length]);a.aiState='patrullerar';}
 return true;
}
export function friendlyLineClear(bot){
 const a=bot.actor,e=bot.target?.entity;if(!e)return true;
 const dx=e.x-a.x,dz=e.z-a.z,len=dx*dx+dz*dz;if(len<.01)return true;
 return !aliveBodies(bot.game).some(b=>{
  if(b===a||b===e||b.kind==='zombie'||b.team&&b.team!==a.team)return false;
  const t=((b.x-a.x)*dx+(b.z-a.z)*dz)/len;
  return t>0&&t<1&&Math.hypot(b.x-a.x-t*dx,b.z-a.z-t*dz)<(b.radius||.2)+.07;
 });
}
/** Segment/AABB sweep is shared for bullets and projectiles by the core caller. */
export function launchRocket(g,actor,dir){
 const owner={ownerId:actor.id,ownerLifeId:actor.lifeId??0,team:actor.team,ownerName:actor.name};
 const p={...eye(actor),id:`rocket-${++g.eventSerial}`,ownerId:actor.id,team:actor.team,
  ...(g.config.networkSlice?{ownerLifeId:owner.ownerLifeId,ownerName:owner.ownerName}:{}),
  vx:dir.x*22,vy:dir.y*22,vz:dir.z*22,born:g.state.time,until:g.state.time+4};
 // Keep the original actor and control generation out of projected state.
 if(g.config.networkSlice)rocketOwners.set(p,Object.freeze({...owner,actor,ownerControlEpoch:actor.controlEpoch??0}));
 g.state.projectiles.push(p);if(g.state.projectiles.length>24)g.state.projectiles.shift();
 g.emit('rocket-launch',actor,{rocketId:p.id,...(g.config.networkSlice?{...owner,...pos(p)}:{})});return p;
}
export function updateRockets(g,dt,rayActor){
 const remaining=[];
 for(const r of g.state.projectiles||[]){
  const projectileOwner=g.config.networkSlice?(rocketOwners.get(r)??r):undefined;
  const len=Math.hypot(r.vx,r.vy,r.vz)*dt,dir={x:r.vx/22,y:r.vy/22,z:r.vz/22},from=pos(r);
  const wall=g.world.raycast(from,dir,len,{vision:false});let travel=wall?.distance??len,hit=null;
  for(const a of aliveBodies(g)){
   const isOwner=projectileOwner?a===projectileOwner.actor:a.id===r.ownerId;
   if(isOwner&&g.state.time-r.born<.18)continue;
   const d=rayActor(from,dir,a,travel);if(d!==null&&d<=travel){travel=d;hit=a;}
  }
  r.x+=dir.x*travel;r.y+=dir.y*travel;r.z+=dir.z*travel;
  if(wall||hit||g.state.time>=r.until||r.y<.02){
   const origin={x:r.x-dir.x*.10,y:Math.max(.08,r.y-dir.y*.10),z:r.z-dir.z*.10};
   const owner=projectileOwner?projectileOwner.actor:g.actors.find(a=>a.id===r.ownerId),radius=4.6;
   const {ownerId,ownerLifeId,team}=projectileOwner??r,ownerName=projectileOwner?projectileOwner.ownerName:owner?.name;
   g.emit('rocket-explosion',null,{...origin,ownerId,team,radius,...(g.config.networkSlice?{rocketId:r.id,ownerLifeId,ownerName,flightFrom:from}:{})});
   for(const a of aliveBodies(g)){
    const center={...(a.kind==='zombie'?zombiePosition(a,a.bodyTime):pos(a)),y:a.y+a.height*.55};const distance=Math.hypot(center.x-origin.x,center.y-origin.y,center.z-origin.z);
    if(distance>=radius&&a!==hit)continue;
    if(a!==hit&&!g.world.segmentClear(origin,center,{vision:false}))continue;
    g.pendingDamage.push({target:a,amount:a===hit?WEAPONS.bazooka.damage:135*Math.max(0,1-distance/radius),source:owner,projectileOwner,rocketId:projectileOwner?r.id:undefined,kind:'bazooka',point:center,sourcePosition:origin});
   }
  }else remaining.push(r);
 }
 g.state.projectiles=remaining;
}
function initializeWanderers(g){
 const random=seededRandom((g.seed^0x676e6f6d)>>>0),nodes=g.world.navigation?.nodes||[];
 g.wanderRandom=random;g.state.wanderers=[];g.wanderNodes=[];
 if(!g.config.wanderers||!nodes.length)return;
 const start=g.world.navigation.nearest(g.world.anchors.analysts[0]);
 const roomNodes=new Map();
 for(const n of nodes){const room=g.world.roomAt(n.x,n.z);if(!room||roomNodes.has(room.id)||!g.world.canOccupy(n.x,n.z,.2,.86,n.y??0))continue;if(!g.world.findPath(start,n).length)continue;roomNodes.set(room.id,n);}
 g.wanderNodes=[...roomNodes.values()];
 const points=[...g.wanderNodes];
 for(let i=0;i<Math.min(14,points.length);i++){
  const p=points.splice(Math.floor(random()*points.length),1)[0];g.state.wanderers.push({id:`dwarf-${i}`,name:`Fantasidvärg ${i+1}`,kind:'dwarf',hp:65,armor:0,alive:true,deaths:0,deathAt:null,respawnAt:null,spawn:{x:p.x,y:p.y??0,z:p.z},x:p.x,y:p.y??0,z:p.z,yaw:random()*6.28,height:.86,radius:.16,path:[],nextPlan:random()*4,moving:0,steps:0,variant:i%5});
 }
}
function updateWanderers(g,dt){
 const rand=g.wanderRandom,s=g.state;if(!rand)return;
 for(const a of s.wanderers||[]){
  if(!a.alive){
   if(isEndless(g)&&s.time>=a.respawnAt&&g.world.canOccupy(a.spawn.x,a.spawn.z,a.radius,a.height,a.spawn.y??0)&&!g.actors.some(o=>o.alive&&dist(o,a.spawn)<.6))Object.assign(a,a.spawn,{y:a.spawn.y??0,hp:65,alive:true,deathAt:null,respawnAt:null,path:[],nextPlan:s.time+1,moving:0,steps:0});
   else continue;
  }
  if(!a.path.length&&s.time>=a.nextPlan){
   const near=g.wanderNodes.filter(n=>dist(a,n)<17&&dist(a,n)>1);
   const choices=near.length?near:g.wanderNodes,target=choices[Math.floor(rand()*choices.length)];
   a.path=target?g.world.findPath(a,target):[];a.nextPlan=s.time+3+rand()*6;
  }
  while(a.path.length&&dist(a,a.path[0])<.06)a.path.shift();
  const p=a.path[0];a.moving=0;if(!p)continue;
  const d=dist(a,p),step=Math.min(d,dt*(.55+a.variant*.055)),old=pos(a);
  g.world.move(a,(p.x-a.x)/d*step,0,(p.z-a.z)/d*step);
  a.moving=dist(old,a)/dt;a.steps+=dist(old,a);a.yaw=Math.atan2(-(p.x-old.x),-(p.z-old.z));
  if(a.moving<.02){a.path=[];a.nextPlan=s.time+2;}
 }
}
