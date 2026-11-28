import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld} from '../src/fps/world.mjs';
import {Game} from '../src/fps/game.mjs';
import {BotController} from '../src/fps/bots.mjs';
import {tacticalPosition} from '../src/fps/bot-tactics.mjs';

const project=JSON.parse(readFileSync(new URL('../levels/meltem.json',import.meta.url)));
const world=createWorld({levelProject:project,fresh:true});

test('sliced Meltem searches preserve the Yuka stair route and every walkable segment',()=>{
  const from={x:-19.5,y:0,z:18.5},to={...from,y:3.4};
  for(const options of [{},{avoid:[{x:from.x,z:from.z,radius:2,weight:1}]}]){
    world.navigation.invalidate();
    const required=world.findPath(from,to,options);
    world.navigation.invalidate();
    const query=world.findPath(from,to,{...options,stepped:true});
    let slices=0,result;
    do{slices++;result=query.next();}while(!result.done);
    assert(slices>1);
    assert.deepEqual(result.value,required);
    let previous=from;
    for(const point of result.value){assert(world.navigation.clear(previous,point));previous=point;}
    assert.deepEqual(previous,to);
  }
});

test('ten live seats share bounded route work and cancel a query on world change',()=>{
  let started=0,steps=0;
  const nav={revision:0,queryEpoch:0,clear:()=>true,findPath(from,to){
    started++;
    return (function*(){for(let i=0;i<5;i++){steps++;yield;}steps++;return [to];})();
  }};
  const game={config:{fixedStep:1/60},state:{time:0},world:{navigation:nav,findPath:nav.findPath}};
  const bots=Array.from({length:10},(_,i)=>Object.assign(Object.create(BotController.prototype),{
    game,actor:{team:i%2?'counterAnalysts':'analysts',index:Math.floor(i/2),x:0,y:0,z:0},
    routeJobs:{tactical:null,movement:null},lastRouteTick:-1,
  }));
  const to={x:7,y:0,z:3},options={blockers:[]},complete=new Set();
  for(let tick=0;tick<40;tick++){
    game.state.time=tick/60;started=0;steps=0;
    if(tick===3)nav.queryEpoch++;
    for(const bot of bots){
      if(complete.has(bot))continue;
      const result=bot.advanceRoute('movement',to,options);
      if(result){assert.deepEqual(result,[to]);complete.add(bot);}
      else if(bot.lastRouteTick===tick)assert.equal(bot.advanceRoute('tactical',to,options),null);
      if(bot.routeJobs.movement)assert.equal(bot.routeJobs.movement.epoch,nav.queryEpoch);
    }
    assert(started<=1);assert(steps<=4);
  }
  assert.equal(complete.size,10);
});

test('Rush can be heard outside walking range on its own floor without granting sight or a live track',()=>{
  const game=new Game(world,{autoplay:true,seed:42,config:{mode:'endless',botVision:0}}).start();
  const listener=game.actors[0],enemy=game.actors[5],bot=listener.bot;
  for(const a of game.actors)a.alive=a===listener||a===enemy;
  Object.assign(listener,{x:-19.5,y:3.4,z:18.5});
  Object.assign(enemy,{x:-18.5,y:7.4,z:18.5});
  game.state.time=10;game.emit('step',enemy,{mode:'rush'});bot.perceive();
  assert.equal(bot.investigation,null);
  const spot={x:-19.5,y:3.4,z:21.3};
  Object.assign(enemy,spot);game.emit('step',enemy,{mode:'rush'});bot.perceive();
  assert.equal(bot.target,null);assert.deepEqual(bot.investigation.lastKnownGround,spot);
  Object.assign(enemy,{x:80,y:10,z:80});game.state.time+=.1;bot.perceive();
  assert.deepEqual(bot.investigation.lastKnownGround,spot);
});

test('cover probes use the roof elevation and respect a teammate’s active cover reservation',()=>{
  const actor={x:2,y:4,z:1,radius:.2,height:1.7},observed=[];
  const world={layeredTerrain:true,groundHeight:()=>4,canOccupy:(x,z,r,h,y)=>y===4,navigation:{clear:(a,b)=>b.y===4}};
  const game={world,actors:[actor],hostages:[],state:{time:4},canSee(from){observed.push(from.y);return false;}};
  const bot={game,actor,style:{angle:0}};
  const threat={x:6,y:5,z:3},first=tacticalPosition(bot,actor,{threat,cover:true});
  assert.equal(first.y,4);assert(observed.length>0&&observed.every(y=>y===5.35));
  const ally={...actor,x:20,z:20,alive:true,bot:{coverMove:{point:first,until:6}}};
  game.actors.push(ally);
  const other=tacticalPosition(bot,actor,{threat,cover:true});
  assert(Math.hypot(first.x-other.x,first.z-other.z)>=.75);
});

test('an injured bot finishes its reserved cover move facing its last sighting without blind fire',()=>{
  const game=new Game(world,{autoplay:true,seed:93,config:{mode:'endless',botVision:0}}).start();
  const actor=game.actors[0],bot=actor.bot,now=game.state.time=10;
  actor.hp=20;const point={x:actor.x+1,y:actor.y,z:actor.z};
  bot.coverMove={point,until:now+1,threat:{x:actor.x+4,y:actor.y+1,z:actor.z+2}};
  bot.nextDecision=0;
  const input=bot.update(1/60);
  assert.equal(bot.mode,'combat');assert.equal(bot.target,null);assert.deepEqual(bot.goal,point);
  assert(!input.fire);
  game.state.time+=2;bot.update(1/60);assert.equal(bot.mode,'objective');
});

test('a layered route leaves overlapping bodies outward and can pass a teammate on a different floor',async()=>{
  const {referenceNavigation}=await import('../src/fps/reference-navigation.mjs');
  const nav=referenceNavigation({
    x:[-.6,-.6,2,2],y:[4,4,4,4],z:[0,1,1,0],offsets:[0,1,3,5,6],
    adj:[1,0,2,1,3,2],cost:[1,1,2.6,2.6,1,1],kind:[0,0,0,0,0,0],
  },{groundHeight:(x,z,y)=>y,canOccupy:()=>true});
  const start={x:0,y:4,z:0},end={x:2,y:4,z:0},body={x:.15,z:0,y:4,radius:.44};
  const route=nav.findPath(start,end,{blockers:[body]});
  assert(route.length>1);assert(route[0].x<=start.x);
  assert.deepEqual(route.at(-1),end);
  assert.deepEqual(nav.findPath(start,end,{blockers:[{...body,y:0}]}),[end]);
});
