// Riposte's deterministic multi-storey cells and directed walk edges are
// exported after buildNav. CS2's Yuka A* searches those exact connections.
import {Graph,NavEdge,NavNode,Vector3} from '../../vendor/yuka/yuka.module.js';
import {finishRoute,routeNodeIds} from './navigation.mjs';
import {SpatialIndex,distanceSegment} from './physics.mjs';

export function referenceNavigation(spec,terrain){
  const {x,y,z,offsets,adj,cost,kind}=spec;
  const graph=new Graph(),cells=new SpatialIndex(2),cache=new Map();
  graph.digraph=true;
  const nodes=x.map((px,id)=>{
    const p={id,x:px,y:y[id],z:z[id]};
    graph.addNode(new NavNode(id,new Vector3(p.x,p.y,p.z)));
    cells.insert(p,{minX:p.x,maxX:p.x,minZ:p.z,maxZ:p.z});
    return p;
  });
  let edges=0;
  for(const p of nodes)for(let k=offsets[p.id];k<offsets[p.id+1];k++){
    // CS2 bots can follow stairs. Their controller has no authored jump timing
    // for Riposte's optional leap links, so never promise those routes.
    if(kind[k])continue;
    graph.addEdge(new NavEdge(p.id,adj[k],cost[k]));edges++;
  }
  function clear(a,b,r=.202){
    const d=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(d/.15));
    let floor=a.y??0;
    for(let i=0;i<=steps;i++){
      const t=i/steps,px=a.x+(b.x-a.x)*t,pz=a.z+(b.z-a.z)*t;
      const support=terrain.groundHeight(px,pz,floor,r);
      if(Math.abs(support-floor)>.47||!terrain.canOccupy(px,pz,r,1.7,support))return false;
      floor=support;
    }
    return Math.abs(floor-(b.y??floor))<.5;
  }
  function* nearestSteps(p,stepped=false){
    let probes=0;
    if(!p)return null;
    for(const range of [1.5,3.5,6]){
      const choices=[...cells.nearby(p.x,p.z,range)];
      const distance=n=>Math.hypot(n.x-p.x,n.z-p.z,2*(n.y-(p.y??0)));
      choices.sort((a,b)=>distance(a)-distance(b));
      for(const n of choices){
        if(stepped&&++probes%8===0)yield;
        if(clear(p,n))return n;
      }
    }
    return null;
  }
  const nearest=p=>finishRoute(nearestSteps(p));
  const point=p=>({x:p.x,y:p.y??0,z:p.z});
  function findPath(from,to,options={}){
    const query=pathSteps(from,to,options);
    return options.stepped?query:finishRoute(query);
  }
  function* pathSteps(from,to,{avoid=[],blockers=[],stepped=false}={}){
    if(!from||!to)return [];
    const legal=(a,b)=>!blockers.some(o=>Math.abs((o.y??0)-a.y)<1.65&&
      distanceSegment(o.x,o.z,[a.x,a.z],[b.x,b.z])<(o.radius??.42)&&
      Math.hypot(a.x-o.x,a.z-o.z)>=(o.radius??.42));
    if(!avoid.length&&legal(from,to)&&clear(from,to))return [point(to)];
    const start=yield* nearestSteps(from,stepped),end=yield* nearestSteps(to,stepped);
    if(!start||!end)return [];
    const weighted=avoid.length||blockers.length;
    const key=start.id+':'+end.id;let ids=weighted?null:cache.get(key);
    if(!ids){
      const query=weighted?{getNode:id=>graph.getNode(id),getEdgesOfNode(id,out){
        graph.getEdgesOfNode(id,out);let count=0;
        for(const edge of out){
          const a=nodes[id],b=nodes[edge.to];if(!legal(a,b))continue;
          let penalty=0;
          for(const area of avoid){
            const d=area.a?distanceSegment(b.x,b.z,[area.a.x,area.a.z],[area.b.x,area.b.z]):Math.hypot(b.x-area.x,b.z-area.z);
            penalty+=Math.max(0,1-d/(area.radius||3))*(area.weight||1);
          }
          out[count++]=penalty?new NavEdge(id,b.id,edge.cost*(1+Math.min(12,penalty))):edge;
        }
        out.length=count;
      }}:graph;
      ids=yield* routeNodeIds(query,start.id,end.id,stepped);if(!ids.length)return [];
      if(!weighted){if(cache.size>=256)cache.clear();cache.set(key,ids);}
    }
    const raw=[point(from),...ids.map(id=>nodes[id]),point(to)],out=[];
    let probes=0;
    for(let i=0;i<raw.length-1;){
      let next=Math.min(i+8,raw.length-1);
      while(next>i+1){
        if(stepped&&++probes%5===0)yield;
        if(legal(raw[i],raw[next])&&clear(raw[i],raw[next]))break;
        next--;
      }
      out.push(point(raw[next]));i=next;
    }
    return out;
  }
  return {nodes,graph,clear,nearest,findPath,revision:0,invalidate:()=>cache.clear(),
    statistics:{nodes:nodes.length,edges,source:'Riposte layered walk graph'}};
}
