import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three/three.module.js';
import {createWorld} from '../src/fps/world.mjs';
import {createPhysics,insidePolygon} from '../src/fps/physics.mjs';
import {prepareGlass,createGlassState} from '../src/fps/destructible-glass.mjs';
import {GlassVisuals} from '../src/fps/glass-visuals.mjs';
import {buildFacilityDetails} from '../src/fps/facility-details-view.mjs';
import {TrajectoryCache} from '../src/fps/trajectory-cache.mjs';
import {Game} from '../src/fps/game.mjs';
const world=createWorld({fresh:true});
const registry={get:(kind,opts={})=>new T.MeshStandardMaterial({transparent:kind.includes('lass'),...opts})};
test('all 12 authored WC places have a toilet and basin, unique IDs and bounded placements',()=>{
 assert.equal(world.details.counts.toilets,12);assert.equal(world.details.counts.basins,12);
 assert.equal(new Set(world.details.props.map(p=>p.id)).size,world.details.props.length);
 for(const p of world.details.props.filter(p=>p.bay)){
  const [x0,z0,x1,z1]=p.bay;assert(p.x-p.w/2>=x0-.01&&p.x+p.w/2<=x1+.01,p.id+' width');assert(p.z-p.d/2>=z0-.01&&p.z+p.d/2<=z1+.01,p.id+' depth');
 }
});
test('kitchen includes two fridges, freezer, dishwasher, two microwaves, sinks; labs stay in excluded volumes',()=>{
 const k=world.details.props.filter(p=>p.id.startsWith('KITCHEN'));
 assert.equal(k.filter(p=>p.type==='fridge').length,2);for(const t of ['freezer','sink','dishwasher','microwave'])assert(k.some(p=>p.type===t));
 for(const p of world.details.props.filter(p=>p.displayOnly)){const r=world.data.excludedRooms.find(r=>r.id===p.roomId);assert(r);assert(insidePolygon(p.x,p.z,r.polygon));assert.equal(world.scopeAllowed(p.x,p.z,.2),false);}
 assert(world.details.facades.length>20);assert(world.description.boxes.some(b=>b.upholsteryColor===0xd76b28));
});
test('static detail models are finite, merged and disposable, not one draw per small fitting',()=>{
 const detail=buildFacilityDetails(world.details,registry);let tris=0;detail.root.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;for(let i=0;i<a.array.length;i++)assert(Number.isFinite(a.array[i]));tris+=(o.geometry.index?.count??a.count)/3;});
 assert(detail.root.children.length<110);assert(tris<65000);detail.dispose();detail.dispose();
});
function fixture(){
 const data={walls:[{id:'WALL-TEST',a:[-1.12,0],b:[1.12,0],surfaceType:'glazed'}],floorPolygons:[[[-4,-4],[4,-4],[4,4],[-4,4]]],excludedRooms:[],rooms:[],obstacles:[]};
 const description={boxes:[{id:'WALL-TEST',x:0,y:1.425,z:0,w:2.24,h:2.85,d:.035,material:'glass',angle:0},{id:'WALL-TEST-frost',x:0,y:1.22,z:0,w:2.24,h:.46,d:.044,material:'frosted',angle:0},{id:'frame',x:0,y:1.425,z:0,w:.036,h:2.85,d:.04,material:'metal',angle:0}],surfaces:[]};
 const plan=prepareGlass(description,data),physics=createPhysics(description,data);physics.setDynamicBoxes([]);let invalidated=0;const state=createGlassState(plan,physics,()=>invalidated++);return {physics,state,plan,get invalidated(){return invalidated;}};
}
test('breaking one pane removes its glass AND frosting from bullets/movement, keeps neighbor/frame, restores on reset',()=>{
 const f=fixture(),p=f.physics,o={x:-.56,y:1.22,z:1},dir={x:0,y:0,z:-1};
 const hit=p.raycast(o,dir,2);assert(hit);assert.equal(p.staticCanOccupy(-.56,0,.2),false);
 const actor={x:-.56,z:.6,y:0,height:1.7,radius:.2};for(let i=0;i<30;i++)p.move(actor,0,0,-.04);assert(actor.z>.18);
 assert(f.state.breakAt(hit));assert.equal(f.state.breakAt(hit),null);assert.equal(f.invalidated,1);assert.equal(p.raycast(o,dir,2),null);assert(p.staticCanOccupy(-.56,0,.2));
 for(let i=0;i<30;i++)p.move(actor,0,0,-.04);assert(actor.z<-.5);assert(p.raycast({x:.56,y:1.7,z:1},dir,2));assert(p.raycast({x:0,y:1.7,z:1},dir,2));
 f.state.reset();assert.equal(f.invalidated,2);assert(p.raycast(o,dir,2));assert.equal(p.staticCanOccupy(-.56,0,.2),false);
});
test('actual gun shot shatters nearest architectural pane, preserves serial events and restores glass on new round',()=>{
 const g=new Game(world,{seed:5,config:{botFire:false,botSpeed:0}});g.start('analysts');g.state.phase='active';
 const pane=[...world.glass.panes.values()].find(p=>p.wallId==='WALL-031');assert(pane);
 for(const a of g.actors)if(!a.isPlayer){a.x=30;a.z=30;}
 Object.assign(g.player,{x:pane.x,z:pane.z+1,y:0,yaw:0,pitch:0,reloadUntil:0,nextShot:0});
 assert(g.fire(g.player));assert.equal(world.glass.brokenCount,1);const e=g.events.find(e=>e.type==='glass-break');assert(e&&e.paneId===pane.id);assert(Number.isFinite(e.serial));
 g.beginRound();assert.equal(world.glass.brokenCount,0);
});
test('glass presentation has bounded shards, stable stationary matrix uploads and clears fragments at round reset',()=>{
 const f=fixture(),scene=new T.Scene(),v=new GlassVisuals(scene,f.state,registry),versions=v.batches.map(b=>b.mesh.instanceMatrix.version);for(let i=0;i<60;i++)v.update(i/60);assert.deepEqual(v.batches.map(b=>b.mesh.instanceMatrix.version),versions);
 const hit=f.physics.raycast({x:-.56,y:1.7,z:1},{x:0,z:-1},2),e=f.state.breakAt(hit);v.events([{type:'glass-break',...e}],{state:{time:1}});v.update(1.1);assert.equal(v.shards.count,12);assert(v.batches.some((b,i)=>b.mesh.instanceMatrix.version>versions[i]));v.update(3);assert.equal(v.shards.count,0);
 for(let i=0;i<100;i++)v.events([{type:'glass-break',...e}],{state:{time:4}});v.update(4.01);assert(v.shards.count<=128);v.events([{type:'round'}],{state:{time:5}});assert.equal(v.shards.count,0);v.dispose();assert.equal(scene.children.length,0);
});

test('grenade preview cache invalidates on pane break AND restore without changing pose',()=>{
 let calls=0;const cache=new TrajectoryCache(()=>({points:[],tag:++calls}));const w={doors:{boxes:[]},staticBoxes:[],raycast(){},glass:{revision:0}};
 const actor={x:0,y:0,z:0,height:1.7,yaw:0,pitch:0,weapon:'he'},config={fixedStep:1/60,grenadeFuse:2,grenadeSpeed:8,grenadeRadius:.1,gravity:9.8};
 assert.equal(cache.read(actor,config,w).tag,1);assert.equal(cache.read(actor,config,w).tag,1);w.glass.revision++;assert.equal(cache.read(actor,config,w).tag,2);w.glass.revision++;assert.equal(cache.read(actor,config,w).tag,3);assert.equal(cache.read(actor,config,w).tag,3);
});
