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
    return {vertices:attr.position.count,position:bytes(Float32Array.from(p)),
      normal:bytes(Int8Array.from(n,v=>Math.round(v*127))),color:bytes(color),
      index:bytes(Uint16Array.from(geo.index.array))};
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
  return {version:1,id:CURMAP.id,sky,fog:{color:atmo.fog,density:atmo.fogD},fabrics,mills,sea,atlas};
};
