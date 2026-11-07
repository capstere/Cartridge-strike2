import {dwarfPoint} from './dwarf-fit.mjs?v=6.1.2';
import * as T from '../vendor/three/three.module.js';
import {heightNormal} from './surface-textures.mjs?v=53';
import {ClothSolver} from './cloth-solver.mjs?v=53';
import {skinMatrix} from './sculpt-engine.mjs?v=6.1.2';
import {FABRICS} from './realism-schema.mjs?v=53';
export function fabricMaterial(color,type='cotton'){
 const f=FABRICS[type],canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#808080';c.fillRect(0,0,128,128);for(let y=0;y<128;y+=4)for(let x=0;x<128;x+=4){c.fillStyle=(x+y)%8?'#929292':'#696969';c.fillRect(x,y,type==='denim'?3:2,3);}
 const map=heightNormal(canvas,1);map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(24,24);
 const m=new T.MeshPhysicalMaterial({color,roughness:f.roughness,sheen:f.sheen,sheenColor:new T.Color(color),normalMap:map,normalScale:new T.Vector2(type==='silk'?.1:.35,type==='silk'?.1:.35),side:T.DoubleSide});m.name='studio-'+type;m.userData.fabric=type;return m;
}
export class ClothPreview{
 constructor(){this.mesh=null;this.signature='';this.accumulator=0;}
 clear(){if(this.mesh){this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.normalMap?.dispose();this.mesh.material.dispose();}this.mesh=null;this.signature='';}
 configure(project,avatar,sources){
  const r=project.creative.realism,signature=JSON.stringify({r,color:project.palette.jacket,fit:project.creative.fit,body:project.body});if(this.avatar===avatar&&signature===this.signature)return;
  this.clear();this.avatar=avatar;this.signature=signature;if(r.garment==='none')return;
  const source=avatar.meshes.find(m=>m.material?.name==='jacket-fabric'),base=sources.get(source)||source.geometry.attributes.position.array,rows=16,cols=24,vertices=[],uv=[],indices=[],edges=[],pins=[];
  for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
   const u=col/cols,v=row/rows,fit=project.creative.fit/100,lengthScale=(r.garmentLength??100)/100;
   if(r.garment==='cape')vertices.push((u-.5)*(.40+.18*v)*fit,1.47-.78*v*lengthScale,-.14-.035*Math.sin(Math.PI*u)-.055*v);
   else{const angle=.40+u*(Math.PI*2-.8),radius=(.20+.035*v)*fit;vertices.push(Math.sin(angle)*radius,1.44-.72*v*lengthScale,Math.cos(angle)*radius*.80);}
   uv.push(u,1-v);const i=row*(cols+1)+col;if(row===0)pins.push(i);
   if(col<cols)edges.push([i,i+1]);if(row<rows)edges.push([i,i+cols+1]);if(col<cols&&row<rows){edges.push([i,i+cols+2],[i+1,i+cols+1]);indices.push(i,i+1,i+cols+1,i+1,i+cols+2,i+cols+1);}if(row<rows-1)edges.push([i,i+2*(cols+1),25]);if(col<cols-1)edges.push([i,i+2,25]);
  }
  if(avatar.isDwarf)for(let i=0;i<vertices.length;i+=3)vertices.splice(i,3,...dwarfPoint(vertices.slice(i,i+3)));
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);const js=new Uint16Array(vertices.length/3*4),ws=new Float32Array(js.length);
  // Transfer nearby original clothing weights; no new skeleton or animation names.
  for(let i=0;i<vertices.length/3;i++){let best=0,distance=Infinity;for(let k=0;k<base.length/3;k++){const d=(base[k*3]-vertices[i*3])**2+(base[k*3+1]-vertices[i*3+1])**2+(base[k*3+2]-vertices[i*3+2])**2;if(d<distance){distance=d;best=k;}}for(let k=0;k<4;k++){js[i*4+k]=source.geometry.attributes.skinIndex.getComponent(best,k);ws[i*4+k]=source.geometry.attributes.skinWeight.getComponent(best,k);}}
  g.setAttribute('skinIndex',new T.Uint16BufferAttribute(js,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(ws,4));g.computeVertexNormals();const m=new T.SkinnedMesh(g,fabricMaterial(project.palette.jacket,r.fabric));m.name='simulated-'+r.garment;m.position.copy(source.position);m.quaternion.copy(source.quaternion);m.scale.copy(source.scale);m.bindMatrix.copy(source.bindMatrix);m.bindMatrixInverse.copy(source.bindMatrixInverse);m.skeleton=source.skeleton;m.frustumCulled=false;source.parent.add(m);this.mesh=m;this.bind=Float64Array.from(vertices);this.targets=new Float64Array(vertices.length);this.matrices=[];this.inverse=[];this.updateTargets();this.solver=new ClothSolver(this.targets,edges,pins,FABRICS[r.fabric]);this.settings={...r,solver:'XPBD-1',step:1/120,iterations:7,collision:'body bone capsules + ground',selfCollision:false};m.userData.cloth={...this.settings,export:'Original bone weights and frozen simulated bind shape; secondary physics must be implemented in the game. Not a baked physics animation.'};this.wind=r.wind/100*2;this.reset();this.settle(90);
 }
 updateTargets(){const v=new T.Vector3();this.mesh.updateMatrixWorld(true);for(let i=0;i<this.targets.length/3;i++){const mat=skinMatrix(this.mesh,i);this.matrices[i]=mat;this.inverse[i]=mat.clone().invert();v.fromArray(this.bind,i*3).applyMatrix4(mat).toArray(this.targets,i*3);}}
 capsules(){const bones=this.avatar.bones,scale=Math.max(this.avatar.holder.scale.x,this.avatar.holder.scale.y,this.avatar.holder.scale.z),point=n=>bones.get(n)?.getWorldPosition(new T.Vector3()).toArray();return [['pelvis','spine_03',.16],['upperarm_l','lowerarm_l',.065],['upperarm_r','lowerarm_r',.065],['thigh_l','calf_l',.085],['thigh_r','calf_r',.085]].map(([a,b,r])=>({a:point(a),b:point(b),r:r*scale})).filter(c=>c.a&&c.b);}
 reset(){if(!this.mesh)return;this.avatar.root.updateWorldMatrix(true,true);this.updateTargets();this.solver.reset(this.targets);this.accumulator=0;this.write();}
 settle(steps=120){if(!this.mesh)return;this.updateTargets();const capsules=this.capsules();for(let i=0;i<steps;i++)this.solver.step(1/120,this.targets,capsules,this.wind);this.write();}
 step(delta){if(!this.mesh)return;this.updateTargets();this.accumulator=Math.min(this.accumulator+delta,.05);const capsules=this.capsules();while(this.accumulator>=1/120){this.solver.step(1/120,this.targets,capsules,this.wind);this.accumulator-=1/120;}this.write();}
 write(){const g=this.mesh.geometry,p=g.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromArray(this.solver.positions,i*3).applyMatrix4(this.inverse[i]);p.setXYZ(i,v.x,v.y,v.z);}p.needsUpdate=true;g.computeVertexNormals();}
 handoff(){return {referencePose:'Idle_Loop',frozenSecondaryMotion:true,collisionRig:[['pelvis','spine_03',.16],['upperarm_l','lowerarm_l',.065],['upperarm_r','lowerarm_r',.065],['thigh_l','calf_l',.085],['thigh_r','calf_r',.085]],collisionRadiusScale:this.avatar?Math.max(this.avatar.holder.scale.x,this.avatar.holder.scale.y,this.avatar.holder.scale.z):1,settings:this.settings||null,worldParticles:this.solver?Array.from(this.solver.positions):[],restBindPositions:this.bind?Array.from(this.bind):[],pins:this.solver?[...this.solver.pins]:[],constraints:this.solver?.edges.map(c=>({a:c.a,b:c.b,length:c.length,compliance:c.compliance}))||[],note:'PREVIEW.glb preserves the draped skinned mesh. Real-time physics is studio-only. Port this solver/settings or bake cloth animation in the target game; self collision and sewing are not implemented.'};}
}
