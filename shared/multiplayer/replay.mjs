// Adapted from Riposte, copyright (c) 2026 BenDBSS. See licenses/riposte-MIT.txt.
// Riposte 09b-killcam's time ring and shortest-arc camera interpolation.
// The wire allowlist contains only the two historical participants in a kill.
import {equippedDefinition} from '../../src/fps/arsenal.mjs';
import {aimFov} from '../../src/fps/tactical-rules.mjs';

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
      if(event.type==='shot'&&actor&&Number.isFinite(event.time))this.shots.push({
        time:event.time,id:actor.id,...generation(actor),weapon:event.weapon??actor.weapon,suppressed:event.suppressed===true
      });
    }
    while(this.shots.length&&(this.shots.length>96||this.shots[0].time<now-REPLAY_SECONDS))this.shots.shift();
    if(!kills.length&&latest&&now-latest.time<SAMPLE_INTERVAL-.000001)return [];
    const poses=new Map();
    for(const a of actors){
      const p=pose(a);
      if(p)poses.set(a.id,{...generation(a),pose:p,opticalFov:quantize(aimFov(a.weapon,equippedDefinition(a)?.zoom))});
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
        const newer=samples[0];
        if(newer&&[ [newer.k,k.pose],[newer.v,v.pose] ].some(([a,b])=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>4))break;
        samples.unshift({time:frame.time,k:{...k.pose,opticalFov:k.opticalFov},v:v.pose});
      }
      const tail=samples.at(-1);
      const a=e.sourcePosition??tail?.k,b=e.point??tail?.v;
      if(!a||!b)return [];
      const distance=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
      const card={version:1,...scope,serial:e.serial,killer,victim,weapon:e.weapon||tail?.k.weapon,distance:quantize(distance)};
      if(!validReplayCard(card))return [];
      if(samples.length<2)return [card];
      const start=samples[0].time;
      const lethalTime=Number.isFinite(e.time)?Math.max(start,Math.min(e.time,now)):now;
      const clip={...card,hitTime:quantize(lethalTime-start),
        samples:samples.map(({time,k,v})=>({t:quantize(time-start),k,v})),
        shots:this.shots.filter(s=>s.id===killer.id&&sameGeneration(s,killer)&&s.time>=start&&s.time<=now).slice(-32).map(s=>({t:quantize(s.time-start),weapon:s.weapon,suppressed:s.suppressed}))};
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
    if(!s||!bounded(s.t,0,REPLAY_SECONDS+.001)||s.t<=last||!validPose(s.k)||!bounded(s.k.opticalFov,12,90)||!validPose(s.v))return false;
    last=s.t;
  }
  return c.samples[0].t===0&&bounded(c.hitTime,0,last)&&c.shots.every(s=>s&&bounded(s.t,0,last)&&
    string(s.weapon,40)&&typeof s.suppressed==='boolean');
}
const lerp=(a,b,f)=>a+(b-a)*f;
const angularDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
// Riposte kcHermite with time-weighted neighboring tangents. Clamp to the
// recorded interval so sharp stops never carry the camera through a wall.
function hermite(previous,a,b,next,duration,leftSpan,rightSpan,u){
  const u2=u*u,u3=u2*u;
  const left=(b-previous)*duration/leftSpan,right=(next-a)*duration/rightSpan;
  const value=(2*u3-3*u2+1)*a+(u3-2*u2+u)*left+(-2*u3+3*u2)*b+(u3-u2)*right;
  return Math.max(Math.min(a,b),Math.min(Math.max(a,b),value));
}
function blend(previous,a,b,next,key,u){
  const p=previous[key],s=a[key],e=b[key],n=next[key];
  const curve=(p,s,e,n)=>hermite(p,s,e,n,b.t-a.t,b.t-previous.t,next.t-a.t,u);
  const yaw=s.yaw+angularDelta(s.yaw,e.yaw);
  return {...(u===1?e:s),x:curve(p.x,s.x,e.x,n.x),y:curve(p.y,s.y,e.y,n.y),z:curve(p.z,s.z,e.z,n.z),
    height:lerp(s.height,e.height,u),aim:lerp(s.aim,e.aim,u),pitch:curve(p.pitch,s.pitch,e.pitch,n.pitch),
    yaw:curve(s.yaw+angularDelta(s.yaw,p.yaw),s.yaw,yaw,yaw+angularDelta(e.yaw,n.yaw))};
}
export function sampleReplay(clip,time){
  const frames=clip.samples;
  let lo=0,hi=frames.length-1;
  while(hi-lo>1){
    const middle=(lo+hi)>>1;
    if(frames[middle].t<=time)lo=middle;else hi=middle;
  }
  const a=frames[lo],b=frames[hi],u=Math.max(0,Math.min(1,(time-a.t)/(b.t-a.t)));
  const previous=frames[lo-1]??a,next=frames[hi+1]??b;
  return {camera:blend(previous,a,b,next,'k',u),target:blend(previous,a,b,next,'v',u),shots:clip.shots.filter(s=>s.t<=time&&time-s.t<.09).map(s=>s.t)};
}
