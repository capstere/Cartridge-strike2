import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld} from '../src/fps/world.mjs';
import {createPhysics} from '../src/fps/physics.mjs';
import {createNavigation} from '../src/fps/navigation.mjs';
import {prepareGlass,createGlassState} from '../src/fps/destructible-glass.mjs';
import {Game} from '../src/fps/game.mjs';
const rectangle=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
function fixture({kind='glazed',width=6,excluded=false,outside=false,angle=0}={}){
 const rotate=([x,z])=>[Math.cos(angle)*x+Math.sin(angle)*z,-Math.sin(angle)*x+Math.cos(angle)*z];
 const data={__custom:true,walls:[{id:'pane',a:rotate([-width/2,0]),b:rotate([width/2,0]),surfaceType:kind,height:2.85,sill:.9}],doors:[],routes:[],targets:[],rooms:[],corridors:[],obstacles:[],excludedRooms:excluded?[{polygon:rectangle(-4,-4,4,-.2).map(rotate)}]:[],floorPolygons:[rectangle(-Math.max(.6,width/2),-3,Math.max(.6,width/2),outside?-.25:3).map(rotate)]};
 if(width<.5)for(const [a,b]of [[[-.6,0],[-width/2,0]],[[width/2,0],[.6,0]]])data.walls.push({id:'solid-'+a[0],a:rotate(a),b:rotate(b),surfaceType:'opaque'});
 const description=globalThis.SpelWorldForLevel(data).build({doors:{}});
 description.boxes.push({id:'curtain',x:0,y:1.4,z:.12,w:width,h:2.8,d:.05,angle,material:'fabric',decorative:true});
 const plan=prepareGlass(description,data),physics=createPhysics(description,data);physics.setDynamicBoxes([]);
 const navigation=createNavigation(data,physics),glass=createGlassState(plan,physics,e=>navigation.updateGlass(e));
 return {...physics,navigation,glass,description,data};
}
function cross(w,p,sign=1){const s=Math.sin(p.angle),c=Math.cos(p.angle),a={x:p.x+s*.6*sign,z:p.z+c*.6*sign,y:0,height:1.7,radius:.2};let peak=0;for(let i=0;i<60;i++){w.move(a,-s*.025*sign,-.02,-c*.025*sign);peak=Math.max(peak,a.y);}return {a,peak,passed:((a.x-p.x)*s+(a.z-p.z)*c)*sign<-.4};}
test('broken full-height panes allow physical crossing both ways over retained low rails, including rotated walls and curtains',()=>{
 for(const angle of [0,.43,Math.PI/2]){
  const w=fixture({angle}),p=[...w.glass.panes.values()][1],before=w.staticBoxes.length;
  assert(!cross(w,p).passed);assert(w.glass.breakAt({id:p.parts[0].id}));
  for(const sign of [-1,1]){const result=cross(w,p,sign);assert(result.passed);assert(result.peak>=.09&&result.peak<.121);}
  assert.equal(w.staticBoxes.length,before);assert(w.staticBoxes.some(b=>b.id==='pane-base'));assert(!w.staticBoxes.some(b=>b.id==='curtain'));
  const post=w.staticBoxes.find(b=>b.id==='pane-post1');assert(!w.canOccupy(post.x,post.z,.2,1.7,.1));
  assert(!cross(w,[...w.glass.panes.values()][2]).passed);
  const revision=w.navigation.revision;assert.equal(w.glass.breakAt({id:p.parts[0].id}),null);assert.equal(w.navigation.revision,revision);
  w.glass.reset();assert(!cross(w,p).passed);
 }
});
test('graph connects previously isolated rooms through an off-axis opening; round reset removes links and node pool stays bounded',()=>{
 const w=fixture(),p=[...w.glass.panes.values()][0],a={x:2,z:2},b={x:2,z:-2},initialEdges=w.navigation.statistics.edges,initialNodes=w.navigation.nodes.length;
 assert.deepEqual(w.navigation.findPath(a,b),[]);
 w.glass.breakAt({id:p.parts[0].id});assert(!w.navigation.clear(a,b));const path=w.navigation.findPath(a,b);assert(path.length>1);let from=a;for(const to of path){assert(w.navigation.clear(from,to));from=to;}
 const count=w.navigation.nodes.length;w.glass.reset();assert.equal(w.navigation.statistics.edges,initialEdges);assert.deepEqual(w.navigation.findPath(a,b),[]);
 // Pooled nodes on still-walkable floor must not steal nearest-node queries
 // after their temporary links are removed at the next round.
 for(const node of w.navigation.nodes.slice(initialNodes))if(w.canOccupy(node.x,node.z))assert(w.navigation.nearest(node).id<initialNodes);
 for(let i=0;i<5;i++){w.glass.breakAt({id:p.parts[0].id});assert(w.navigation.findPath(a,b).length);w.glass.reset();}
 assert.equal(w.navigation.nodes.length,count);
});
test('parapets, narrow frames, missing floor and excluded rooms remain blocked after every pane breaks',()=>{
 for(const options of [{kind:'window'},{width:.38},{excluded:true},{outside:true}]){
  const w=fixture(options),p=[...w.glass.panes.values()][0];for(const pane of w.glass.panes.values())w.glass.breakAt({id:pane.parts[0].id});
  assert(!cross(w,p,options.outside?-1:1).passed,JSON.stringify(options));assert.deepEqual(w.navigation.findPath({x:0,z:2},{x:0,z:-2}),[]);
 }
});
test('prepared office pane: real shots, bot steering through the new opening, retained geometry and round reset',()=>{
 const project=JSON.parse(readFileSync('levels/floor5-prepared.json')),w=createWorld({fresh:true,levelProject:project}),g=new Game(w,{config:{botFire:false,botSpeed:1.8,buyTime:0}});g.start('analysts');g.state.phase='active';
 const p=w.glass.panes.get('WALL-139-v1-1-1/pane-0'),s=Math.sin(p.angle),c=Math.cos(p.angle),a={x:p.x+s*.65,z:p.z+c*.65},b={x:p.x-s*.65,z:p.z-c*.65};
 Object.assign(g.player,a,{y:0,yaw:Math.atan2(s,c),pitch:0,nextShot:0,weapon:'p9'});g.fire(g.player);assert(p.broken);assert(g.events.some(e=>e.type==='glass-break'));
 for(const sign of [1,-1])assert(cross(w,p,sign).passed);
 const actor=g.actors[1],bot=actor.bot;Object.assign(actor,a,{y:0});bot.goal=b;bot.nextPath=Infinity;bot.navigationRevision=w.navigation.revision-1;
 for(let i=0;i<150;i++){const input={};bot.follow(1/60,input);w.move(actor,input.moveWorld?.x||0,-.01,input.moveWorld?.z||0);g.state.time+=1/60;}
 assert(Math.hypot(actor.x-b.x,actor.z-b.z)<.15);assert.equal(bot.navigationRevision,w.navigation.revision);
 const count=w.navigation.nodes.length;g.beginRound();assert.equal(w.glass.brokenCount,0);assert(!cross(w,p).passed);assert.equal(w.navigation.nodes.length,count);
});
