// Riposte 09i-modes. Rules run on the same fixed step in Solo and on the host.
export const FFA='ffa', DOMINATION='dom';
export const DOMINATION_LIMIT=100;
export const finiteActionMode=mode=>mode===FFA||mode===DOMINATION;
export const respawnMode=mode=>mode==='endless'||finiteActionMode(mode);
export const simulationMode=roomMode=>roomMode==='tdm'?'endless':roomMode;
const teams=['analysts','counterAnalysts'];
const donorFlags={meltem:[[-10,36],[-20,0],[-10.5,-36]],embruns:[[-2,29],[11.5,0],[-1.5,-29.5]],tephra:[[.5,41.5],[-14.5,0],[0,-41.5]]};
const layouts=new WeakMap();
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

function flagLayout(world){
 if(layouts.has(world))return layouts.get(world);
 const home=world.anchors.analysts[0],away=world.anchors.counterAnalysts[0];
 const reference=donorFlags[world.referenceId];
 const positions=reference?reference.map(([x,z])=>({x,z})):
  [.2,.5,.8].map(t=>({x:home.x+(away.x-home.x)*t,z:home.z+(away.z-home.z)*t}));
 const radius=reference?5.5:Math.min(2.8,distance(home,away)*.09);
 const flags=[];
 for(const [i,p] of positions.entries()){
  const candidates=world.navigation.nodes.filter(n=>flags.every(z=>distance(z,n)>radius*2));
  candidates.sort((a,b)=>distance(a,p)-distance(b,p));
  const n=candidates.find(n=>world.canOccupy(n.x,n.z,.32,1.72,n.y??0)&&
    world.findPath(home,n).length&&world.findPath(away,n).length);
  if(!n)throw Error('Domination needs three reachable, separate capture points.');
  flags.push({id:'ABC'[i],x:n.x,y:n.y??0,z:n.z,radius});
 }
 layouts.set(world,flags);return flags;
}
export function resetModeObjectives(game){
 const s=game.state;
 s.zones=s.mode===DOMINATION?flagLayout(game.world).map(z=>({...z,owner:'',progress:0,contested:false})):[];
 s.zoneScoreCarry={analysts:0,counterAnalysts:0};
 if(finiteActionMode(s.mode)){
  s.deadline=s.time+(game.config.matchMinutes??10)*60;
  s.scoreTarget=s.mode===FFA?(game.config.fragLimit??25):(game.config.dominationLimit??DOMINATION_LIMIT);
 }
}
export const compareFFA=(a,b)=>b.kills-a.kills||a.deaths-b.deaths||(b.combat?.points??b.handling?.points??b.points??0)-(a.combat?.points??a.handling?.points??a.points??0)||a.id.localeCompare(b.id);
export function rankFFA(actors){
 return [...actors].sort(compareFFA);
}
export function modeWinner(mode,actors,score){
 if(mode!==FFA)return score.analysts===score.counterAnalysts?'draw':score.analysts>score.counterAnalysts?'analysts':'counterAnalysts';
 const [a,b]=rankFFA(actors);
 if(!a||b&&a.kills===b.kills&&a.deaths===b.deaths&&(a.combat?.points??0)===(b.combat?.points??0))return 'draw';
 return a.id;
}
export function modeReachedTarget(mode,actors,score,target){
 return mode===FFA?actors.some(a=>a.kills>=target):teams.some(t=>score[t]>=target);
}
function tickFlags(g,dt){
 const s=g.state;
 for(const z of s.zones){
  const occupants=g.actors.filter(a=>a.alive&&!a.disconnected&&a.spawnProtectedUntil<=s.time&&Math.abs(a.y-z.y)<=2.8&&distance(a,z)<=z.radius&&
   g.world.segmentClear({x:a.x,y:a.y+.85,z:a.z},{x:z.x,y:z.y+.85,z:z.z},{vision:false}));
  const side=occupants[0]?.team;
  z.contested=occupants.some(a=>a.team!==side);
  if(z.contested)continue;
  if(side){
   const speed=(1+.5*(Math.min(3,occupants.length)-1))/6;
   z.progress=clamp(z.progress+(side===teams[0]?1:-1)*dt*speed,-1,1);
  }else{
   const home=z.owner===teams[0]?1:z.owner===teams[1]?-1:0;
   z.progress+=clamp(home-z.progress,-dt*.1,dt*.1);
  }
  const old=z.owner;
  if(z.progress>=1-1e-8){z.progress=1;z.owner=teams[0];}
  else if(z.progress<=-1+1e-8){z.progress=-1;z.owner=teams[1];}
  else if(old===teams[0]&&z.progress<=0||old===teams[1]&&z.progress>=0)z.owner='';
  if(z.owner!==old){
   if(z.owner)for(const a of occupants){
    a.combat.captures++;a.combat.points+=75;
    g.emit('combat-medal',a,{kind:'capture',title:'ZONE CAPTURED',detail:z.id,points:75});
   }
   g.emit(z.owner?'control-captured':'control-neutralized',null,{id:z.id,team:z.owner,actorIds:occupants.map(a=>a.id)});
  }
 }
 for(const team of teams){
  s.zoneScoreCarry[team]+=dt*s.zones.filter(z=>z.owner===team).length/4;
  const points=Math.floor(s.zoneScoreCarry[team]+1e-8);
  s.score[team]+=points;s.zoneScoreCarry[team]-=points;
 }
}
export function tickMatchMode(g,dt){
 const s=g.state;
 if(!finiteActionMode(s.mode))return;
 if(s.mode===DOMINATION)tickFlags(g,dt);
 if(g.config.networkSlice)return;
 const reached=modeReachedTarget(s.mode,g.actors,s.score,s.scoreTarget);
 if(!reached&&s.time<s.deadline)return;
 s.phase='match';s.result={winner:modeWinner(s.mode,g.actors,s.score),reason:reached?'score':'time'};
 g.emit('match',null,s.result);
}
export function dominationObjective(bot){
 const g=bot.game,a=bot.actor,zones=g.state.zones;
 if(g.state.mode!==DOMINATION||!zones.length)return false;
 // Split the squad between public objectives. Retain a defender on an owned point.
 const preferred=zones[(a.index+(a.team===teams[0]?0:2))%zones.length];
 const target=preferred.owner!==a.team||a.index===0?preferred:
  zones.filter(z=>z.owner!==a.team).sort((x,y)=>distance(a,x)-distance(a,y))[0]??preferred;
 const inside=distance(a,target)<target.radius*.55&&Math.abs(a.y-target.y)<1.5&&
  g.world.segmentClear({x:a.x,y:a.y+.85,z:a.z},{x:target.x,y:target.y+.85,z:target.z},{vision:false});
 bot.setGoal(inside?null:target);a.aiState=inside?'Holding point':'Moving to point';return true;
}
export function spawnSide(g,a){
 if(g.state.mode!==DOMINATION)return a.team;
 const [home,,away]=g.state.zones||[],other=teams.find(t=>t!==a.team);
 if(!home||!away)return a.team;
 const ownBase=distance(g.world.anchors[a.team][0],home)<distance(g.world.anchors[a.team][0],away)?home:away;
 return ownBase.owner===other&&(ownBase===home?away:home).owner===a.team?other:a.team;
}
