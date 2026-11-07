/** Shared deterministic scenarios for Node and the real FPS browser harness. */
export function* roundFrames(game,{rounds=2}={}){
 const w=game.world,report={seed:game.seed,team:game.team,results:[],routes:[],exits:[],yields:0,earlyShots:0,maxMovingStall:0,positions:[]},checked=new Set(),stalls=new Map();
 const limit=rounds*(game.config.buyTime+game.config.roundTime+game.config.bombTime+game.config.resultTime)+5;
 for(let tick=0;tick<60*limit&&report.results.length<rounds;tick++){
  game.step(1/60);
  for(const e of game.events){
   if(e.type==='route')report.routes.push({round:game.state.round,actor:e.actorId,lane:e.lane,role:e.role});
   if(e.type==='bot-yield')report.yields++;
   if(e.type==='shot'&&Number.isFinite(e.reactionAt)&&e.time+1e-7<e.reactionAt)report.earlyShots++;
   if(e.type==='result')report.results.push({round:game.state.round,reason:e.reason,winner:e.winner});
  }
  const elapsed=game.state.time-game.state.roundStartedAt;
  for(const a of game.actors){
   const wantsMove=game.phase==='active'&&a.alive&&a.bot.mode==='objective'&&a.bot.goal&&Math.hypot(a.x-a.bot.goal.x,a.z-a.bot.goal.z)>.6&&!a.action&&!game.hostages.some(h=>h.escortId===a.id);
   const stalled=wantsMove&&a.moving<.1?(stalls.get(a.id)||0)+1/60:0;stalls.set(a.id,stalled);
   if(stalled>report.maxMovingStall){report.maxMovingStall=stalled;report.worstStall={id:a.id,x:a.x,z:a.z,goal:a.bot.goal,round:game.state.round,time:game.state.time};}
  }
  if(elapsed>=12&&!checked.has(game.state.round)){
   checked.add(game.state.round);report.exits.push({round:game.state.round,actors:game.actors.map(a=>({id:a.id,alive:a.alive,room:w.roomAt(a.x,a.z)?.id,travel:a.bot.distanceTravelled}))});
   yield {name:'exit-'+game.state.round,time:game.state.time};
  }
  if(tick%120===0){
   for(const a of game.actors.filter(a=>a.alive)){
    if(!w.scopeAllowed(a.x,a.z,a.radius))throw Error('Actor outside allowed floor: '+a.id);
   }
   report.positions.push({round:game.state.round,time:game.state.time,actors:game.actors.filter(a=>a.alive).map(a=>({id:a.id,x:a.x,z:a.z,mode:a.bot.mode,role:a.aiRole}))});
  }
  if(tick%1200===0)yield {name:'round-'+game.state.round+'-'+Math.round(elapsed),time:game.state.time};
  game.events=[];
 }
 return report;
}
export function runRounds(game,options={}){
 const frames=roundFrames(game,options);let step;
 do{step=frames.next();if(!step.done)options.onFrame?.(step.value.name,game);}while(!step.done);
 return step.value;
}
export function runObjective(game,scenario){
 for(const a of game.actors)if(a.team!==game.team)a.bot=null;
 if(scenario==='defuse')Object.assign(game.bomb,{...game.world.anchors.bomb,status:'planted',carrierId:null,deadline:game.state.time+game.config.bombTime});
 if(scenario==='rescue')Object.assign(game.bomb,{status:'inactive',carrierId:null});
 const events=[];
 for(let tick=0;tick<60*122&&game.phase!=='result';tick++){
  game.step(1/60);events.push(...game.events.filter(e=>['planted','defuse','hostage','rescued'].includes(e.type)));game.events=[];
  if(scenario==='plant'&&game.bomb.status==='planted')break;
 }
 return {seed:game.seed,scenario,time:game.state.time,result:game.state.result?.reason,bomb:game.bomb.status,rescued:game.hostages.filter(h=>h.rescued).length,events};
}
