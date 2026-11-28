import { AStar, Graph, NavNode, NavEdge, Vector3, PriorityQueue, HeuristicPolicyEuclid } from '../../vendor/yuka/yuka.module.js';
import { ACTOR_RADIUS, STANDING_HEIGHT, SpatialIndex, polygonBounds, distanceSegment } from './physics.mjs';

// Live searches retain the native graph, costs and Yuka priority ordering. Like
// Riposte's findPath, each needs a frontier, best costs and parent links. Yield
// at fixed work intervals so a difficult route cannot consume a whole tick.
export function* routeNodeIds(graph,start,end,stepped){
  if(!stepped){
    const search=new AStar(graph,start,end).search();
    return search.found?search.getPath():[];
  }
  const frontier=new PriorityQueue((a,b)=>a.cost-b.cost);
  const costs=new Map([[start,0]]),parents=new Map(),closed=new Set(),edges=[];
  frontier.push({index:start,cost:0});
  let work=0;
  while(frontier.length){
    if(++work===48){work=0;yield;}
    const id=frontier.pop().index;
    if(closed.has(id))continue;
    if(id===end){
      const path=[end];
      while(path[path.length-1]!==start)path.push(parents.get(path[path.length-1]));
      return path.reverse();
    }
    closed.add(id);
    graph.getEdgesOfNode(id,edges);
    for(const edge of edges){
      if(closed.has(edge.to))continue;
      const cost=costs.get(id)+edge.cost;
      if(cost>=(costs.get(edge.to)??Infinity))continue;
      costs.set(edge.to,cost);parents.set(edge.to,id);
      frontier.push({index:edge.to,cost:cost+HeuristicPolicyEuclid.calculate(graph,edge.to,end)});
    }
  }
  return [];
}

export function finishRoute(iterator){
  let result;
  do{result=iterator.next();}while(!result.done);
  return result.value;
}

/** Yuka navigation graph generated from accepted routes + collision-validated floor samples.
 * All edges are swept with the actor footprint. The old reviewed routes provide samples
 * in narrow apertures where a regular grid alone could miss a valid existing doorway.
 */
export function createNavigation(data,physics,{spacing=.70,radius=ACTOR_RADIUS+.002,clearanceCacheLimit=8192,template=null}={}){
  const graph=new Graph(),nodes=[],index=new SpatialIndex(1),dedup=new Map(),edgeKeys=new Set(),cache=new Map();
  const started=performance.now();
  let baseEdgeData=template&&!template.navigation?[]:null;
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
  const pointKey=(x,z)=>`${x.toFixed(3)},${z.toFixed(3)}`;
  const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
  function insertNode(x,z,key){
    const n={id:nodes.length,x,z};
    nodes.push(n);dedup.set(key,n.id);
    graph.addNode(new NavNode(n.id,new Vector3(x,0,z)));
    index.insert(n,{minX:x,maxX:x,minZ:z,maxZ:z});
    return n.id;
  }
  function add(x,z){
    const key=pointKey(x,z);if(dedup.has(key))return dedup.get(key);
    if(!physics.canOccupy(x,z,radius))return -1;
    return insertNode(x,z,key);
  }
  function insertEdge(a,b,cost,key){
    graph.addEdge(new NavEdge(a,b,cost));edgeKeys.add(key);
  }
  function connect(a,b){
    if(a===b||a<0||b<0)return;const key=edgeKey(a,b);if(edgeKeys.has(key))return;
    const from=nodes[a],to=nodes[b];if(!clear(from,to))return;
    const cost=Math.hypot(to.x-from.x,to.z-from.z);
    insertEdge(a,b,cost,key);
    if(baseEdgeData)baseEdgeData.push(a,b,cost);
  }
  if(template?.navigation){
    // Rebuild private Yuka objects and indices in their original insertion
    // order. Runtime glass changes and clearance caches stay room-local.
    const {positions,edges}=template.navigation;
    for(let i=0;i<positions.length;i+=2){
      const x=positions[i],z=positions[i+1];
      insertNode(x,z,pointKey(x,z));
    }
    for(let i=0;i<edges.length;i+=3){
      const a=edges[i],b=edges[i+1];
      insertEdge(a,b,edges[i+2],edgeKey(a,b));
    }
  }else{
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
    if(baseEdgeData){
      const positions=[];
      for(const node of nodes)positions.push(node.x,node.z);
      template.navigation=Object.freeze({positions:Object.freeze(positions),edges:Object.freeze(baseEdgeData)});
      baseEdgeData=null;
    }
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
    // Almost every remote path edge misses a local blocker by many metres.
    if(p.x<Math.min(a.x,b.x)-p.radius||p.x>Math.max(a.x,b.x)+p.radius||
       p.z<Math.min(a.z,b.z)-p.radius||p.z>Math.max(a.z,b.z)+p.radius)return true;
    if(distanceSegment(p.x,p.z,[a.x,a.z],[b.x,b.z])>=p.radius-1e-7)return true;
    // Contact resolution may leave a sub-millimetre overlap. Only an outward
    // first connection may leave it; later edges cannot enter the body disc.
    return allowExit&&Math.hypot(a.x-p.x,a.z-p.z)<p.radius&&Math.hypot(b.x-p.x,b.z-p.z)>=p.radius&&
      (a.x-p.x)*(b.x-a.x)+(a.z-p.z)*(b.z-a.z)>=0;
  });
  function* nearestSteps(point,blockers=[],allowExit=false,stepped=false){
    let probes=0;
    for(const distance of [1.2,2.6,5.2,10]){
      const choices=[...index.nearby(point.x,point.z,distance)].sort((a,b)=>Math.hypot(a.x-point.x,a.z-point.z)-Math.hypot(b.x-point.x,b.z-point.z));
      for(const n of choices){
        if(stepped&&++probes%8===0)yield;
        if((n.id<baseNodeCount||activeGlassNodes.has(n.id))&&bodiesClear(point,n,blockers,allowExit)&&clear(point,n,ACTOR_RADIUS))return n;
      }
    }
    return null;
  }
  const nearest=(...args)=>finishRoute(nearestSteps(...args));
  function findPath(from,to,options={}){
    const query=pathSteps(from,to,options);
    return options.stepped?query:finishRoute(query);
  }
  function* pathSteps(from,to,{avoid=[],blockers=[],stepped=false}={}){
    if(!from||!to||![from.x,from.z,to.x,to.z].every(Number.isFinite))return [];
    if(!avoid.length&&bodiesClear(from,to,blockers,true)&&clear(from,to,ACTOR_RADIUS))return [{x:to.x,z:to.z}];
    // Each endpoint must connect via a swept capsule. Reject an obstructed
    // endpoint once instead of testing it against every nearby graph node.
    if(!physics.canOccupy(from.x,from.z,ACTOR_RADIUS)||!physics.canOccupy(to.x,to.z,ACTOR_RADIUS))return [];
    const start=yield* nearestSteps(from,blockers,true,stepped),end=yield* nearestSteps(to,blockers,false,stepped);if(!start||!end||component[start.id]!==component[end.id])return [];
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
      graph.getEdgesOfNode(id,out);let count=0;for(const e of out)if(bodiesClear(nodes[e.from],nodes[e.to],blockers))out[count++]=avoid.length?new NavEdge(e.from,e.to,weightedCost(nodes[e.from],nodes[e.to])):e;out.length=count;return out;
    }}:graph;
    const key=`${start.id}:${end.id}`;let ids=custom?null:cache.get(key);
    if(!ids){ids=yield* routeNodeIds(queryGraph,start.id,end.id,stepped);if(!ids.length)return [];if(!custom){if(cache.size>512)cache.clear();cache.set(key,ids);}}
    const raw=[{x:from.x,z:from.z},...ids.map(id=>({x:nodes[id].x,z:nodes[id].z})),{x:to.x,z:to.z}],path=[];
    const costs=[0];if(avoid.length)for(let i=1;i<raw.length;i++)costs[i]=costs[i-1]+weightedCost(raw[i-1],raw[i]);
    let current=0,probes=0;
    while(current<raw.length-1){
      let next=current+1;
      // A bounded lookahead smooths routes without expensive full-map visibility sweeps.
      for(let i=Math.min(raw.length-1,current+32);i>current+1;i--){
        if(stepped&&++probes%5===0)yield;
        if(bodiesClear(raw[current],raw[i],blockers,current===0)&&(!avoid.length||weightedCost(raw[current],raw[i])<=(costs[i]-costs[current])*1.08)&&clear(raw[current],raw[i],ACTOR_RADIUS+.001)){next=i;break;}
      }
      if(physics.dynamicPassages?.()&&!clear(raw[current],raw[next],ACTOR_RADIUS))return [];
      path.push(raw[next]);current=next;
    }
    return path;
  }
  let queryEpoch=0;
  const invalidate=()=>{queryEpoch++;cache.clear();clearanceCache.clear();clearanceStats.size=0;};
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
  return {findPath,clear,nearest,nodes,graph,invalidate,updateGlass,get queryEpoch(){return queryEpoch;},get revision(){return revision;},statistics};
}
