/** Owner-marked layout v1 / source revision 3: geometry and physics contracts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from '../src/fps/world.mjs';
import {createPhysics} from '../src/fps/physics.mjs';
const world=createWorld(),D=world.data;

test('published geometry has exact owner revision and no original reference payload',()=>{
 assert.equal(D.metadata.reviewRevision,3);
 assert.equal(D.walls.length,339);
 assert.equal(D.walls.filter(w=>w.surfaceType==='glazed').length,16);
 assert.equal(D.walls.filter(w=>w.surfaceType==='window').length,16);
 assert.equal(D.metadata.metricScaleVerified,false);
 assert(!JSON.stringify(D).includes('IMG_5904'));
 assert(!JSON.stringify(D).includes('markupSource'));
});

test('every marked window and full-height glass wall has real glass geometry and solid physical collision',()=>{
 for(const wall of D.walls.filter(w=>['glazed','window'].includes(w.surfaceType))){
  const boxes=world.description.boxes.filter(b=>b.id===wall.id||b.id.startsWith(wall.id+'-'));
  assert(boxes.some(b=>b.material==='glass'),wall.id+' glass');
  assert(!boxes.some(b=>b.id===wall.id&&b.material==='wall'&&b.h>2),wall.id+' opaque wall was not replaced');
  const physics=createPhysics({boxes,surfaces:[]},{floorPolygons:[[[-100,-100],[100,-100],[100,100],[-100,100]]],excludedRooms:[],rooms:[],obstacles:[]});
  const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],len=Math.hypot(dx,dz),x=(wall.a[0]+wall.b[0])/2,z=(wall.a[1]+wall.b[1])/2,nx=-dz/len,nz=dx/len;
  const hit=physics.raycast({x:x+nx*.3,y:1.7,z:z+nz*.3},{x:-nx,y:0,z:-nz},.6,{staticOnly:true});
  assert(hit,wall.id+' bullet collision');
  assert.equal(physics.staticCanOccupy(x,z,.2,1.7,0),false,wall.id+' walking collision');
 }
});

test('specified door kinds, removal, newly ordinary apertures and future terrace boundary match owner intent',()=>{
 const get=id=>D.doors.find(d=>d.id===id);
 for(const id of ['D01','D02','D03']){assert.equal(get(id).doorType,'elevator');assert(get(id).lockedUntilImplemented);}
 for(const id of ['D04','D06','D07','D08']){assert.equal(get(id).doorType,'card');assert(get(id).accessCardConfirmed);assert(world.doors.doors.some(d=>d.id===id));assert(!world.staticBoxes.some(b=>b.id===id+'-leaf'));}
 assert.equal(get('D05').removed,true);assert(!world.staticBoxes.some(b=>/^D05-/.test(b.id)));assert(!world.doors.doors.some(d=>d.id==='D05'));
 for(const id of ['D14','D42','D60','D62','D63'])assert(world.doors.doors.some(d=>d.id===id),id+' ordinary door');
 assert.equal(get('D01T').doorType,'terrace');assert(get('D01T').lockedUntilImplemented);
 assert(world.staticBoxes.some(b=>b.id==='D01T-terrace'));assert(!world.doors.doors.some(d=>d.id==='D01T'));
 assert.deepEqual(world.doors.skipped.filter(d=>d.reason==='open-passage').map(d=>d.id),['D48','D58','D61']);
 assert.equal(world.doors.doors.length,51);assert.equal(world.doors.boxes.length,65);
});

test('painted-open floor has continuous accepted coverage, and the remaining excluded volumes are not expanded into',()=>{
 // Office corridor opening explicitly painted by owner, formerly outside the floor union.
 assert.equal(world.onFloor(39.5,-.28),true);
 const room=D.rooms.find(r=>r.id==='I33');assert.equal(room.name,'Lobby');
 for(const id of ['D43','D44','D45','D63','D46','D47']){
  const door=D.doors.find(d=>d.id===id),p={x:door.center[0],z:door.center[1]+.65};
  assert(world.findPath(p,world.anchors.rescue).length,id+' WC approach is connected');
 }
});

test('lunch and lounge furniture are authored from marked footprints; erased procedural props do not respawn',()=>{
 const objects=D.obstacles;
 assert.equal(objects.filter(o=>o.roomId==='I09'&&o.kind==='authored-chair').length,50);
 assert.equal(objects.filter(o=>o.roomId==='I09'&&o.kind==='authored-dining-table').length,5);
 assert.equal(objects.filter(o=>o.roomId==='I25'&&o.kind==='authored-sofa').length,6);
 assert.equal(objects.filter(o=>o.roomId==='I25'&&o.kind==='authored-coffee-table').length,2);
 assert(!world.living.props.some(p=>['I09','I15','I06','I26','I25','I19','I20'].includes(p.roomId)));
 const lobby=world.living.props.filter(p=>p.roomId==='I33');
 assert.equal(lobby.filter(p=>p.type==='planter').length,2);assert.equal(lobby.filter(p=>p.type==='sofa').length,2);assert.equal(lobby.filter(p=>p.type==='coffee-table').length,1);
 for(const [id,types]of Object.entries(D.layoutPresentation.suppressedLivingTypes))assert(!world.living.props.some(p=>p.roomId===id&&types.includes(p.type)),id+' erased prop reintroduced');
});
