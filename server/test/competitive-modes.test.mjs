import assert from 'node:assert/strict';
import test from 'node:test';
import {Client} from '@colyseus/sdk';
import {createLocalServer} from '../local-server.mjs';
import {ready,options,own,until,send,delay} from './helpers.mjs';
import {loadHeadlessWorld} from '../headless.mjs';
import {Game} from '../../src/fps/game.mjs';
import {respawnActor} from '../../src/fps/action-rules.mjs';
import {modeWinner,tickMatchMode,resetModeObjectives,spawnSide} from '../../src/fps/match-modes.mjs';
import {NETWORK_MAPS} from '../../shared/multiplayer/maps.mjs';

const cmd=(p,kind,data={})=>p.send('match',{kind,matchId:p.state.matchId,controlEpoch:own(p).controlEpoch,...data});
async function pair(t,mode){
 const server=await createLocalServer({port:0,testMatch:{countdownSeconds:.1,scoreTarget:1}});
 const peers=[];
 t.after(async()=>{await Promise.allSettled(peers.map(p=>p.leave()));await server.close();});
 for(const team of ['analysts',mode==='ffa'?'analysts':'counterAnalysts']){
  const client=new Client(server.url,{headers:{Origin:server.url}}),settings={...options,mode,team,mapId:'floor5-prepared'};
  const p=await ready(await (peers.length?client.joinById(peers[0].roomId,settings):client.create('private-fps',settings)));
  peers.push(p);
 }
 for(const p of peers)cmd(p,'ready',{ready:true});
 await until(()=>peers.every(p=>own(p).playerReady),'both players ready');
 cmd(peers[0],'start');
 await until(()=>peers.every(p=>p.state.phase==='active'),'started authoritative match');
 const [room]=server.rooms;
 return {peers,room,game:room.sim.game};
}

test('same-uniform FFA opponents can start, shoot, score individually and rematch', {timeout:45000},async t=>{
 const {peers,room,game}=await pair(t,'ffa'),[host,guest]=peers;
 const a=room.seats.get(host.sessionId).actor,b=room.seats.get(guest.sessionId).actor;
 assert.equal(a.team,b.team);
 assert.equal(a.teamKills,0);
 assert.equal(room.teamComms.active(),false);
 assert.equal(game.state.mode,'ffa');
 for(const p of peers)p.send('controls',{enabled:true,lifeId:own(p).lifeId,controlEpoch:own(p).controlEpoch});
 Object.assign(a,{x:20,y:0,z:-18,yaw:Math.PI,spawnProtectedUntil:0});
 Object.assign(b,{x:20,y:0,z:-16,hp:9,armor:0,spawnProtectedUntil:0});
 await delay(250);
 send(host,{fire:true,fireId:1,yaw:Math.PI,pitch:0});
 await until(()=>peers.every(p=>p.state.phase==='results'),'one genuine SDK firearm input settled the FFA match');
 for(const p of peers){
  assert.equal(p.state.winner,a.id);
  assert.equal(p.state.analysts+p.state.counterAnalysts,0);
  const results=JSON.parse(p.state.results);
  assert.deepEqual(results.players.map(row=>[row.id,row.kills,row.deaths]),[[a.id,1,0],[b.id,0,1]]);
 }
 assert.equal(a.teamKills,0);
 cmd(guest,'rematch');
 await until(()=>peers.every(p=>p.state.matchId===2&&p.state.phase==='waiting'),'reopened FFA');
 assert(peers.every(p=>own(p).kills===0&&own(p).deaths===0));
});

test('Domination capture is authoritative, contested and cleared on rematch', {timeout:45000},async t=>{
 const {peers,room,game}=await pair(t,'dom'),[host,guest]=peers;
 const a=room.seats.get(host.sessionId).actor,b=room.seats.get(guest.sessionId).actor,z=game.state.zones[1];
 const candidates=game.world.navigation.nodes.filter(n=>Math.hypot(n.x-z.x,n.z-z.z)<z.radius&&
  game.world.canOccupy(n.x,n.z,a.radius+.05,a.height,n.y??0)&&
  game.world.segmentClear({x:n.x,y:(n.y??0)+.85,z:n.z},{x:z.x,y:z.y+.85,z:z.z},{vision:false}));
 const first=candidates[0],second=candidates.find(n=>Math.hypot(n.x-first.x,n.z-first.z)>a.radius+b.radius+.15);
 assert(first&&second,'two clear standing positions in the same flag');
 for(const [actor,n] of [[a,first],[b,second]])Object.assign(actor,{x:n.x,y:n.y??0,z:n.z,spawnProtectedUntil:0});
 await until(()=>peers.every(p=>p.state.zones.get('B')?.contested),'catch-up state includes the contested flag');
 assert.equal(z.progress,0);
 Object.assign(b,game.world.anchors.counterAnalysts[0]);
 // Accelerate only the first five seconds of this fixed-step capture.
 for(let i=0;i<310;i++)tickMatchMode(game,1/60);
 await until(()=>host.state.zones.get('B').progress>.8,'partial capture replicated');
 await until(()=>peers.every(p=>p.state.zones.get('B').owner==='analysts'),'host awards ownership at full capture');
 assert.equal(a.combat.captures,1);
 game.state.zoneScoreCarry.analysts=.95;
 await until(()=>peers.every(p=>p.state.phase==='results'),'owned point, independent of kills, won the match');
 for(const p of peers){assert.equal(p.state.winner,'analysts');assert.equal(p.state.analysts,1);assert.equal(own(p).kills,0);}
 cmd(guest,'rematch');
 await until(()=>peers.every(p=>p.state.phase==='waiting'),'returned to same room');
 for(const p of peers)assert([...p.state.zones.values()].every(z=>!z.owner&&!z.contested&&z.progress===0));
 cmd(host,'settings',{mode:'tdm'});
 await until(()=>peers.every(p=>p.state.mode==='tdm'&&!p.state.zones.size),'old flags removed in original TDM');
});

test('all advertised Domination points are separated and reachable from both bases', {timeout:120000},async()=>{
 for(const map of NETWORK_MAPS){
  assert(map.modes.includes('ffa')&&map.modes.includes('dom'));
  const {world}=await loadHeadlessWorld(map.id);
  const game=new Game(world,{config:{mode:'dom',zombies:false,wanderers:false,danceman:false}}).start();
  assert.deepEqual(game.state.zones.map(z=>z.id),['A','B','C'],map.id);
  for(const z of game.state.zones){
   assert(world.canOccupy(z.x,z.z,.32,1.72,z.y),map.id+z.id);
   for(const team of ['analysts','counterAnalysts'])assert(world.findPath(world.anchors[team][0],z).length,map.id+z.id+team);
   for(const other of game.state.zones.filter(p=>p!==z))assert(Math.hypot(other.x-z.x,other.z-z.z)>z.radius+other.radius);
  }
 }
});

test('Solo FFA and Domination settle full batches and preserve legal respawns',async()=>{
 const {world}=await loadHeadlessWorld('meltem');
 const game=new Game(world,{config:{mode:'ffa',fragLimit:1,zombies:false,wanderers:false,danceman:false}}).start();
 const a=game.player,b=game.actors.find(b=>b!==a&&b.team===a.team);
 assert.equal(game.actors.length,8);assert.equal(game.hostages.length,0);
 assert.equal(game.radio('go'),false);
 for(const p of game.actors)assert(world.canOccupy(p.x,p.z,p.radius,p.height,p.y));
 b.spawnProtectedUntil=0;game.damage(b,1000,a,'ar47');
 assert(b.respawnAt>0);assert.equal(b.alive,false);assert.equal(a.kills,1);
 tickMatchMode(game,1/60);assert.equal(game.state.result.winner,a.id);
 const life=b.lifeId;assert(respawnActor(game,b));assert(b.lifeId>life&&b.spawnProtectedUntil>game.state.time);
 assert(world.canOccupy(b.x,b.z,b.radius,b.height,b.y));
 const tied=[{id:'a',kills:2,deaths:1},{id:'b',kills:2,deaths:1}];
 assert.equal(modeWinner('ffa',tied,{}),'draw');
 game.config.mode='dom';game.config.dominationLimit=1;game.start();
 const z=game.state.zones[1],occupant=game.player;
 const near=game.state.zones.toSorted((x,y)=>Math.hypot(x.x-world.anchors.analysts[0].x,x.z-world.anchors.analysts[0].z)-Math.hypot(y.x-world.anchors.analysts[0].x,y.z-world.anchors.analysts[0].z));
 near[0].owner='counterAnalysts';near[2].owner='analysts';
 assert.equal(spawnSide(game,occupant),'counterAnalysts');
 near[0].owner=near[2].owner='';
 for(const p of game.actors)p.alive=p===occupant;
 Object.assign(occupant,{x:z.x,y:z.y,z:z.z,spawnProtectedUntil:0});
 occupant.disconnected=true;tickMatchMode(game,1/60);assert.equal(z.progress,0);occupant.disconnected=false;
 for(let i=0;i<610&&game.phase==='active';i++)tickMatchMode(game,1/60);
 assert.equal(game.state.result.winner,occupant.team);assert.equal(occupant.kills,0);
 resetModeObjectives(game);assert(game.state.zones.every(z=>z.progress===0&&!z.owner));
});
