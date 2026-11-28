// Adapted from Riposte, copyright (c) 2026 BenDBSS. See licenses/riposte-MIT.txt.
// Riposte 09b-killcam's time ring and shortest-arc camera interpolation.
// The wire allowlist contains only the two historical participants in a kill.
export const REPLAY_SECONDS=2.8;
export const REPLAY_FRAMES=46;
const SAMPLE_INTERVAL=1/15;
const sameKeys=(a,b,keys)=>!!a&&!!b&&keys.every(k=>a[k]===b[k]);
export const sameReplayWorld=(a,b)=>sameKeys(a,b,['matchId','worldRevision','mapId','round']);
export const sameReplaySeat=(a,b)=>sameReplayWorld(a,b)&&sameKeys(a,b,['actorId','lifeId','controlEpoch']);
const quantize=n=>Math.round(n*1000)/1000;
const bounded=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const string=(s,max=80)=>typeof s==='string'&&s.length>0&&s.length<=max;
function pose(actor){
  if(!['x','y','z','yaw','pitch','height'].every(k=>Number.isFinite(actor[k])))return null;
  return {x:quantize(actor.x),y:quantize(actor.y),z:quantize(actor.z),yaw:quantize(actor.yaw),pitch:quantize(actor.pitch),
    height:quantize(actor.height),aim:quantize(Math.max(0,Math.min(1,actor.aimAmount||0))),weapon:actor.weapon||'knife',
    alive:!!actor.alive,crouch:!!actor.crouching};
}
const generation=a=>({lifeId:a.lifeId??0,controlEpoch:a.controlEpoch??0});
const sameGeneration=(a,b)=>sameKeys(a,b,['lifeId','controlEpoch']);
function participant(a){return {id:a.id,name:String(a.name||a.id).slice(0,80),team:a.team,outfitId:a.outfitId??'issued',...generation(a)};}
export class ReplayHistory{
  constructor(){this.reset();}
  reset(){this.scope=null;this.frames=[];this.shots=[];this.lastTime=-Infinity;}
  record(scope,now,actors,events=[]){
    if(!Number.isFinite(now))return [];
    if(!sameReplayWorld(this.scope,scope)||now<this.lastTime)this.reset();
    this.scope??={...scope};this.lastTime=now;
    const latest=this.frames.at(-1);
    if(!events.length&&latest&&now-latest.time<SAMPLE_INTERVAL-.000001)return [];
    const byId=new Map(actors.map(a=>[a.id,a]));
    const kills=events.filter(e=>e.type==='kill'&&byId.has(e.sourceId)&&byId.has(e.actorId)&&e.sourceId!==e.actorId);
    for(const event of events){
      const actor=byId.get(event.actorId);
      if(event.type==='shot'&&actor&&Number.isFinite(event.time))this.shots.push({time:event.time,id:actor.id,...generation(actor)});
    }
    while(this.shots.length&&(this.shots.length>96||this.shots[0].time<now-REPLAY_SECONDS))this.shots.shift();
    if(!kills.length&&latest&&now-latest.time<SAMPLE_INTERVAL-.000001)return [];
    const poses=new Map();
    for(const a of actors){
      const p=pose(a);
      if(p)poses.set(a.id,{...generation(a),pose:p});
    }
    for(const event of events){
      const p=poses.get(event.actorId)?.pose;
      if(event.type==='shot'&&p&&Number.isFinite(event.yaw)&&Number.isFinite(event.pitch)){
        p.yaw=quantize(event.yaw);p.pitch=quantize(event.pitch);
      }
    }
    if(latest?.time===now)this.frames.pop();
    this.frames.push({time:now,poses});
    while(this.frames.length>REPLAY_FRAMES||this.frames[0].time<now-REPLAY_SECONDS)this.frames.shift();
    return kills.flatMap(e=>{
      const killer=participant(byId.get(e.sourceId)),victim=participant(byId.get(e.actorId));
      const samples=[];
      // Stop at the generation boundary; an absent/reassigned actor never bridges history.
      for(let i=this.frames.length-1;i>=0;i--){
        const frame=this.frames[i],k=frame.poses.get(killer.id),v=frame.poses.get(victim.id);
        if(!sameGeneration(k,killer)||!sameGeneration(v,victim)||(!k.pose.alive&&i!==this.frames.length-1)||
           (!v.pose.alive&&i!==this.frames.length-1)||(samples[0]&&samples[0].time-frame.time>.3))break;
        samples.unshift({time:frame.time,k:k.pose,v:v.pose});
      }
      const tail=samples.at(-1);
      const a=e.sourcePosition??tail?.k,b=e.point??tail?.v;
      if(!a||!b)return [];
      const distance=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
      const card={version:1,...scope,serial:e.serial,killer,victim,weapon:e.weapon||tail?.k.weapon,distance:quantize(distance)};
      if(!validReplayCard(card))return [];
      if(samples.length<2)return [card];
      const start=samples[0].time;
      const clip={...card,
        samples:samples.map(({time,k,v})=>({t:quantize(time-start),k,v})),
        shots:this.shots.filter(s=>s.id===killer.id&&sameGeneration(s,killer)&&s.time>=start&&s.time<=now).slice(-32).map(s=>quantize(s.time-start))};
      return validReplayClip(clip)?[clip]:[];
    });
  }
}
function validPose(p){
  return p&&['x','y','z','yaw','pitch'].every(k=>bounded(p[k],-100000,100000))&&bounded(p.height,.05,10)&&
    bounded(p.aim,0,1)&&string(p.weapon,40)&&typeof p.alive==='boolean'&&typeof p.crouch==='boolean';
}
function validParticipant(a){return a&&string(a.id)&&string(a.name)&&string(a.team,32)&&
  [a.lifeId,a.controlEpoch].every(n=>Number.isSafeInteger(n)&&n>=0);}
export function validReplayCard(c){
  return c?.version===1&&validParticipant(c.killer)&&validParticipant(c.victim)&&c.killer.id!==c.victim.id&&
    string(c.weapon,40)&&Number.isSafeInteger(c.serial)&&c.serial>=1&&bounded(c.distance,0,100000);
}
export function validReplayClip(c){
  if(!validReplayCard(c)||!Array.isArray(c.samples)||c.samples.length<2||
    c.samples.length>REPLAY_FRAMES||!Array.isArray(c.shots)||c.shots.length>32)return false;
  let last=-1;
  for(const s of c.samples){
    if(!s||!bounded(s.t,0,REPLAY_SECONDS+.001)||s.t<=last||!validPose(s.k)||!validPose(s.v))return false;
    last=s.t;
  }
  return c.samples[0].t===0&&c.shots.every(t=>bounded(t,0,last));
}
const lerp=(a,b,f)=>a+(b-a)*f;
function blend(a,b,f){
  const dy=b.yaw-a.yaw;
  return {...(f===1?b:a),x:lerp(a.x,b.x,f),y:lerp(a.y,b.y,f),z:lerp(a.z,b.z,f),
    height:lerp(a.height,b.height,f),aim:lerp(a.aim,b.aim,f),pitch:lerp(a.pitch,b.pitch,f),
    yaw:a.yaw+Math.atan2(Math.sin(dy),Math.cos(dy))*f};
}
export function sampleReplay(clip,time){
  const frames=clip.samples;
  let i=1;
  while(i<frames.length-1&&frames[i].t<time)i++;
  const a=frames[i-1],b=frames[i],f=Math.max(0,Math.min(1,(time-a.t)/(b.t-a.t)));
  return {camera:blend(a.k,b.k,f),target:blend(a.v,b.v,f),shots:clip.shots.filter(t=>t<=time&&time-t<.09)};
}
