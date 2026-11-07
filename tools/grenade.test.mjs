import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CONFIG } from '../src/fps/game.mjs';
import {grenadeLaunch,advanceGrenade,predictGrenade,grenadeThreat} from '../src/fps/grenade-physics.mjs';
const p=()=>({id:'human',team:'analysts',alive:true,x:0,y:0,z:0,height:1.7,yaw:0,pitch:0,weapon:'he',inventory:{he:1,flash:1,smoke:1},flash:0});
const config={...CONFIG};
function room({wall=false,ceiling=false,floor=true}={}) {
  const planes=[...(floor?[{axis:'y',at:0}]:[]),...(wall?[{axis:'z',at:-3}]:[]),...(ceiling?[{axis:'y',at:2.6}]:[])];
  return {raycast(o,d,max){
    let result=null;
    for(const plane of planes){const k=plane.axis;if(Math.abs(d[k])<1e-10)continue;
      const t=(plane.at-o[k])/d[k];
      if(t>=.0001&&t<max&&(!result||t<result.distance)){
        const normal={x:0,y:0,z:0};normal[k]=d[k]>0?-1:1;result={distance:t,normal};
      }
    }
    return result;
  }};
}
// Independent pre-0.14.1 integrator: guards against accidental gameplay retuning.
function legacy(g,world,dt){
  g.vy-=config.gravity*dt;
  const displacement={x:g.vx*dt,y:g.vy*dt,z:g.vz*dt};
  const length=Math.hypot(displacement.x,displacement.y,displacement.z);
  const dir=length?{x:displacement.x/length,y:displacement.y/length,z:displacement.z/length}:{x:0,y:-1,z:0};
  const hit=world.raycast(g,dir,length+g.radius,{vision:false});
  if(hit){const travel=Math.max(0,hit.distance-g.radius);g.x+=dir.x*travel;g.y+=dir.y*travel;g.z+=dir.z*travel;
    const n=hit.normal??{x:0,y:1,z:0},dot=g.vx*n.x+g.vy*n.y+g.vz*n.z;
    g.vx=(g.vx-1.6*dot*n.x)*.72;g.vy=(g.vy-1.6*dot*n.y)*.72;g.vz=(g.vz-1.6*dot*n.z)*.72;
  }else{g.x+=displacement.x;g.y+=displacement.y;g.z+=displacement.z;}
  if(g.y<g.radius){g.y=g.radius;g.vy=Math.abs(g.vy)*.35;g.vx*=.82;g.vz*=.82;}
}

test('shared launch preserves eye origin, throwing angle, speed and fuse',()=>{
  const a=p(),g=grenadeLaunch(a,config,10);
  assert.equal(g.y,1.7-.12);assert.equal(Math.abs(g.vx),0);
  assert.equal(g.vy,Math.sin(.15)*config.grenadeSpeed+1.8);
  assert.equal(g.vz,-Math.cos(.15)*config.grenadeSpeed);
  assert.equal(g.deadline,10+config.grenadeFuse);assert.equal(g.radius,config.grenadeRadius);
});
for(const name of ['open','wall','ceiling','fallback'])test('legacy physics unchanged: '+name,()=>{
  const world=room({wall:name==='wall',ceiling:name==='ceiling',floor:name!=='fallback'});
  for(const pitch of [-1.1,-.25,0,.6,1.2]){
    const a=p();a.pitch=pitch;
    const actual=grenadeLaunch(a,config),before={...actual};
    for(let i=0;i<120;i++){advanceGrenade(actual,world,config.gravity,config.fixedStep);legacy(before,world,config.fixedStep);assert.deepEqual(actual,before);}
  }
});
for(const name of ['open','wall','ceiling'])test('prediction equals real Game detonation endpoint: '+name,()=>{
  const a=p();a.pitch=name==='ceiling'?.9:0;
  const world=room({wall:name==='wall',ceiling:name==='ceiling'}),prediction=predictGrenade(a,config,world),events=[];
  let detonated;
  const game={world,config,state:{time:0,grenades:[grenadeLaunch(a,config)]},emit(type,actor,data){events.push(type);},detonateGrenade(g){detonated={...g};}};
  for(let i=0;i<200&&game.state.grenades.length;i++){
    game.state.time=i*config.fixedStep;Game.prototype.updateGrenades.call(game,config.fixedStep);
  }
  assert.ok(detonated);assert.deepEqual(prediction.endpoint,{x:detonated.x,y:detonated.y,z:detonated.z});
  assert.equal(events.filter(e=>e==='bounce').length,prediction.bounces);
  assert.ok(prediction.points.length<=prediction.steps+1);
  if(name==='wall')assert.ok(prediction.endpoint.z>-3,'Prediction bounces instead of going through wall');
});
test('prediction cannot consume inventory, launch projectiles or mutate the actor',()=>{
  const a=p(),snapshot=structuredClone(a);
  for(let i=0;i<10;i++)predictGrenade(a,config,room({wall:true}));
  assert.deepEqual(a,snapshot);
});
test('prediction has a strict step budget and rejects invalid time steps',()=>{
  for(const fixedStep of [0,-1,NaN,Infinity,.000001])assert.equal(predictGrenade(p(),{...config,fixedStep},room()),null);
  assert.equal(predictGrenade(p(),{...config,grenadeFuse:Infinity},room()),null);
});
function danger(){
  const player=p(),enemy={id:'enemy',team:'counterAnalysts'};
  const g={id:'incoming',type:'he',ownerId:'enemy',x:0,y:.1,z:-2,deadline:6};
  const game={player,actors:[player,enemy],phase:'active',config:{...config},state:{time:5,paused:false,grenades:[g]},world:{segmentClear:()=>true},smokeBlocks:()=>false};
  return {game,player,g};
}
test('HE danger includes countdown and turns relative to the view',()=>{
  const {game,player,g}=danger();let t=grenadeThreat(game);
  assert.equal(t.id,g.id);assert.equal(t.left,1);assert.equal(Math.abs(t.angle),0);
  g.x=2;g.z=0;t=grenadeThreat(game);assert.ok(Math.abs(t.angle-Math.PI/2)<1e-8);
  player.yaw=-Math.PI/2;t=grenadeThreat(game);assert.ok(Math.abs(t.angle)<1e-8);
});
test('solid cover, smoke, pause, death and blinded view hide danger',()=>{
  const {game,player}=danger();game.world.segmentClear=()=>false;assert.equal(grenadeThreat(game),null);
  game.world.segmentClear=()=>true;game.smokeBlocks=()=>true;assert.equal(grenadeThreat(game),null);
  game.smokeBlocks=()=>false;game.state.paused=true;assert.equal(grenadeThreat(game),null);
  game.state.paused=false;player.alive=false;assert.equal(grenadeThreat(game),null);
  player.alive=true;player.flash=.9;assert.equal(grenadeThreat(game),null);
});
test('friendly-fire and spawn shield rules prevent harmless HE warnings',()=>{
  const {game,player,g}=danger();g.ownerId=player.id;
  assert.equal(grenadeThreat(game),null);game.config.friendlyFire=true;assert.ok(grenadeThreat(game));
  player.spawnProtectedUntil=7;assert.equal(grenadeThreat(game),null);
});
test('flash warnings include friendly flash but never smoke cartridges or expired grenades',()=>{
  const {game,player,g}=danger();g.ownerId=player.id;g.type='flash';assert.equal(grenadeThreat(game).type,'flash');
  g.type='smoke';assert.equal(grenadeThreat(game),null);
  g.type='flash';g.deadline=5;assert.equal(grenadeThreat(game),null);
  g.deadline=6;g.z=-30;assert.equal(grenadeThreat(game),null);
});
test('nearest detonation deadline has priority when several grenades threaten',()=>{
  const {game,g}=danger();game.state.grenades.push({...g,id:'earlier',z:-3,deadline:5.3});
  assert.equal(grenadeThreat(game).id,'earlier');
});
