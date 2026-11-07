/* Derive a small, self-contained GLB per reusable Hissrum12 equipment family.
 * Input is PINNED public capstere/jedi source; no sample bags or private content.
 * This is offline tooling. The game runtime never imports these scripts.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const upstream=process.argv[2],out=process.argv[3];
if(!upstream||!out)throw Error('usage: node build-hissrum.cjs <pinned Jedi checkout> <public editor models directory>');
const sourceSha={
 'planner-core.js':'', 'object-library.js':''
};
const source={};for(const file of Object.keys(sourceSha)){
 source[file]=fs.readFileSync(path.join(upstream,file),'utf8');
 sourceSha[file]=crypto.createHash('sha256').update(source[file]).digest('hex');
}
// Never render workplace-operation labels from the source's display geometry.
source['object-library.js']=source['object-library.js'].replace("text('SAMPLE\\nPOINTS'", "text('READY'").replace("text('4',x,py+phoneH", "text(' ',x,py+phoneH");
const sandbox={Math,Float32Array,Uint8Array,console};sandbox.globalThis=sandbox;
vm.runInNewContext(source['planner-core.js'],sandbox,{filename:'planner-core.js',timeout:4000});
vm.runInNewContext(source['object-library.js'],sandbox,{filename:'object-library.js',timeout:4000});
const C=sandbox.LayoutCore;if(!C?.CATALOG?.length)throw Error('Missing pinned source catalog');
// sampleBag uses a proprietary internally-derived cartridge mesh. It is forbidden
// by the source itself and is NOT exported. All other 28 source types included.
const all=C.CATALOG.filter(x=>x.type!=='sampleBag');
const skipMaterial=new Set(['bagFilm','bagFold']);
const align=n=>(n+3)&~3;
function glbFor(model){
 const o={...model,params:{...(model.params||{}),...(model.type==='sign'?{text:'STORAGE'}:{})}};
 const parts=C.buildGeometry(model.type,o),buffers=[],bufferViews=[],accessors=[],materials=[],primitives=[];
 let position=0,triangles=0,verts=0,materialCount=0;
 const pushBuf=(b,target)=>{const offset=align(position);if(offset>position){buffers.push(Buffer.alloc(offset-position));position=offset;}
  buffers.push(b);const index=bufferViews.length;bufferViews.push({buffer:0,byteOffset:position,byteLength:b.byteLength,...(target?{target}:{})});position+=b.byteLength;return index;
 };
 const accessor=(view,componentType,count,type,min,max)=>{
  let a={bufferView:view,componentType,count,type};if(min)a.min=min;if(max)a.max=max;accessors.push(a);return accessors.length-1;
 };
 for(const part of parts){if(!part.p?.length||skipMaterial.has(part.mat))continue;
  if(part.p.length!==part.n.length||part.p.length%9)throw Error('Invalid triangle buffers '+model.type+'/'+part.mat);
  // Quantize vertex signatures to micrometres/normals; preserve each source face.
  const unique=new Map(),vertsXYZ=[],normals=[],indices=[];
  for(let j=0;j<part.p.length;j+=3){
   const pos=[part.p[j],part.p[j+1],part.p[j+2]],n=[part.n[j],part.n[j+1],part.n[j+2]];
   if(![...pos,...n].every(Number.isFinite))throw Error('Non-finite vertex '+model.type);
   const key=pos.map(x=>Math.round(x*1e5)).concat(n.map(x=>Math.round(x*1e4))).join(',');
   let v=unique.get(key);
   if(v===undefined){v=unique.size;unique.set(key,v);vertsXYZ.push(...pos);normals.push(...n);}
   indices.push(v);
  }
  const index32=unique.size>65535;
  const vertsBinary=Buffer.from(new Float32Array(vertsXYZ).buffer);
  const normalsBinary=Buffer.from(new Float32Array(normals).buffer);
  const indicesBinary=Buffer.from((index32?new Uint32Array(indices):new Uint16Array(indices)).buffer);
  const vb=pushBuf(vertsBinary,34962),nb=pushBuf(normalsBinary,34962),ib=pushBuf(indicesBinary,34963);
  const pMin=[Infinity,Infinity,Infinity],pMax=[-Infinity,-Infinity,-Infinity];
  for(let k=0;k<vertsXYZ.length;k+=3)for(let axis=0;axis<3;axis++){
   pMin[axis]=Math.min(pMin[axis],vertsXYZ[k+axis]);pMax[axis]=Math.max(pMax[axis],vertsXYZ[k+axis]);
  }
  const attrs={POSITION:accessor(vb,5126,unique.size,'VEC3',pMin,pMax),NORMAL:accessor(nb,5126,unique.size,'VEC3')};
  const idx=accessor(ib,index32?5125:5123,indices.length,'SCALAR');
  const src=C.MATS[part.mat];if(!src)throw Error('Missing material '+part.mat);
  const m=materials.push({name:part.mat,pbrMetallicRoughness:{baseColorFactor:[src[0],src[1],src[2],src[3]],metallicFactor:/steel|chrome|zinc|brass/.test(part.mat)?.4:0,roughnessFactor:.8},alphaMode:src[3]<.995?'BLEND':'OPAQUE',doubleSided:src[3]<.995})-1;
  primitives.push({attributes:attrs,indices:idx,material:m,mode:4});triangles+=indices.length/3;verts+=unique.size;materialCount++;
 }
 if(!primitives.length)throw Error('No model geometry '+model.type);
 const doc={asset:{version:'2.0',generator:'Cartridge Studio / pinned Hissrum12 procedural converter'},
  buffers:[{byteLength:position}],bufferViews,accessors,materials,
  meshes:[{name:'H12_'+model.type,primitives}],nodes:[{mesh:0,name:model.name}],scenes:[{nodes:[0]}],scene:0,
  extras:{origin:'capstere/jedi',sourceCommit:'0ed0c4defed19578c42e660f4c2fbae2dfc1e686',sourceType:model.type,
    license:'Original owner-created procedural geometry; sampleBag excluded',defaultDimensions:[model.w,model.d,model.h],
    note:'Illustrative model, not a measured copy of actual equipment'}
 };
 const json=Buffer.from(JSON.stringify(doc)),jp=align(json.length),bp=align(position),len=12+8+jp+8+bp,blob=Buffer.alloc(len);
 blob.write('glTF',0);blob.writeUInt32LE(2,4);blob.writeUInt32LE(len,8);blob.writeUInt32LE(jp,12);blob.write('JSON',16);blob.fill(0x20,20,20+jp);json.copy(blob,20);
 blob.writeUInt32LE(bp,20+jp);blob.write('BIN\0',24+jp);
 let off=28+jp;for(const b of buffers){b.copy(blob,off);off+=b.length;}
 const sha256=crypto.createHash('sha256').update(blob).digest('hex');
 return {blob,triangles,vertices:verts,primitiveCount:primitives.length,sha256,bytes:blob.byteLength};
}
fs.mkdirSync(out,{recursive:true});const manifest={schemaVersion:1,sourceRepository:'capstere/jedi',sourceCommit:'0ed0c4defed19578c42e660f4c2fbae2dfc1e686',sourceSha,excluded:[{type:'sampleBag',reason:'Internal model is explicitly marked private/do not publish by Hissrum12 source'}],models:[]};
for(const m of all){const g=glbFor(m);fs.writeFileSync(path.join(out,m.type+'.glb'),g.blob);
 manifest.models.push({id:'hissrum12:'+m.type,sourceType:m.type,name:m.name,category:m.category,sourceDimensions:[m.w,m.d,m.h],defaultParams:m.params||{},triangles:g.triangles,vertices:g.vertices,materials:g.primitiveCount,sha256:g.sha256,bytes:g.bytes});
}
fs.writeFileSync(path.join(out,'asset-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',models:manifest.models.length,totalBytes:manifest.models.reduce((s,m)=>s+m.bytes,0),maxTris:Math.max(...manifest.models.map(m=>m.triangles)),maxAsset:manifest.models.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,5).map(x=>({id:x.id,tris:x.triangles,bytes:x.bytes})),sourceSha},null,2));
