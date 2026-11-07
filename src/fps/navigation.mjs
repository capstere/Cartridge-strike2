import { AStar, Graph, NavNode, NavEdge, Vector3 } from '../../vendor/yuka/yuka.module.js';
import { ACTOR_RADIUS, STANDING_HEIGHT, SpatialIndex, polygonBounds, distanceSegment } from './physics.mjs';

/** Yuka navigation graph generated from accepted routes + collision-validated floor samples.
 * All edges are swept with the actor footprint. The old reviewed routes provide samples
 * in narrow apertures where a regular grid alone could miss a valid existing doorway.
 */
export function createNavigation(data,physics,{spacing=.70,radius=ACTOR_RADIUS+.002,clearanceCacheLimit=8192}={}){
  const graph=new Graph(),nodes=[],index=new SpatialIndex(1),dedup=new Map(),edgeKeys=new Set(),cache=new Map();
  const started=performance.now();
  const clearanceCache=new Map(),clearanceStats={calls:0,hits:0,samples:0,size:0,limit:Math.max(0,Math.floor(clearanceCacheLimit))};
  let cacheClearance=false;
  function remember(key,result){
    if(key){if(clearanceCache.size>=clearanceStats.limit)clearanceCache.delete(clearanceCache.keys().next().value);clearanceCache.set(key,result);clearanceStats.size=clearanceCache.size;}
    return result;
  }
  function clear(a,b,r=radius){
    // Static capsule clearance is symmetric. Preserve every coordinate bit in
    // the key: rounding could accidentally permit a wall-edge penetration.
    // Dynamic actors are resolved separately by Game and never enter this cache.
    let key=null;
    if(cacheClearance){
      clearanceStats.calls++;
      if(clearanceStats.limit){const first=a.x<b.x||a.x===b.x&&a.z<=b.z;const p=first?a:b,q=first?b:a;key=`${r}:${p.x},${p.z}:${q.x},${q.z}`;const cached=clearanceCache.get(key);if(cached!==undefined){clearanceStats.hits++;return cached;}}
    }
    const distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(distance/.075));
    for(let i=0;i<=steps;i++){if(cacheClearance)clearanceStats.samples++;if(!physics.canOccupy(a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps,r))return remember(key,false);}
    return remember(key,true);
  }
  function add(x,z){
    const key=`${x.toFixed(3)},${z.toFixed(3)}`;if(dedup.has(key))return dedup.get(key);
    if(!physics.canOccupy(x,z,radius))return -1;
    const n={id:nodes.length,x,z};nodes.push(n);dedup.set(key,n.id);graph.addNode(new NavNode(n.id,new Vector3(x,0,z)));index.insert(n,{minX:x,maxX:x,minZ:z,maxZ:z});return n.id;
  }
  function connect(a,b){
    if(a===b||a<0||b<0)return;const key=a<b?`${a}:${b}`:`${b}:${a}`;if(edgeKeys.has(key))return;
    const from=nodes[a],to=nodes[b];if(!clear(from,to))return;
    graph.addEdge(new NavEdge(a,b,Math.hypot(to.x-from.x,to.z-from.z)));edgeKeys.add(key);
  }
  for(const route of data.routes)for(const segment of route.segments){
    let previous=-1;
    for(let j=0;j<segment.points.length-1;j++){
      const a=segment.points[j],b=segment.points[j+1],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.65));
      for(let i=0;i<=steps;i++){
        const id=add(a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps);connect(previous,id);previous=id;
      }
    }
  }
  // Sampling within each actual polygon avoids allocating a rectangular grid over excluded rooms.
  for(const polygon of data.floorPolygons){
    const b=polygonBounds(polygon);
    for(let x=Math.ceil(b.minX/spacing)*spacing;x<=b.maxX;x+=spacing)for(let z=Math.ceil(b.minZ/spacing)*spacing;z<=b.maxZ;z+=spacing)add(x,z);
  }
  for(const door of data.doors.filter(d=>!d.blocked)){
    const [x,z]=door.center,dx=door.b[0]-door.a[0],dz=door.b[1]-door.a[1],length=Math.hypot(dx,dz);
    for(const offset of [-.65,0,.65])add(x-dz/length*offset,z+dx/length*offset);
  }
  for(const n of nodes){
    const neighbors=[...index.nearby(n.x,n.z,1.04)].filter(m=>m.id<n.id&&Math.hypot(m.x-n.x,m.z-n.z)<=1.04);
    for(const other of neighbors)connect(n.id,other.id);
  }
  // Relabel only at construction and glass events; impossible routes never teleport.
  let component,components=0,revision=0;
  function labelComponents(){
    component=new Int32Array(nodes.length).fill(-1);components=0;const out=[];
    for(const n of nodes)if(component[n.id]<0){const queue=[n.id];component[n.id]=components;for(let q=0;q<queue.length;q++){graph.getEdgesOfNode(queue[q],out);for(const e of out)if(component[e.to]<0){component[e.to]=components;queue.push(e.to);}}components++;}
  }
  labelComponents();
  // Construction performs many one-off probes; only retain live path queries.
  cacheClearance=true;
  const bodiesClear=(a,b,blockers,allowExit=false)=>blockers.every(p=>{
    if(distanceSegment(p.x,p.z,[a.x,a.z],[b.x,b.z])>=p.radius-1e-7)return true;
    // Contact resolution may leave a sub-millimetre overlap. Only an outward
    // first connection may leave it; later edges cannot enter the body disc.
    return allowExit&&Math.hypot(a.x-p.x,a.z-p.z)<p.radius&&Math.hypot(b.x-p.x,b.z-p.z)>=p.radius&&
      (a.x-p.x)*(b.x-a.x)+(a.z-p.z)*(b.z-a.z)>=0;
  });
  function nearest(point,blockers=[],allowExit=false){
    for(const distance of [1.2,2.6,5.2,10]){
      const choices=[...index.nearby(point.x,point.z,distance)].sort((a,b)=>Math.hypot(a.x-point.x,a.z-point.z)-Math.hypot(b.x-point.x,b.z-point.z));
      for(const n of choices)if((n.id<baseNodeCount||activeGlassNodes.has(n.id))&&bodiesClear(point,n,blockers,allowExit)&&clear(point,n,ACTOR_RADIUS))return n;
    }
    return null;
  }
  function findPath(from,to,{avoid=[],blockers=[]}={}){
    if(!from||!to||![from.x,from.z,to.x,to.z].every(Number.isFinite))return [];
    if(!avoid.length&&bodiesClear(from,to,blockers,true)&&clear(from,to,ACTOR_RADIUS))return [{x:to.x,z:to.z}];
    const start=nearest(from,blockers,true),end=nearest(to,blockers);if(!start||!end||component[start.id]!==component[end.id])return [];
    // Tactical costs are private to this query. They never mutate the shared
    // Yuka graph, remove valid edges, or change the collision footprint.
    const penalty=(x,z)=>1+Math.min(12,avoid.reduce((sum,p)=>{
      const d=p.a?distanceSegment(x,z,[p.a.x,p.a.z],[p.b.x,p.b.z]):Math.hypot(x-p.x,z-p.z);
      return sum+Math.max(0,1-d/(p.radius||3))*(p.weight||1);
    },0));
    const weightedCost=(a,b)=>{
      const d=Math.hypot(b.x-a.x,b.z-a.z),count=Math.max(1,Math.ceil(d));let sum=0;
      for(let i=0;i<count;i++)sum+=penalty(a.x+(b.x-a.x)*(i+.5)/count,a.z+(b.z-a.z)*(i+.5)/count);
      return d*sum/count;
    };
    const custom=avoid.length||blockers.length;
    const queryGraph=custom?{getNode:id=>graph.getNode(id),getEdgesOfNode(id,out){
      graph.getEdgesOfNode(id,out);let count=0;for(const e of out)if(bodiesClear(nodes[e.from],nodes[e.to],blockers))out[count++]=new NavEdge(e.from,e.to,avoid.length?weightedCost(nodes[e.from],nodes[e.to]):e.cost);out.length=count;return out;
    }}:graph;
    const key=`${start.id}:${end.id}`;let ids=custom?null:cache.get(key);
    if(!ids){const search=new AStar(queryGraph,start.id,end.id).search();if(!search.found)return [];ids=search.getPath();if(!custom){if(cache.size>512)cache.clear();cache.set(key,ids);}}
    const raw=[{x:from.x,z:from.z},...ids.map(id=>({x:nodes[id].x,z:nodes[id].z})),{x:to.x,z:to.z}],path=[];
    const costs=[0];if(avoid.length)for(let i=1;i<raw.length;i++)costs[i]=costs[i-1]+weightedCost(raw[i-1],raw[i]);
    let current=0;
    while(current<raw.length-1){
      let next=current+1;
      // A bounded lookahead smooths routes without expensive full-map visibility sweeps.
      for(let i=Math.min(raw.length-1,current+32);i>current+1;i--)if(bodiesClear(raw[current],raw[i],blockers,current===0)&&(!avoid.length||weightedCost(raw[current],raw[i])<=(costs[i]-costs[current])*1.08)&&clear(raw[current],raw[i],ACTOR_RADIUS+.001)){next=i;break;}
      if(physics.dynamicPassages?.()&&!clear(raw[current],raw[next],ACTOR_RADIUS))return [];
      path.push(raw[next]);current=next;
    }
    return path;
  }
  const invalidate=()=>{cache.clear();clearanceCache.clear();clearanceStats.size=0;};
  const baseEdges=new Set(edgeKeys),addedEdges=new Map(),baseNodeCount=nodes.length,activeGlassNodes=new Set();
  const statistics={nodes:nodes.length,edges:edgeKeys.size,components,buildMs:Math.round(performance.now()-started),clearance:clearanceStats,glassUpdates:0,library:'Yuka Graph/NavNode/NavEdge/AStar'};
  function updateGlass({pane,reset=false}={}){
    invalidate();
    if(reset){
      for(const [key,edge]of addedEdges){graph.removeEdge(edge);edgeKeys.delete(key);}addedEdges.clear();activeGlassNodes.clear();
    }else if(pane&&pane.y-pane.h/2<=.12&&pane.h>=STANDING_HEIGHT){
      const c=Math.cos(pane.angle),s=Math.sin(pane.angle),width=Math.max(0,pane.w/2-radius-.01);
      // Reuse these nodes on later rounds. Only collision-valid samples/edges
      // near the broken pane are added; no full-map resampling on a shot/frame.
      for(const along of [-width,0,width])for(const normal of [-.5,0,.5])add(pane.x+c*along+s*normal,pane.z-s*along+c*normal);
      const nearby=[...index.nearby(pane.x,pane.z,pane.w/2+1.1)];
      for(const n of nearby)for(const other of index.nearby(n.x,n.z,1.04))if(other.id<n.id&&Math.hypot(n.x-other.x,n.z-other.z)<=1.04){
        const key=`${other.id}:${n.id}`;connect(other.id,n.id);
        if(edgeKeys.has(key)&&!baseEdges.has(key)&&!addedEdges.has(key)){
          addedEdges.set(key,graph.getEdge(other.id,n.id));
          if(n.id>=baseNodeCount)activeGlassNodes.add(n.id);if(other.id>=baseNodeCount)activeGlassNodes.add(other.id);
        }
      }
    }
    labelComponents();revision++;statistics.glassUpdates++;Object.assign(statistics,{nodes:nodes.length,edges:edgeKeys.size,components});
  }
  return {findPath,clear,nearest,nodes,graph,invalidate,updateGlass,get revision(){return revision;},statistics};
}
