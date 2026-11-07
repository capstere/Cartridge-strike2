import * as THREE from '../../vendor/three/three.module.js';

/** Riposte-inspired preallocated tracer batch, retaining our existing line
 * style and 45ms simulation-time lifetime. Never changes bullet/hit logic.
 * Each slot owns only numeric data; no per-shot Mesh/Geometry/Material/Vector.
 */
export class TracerBatch {
  constructor(scene, capacity = 128) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4096) throw new RangeError('Invalid tracer capacity');
    this.scene=scene;this.capacity=capacity;this.cursor=0;this.count=0;this.disposed=false;
    this.points=new Float32Array(capacity*6);
    this.born=new Float64Array(capacity);this.until=new Float64Array(capacity);this.until.fill(-Infinity);
    this.positions=new Float32Array(capacity*6);this.colors=new Float32Array(capacity*8);
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,4).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0,0);
    const color=new THREE.Color(0xf3da9b);
    for(let i=0;i<capacity*2;i++) {this.colors[i*4]=color.r;this.colors[i*4+1]=color.g;this.colors[i*4+2]=color.b;}
    // RGBA vertex colours keep independent fades with the standard Three.js
    // tone-mapping/colour-space pipeline. Walls still occlude every segment.
    this.material=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false});
    this.mesh=new THREE.LineSegments(this.geometry,this.material);
    this.mesh.name='pooled-shot-tracers';this.mesh.frustumCulled=false;this.mesh.visible=false;
    scene.add(this.mesh);
  }
  add(from,to,time,lifetime=.045) {
    if(this.disposed || !from || !to || !Number.isFinite(time) || !(lifetime>0) || !Number.isFinite(lifetime))return false;
    if(!Number.isFinite(from.x)||!Number.isFinite(from.y)||!Number.isFinite(from.z)||!Number.isFinite(to.x)||!Number.isFinite(to.y)||!Number.isFinite(to.z))return false;
    const i=this.cursor, p=i*6;
    this.points[p]=from.x;this.points[p+1]=from.y;this.points[p+2]=from.z;
    this.points[p+3]=to.x;this.points[p+4]=to.y;this.points[p+5]=to.z;
    this.born[i]=time;this.until[i]=time+lifetime;
    this.cursor=(i+1)%this.capacity;
    return true;
  }
  update(time) {
    if(this.disposed || !Number.isFinite(time))return;
    let n=0;
    for(let i=0;i<this.capacity;i++) {
      if(time>=this.until[i] || time<this.born[i])continue;
      const p=i*6,d=n*6;
      for(let k=0;k<6;k++)this.positions[d+k]=this.points[p+k];
      const alpha=Math.max(0,Math.min(1,(this.until[i]-time)/(this.until[i]-this.born[i])));
      this.colors[n*8+3]=this.colors[n*8+7]=alpha;
      n++;
    }
    this.count=n;this.mesh.visible=n>0;this.geometry.setDrawRange(0,n*2);
    if(n){this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.color.needsUpdate=true;}
  }
  clear() {
    this.until.fill(-Infinity);this.cursor=0;this.count=0;
    this.mesh.visible=false;this.geometry.setDrawRange(0,0);
  }
  dispose() {
    if(this.disposed)return;
    this.disposed=true;this.clear();this.scene.remove(this.mesh);
    this.geometry.dispose();this.material.dispose();
  }
}
