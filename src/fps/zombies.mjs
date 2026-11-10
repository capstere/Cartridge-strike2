import {rejoinNavigation} from './body-recovery.mjs';
import {seededRandom} from './config.mjs';
import {POSES,LENGTH,pose,bodyHeight,zombiePosition} from './zombie-poses.mjs';
import {isZombieFloor,zombieSites,distanceXZ as distance} from './zombie-sites.mjs';

const at=(a,y)=>({x:a.x,y:(a.y||0)+y,z:a.z});
const facing=(a,b)=>Math.atan2(a.x-b.x,a.z-b.z);
const occupied=(g,p,except)=>[...g.actors,...g.hostages,...g.state.zombies].some(a=>
  a!==except && a.alive!==false && !a.rescued && distance(a,p)<(a.radius||.2)+.26);
const busy=new Set(['rising','recovering','knockdown','hurt','attack']);
const moving=new Set(['wandering','investigating','pursuing']);

function idle(g,z){
  const t=g.state.time;
  pose(z,t,'idle','idle',{loop:true,rate:z.model==='tattered'?0:1});
  z.nextAmbient=t+1.4+g.zombieRandom()*3; z.path=[]; z.goal=null;
}
function spawn(g,home,index){
  const t=g.state.time, z={id:'zombie-'+index,kind:'zombie',model:home.model,
    name:home.model==='hollow'?'The Hollow Walker':'Tattered Wanderer',
    home,seat:home.seat,seatExitAt:null,x:home.x,y:0,z:home.z,yaw:home.yaw??g.zombieRandom()*6.28,
    radius:.20,height:1.7,hp:115,armor:0,alive:true,deaths:0,deathAt:null,path:[],goal:null,
    moving:0,bodyTime:t,nextSense:t+index*.07,nextPath:0,heard:g.eventSerial,hitAt:-Infinity,
    nextAttack:t+2,aggressive:index!==3,weakGait:index===2,targetId:null,lastKnown:null,
    stepDistance:0,ambientCount:index,gestureIndex:Math.floor(index/2),nextAmbient:t+index,wait:0,bodyState:null};
  if(home.rest==='bed') pose(z,t,'sleeping','sleep',{loop:true});
  else if(home.seat) pose(z,t,'sitting','sit',{loop:true});
  else idle(g,z);
  z.height=bodyHeight(z,t);
  return z;
}

function nextDance(g,z){
  if(!z.dances.length){
    const bag=['dance','jazz','strut','groove'];
    for(let i=bag.length-1;i>0;i--){
      const j=Math.floor(g.danceRandom()*(i+1));
      [bag[i],bag[j]]=[bag[j],bag[i]];
    }
    if(POSES.danceman[bag[3]]===z.clip)[bag[0],bag[3]]=[bag[3],bag[0]];
    z.dances=bag;
  }
  pose(z,g.state.time,'dancing',z.dances.pop());
}

export function populateZombies(g){
  g.state.zombies=[]; if(!isZombieFloor(g.world))return;
  const sites=zombieSites(g.world); g.zombieSites=sites; g.zombieRandom=seededRandom((g.seed^0x1973)+g.state.round*379);
  g.nextZombiePath=0;
  const site=room=>sites.patrol.find(p=>p.room===room);
  const homes=[
    [sites.bed,'hollow','bed'],[sites.chair,'tattered'],[site('C03'),'hollow'],[site('I26'),'tattered'],[site('C15'),'tattered'],
  ];
  const zones=g.state.combatFlow?.zones||[];
  for(const [p,model,rest] of homes.slice(0,g.config.mobile?3:5)){
    if(!p||occupied(g,p)||zones.some(o=>distance(o,p)<o.radius+1))continue;
    g.state.zombies.push(spawn(g,{...p,model,rest},g.state.zombies.length));
  }
  if(sites.dancer){
    g.danceRandom=seededRandom((g.seed^0x4d414e)+g.state.round);
    const dancer={...sites.dancer,id:'danceman',model:'danceman',kind:'zombie',name:'Danceman',
      radius:.24,height:1.7,hp:100,armor:0,deaths:0,alive:true,dances:[]};
    nextDance(g,dancer);
    g.state.zombies.push(dancer);
  }
}

function perceive(g,z){
  const t=g.state.time, p=zombiePosition(z,t), from=at(p,z.height*.82);
  const asleep=z.behavior==='sleeping', sight=asleep?1.45:9;
  let seen=null, nearest=sight;
  for(const a of g.actors){
    const d=distance(p,a); if(!a.alive||d>nearest)continue;
    const dx=a.x-p.x,dz=a.z-p.z;
    if(d>2.2 && (-Math.sin(z.yaw)*dx-Math.cos(z.yaw)*dz)/d<-.12)continue;
    if(g.canSee(from,at(a,a.height*.69))){seen=a;nearest=d;}
  }
  let noise=null,best=0;
  for(const e of g.soundEvents){
    if(e.serial<=z.heard)continue;
    const loud=e.type==='shot'&&e.weapon!=='knife'?20:e.type==='he'?24:e.type==='step'?(e.mode==='run'?5.2:1.35):0;
    if(!loud || (e.type!=='he'&&!e.team))continue;
    const d=distance(p,e);if(d>=loud)continue;
    const clear=g.world.segmentClear(from,at(e,.85),{vision:false}), strength=loud*(clear?1:.27)-d;
    if(strength>best){noise=e;best=strength;}
  }
  z.heard=g.eventSerial; z.targetId=seen?.id??null;
  if(seen||noise){
    const target=seen||noise;
    z.lastKnown={x:target.x,z:target.z}; z.memoryUntil=t+(seen?3.5:5);
  }
  return seen||noise;
}

function wake(g,z){
  if(occupied(g,z,z)||!g.world.canOccupy(z.x,z.z,z.radius,1.7))return;
  if(z.behavior==='sitting'){
    z.seatExitAt=g.state.time; z.seatExitDuration=LENGTH[POSES[z.model].rise];
  }
  pose(z,g.state.time,'rising','rise'); z.wait=0;
}

function travel(g,z,state,goal){
  const key=state==='pursuing' && z.hp>48?'run':z.weakGait||z.hp<75?'limp':'walk';
  if(z.behavior!==state||z.clip!==POSES[z.model][key])pose(z,g.state.time,state,key,{loop:true});
  if(!z.goal||distance(z.goal,goal)>.8){z.goal={x:goal.x,z:goal.z};z.replan=true;z.stalledAt=null;}
}

function ambient(g,z){
  const t=g.state.time, w=g.world, sites=g.zombieSites.patrol, i=z.ambientCount++;
  if(z.model==='hollow' && i%4===1){pose(z,t,'ambient','pain');return;}
  if(z.model==='tattered' && i%3===1 && w.canOccupy(z.x,z.z,.84,1.7)){
    pose(z,t,'ambient',['flare','reach','contortion'][z.gestureIndex++%3]);return;
  }
  const nearby=sites.filter(p=>distance(p,z)>2 && distance(p,z)<23 && distance(p,z.home)<16 && !occupied(g,p,z));
  if(nearby.length) travel(g,z,'wandering',nearby[Math.floor(g.zombieRandom()*nearby.length)]);
  else idle(g,z);
}

const inReach=(g,z,a)=>a?.alive && distance(z,a)<.88 && Math.abs(z.y-a.y)<.5 &&
  g.world.segmentClear(at(z,.66),at(a,.66),{vision:false}) && g.canSee(at(z,1.12),at(a,1.12));
function think(g,z){
  const t=g.state.time, stimulus=perceive(g,z);
  if(z.behavior==='sleeping'||z.behavior==='sitting'){if(stimulus)wake(g,z);return;}
  if(busy.has(z.behavior))return;
  const a=g.actors.find(o=>o.id===z.targetId);
  if(a && !z.aggressive && distance(z,a)<3.5){
    // A retiring resident yields the aisle to a passing group.
    const refuges=g.zombieSites.patrol.filter(p=>distance(z,p)<16 && distance(a,p)>4);
    const refuge=refuges.sort((u,v)=>distance(u,z)-distance(v,z))[0];
    if(refuge)travel(g,z,'wandering',refuge);
    return;
  }
  if(a && z.aggressive && inReach(g,z,a) && t>=z.nextAttack){
    z.yaw=facing(z,a); z.path=[];z.goal=null;z.attackId=a.id;
    pose(z,t,'attack','stomp');z.impactAt=t+(z.model==='hollow'?.88:.78);
    g.emit('zombie-windup',z);return;
  }
  // Residents break off at the edge of their territory and leave mission interactions clear.
  const objectives=[g.world.anchors.bomb,g.world.anchors.rescue,...g.world.anchors.hostages];
  if(z.lastKnown && (distance(z.home,z.lastKnown)>10 || objectives.some(p=>p && distance(p,z.lastKnown)<3))){
    z.lastKnown=null;z.targetId=null;
    if(distance(z,z.home)>2){travel(g,z,'wandering',z.home);return;}
  }
  if(z.lastKnown && t<z.memoryUntil){
    const state=a && z.aggressive?'pursuing':'investigating';
    if(distance(z,z.lastKnown)>.46)travel(g,z,state,z.lastKnown);
    else if(moving.has(z.behavior))idle(g,z);
    return;
  }
  if(z.behavior==='pursuing'||z.behavior==='investigating')idle(g,z);
  if(z.behavior==='idle' && t>=z.nextAmbient)ambient(g,z);
}

function move(g,z,dt){
  const t=g.state.time;
  if(!z.goal)return;
  if((z.replan||!z.path.length) && t>=z.nextPath && t>=g.nextZombiePath){
    const blockers=z.blockedBy?g.actors.filter(a=>a.alive && a.id!==z.targetId && distance(a,z)<2):[];
    z.path=g.world.findPath(z,z.goal,{blockers});
    if(!z.path.length)z.path=rejoinNavigation(g,z);
    z.replan=false;z.nextPath=t+1.1;g.nextZombiePath=t+.22;
    if(!z.path.length){idle(g,z);return;}
  }
  while(z.path.length && distance(z,z.path[0])<.07)z.path.shift();
  const p=z.path[0];if(!p){if(distance(z,z.goal)<.4)idle(g,z);return;}
  const length=distance(z,p), speed=z.clip===POSES[z.model].run?2.05:z.clip===POSES[z.model].limp?.52:.84;
  const step=Math.min(length,dt*speed), x=z.x,zz=z.z;
  g.moveBody(z,(p.x-x)/length*step,0,(p.z-zz)/length*step);
  const walked=Math.hypot(z.x-x,z.z-zz);z.moving=walked/dt;
  if(walked>.0005){
    z.yaw=Math.atan2(x-z.x,zz-z.z);z.wait=0;z.stalledAt=null;z.stepDistance+=walked;
    if(z.stepDistance>.8){
      z.stepDistance=0;g.emit('step',z,{mode:speed>1?'run':'sneak',surface:g.world.materialAt(z.x,z.z)});
    }
  }
  else {
    z.stalledAt??=t;
    if(t-z.stalledAt>2.5 && z.behavior==='wandering'){idle(g,z);return;}
    if((z.wait+=dt)>.65){z.path=[];z.replan=true;z.wait=0;}
  }
}

function tickOne(g,z,dt){
  const t=g.state.time; z.bodyTime=t;z.height=bodyHeight(z,t);
  if(z.behavior==='attack' && t>=z.impactAt){
    z.impactAt=Infinity;const a=g.actors.find(o=>o.id===z.attackId);
    g.emit('zombie-stomp',z,{surface:g.world.materialAt(z.x,z.z)});
    if(inReach(g,z,a))g.pendingDamage.push({source:z,target:a,amount:12,kind:'stomp'});
    z.nextAttack=t+3;
  }
  if(t>=z.until){
    if(z.behavior==='knockdown'){
      if(z.model==='hollow')pose(z,t,'recovering','rise');
      else {const key=z.clip===POSES.tattered.blast?'blast':'down';pose(z,t,'recovering',key,{rate:-1,offset:LENGTH[z.clip]});}
    } else idle(g,z);
  }
  if(t>=z.nextSense){z.nextSense=t+.33;think(g,z);}
  if(moving.has(z.behavior))move(g,z,dt);
}

export function tickDance(g){
  const z=g.state.zombies.find(resident=>resident.model==='danceman');
  if(z?.alive && g.state.time>=z.until)nextDance(g,z);
}

export function tickZombies(g,dt){
  const list=g.state.zombies;
  for(let i=0;i<list.length;i++){
    const z=list[i];
    if(z.model==='danceman')continue;
    if(z.alive){tickOne(g,z,dt);continue;}
    if(g.state.mode!=='endless'||g.state.time<z.revisitAt)continue;
    z.revisitAt=g.state.time+5;
    // Replace a corpse only when both ends of the replacement are out of sight.
    const observed=p=>g.actors.some(a=>a.alive && (distance(a,p)<7 ||
      distance(a,p)<22 && g.canSee(at(a,1.4),at(p,.8))));
    if(!observed(z)&&!observed(z.home)&&!occupied(g,z.home,z)&&g.world.canOccupy(z.home.x,z.home.z,z.radius,1.7)){
      for(const a of g.actors)if(a.bot?.memory.hasRecord(z))a.bot.memory.deleteRecord(z);
      list[i]=spawn(g,z.home,i);
    }
  }
}

export function reactZombie(g,z,kind,hit,source){
  const t=g.state.time, was=z.behavior, blast=kind==='he'||kind==='bazooka';
  if(z.model==='danceman'){
    if(z.hp<=0)pose(z,t,'dead','dead');
    return;
  }
  if(source){z.lastKnown={x:source.x,z:source.z};z.memoryUntil=t+6;}
  if(z.hp<=0){
    z.path=[];z.goal=null;z.targetId=null;z.attackId=null;z.impactAt=Infinity;z.revisitAt=t+55;
    const low=z.height<.85, seated=was==='sitting'||(was==='rising'&&z.seatExitAt!=null && t-z.seatExitAt<1.4);
    const front=hit.direction.x*(-Math.sin(z.yaw))+hit.direction.z*(-Math.cos(z.yaw))>0;
    const abdomen=hit.point.y-z.y>.62 && hit.point.y-z.y<1.02;
    let key=blast?'blast':abdomen?'abdominal':kind==='knife'||low?'dead':front?'front':'back';
    const sign=key==='front'?1:-1, clear=g.world.canOccupy(z.x-sign*Math.sin(z.yaw)*.72,z.z-sign*Math.cos(z.yaw)*.72,.30,.55);
    if(!clear && !low)key='dead';
    if(seated){z.seatExitAt=t;z.seatExitDuration=.85;}
    pose(z,t,'dead',key,{offset:low?LENGTH[POSES[z.model][key]]*.85:seated?.7:0});
    return;
  }
  if(was==='sitting'||was==='sleeping'){wake(g,z);return;}
  if(['knockdown','recovering','rising'].includes(was)||t-z.hitAt<.55)return;
  z.hitAt=t;z.path=[];z.goal=null;z.attackId=null;z.impactAt=Infinity;
  if(blast||hit.amount>=35){pose(z,t,'knockdown',blast?'blast':'down');return;}
  const key=z.model==='hollow' && kind==='knife'?'strike':z.model==='hollow' && hit.point.y-z.y>1.4?'pain':'flinch';
  pose(z,t,'hurt',key);
}
