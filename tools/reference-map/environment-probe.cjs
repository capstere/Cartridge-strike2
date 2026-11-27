// Executed inside the pinned donor realm after mapEnsure completes.
// Serialize only assets made by this map. Gameplay state stays with the target.
exports.capture=function readSourceEnvironment(){
  function bytes(array){
    const view=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
    let str='';
    for(let i=0;i<view.length;i+=16384)str+=String.fromCharCode(...view.subarray(i,i+16384));
    return btoa(str);
  }
  function geometry(mesh){
    const geo=mesh.geometry,attr=geo.attributes;
    if(!geo.index?.array||!attr.position?.array)throw Error('Missing donor environment geometry.');
    if(attr.position.count>65535)throw Error('Review environment index width.');
    const p=attr.position.array,n=attr.normal.array,c=attr.color.array;
    const color=Uint8Array.from(c,v=>Math.round(255*Math.max(0,Math.min(1,v))));
    const material=Object.keys(MAT).find(k=>MAT[k]===mesh.material)||'color';
    return {material,uv:attr.uv?bytes(Float32Array.from(attr.uv.array)):null,
      vertices:attr.position.count,position:bytes(Float32Array.from(p)),
      normal:bytes(Int8Array.from(n,v=>Math.round(v*127))),color:bytes(color),
      index:bytes(Uint16Array.from(geo.index.array))};
  }
  function floatGeometry(g){
    // Most source float materials share the lower tier's vertex-tinted finish.
    // Merge only the matching hull/trim batches here; preserve original atlas
    // UVs separately for registration marks, lettering, flags and wood.
    const mapped={signs4:'signs',decals4:'decals',signs3:'signs',decals3:'decals',screen:'decals',cyflag:'cyflag',wood:'wood',timber:'wood'};
    const batches=new Map();
    for(const mesh of g.children.filter(child=>child.isMesh)){
      const source=Object.keys(MAT).find(k=>MAT[k]===mesh.material);
      const key=mapped[source]||'color';
      if(!batches.has(key))batches.set(key,[]);
      batches.get(key).push(mesh);
    }
    const out=[];
    for(const [key,parts] of batches){
      const count=parts.reduce((n,m)=>n+m.geometry.attributes.position.count,0);
      if(count>65535)throw Error('Review indexed boat width.');
      const position=new Float32Array(count*3),normal=new Int8Array(count*3),color=new Uint8Array(count*3);
      const uv=new Float32Array(count*2),indices=[];
      let index=0;
      for(const m of parts){
        const g=m.geometry,a=g.attributes;
        position.set(a.position.array,index*3);uv.set(a.uv.array,index*2);
        for(let i=0;i<a.normal.array.length;i++){
          normal[index*3+i]=Math.round(a.normal.array[i]*127);
          color[index*3+i]=Math.round(Math.min(1,a.color.array[i]*(a.aoc?.array[Math.floor(i/3)]||1))*255);
        }
        for(const v of g.index.array)indices.push(v+index);
        index+=a.position.count;
      }
      out.push({material:key,vertices:count,position:bytes(position),normal:bytes(normal),color:bytes(color),
        index:bytes(Uint16Array.from(indices)),uv:key==='color'?null:bytes(uv)});
    }
    return out;
  }
  const breeze=CLOTH_BREEZE[CURMAP.id]||CLOTH_BREEZE_DEF;
  // Bake samples using the map's actual pinned cloth, Verlet solver, material
  // drag, constraints, ground limit and wind harmonics. No CPU cloth step in the target.
  const oldTime=CLOTH.t,dt=1/30,steps=16,wind=new V3(),fabrics=[];
  const dir=Math.hypot(breeze[0],breeze[1])||1;
  for(const cloth of TOILES){
    const solver=cloth.sim;
    solver.tgt.set(cloth.T.rest);solver.reset();solver.normals();toileWrite(cloth);
    const mesh=geometry(cloth.mesh),rest=new Float32Array(cloth.pos);
    const poses=[];
    let maxDelta=0;
    for(let i=1;i<=steps*5;i++){
      const t=i*dt;CLOTH.t=t;
      const gust=.6+.3*Math.sin(t*.45)+.25*Math.sin(t*1.3+1.7)+.15*Math.sin(t*2.9+.4);
      const gain=breeze[2]*gust*cloth.wind;
      wind.set(breeze[0]/dir*gain,gain*(.35*Math.sin(t*.9)+.2*Math.sin(t*2.3+.6)),breeze[1]/dir*gain);
      solver.step(dt,wind,2);solver.normals();
      if(i>=steps*2 && i%steps===0){
        toileWrite(cloth);
        const delta=Float32Array.from(cloth.pos,(v,k)=>v-rest[k]);
        for(const d of delta)maxDelta=Math.max(maxDelta,Math.abs(d));
        poses.push(delta);
      }
    }
    const scale=Math.max(.000001,maxDelta);
    fabrics.push({mesh,range:Math.sqrt(cloth.far2),offset:cloth.sph.center.toArray(),
      deltaScale:scale,deltas:poses.map(a=>bytes(Int8Array.from(a,v=>Math.round(127*v/scale))))});
  }
  CLOTH.t=oldTime;
  const mills=(CYC.mill||[]).map(mill=>({position:mill.g.position.toArray(),yaw:mill.g.rotation.y,
    phase:mill.ph,speed:mill.k,parts:mill.g.children.filter(child=>child.isMesh).map(geometry)}));
  const sky=CURMAP.def.skyPhoto,atmo=CURMAP.def.atmo,W=WATER;
  const floats=W.floats.map(({g,x,z,ry,draft,L,B,roll,ph,f})=>({x,z,yaw:ry,draft,length:L,beam:B,roll,phase:ph,frequency:f,
    parts:floatGeometry(g)}));
  const ponds=PONDS.map(({mesh,U})=>{
    const g=mesh.geometry;
    return {position:mesh.position.toArray(),yaw:mesh.rotation.y,
      vertices:bytes(Float32Array.from(g.attributes.position.array)),rim:bytes(Float32Array.from(g.attributes.aRim.array)),
      indices:bytes(Uint16Array.from(g.index.array)),shallow:U.uPShal.value.toArray(),deep:U.uPDeep.value.toArray(),
      maxDepth:U.uPBed.value,slope:U.uPSlope.value,visibility:U.uPVis.value,murk:U.uPMurk.value,
      opacity:U.uPAlpha.value,rings:U.uPRing.value,calm:U.uPCalm.value};
  });
  const sea=W.on?{
    level:W.y,east:W.east,open:W.open,waves:WAVES_C.map(w=>[w.dx,w.dz,w.k,w.A,w.w,w.Q,w.ph,w.g]),
    field:W.F?{x:W.F.x0,z:W.F.z0,width:W.F.w,height:W.F.h,resolution:W.F.ppm,
      distance:bytes(Uint8Array.from(W.dist,d=>Math.round(255*Math.min(1,d/16))))}:null,
    deep:W.U.uWDeep.value.toArray(),shallow:W.U.uWShallow.value.toArray(),
    foam:W.U.uWFoamC.value.toArray(),sun:W.U.uWSunD.value.toArray(),sunColor:W.U.uWSunC.value.toArray()
  }:null;
  // canvasOnce frees the original GPU-uploaded canvas, so execute the exact
  // factories afresh, retaining their authored UV orientation and alpha.
  const atlas={};
  if(CURMAP.id==='meltem'){
    for(const [id,factory] of Object.entries({cyflag:cyFlagTex,cyfol:cyFloraAtlas})){
      const texture=factory().map,canvas=texture.image;
      atlas[id]={image:canvas.toDataURL('image/png').split(',')[1],flipY:texture.flipY};
      texture.dispose();
    }
  }
  let volcano=null;
  if(CURMAP.id==='tephra'){
    for(const key of ['lava','basalt','moss','panel']){
      const target=TEX[key]?.map?.userData.rt;
      if(!target)throw Error('Original volcanic surface is unavailable: '+key);
      const pixels=new Uint8Array(target.width*target.height*4);
      renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
      for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
      const canvas=document.createElement('canvas');canvas.width=target.width;canvas.height=target.height;
      canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer),canvas.width,canvas.height),0,0);
      atlas[key]={image:canvas.toDataURL('image/png').split(',')[1],flipY:false};
    }
    const bounds=CURMAP.def.bounds,width=Math.ceil((bounds.x1-bounds.x0)/2),height=Math.ceil((bounds.z1-bounds.z0)/2);
    const canopy=new Uint8Array(width*height);
    for(let z=0;z<height;z++)for(let x=0;x<width;x++){
      const px=bounds.x0+(x+.5)*2,pz=bounds.z0+(z+.5)*2;
      const top=ceilingAbove(px,pz,.2,.2);
      canopy[z*width+x]=Number.isFinite(top)&&top<28?Math.round(Math.max(0,top)*8):255;
    }
    volcano={wind:TP_WIND,crater:TP_V,vents:TPH.vents.map(({x,y,z,r,k,low,lava})=>({x,y,z,r,k,low:!!low,lava:!!lava})),
      canopy:{x:bounds.x0,z:bounds.z0,width,height,step:2,heights:bytes(canopy)}};
  }
  return {version:1,id:CURMAP.id,sky,fog:{color:atmo.fog,density:atmo.fogD},fabrics,mills,sea,atlas,ponds,floats,volcano};
};
