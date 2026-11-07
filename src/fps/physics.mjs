import { Box3, BoxGeometry, Matrix4, Vector2, Vector3, Triangle, ShapeUtils } from '../../vendor/three/three.module.js';
import { Capsule } from '../../vendor/three/addons/math/Capsule.js';
import { Octree } from '../../vendor/three/addons/math/Octree.js';

export const ACTOR_RADIUS=.20;
export const STANDING_HEIGHT=1.70;
export const CEILING_HEIGHT=2.85;
const EPS=1e-5;
const RING=Array.from({length:16},(_,i)=>[Math.cos(i*Math.PI/8),Math.sin(i*Math.PI/8)]);
export const polygonBounds=p=>({minX:Math.min(...p.map(v=>v[0])),maxX:Math.max(...p.map(v=>v[0])),minZ:Math.min(...p.map(v=>v[1])),maxZ:Math.max(...p.map(v=>v[1]))});
export function insidePolygon(x,z,p){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export function distanceSegment(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);}

/** Static two-dimensional broad phase. It never changes the authoritative geometry. */
export class SpatialIndex {
  constructor(size=2){this.size=size;this.cells=new Map();this.marks=new WeakMap();this.queryId=0;}
  insert(item,bounds){
    for(let x=Math.floor(bounds.minX/this.size);x<=Math.floor(bounds.maxX/this.size);x++)for(let z=Math.floor(bounds.minZ/this.size);z<=Math.floor(bounds.maxZ/this.size);z++){
      const key=`${x},${z}`,cell=this.cells.get(key)||[];cell.push(item);this.cells.set(key,cell);
    }
  }
  at(x,z){return this.cells.get(`${Math.floor(x/this.size)},${Math.floor(z/this.size)}`)||[];}
  query(x,z,r,out){
    out.length=0;const stamp=++this.queryId;
    for(let ix=Math.floor((x-r)/this.size);ix<=Math.floor((x+r)/this.size);ix++)for(let iz=Math.floor((z-r)/this.size);iz<=Math.floor((z+r)/this.size);iz++){
      const cell=this.cells.get(`${ix},${iz}`);if(!cell)continue;
      for(const item of cell)if(this.marks.get(item)!==stamp){this.marks.set(item,stamp);out.push(item);}
    }return out;
  }
  nearby(x,z,r){const out=new Set();for(let ix=Math.floor((x-r)/this.size);ix<=Math.floor((x+r)/this.size);ix++)for(let iz=Math.floor((z-r)/this.size);iz<=Math.floor((z+r)/this.size);iz++)for(const p of this.cells.get(`${ix},${iz}`)||[])out.add(p);return out;}
}

function boxBounds(b){const c=Math.abs(Math.cos(b.angle||0)),s=Math.abs(Math.sin(b.angle||0)),hx=(b.w*c+b.d*s)/2,hz=(b.w*s+b.d*c)/2;return {minX:b.x-hx,maxX:b.x+hx,minZ:b.z-hz,maxZ:b.z+hz};}
export function circleHitsBox(x,z,r,b){
  if(b.disabled)return false;
  const dx=x-b.x,dz=z-b.z;
  if(Math.abs(dx)>b.w/2+b.d/2+r||Math.abs(dz)>b.w/2+b.d/2+r)return false;
  const lx=b.cos*dx-b.sin*dz,lz=b.sin*dx+b.cos*dz,qx=Math.max(Math.abs(lx)-b.w/2,0),qz=Math.max(Math.abs(lz)-b.d/2,0);
  return qx*qx+qz*qz<(r-EPS)*(r-EPS);
}
function capsuleFootprintRadius(b,y,height,r){
  const low=y+r,high=y+height-r;
  const gap=Math.max(0,low-(b.y+b.h/2),(b.y-b.h/2)-high);
  return gap>=r?0:Math.sqrt(r*r-gap*gap);
}

/** A bounded builder for the upstream Octree; all intersection routines remain Three.js.
 * Adapted from Three.js Octree.split (MIT; Copyright 2010-2025 Three.js authors).
 * Upstream children reset maxLevel/trianglesPerLeaf to defaults. Explicitly propagating
 * those limits avoids hundreds of megabytes of tiny nodes around coplanar office trim.
 */
class FloorOctree extends Octree {
  capsuleIntersect(capsule){
    // Reject only proven empty space. All contact/resolution math stays upstream.
    if(this.mayIntersectCapsule&&!this.mayIntersectCapsule(capsule))return false;
    return super.capsuleIntersect(capsule);
  }
  split(level){
    if(!this.box)return this;
    const half=this.box.max.clone().sub(this.box.min).multiplyScalar(.5),children=[];
    for(let x=0;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++){
      const min=this.box.min.clone().add(new Vector3(x,y,z).multiply(half));
      const child=new FloorOctree(new Box3(min,min.clone().add(half)));child.maxLevel=this.maxLevel;child.trianglesPerLeaf=this.trianglesPerLeaf;children.push(child);
    }
    for(const triangle of this.triangles)for(const child of children)if(child.box.intersectsTriangle(triangle))child.triangles.push(triangle);
    this.triangles=[];
    for(const child of children)if(child.triangles.length){if(child.triangles.length>this.trianglesPerLeaf&&level<this.maxLevel)child.split(level+1);this.subTrees.push(child);}
    return this;
  }
}

/** Floor adapter uses the official Three Capsule/Octree FPS collision pattern.
 * Static triangles are built once from the same boxes/surfaces sent to the renderer.
 * Authoritative scope constraints additionally prevent any jump into excluded volumes.
 */
export function createPhysics(description,data){
  const floorIndex=new SpatialIndex(),scopeIndex=new SpatialIndex(),navObstacleIndex=new SpatialIndex(),boxIndex=new SpatialIndex();
  const edgeBounds=new WeakMap();
  function addPolygon(index,p){
    index.insert(p,polygonBounds(p));
    if(!edgeBounds.has(p))edgeBounds.set(p,p.map((a,i)=>{const b=p[(i+1)%p.length];return {a,b,minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minZ:Math.min(a[1],b[1]),maxZ:Math.max(a[1],b[1])};}));
  }
  function nearEdge(x,z,p,r){
    // Floor-ring/navigation probes mostly miss the polygon entirely. Reject
    // distant edges before the unchanged exact segment-distance calculation.
    // A conservative epsilon pad also retains boundary and grazing behavior.
    const pad=r+EPS;
    for(const e of edgeBounds.get(p))if(x>=e.minX-pad&&x<=e.maxX+pad&&z>=e.minZ-pad&&z<=e.maxZ+pad&&distanceSegment(x,z,e.a,e.b)<r)return true;
    return false;
  }
  const touchesPolygon=(x,z,r,p)=>insidePolygon(x,z,p)||nearEdge(x,z,p,r-EPS);
  for(const p of data.floorPolygons)addPolygon(floorIndex,p);
  for(const r of [...data.excludedRooms,...data.rooms.filter(r=>r.status==='uncertain'),...data.obstacles.filter(o=>o.kind==='uncertain-area')])addPolygon(scopeIndex,r.polygon);
  for(const o of data.obstacles)if(o.collision!=='none')addPolygon(navObstacleIndex,o.polygon);
  // Decorative objects remain visible but never enter the physical broadphase.
  const decorativeIds=data.__custom?new Set(data.obstacles.filter(o=>o.collision==='none').map(o=>o.id)):new Set();
  const staticBoxes=description.boxes.filter(b=>b.w>0&&b.h>0&&b.d>0&&!decorativeIds.has(b.id)&&!b.decorative).map(b=>({...b,cos:Math.cos(b.angle||0),sin:Math.sin(b.angle||0)}));
  for(const b of staticBoxes)boxIndex.insert(b,boxBounds(b));
  // Low glazing rails stay physical, but can be stepped over inside a broken,
  // standing-height pane. Keep them out of the immutable triangle tree.
  const glassRails=new Map(),activeGlassRails=new Set(),railIndex=new SpatialIndex(),railScratch=[];
  const glassWalls=new Map();
  for(const b of staticBoxes)if(b.glassId&&b.material==='glass'&&b.y-b.h/2<=.12&&b.h>=STANDING_HEIGHT){
    const id=b.glassId.split('/pane-')[0];if(!glassWalls.has(id))glassWalls.set(id,[]);glassWalls.get(id).push(b);
  }
  for(const [id,panes]of glassWalls)for(const b of staticBoxes)if([id+'-base',id+'-skirt',id+'-sill'].includes(b.id)&&b.y+b.h/2<=.12)glassRails.set(b,panes);
  for(const rail of glassRails.keys())railIndex.insert(rail,boxBounds(rail));
  function updateGlassPassages(){activeGlassRails.clear();for(const [rail,panes]of glassRails)if(panes.some(p=>p.disabled))activeGlassRails.add(rail);}
  let dynamicBoxes=[],dynamicIndex=new SpatialIndex();
  const dynamicScratch=[],motionScratch=[];
  const scopeScratch=[],obstacleScratch=[],boxScratch=[];
  const setDynamicBoxes=boxes=>{dynamicBoxes=[...boxes,...staticBoxes.filter(b=>b.glassId||glassRails.has(b))];dynamicIndex=new SpatialIndex();for(const b of dynamicBoxes)dynamicIndex.insert(b,b.broadphaseBounds||boxBounds(b));};
  let lastFloor=null;
  function onFloor(x,z){
    // Consecutive capsule-ring and path samples usually stay in one polygon.
    // Only an exact interior hit bypasses the index; boundary probes still use
    // its original cells and epsilon rule, including at cell borders.
    if(lastFloor&&insidePolygon(x,z,lastFloor))return true;
    for(const p of floorIndex.at(x,z))if(insidePolygon(x,z,p)||nearEdge(x,z,p,EPS)){lastFloor=p;return true;}
    return false;
  }
  function scopeAllowed(x,z,r=ACTOR_RADIUS){
    if(!Number.isFinite(x)||!Number.isFinite(z))return false;
    if(!onFloor(x,z))return false;
    for(const [cx,cz] of RING)if(!onFloor(x+cx*r,z+cz*r))return false;
    for(const p of scopeIndex.query(x,z,r,scopeScratch))if(touchesPolygon(x,z,r,p))return false;
    return true;
  }
  function glassStepHeight(x,z,r,y){
    let top=y;
    if(!activeGlassRails.size||y>.121)return top;
    for(const rail of railIndex.query(x,z,r,railScratch)){
      const panes=glassRails.get(rail);if(!activeGlassRails.has(rail)||!circleHitsBox(x,z,r,rail))continue;
      for(const pane of panes){
        if(!pane.disabled)continue;
        const dx=x-pane.x,dz=z-pane.z,along=pane.cos*dx-pane.sin*dz;
        if(Math.abs(along)+r>pane.w/2+.001)continue;
        const offset=Math.max(.35,rail.d/2+r+.01);
        // Never grant new floor: both landings and the crossing remain in scope.
        if(!scopeAllowed(x+pane.sin*offset,z+pane.cos*offset,r)||!scopeAllowed(x-pane.sin*offset,z-pane.cos*offset,r))continue;
        top=Math.max(top,rail.y+rail.h/2+.00001);
      }
    }
    return top;
  }
  function canOccupy(x,z,r=ACTOR_RADIUS,height=STANDING_HEIGHT,y=0,staticOnly=false){
    if(!scopeAllowed(x,z,r))return false;
    y=glassStepHeight(x,z,r,y);
    // Accepted furniture footprints stay outside the navigation surface. At jumping
    // height movement uses the exact visible geometry; no furniture is a scope shortcut.
    if(y<.1)for(const p of navObstacleIndex.query(x,z,r,obstacleScratch))if(touchesPolygon(x,z,r,p))return false;
    for(const b of boxIndex.query(x,z,r,boxScratch)){
      // The feet/head are hemispheres, not a full-height cylinder. In particular
      // a 9-cm skirting board does not require a full 20-cm horizontal offset.
      // This exact capsule cross-section matches the Octree's physical clearance.
      const effectiveRadius=capsuleFootprintRadius(b,y,height,r);
      if(b.y+b.h/2>.035&&effectiveRadius>0&&circleHitsBox(x,z,effectiveRadius,b))return false;
    }
    if(!staticOnly)for(const b of dynamicIndex.query(x,z,r,dynamicScratch)){const er=capsuleFootprintRadius(b,y,height,r);if(er>0&&circleHitsBox(x,z,er,b))return false;}
    return true;
  }

  const octree=new FloorOctree();octree.trianglesPerLeaf=24;octree.maxLevel=7;
  const cube=new BoxGeometry(1,1,1).toNonIndexed(),vertices=cube.getAttribute('position');
  const transform=new Matrix4(),rotation=new Matrix4(),scale=new Matrix4();
  for(const b of staticBoxes){
    // Millimetre-scale threshold trim is walkable; rendered height and ray hits stay exact.
    if(b.y+b.h/2<=.035||b.glassId||glassRails.has(b))continue;
    transform.makeTranslation(b.x,b.y,b.z).multiply(rotation.makeRotationY(b.angle||0)).multiply(scale.makeScale(b.w,b.h,b.d));
    for(let i=0;i<vertices.count;i+=3){const vs=[0,1,2].map(k=>new Vector3().fromBufferAttribute(vertices,i+k).applyMatrix4(transform));const t=new Triangle(...vs);t.objectId=b.id;octree.addTriangle(t);}
  }
  cube.dispose();
  const surfaces=description.surfaces.filter(s=>s.material==='table'||s.id.startsWith('floor-')||s.id.startsWith('ceiling-'));
  const tableIndex=new SpatialIndex(),staticMotionScratch=[],tableMotionScratch=[];
  for(const s of surfaces)if(s.material==='table'){const bounds=polygonBounds(s.polygon);tableIndex.insert({surface:s,bounds},bounds);}
  octree.mayIntersectCapsule=c=>{
    // Game actors are vertical. Preserve the generic upstream path for tilted or
    // invalid capsules rather than approximating their swept horizontal segment.
    if(c.start.x!==c.end.x||c.start.z!==c.end.z||!Number.isFinite(c.radius)||c.radius<0)return true;
    const x=c.start.x,z=c.start.z,r=c.radius+EPS*10;
    const low=Math.min(c.start.y,c.end.y)-c.radius-EPS,high=Math.max(c.start.y,c.end.y)+c.radius+EPS;
    if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(low)||!Number.isFinite(high))return true;
    for(const b of boxIndex.query(x,z,r,staticMotionScratch)){
      // Match the Octree's threshold-trim exclusion; include complete capsule
      // radius here, conservatively, including near feet/head and rotated boxes.
      if(b.y+b.h/2<=.035||b.y+b.h/2<low||b.y-b.h/2>high)continue;
      if(circleHitsBox(x,z,r,b))return true;
    }
    // Table tops/undersides are standalone triangles, not necessarily boxes.
    // Their bounds deliberately admit false positives at concave edges/holes.
    for(const {surface:s,bounds:b} of tableIndex.query(x,z,r,tableMotionScratch))
      if(s.y>=low&&s.y<=high&&x+r>=b.minX&&x-r<=b.maxX&&z+r>=b.minZ&&z-r<=b.maxZ)return true;
    return false;
  };
  // Floor/ceiling are planar at known source heights: scopeAllowed + the exact
  // vertical bounds in move handle them without inserting thousands of overlapping
  // coplanar triangles into an Octree. Ray tests still use every source polygon.
  for(const s of surfaces.filter(s=>s.material==='table')){
    const contour=s.polygon.map(p=>new Vector2(p[0],p[1]));
    for(const face of ShapeUtils.triangulateShape(contour,[])){
      const vs=face.map(i=>new Vector3(s.polygon[i][0],s.y,s.polygon[i][1]));
      // Both windings make table undersides and ceiling underside physically solid.
      const t=new Triangle(...vs),r=new Triangle(vs[2].clone(),vs[1].clone(),vs[0].clone());t.objectId=r.objectId=s.id;octree.addTriangle(t);octree.addTriangle(r);
    }
  }
  // Cubic partitions avoid dividing a 2.85-high floor into millimetre-tall cells
  // while the horizontal span is almost 100 units. Empty upper cells are discarded.
  const span=octree.bounds.getSize(new Vector3());octree.bounds.max.y=octree.bounds.min.y+Math.max(span.x,span.y,span.z);
  octree.build();
  const capsule=new Capsule(),translation=new Vector3();
  function setCapsule(actor,height=actor.height||STANDING_HEIGHT){const r=actor.radius||ACTOR_RADIUS;capsule.radius=r;capsule.start.set(actor.x,(actor.y||0)+r,actor.z);capsule.end.set(actor.x,(actor.y||0)+Math.max(r,height-r),actor.z);return capsule;}
  function canStand(actor,height=STANDING_HEIGHT){
    // Standing is legal only if the extra head volume is clear, including tables and lintels.
    const y=actor.y||0,r=actor.radius||ACTOR_RADIUS;
    if(y+height>CEILING_HEIGHT+.001)return false;
    for(const b of boxIndex.nearby(actor.x,actor.z,r))if(b.y+b.h/2>y+(actor.height||1.08)-.02&&b.y-b.h/2<y+height&&circleHitsBox(actor.x,actor.z,r,b))return false;
    return true;
  }
  function move(actor,dx,dy,dz){
    const result={collision:false,onGround:false,ceiling:false,normal:{x:0,y:0,z:0}};
    if(![dx,dy,dz].every(Number.isFinite)||Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz))>5)return result;
    actor.y=Number.isFinite(actor.y)?actor.y:0;
    const r=actor.radius||ACTOR_RADIUS,h=actor.height||STANDING_HEIGHT,n=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz))/.07));
    for(let i=0;i<n;i++){
      const ox=actor.x,oy=actor.y,oz=actor.z;
      const nx=ox+dx/n,nz=oz+dz/n;
      if(scopeAllowed(nx,nz,r)){actor.x=nx;actor.z=nz;}
      else{
        result.collision=true;
        if(scopeAllowed(nx,oz,r))actor.x=nx;
        if(scopeAllowed(actor.x,nz,r))actor.z=nz;
      }
      actor.y+=dy/n;
      if(dy<=0){const step=glassStepHeight(actor.x,actor.z,r,actor.y);
        if(step>actor.y&&step+h<=CEILING_HEIGHT&&canOccupy(actor.x,actor.z,r,h,step)){actor.y=step;result.onGround=true;if(actor.vy<0)actor.vy=0;}}
      setCapsule(actor,h);
      for(let j=0;j<3;j++){
        const collision=octree.capsuleIntersect(capsule);if(!collision||collision.depth<1e-7)break;
        result.collision=true;result.normal={x:collision.normal.x,y:collision.normal.y,z:collision.normal.z};
        if(collision.normal.y>.45){result.onGround=true;if(actor.vy<0)actor.vy=0;}
        if(collision.normal.y<-.45){result.ceiling=true;if(actor.vy>0)actor.vy=0;}
        capsule.translate(translation.copy(collision.normal).multiplyScalar(collision.depth+.00001));
      }
      actor.x=capsule.start.x;actor.y=capsule.start.y-r;actor.z=capsule.start.z;
      let doorPushed=false;
      dynamicIndex.query(actor.x,actor.z,r+.1,motionScratch);
      for(let pass=0;pass<3;pass++)for(const b of motionScratch){
        const er=capsuleFootprintRadius(b,actor.y,h,r);if(!er||!circleHitsBox(actor.x,actor.z,er,b))continue;
        const rx=actor.x-b.x,rz=actor.z-b.z,lx=b.cos*rx-b.sin*rz,lz=b.sin*rx+b.cos*rz;
        const qx=Math.max(-b.w/2,Math.min(b.w/2,lx)),qz=Math.max(-b.d/2,Math.min(b.d/2,lz));
        let vx=lx-qx,vz=lz-qz,dist=Math.hypot(vx,vz),depth=er-dist+.00001;
        if(dist<1e-8){if(b.w/2-Math.abs(lx)<b.d/2-Math.abs(lz)){vx=lx<0?-1:1;vz=0;depth=er+b.w/2-Math.abs(lx);}else{vx=0;vz=lz<0?-1:1;depth=er+b.d/2-Math.abs(lz);}dist=1;}
        actor.x+=(b.cos*vx+b.sin*vz)/dist*depth;actor.z+=(-b.sin*vx+b.cos*vz)/dist*depth;result.collision=true;doorPushed=true;
      }
      if(!scopeAllowed(actor.x,actor.z,r)){
        // A diagonal correction at a jamb/floor edge used to discard both axes.
        // Retain a legal tangential step, without shrinking the capsule or teleporting.
        actor.x=ox;actor.z=oz;result.collision=true;
        for(const [x,z] of [[nx,oz],[ox,nz]])if(canOccupy(x,z,r,h,actor.y)){actor.x=x;actor.z=z;break;}
      }
      // A moving slab must never push the actor into an adjacent static wall.
      if(doorPushed&&!canOccupy(actor.x,actor.z,r,h,actor.y,true)&&canOccupy(ox,oz,r,h,actor.y,true)){
        actor.x=ox;actor.z=oz;result.collision=true;
      }
      if(actor.y<.0001){actor.y=0;result.onGround=true;if(actor.vy<0)actor.vy=0;}
      if(actor.y+h>CEILING_HEIGHT){actor.y=CEILING_HEIGHT-h;result.ceiling=true;if(actor.vy>0)actor.vy=0;}
      if(!Number.isFinite(actor.y)){actor.y=oy;result.collision=true;}
    }
    actor.onGround=result.onGround||actor.y<=.001;return result;
  }

  let rayStamp=0;
  function raycast(origin,direction,maxDistance=100,{vision=false,staticOnly=false}={}){
    const len=Math.hypot(direction.x,direction.y||0,direction.z);if(len<EPS||maxDistance<=0)return null;
    const dir={x:direction.x/len,y:(direction.y||0)/len,z:direction.z/len},o={x:origin.x,y:origin.y??1.5,z:origin.z};
    let hit=null,best=maxDistance;
    // Exact grid traversal: visit only crossed cells, once per OBB. No sampled
    // neighbourhood Sets, and stop behind the nearest solid hit (also for AI rays).
    const stamp=++rayStamp;
    const test=b=>{
      if(b.disabled||b._rayStamp===stamp)return;b._rayStamp=stamp;
      if(vision&&b.material==='glass')return;
      const ox=o.x-b.x,oz=o.z-b.z,p=[b.cos*ox-b.sin*oz,o.y-b.y,b.sin*ox+b.cos*oz],d=[b.cos*dir.x-b.sin*dir.z,dir.y,b.sin*dir.x+b.cos*dir.z],half=[b.w/2,b.h/2,b.d/2];
      let enter=-Infinity,leave=Infinity,axis=-1,sign=0,ok=true;
      for(let j=0;j<3;j++){
        if(Math.abs(d[j])<1e-10){if(Math.abs(p[j])>half[j]){ok=false;break;}}
        else{let t1=(-half[j]-p[j])/d[j],t2=(half[j]-p[j])/d[j];const n=d[j]>0?-1:1;if(t1>t2)[t1,t2]=[t2,t1];if(t1>enter){enter=t1;axis=j;sign=n;}leave=Math.min(leave,t2);if(enter>leave){ok=false;break;}}
      }
      if(!ok||leave<.0001||enter>best)return;
      const t=Math.max(0,enter);const normal=[0,0,0];if(axis>=0)normal[axis]=sign;
      best=t;hit={distance:t,point:{x:o.x+dir.x*t,y:o.y+dir.y*t,z:o.z+dir.z*t},normal:{x:b.cos*normal[0]+b.sin*normal[2],y:normal[1],z:-b.sin*normal[0]+b.cos*normal[2]},id:b.id,material:b.material};
        };
    const testCell=(ix,iz)=>{const key=`${ix},${iz}`,cell=boxIndex.cells.get(key);if(cell)for(const b of cell)test(b);if(!staticOnly){const moving=dynamicIndex.cells.get(key);if(moving)for(const b of moving)test(b);}};
    const size=boxIndex.size,sx=Math.sign(dir.x),sz=Math.sign(dir.z);
    let ix=Math.floor(o.x/size),iz=Math.floor(o.z/size);
    const deltaX=sx?size/Math.abs(dir.x):Infinity,deltaZ=sz?size/Math.abs(dir.z):Infinity;
    let nextX=sx?((ix+(sx>0?1:0))*size-o.x)/dir.x:Infinity;
    let nextZ=sz?((iz+(sz>0?1:0))*size-o.z)/dir.z:Infinity;
    for(;;){
      testCell(ix,iz);
      if(Math.min(nextX,nextZ)>best||!Number.isFinite(Math.min(nextX,nextZ)))break;
      // On a corner visit both adjacent cells too; grazing an OBB stays a hit.
      if(Math.abs(nextX-nextZ)<1e-10){
        testCell(ix+sx,iz);testCell(ix,iz+sz);
        ix+=sx;iz+=sz;nextX+=deltaX;nextZ+=deltaZ;
      }else if(nextX<nextZ){ix+=sx;nextX+=deltaX;}else{iz+=sz;nextZ+=deltaZ;}
    }
    if(Math.abs(dir.y)>1e-9)for(const s of surfaces){const t=(s.y-o.y)/dir.y;if(t>=.0001&&t<best&&insidePolygon(o.x+dir.x*t,o.z+dir.z*t,s.polygon)){best=t;hit={distance:t,point:{x:o.x+dir.x*t,y:s.y,z:o.z+dir.z*t},normal:{x:0,y:dir.y>0?-1:1,z:0},id:s.id,material:s.material};}}
    return hit;
  }
  function segmentClear(from,to,options={}){const dx=to.x-from.x,dy=(to.y??1.5)-(from.y??1.5),dz=to.z-from.z,d=Math.hypot(dx,dy,dz);return d<EPS||!raycast({...from,y:from.y??1.5},{x:dx,y:dy,z:dz},Math.max(0,d-.015),options);}
  return {canOccupy,updateGlassPassages,staticCanOccupy:(x,z,r,h,y)=>canOccupy(x,z,r,h,y,true),setDynamicBoxes,scopeAllowed,onFloor,canStand,move,raycast,segmentClear,octree,staticBoxes,statistics:{staticBoxes:staticBoxes.length,collisionSurfaces:surfaces.length,source:'Three.js Capsule + Octree; source boxes and polygons'}};
}
