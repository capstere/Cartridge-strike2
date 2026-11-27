// These functions are serialized into a private copy of the pinned donor page.
// They execute in its lexical scope, using its original map and prefab factories.
exports.install=function installReferenceProbe(){
  window.startReferenceExport=()=>mapEnsure('meltem').then(()=>true);
  window.readReferenceMap=()=>({
    bounds:CURMAP.def.bounds,spawns:SPAWNS,zones:ZONES,poi:POI,ramps:RAMPS,holes:HOLES,
    solids:COL.map(c=>[c.x0,c.x1,c.y0,c.y1,c.z0,c.z1,c.m,+!!c.ray,+!!c.noRay,+!!c.inv,+!!c.prop]),
    water:{y:WATER.y,floor:WATER.floor,box:WATER.box,land:WATER.land},
    atmosphere:{fog:CURMAP.def.atmo.fog,sun:CURMAP.def.atmo.sun,sunColor:CURMAP.def.atmo.sunColor,sky:CURMAP.def.atmo.sky},
    renderGroups:window.exportBuffers.map(b=>({material:b.mat,detail:b.cls,chunk:b.ck,n:b.g.nv,indices:b.g.ni})),
    nav:{x:[...NAV.nx],y:[...NAV.ny],z:[...NAV.nz],offsets:[...NAV.adjStart],adj:[...NAV.adj],cost:[...NAV.adjCost],kind:[...NAV.adjKind]},
    rayProps:PHYS.bodies.filter(b=>!b.pooled&&b.origin&&b.d.ray).map(b=>({
      id:b.id,p:{x:b.p.x,y:b.p.y,z:b.p.z},R:[...b.R],sh:b.sh,rad:b.rad,through:!!b.d.through,material:b.d.mat
    })),
    sourceProps:PHYS.bodies.filter(b=>!b.pooled&&b.origin).length
  });
};
exports.capture=function captureStaticGeometry(){
  // Use Maker.put's original position, normal, UV and tint transforms to bake
  // resting props into the visual mesh. No second collision or gameplay body.
  for(const body of PHYS.bodies){
    if(!body.origin||body.pooled)continue;
    const {x,y,z,ry,rx,rz}=body.origin,pf=body.V.pf;
    const geometryOnly={...pf,cols:[],occs:[],pcols:[],lamps:[],fabrics:[],dyn:[]};
    DECOR.save().move(x,y,z).rotY(ry).rotX(rx).rotZ(rz).scl(body.s);
    DECOR.put(geometryOnly,{nocol:true,tint:body.tintRaw});DECOR.restore();
  }
  window.exportBuffers=Array.from(WORLD.bufs.values());
};
exports.group=function readGeometryGroup(i){
  const g=window.exportBuffers[i].g;
  function base64(view,length){
    const bytes=new Uint8Array(view.buffer,view.byteOffset,length*view.BYTES_PER_ELEMENT);
    let text='';
    for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));
    return btoa(text);
  }
  return {position:base64(g.P,g.nv*3),normal:base64(g.N,g.nv*3),uv:base64(g.U,g.nv*2),
    color:base64(g.C,g.nv*3),ao:base64(g.A,g.nv),index:base64(g.I,g.ni)};
};
