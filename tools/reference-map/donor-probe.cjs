// These functions are serialized into a private copy of the pinned donor page.
// They execute in its lexical scope, using its original map and prefab factories.
exports.install=function installReferenceProbe(){
  window.startReferenceExport=(id='meltem')=>mapEnsure(id).then(()=>CURMAP.id);
  window.readReferenceCapabilities=()=>{
    const types={};
    for(const kind of NAV.adjKind)types[kind]=(types[kind]||0)+1;
    let lowest=Infinity,highest=-Infinity;
    for(const y of NAV.ny){lowest=Math.min(lowest,y);highest=Math.max(highest,y);}
    const locations=SPAWNS.map(team=>team.map(([x,z])=>({x,y:gy0(x,z),z})));
    const starts=locations.map(team=>team.map(({x,y,z})=>navNode(x,y,z)));
    const goals=POI.map(([x,y,z])=>navNode(x,y,z));
    let oppositePairs=0,reachablePairs=0,poiReachableFromEverySpawn=goals.map(node=>node>=0);
    const queue=new Int32Array(NAV.nx.length);
    for(const [side,team] of starts.entries())for(const seed of team){
      const seen=new Uint8Array(queue.length);let head=0,tail=0;
      if(seed>=0){seen[seed]=1;queue[tail++]=seed;}
      while(head<tail){
        const from=queue[head++];
        for(let j=NAV.adjStart[from];j<NAV.adjStart[from+1];j++){
          const to=NAV.adj[j];
          if(!seen[to]&&NAV.adjKind[j]===0){seen[to]=1;queue[tail++]=to;}
        }
      }
      for(const goal of starts[1-side]){oppositePairs++;if(seen[goal])reachablePairs++;}
      for(const [i,goal] of goals.entries())poiReachableFromEverySpawn[i]&&=!!seen[goal];
    }
    const bodies=PHYS.bodies.filter(body=>!body.pooled && body.origin);
    const definition=CURMAP.def,atmo=definition.atmo,sound=definition.sound;
    const update=definition.update?.toString()||'';
    const staticGeometry=window.sourceMapGeometry;
    let restPropTriangles=0;
    for(const body of bodies)for(const part of body.V.pf.parts.values())restPropTriangles+=part.g.ni/3;
    return {
      id:CURMAP.id,bounds:CURMAP.def.bounds,spawns:SPAWNS.map(team=>team.length),
      volumes:COL.length,ramps:RAMPS.length,holes:HOLES.length,bridges:BRIDGES.length,
      spawnRoutes:{oppositePairs,reachablePairs,unresolvedSpawns:starts.flat().filter(n=>n<0).length,
        authoredPoi:goals.length,poiReachableFromEverySpawn:poiReachableFromEverySpawn.filter(Boolean).length},
      spawnSurfaces:[...new Set(locations.flat().map(p=>definition.surface?.(p)||'concrete'))].sort(),
      seaEnabled:WATER.on,pools:POOLS.length,visualPonds:PONDS.length,circularConfinement:RING.on,
      void:VOID.on,relief:RELIEF.on,altitude:[lowest,highest],
      environment:{
        fog:{color:atmo.fog,density:atmo.fogD,height:atmo.fogH||null},
        wind:WIND_U.uWnD.value.toArray().slice(0,3),
        movingFoliageMaterials:staticGeometry.materials.filter(key=>Object.hasOwn(WIND_AMP,key)),
        fabricGroups:TOILES.length,fabricTriangles:TOILES.reduce((n,s)=>n+(s.mesh.geometry.index?.count||0)/3,0),
        snowfall:atmo.snowfall||0,snowCover:atmo.snow||null,ashCover:atmo.coat||null,
        sandstorm:update.includes('smStorm('),lightning:update.includes('tephraLightning('),
        ashFall:update.includes('tephraAshUpdate('),steam:update.includes('tephraSteam('),
        windmills:update.includes('cyUpdateMills('),waterfalls:update.includes('waterfallsUpdate('),
        photographicSky:definition.skyPhoto?.key||null,
        ambience:sound?{pack:sound.pack,bedGain:sound.bed,spots:sound.spots?.map(s=>s.id)||[],
          fixedLoops:typeof sound.loops==='function'||!!sound.loops?.length,fountainGain:sound.fountain||0}:null
      },
      navigationNodes:NAV.nx.length,navigationEdges:NAV.adj.length,edgesByTraversal:types,
      props:bodies.length,breakableProps:bodies.filter(body=>body.d.brk).length,
      rayProps:bodies.filter(body=>body.d.ray).length,
      breakableRayProps:bodies.filter(body=>body.d.ray&&body.d.brk).length,
      geometry:{staticGroups:staticGeometry.groups,staticTriangles:staticGeometry.triangles,
        staticMaterials:staticGeometry.materials,restPropTriangles}
    };
  };
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
exports.capture=function captureStaticGeometry(surveyOnly){
  const sourceGroups=Array.from(WORLD.bufs.values()).filter(group=>group.g.ni>0);
  window.sourceMapGeometry={
    groups:sourceGroups.length,triangles:sourceGroups.reduce((n,group)=>n+group.g.ni/3,0),
    materials:[...new Set(sourceGroups.map(group=>group.mat))].sort()
  };
  // A survey observes the unmodified factory. Baking is only for a target export.
  if(surveyOnly)return;
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
