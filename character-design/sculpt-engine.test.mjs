import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three/three.module.js';
import {subdivideSkin,skinMatrix,SculptEngine,safeSurfaceStep} from './sculpt-engine.mjs?v=6.1.2';
import {newSculpt,validateSculpt,brushWeight} from './sculpt-schema.mjs?v=6.1.2';
function fixture(){
 const geometry=new T.PlaneGeometry(.16,.24,8,12).toNonIndexed();geometry.translate(0,1.67,.09);
 const count=geometry.attributes.position.count;
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(count*4),4));const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 const root=new T.Group(),bone=new T.Bone();root.add(bone);const mesh=new T.SkinnedMesh(geometry,new T.MeshStandardMaterial({name:'face-skin',color:'#ffffff'}));root.add(mesh);root.updateMatrixWorld(true);mesh.bind(new T.Skeleton([bone]));
 const avatar={meshes:[mesh],gender:'male',scale:1,root},project={creative:{sculpt:newSculpt()}},engine=new SculptEngine();engine.apply(project,avatar,new Map([[mesh,Float32Array.from(geometry.attributes.position.array)]]));return {engine,project,mesh,bone,root,avatar};
}
function begin(f,mode='grab',symmetry=true){return f.engine.begin(f.project,{object:f.mesh,face:{a:0,normal:new T.Vector3(0,0,1)},point:new T.Vector3(.027,1.67,.09)},{mode,radius:.055,strength:1,symmetry,color:new T.Color('#e14466')});}
test('subdivision retains UVs and normalized skin weights without mutating original geometry',()=>{
 const f=fixture(),original=Float32Array.from(f.mesh.geometry.attributes.position.array),g=subdivideSkin(f.mesh.geometry,2);
 assert.equal(g.attributes.position.count,original.length/3*16);assert.deepEqual(f.mesh.geometry.attributes.position.array,original);
 for(let i=0;i<g.attributes.skinWeight.count;i++)assert.ok(Math.abs([0,1,2,3].reduce((n,a)=>n+g.attributes.skinWeight.getComponent(i,a),0)-1)<1e-6);
 assert.equal(g.attributes.uv.count,g.attributes.position.count);
});
test('skin matrix converts an actually posed/skinned vertex both ways',()=>{
 const f=fixture();f.bone.rotation.z=.3;f.bone.position.set(.2,.04,.1);f.root.scale.set(1.2,.9,1.1);f.root.updateMatrixWorld(true);f.mesh.skeleton.update();
 const actual=f.mesh.getVertexPosition(0,new T.Vector3()).applyMatrix4(f.mesh.matrixWorld),bind=new T.Vector3().fromBufferAttribute(f.mesh.geometry.attributes.position,0),matrix=skinMatrix(f.mesh,0);
 assert.ok(bind.clone().applyMatrix4(matrix).distanceTo(actual)<1e-6);assert.ok(actual.clone().applyMatrix4(matrix.invert()).distanceTo(bind)<1e-6);
});
test('dragging changes real vertices, welds UV seams and roundtrips sparse data',()=>{
 const f=fixture();assert.ok(begin(f));f.engine.brush(f.project,{delta:new T.Vector3(.01,.014,.005)});f.engine.finish(f.project);validateSculpt(f.project.creative.sculpt);
 const e=f.engine.entries[0];assert.ok(e.offsets.some(v=>v!==0));assert.ok(f.project.creative.sculpt.models.male['face-skin'].deltas.length>0);
 for(const group of e.groups){const first=group.indices[0];for(const i of group.indices)assert.equal(e.mesh.geometry.attributes.position.getY(i),e.mesh.geometry.attributes.position.getY(first));}
 const data=JSON.parse(JSON.stringify(f.project));const fresh=fixture();fresh.engine.apply(data,fresh.avatar,new Map([[fresh.mesh,Float32Array.from(fresh.mesh.geometry.attributes.position.array)]]));assert.deepEqual(fresh.engine.entries[0].offsets,e.offsets);
});
test('paint is reversible and protected neck vertices remain fixed',()=>{
 const f=fixture();begin(f,'paint');f.engine.brush(f.project);f.engine.finish(f.project);assert.ok(f.engine.entries[0].paint.some(v=>v>0));validateSculpt(f.project.creative.sculpt);
 f.engine.reset(f.project,true);assert.ok(f.engine.entries[0].paint.every(v=>v===0));assert.ok(f.engine.entries[0].offsets.every(v=>v===0));
 begin(f);f.engine.brush(f.project,{delta:new T.Vector3(0,.02,0)});f.engine.cancel(f.project);assert.ok(f.engine.entries[0].offsets.every(v=>v===0));
});
test('invalid sparse data and incompatible topology fail explicitly',()=>{
 const f=fixture();begin(f);f.engine.brush(f.project,{delta:new T.Vector3(0,.02,0)});f.engine.finish(f.project);
 const p=structuredClone(f.project);p.creative.sculpt.models.male['face-skin'].deltas[1]=10;assert.throws(()=>validateSculpt(p.creative.sculpt),/stor/);
 p.creative.sculpt.models.male['face-skin'].deltas[1]=.01;p.creative.sculpt.models.male['face-skin'].topology='s1-12345678';const fresh=fixture();assert.throws(()=>fresh.engine.apply(p,fresh.avatar,new Map([[fresh.mesh,Float32Array.from(fresh.mesh.geometry.attributes.position.array)]])),/matchar/);
 assert.equal(brushWeight(0,.04),1);assert.equal(brushWeight(.05,.04),0);
});

test('symmetry produces mirrored displacements and reset restores authored normals',()=>{
 const f=fixture(),e=f.engine.entries[0],normals=Float32Array.from(e.mesh.geometry.attributes.normal.array);begin(f);f.engine.brush(f.project,{delta:new T.Vector3(.015,.012,.005)});f.engine.finish(f.project);
 for(let i=0;i<e.groups.length;i++){const p=e.groups[i].p,j=e.groups.findIndex(g=>Math.abs(g.p[0]+p[0])<1e-6&&Math.abs(g.p[1]-p[1])<1e-6&&Math.abs(g.p[2]-p[2])<1e-6);if(j<0)continue;assert.ok(Math.abs(e.offsets[i*3]+e.offsets[j*3])<1e-6);assert.ok(Math.abs(e.offsets[i*3+1]-e.offsets[j*3+1])<1e-6);}
 f.engine.reset(f.project,true);assert.deepEqual(e.mesh.geometry.attributes.normal.array,normals);
 assert.equal(f.engine.begin(f.project,{object:f.mesh,face:{a:0,normal:new T.Vector3(0,0,1)},point:new T.Vector3(0,1.40,.09)},{mode:'grab',radius:.06,strength:1,symmetry:true}),false,'neck attachment cannot be grabbed');
});

test('legacy portrait annotations retain their original camera framing',async()=>{const {newProject}=await import('./project-schema.mjs?v=6.1.2');const {ensureCreative}=await import('./creative-schema.mjs?v=6.1.2');const p=newProject();p.studioVersion='4.1';p.artwork={faceViews:{front:'data:image/png;base64,example'}};ensureCreative(p);assert.equal(p.artwork.portraitFraming,'legacy-headbone-v4');const modern=newProject();modern.studioVersion='5.0';modern.artwork={faceViews:{}};ensureCreative(modern);assert.equal(modern.artwork.portraitFraming,undefined);});

test('an inverted triangle is backed off before it can fold or collapse',()=>{
 const f=fixture(),e=f.engine.entries[0],original=e.offsets.slice(),candidate=original.slice();
 const i=e.vertexGroups[0],j=e.vertexGroups[1],k=e.vertexGroups[2],a=e.groups[i].p,b=e.groups[j].p,c=e.groups[k].p;
 // Reflect one corner through the opposite edge: a definite inversion.
 const midpoint=b.map((v,n)=>(v+c[n])/2);for(let n=0;n<3;n++)candidate[i*3+n]=2*(midpoint[n]-a[n]);
 const mix=safeSurfaceStep(e,original,original,candidate);assert.ok(mix>0&&mix<.5,'inverted step is reduced before the zero-area midpoint');
 for(let n=0;n<candidate.length;n++)candidate[n]*=mix;
 assert.equal(safeSurfaceStep(e,original,original,candidate),1,'accepted surface has retained projected triangle area');
});

test('large drags saturate smoothly and retain exact UVs and seam welding',()=>{
 const f=fixture(),uv=f.mesh.geometry.attributes.uv.array.slice();begin(f);f.engine.brush(f.project,{delta:new T.Vector3(3,2,1)});f.engine.finish(f.project);
 assert.deepEqual(f.mesh.geometry.attributes.uv.array,uv);
 for(const e of f.engine.entries)for(const g of e.groups){const first=g.indices[0];for(const i of g.indices)for(let n=0;n<3;n++)assert.equal(e.mesh.geometry.attributes.position.getComponent(i,n),e.mesh.geometry.attributes.position.getComponent(first,n));}
 assert.ok(Math.max(...f.engine.entries[0].offsets.map(Math.abs))<.031,'stroke movement remains bounded relative to brush radius');
});
