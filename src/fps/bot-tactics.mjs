/** Decisions layered on the existing Yuka graph, sensors and objective rules. */
import {distanceSegment} from './physics.mjs';
import {pathLength} from './tactical-map.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=p=>({x:p.x,z:p.z});
export const routeCorridor=(from,path,weight=3)=>path.map((p,i)=>({a:point(i?path[i-1]:from),b:point(p),radius:2.4,weight}));
const deviation=(from,path,other)=>Math.max(0,...path.map(p=>Math.min(...routeCorridor(from,other).map(s=>distanceSegment(p.x,p.z,[s.a.x,s.a.z],[s.b.x,s.b.z])))));

export function routeChoices(navigation,from,to){
 const direct=navigation.findPath(from,to);if(!direct.length)return [];
 const base=pathLength(from,direct),choices=[{id:'route-1',path:direct,length:base}],avoid=routeCorridor(from,direct,4);
 for(let i=0;i<2;i++){
  const path=navigation.findPath(from,to,{avoid}),length=pathLength(from,path);
  if(!path.length||length>base*1.65+4)break;
  if(choices.every(c=>deviation(from,path,c.path)>1.8))choices.push({id:'route-'+(choices.length+1),path,length});
  avoid.push(...routeCorridor(from,path,4));
 }
 return choices;
}

/** Prepared during level load, with the same open-door navigation used by FPS.
 * No authored coordinates, new floor or imaginary passages. */
export function createFloorTactics(navigation,anchors){
 const prepared=new Map(),targets={bomb:anchors.bomb,hostages:anchors.hostages[0]};
 for(const team of ['analysts','counterAnalysts'])for(const [key,to]of Object.entries(targets)){
  const from=anchors[team]?.[0];if(from&&to)prepared.set(team+':'+key,routeChoices(navigation,from,to));
 }
 return {kind:'floor5',lanes:[],geometryChanged:false,
  choices:(team,key)=>prepared.get(team+':'+key)||[],
  targetKey:p=>Object.entries(targets).find(([,v])=>v&&distance(p,v)<3)?.[0]||null,
 };
}

/** Public team tasks and reported snapshots only. Enemy actors are never read. */
export class SquadTactics {
 constructor(game){
  this.game=game;this.signature='';this.assignments=new Map();this.claims=new Map();this.ranks=new Map();
  for(const a of game.actors)if(a.bot)this.ranks.set(a.id,game.random());
  this.refresh();
  for(const team of ['analysts','counterAnalysts']){
   const door=game.world.doors?.elevators?.cabins.find(c=>c.id===game.world.project?.gameplay.startElevators?.find(e=>e.team===team)?.doorId);
   const bots=game.actors.filter(a=>a.bot&&a.team===team).sort((a,b)=>door?distance(a,door)-distance(b,door):this.rank(a)-this.rank(b));
   bots.forEach((a,i)=>{a.bot.departAt=game.state.roundStartedAt+i*.32+game.random()*.18;});
  }
 }
 rank(a){return this.ranks.get(a.id)??a.index/5;}
 refresh(){
  const g=this.game,b=g.bomb,signature=[g.actors.filter(a=>a.alive).map(a=>a.id).join(','),b.status,b.carrierId,...g.hostages.map(h=>`${h.id}:${h.alive}:${h.rescued}:${h.escortId}`)].join('|');
  if(signature===this.signature)return;this.signature=signature;this.assignments.clear();
  for(const team of ['analysts','counterAnalysts']){
   const bots=g.actors.filter(a=>a.alive&&a.bot&&a.team===team).sort((a,c)=>this.rank(a)-this.rank(c));
   if(team==='analysts'){
    const roles=['defend','guard','watch','flank','support'];
    bots.forEach((a,i)=>this.assignments.set(a.id,{role:roles[i],focus:i===1?'hostages':'bomb'}));
   }else{
    const available=g.hostages.filter(h=>h.alive!==false&&!h.rescued&&!h.escortId),others=[];
    for(const a of bots){
     if(a.id===b.carrierId)this.assignments.set(a.id,{role:'objective',focus:'bomb'});
     else if(g.hostages.some(h=>h.escortId===a.id&&!h.rescued))this.assignments.set(a.id,{role:'escort',focus:'rescue'});
     else others.push(a);
    }
    others.forEach((a,i)=>this.assignments.set(a.id,i<available.length?{role:'rescue',focus:'hostages',hostageId:available[i].id}:{role:i===available.length?'flank':'support',focus:'bomb'}));
   }
  }
  for(const a of g.actors)if(a.bot){const task=this.assignments.get(a.id);if(task){a.aiRole=task.role;a.bot.task=task;}}
 }
 claim(bot,record){
  const g=this.game,now=g.state.time,a=bot.actor,key=`${a.team}:${record.entity.id}:${Math.round(record.lastSensedPosition.x/3)}:${Math.round(record.lastSensedPosition.z/3)}`;
  for(const [id,c]of this.claims)if(c.until<now||!g.actors.some(a=>a.id===id&&a.alive))this.claims.delete(id);
  const own=this.claims.get(a.id);if(own?.key===key)return true;
  if(this.claims.size>16)this.claims.clear();
  if([...this.claims.values()].filter(c=>c.key===key).length>=2)return false;
  // A defender keeps the objective covered while another teammate investigates.
  if(['defend','guard'].includes(a.aiRole)&&g.actors.some(o=>o!==a&&o.alive&&o.team===a.team&&o.bot&&!o.bot.urgentObjective()))return false;
  this.claims.set(a.id,{key,until:now+4.5});return true;
 }
 release(bot){this.claims.delete(bot.actor.id);}
 contacts(team){
  const now=this.game.state.time;
  return (this.game.tacticalContacts||[]).filter(c=>c.team===team&&c.at<=now&&now-c.at<8).map(c=>({...c,radius:4,weight:5*(1-(now-c.at)/8)}));
 }
}

/** Small local probes choose real cover/standing space, never alter furniture. */
export function tacticalPosition(bot,center,{threat=null,radius=2.2,cover=false}={}){
 const {game:g,actor:a}=bot,w=g.world,phase=bot.positionPhase??bot.style.angle,candidates=[];
 for(let i=0;i<12;i++){
  const angle=phase+i*Math.PI/6,p={x:center.x+Math.cos(angle)*radius,z:center.z+Math.sin(angle)*radius};
  if(!w.canOccupy(p.x,p.z,a.radius+.02)||g.actors.some(o=>o!==a&&o.alive&&o.team===a.team&&(distance(o,p)<.75||o.bot?.hold&&distance(o.bot.hold.point,p)<.75)))continue;
  if(g.hostages.some(h=>h.alive!==false&&!h.rescued&&distance(h,p)<.65))continue;
  if(!w.navigation.clear(cover?a:center,p))continue;
  let score=-distance(a,p)*.12;
  if(threat){const sheltered=!g.canSee({...p,y:1.35},{...threat,y:threat.y??1.3});score+=sheltered?(cover?5:1):0;}
  candidates.push({...p,score});
 }
 candidates.sort((a,b)=>b.score-a.score);
 return candidates[0]||point(center);
}
