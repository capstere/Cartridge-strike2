/** In-memory instance clipboard. Never copies or edits a GLB; anchors stay explicit. */
import {furnitureAssembly, furnitureHandleFrame, planFurnitureTranslation} from './furniture-translation.mjs?v=5.8.1';
import {poseOnWall} from './wall-mounts.mjs?v=5.8.0';
const clone=value=>structuredClone(value);
const wallStamp=w=>JSON.stringify(w&&[w.id,w.kind,w.a,w.b,w.height,w.thickness,w.deleted]);
export function captureFurniture(items,ids,walls,projectId,assets=[]){
 const chosen=new Set(ids),members=new Map();
 for(const item of items)if(chosen.has(item.id))for(const member of furnitureAssembly(item,items))members.set(member.id,member);
 if(!members.size)throw Error('Markera en eller flera möbler att kopiera. Väggar och golv kopieras inte.');
 const rows=[...members.values()],roots=rows.filter(o=>!members.has(o.mountId));
 if(new Set(roots.flatMap(root=>furnitureAssembly(root,rows).map(o=>o.id))).size!==rows.length)throw Error('Möblernas fästen bildar en cirkel. Kopieringen avbröts.');
 return clone({projectId,items:rows,roots:roots.map(o=>o.id),walls:rows.filter(o=>o.wallMount).map(o=>({id:o.wallMount.wallId,stamp:wallStamp(walls.find(w=>w.id===o.wallMount.wallId))})),supports:roots.filter(o=>o.mountId).map(o=>items.find(p=>p.id===o.mountId)),assets:assets.filter(a=>rows.some(o=>o.assetId===a.assetId))});
}
export function pasteFurniture(clipboard,items,walls,projectId,{usedIds=[],step=1}={}){
 if(!clipboard)throw Error('Kopiera först med Ctrl/⌘+C.');
 if(clipboard.projectId!==projectId)throw Error('Kopieringen hör till en annan bana. Kopiera möblerna i den här banan först.');
 for(const w of clipboard.walls)if(w.stamp!==wallStamp(walls.find(x=>x.id===w.id)))throw Error('En kopierad möbels vägg har ändrats eller tagits bort. Kopiera på nytt.');
 for(const support of clipboard.supports)if(!support||JSON.stringify(items.find(o=>o.id===support.id))!==JSON.stringify(support))throw Error('Möbelytan har ändrats eller saknas. Kopiera på nytt, gärna tillsammans med bordet.');
 const used=new Set([...usedIds,...items.map(o=>o.id)]),mapping=new Map();let n=1;
 for(const item of clipboard.items){let id;do{id='NY-OBJ-'+String(n++).padStart(4,'0');}while(used.has(id));used.add(id);mapping.set(item.id,id);}
 const copies=clone(clipboard.items).map(({original,source,deleted,...o})=>({...o,id:mapping.get(o.id),source:'added',mountId:mapping.get(o.mountId)||o.mountId||null}));
 const roots=clipboard.roots.map(id=>mapping.get(id));
 for(const o of copies)if(o.wallMount&&!poseOnWall(o,o.wallMount,walls))throw Error('En kopierad möbel får inte plats på väggen. Inget klistrades in.');
 const anchor=copies.find(o=>roots.includes(o.id)&&o.wallMount),frame=anchor&&furnitureHandleFrame(anchor,walls),distance=.4*Math.max(1,Math.min(step,20));
 const offset=frame?{x:frame.axes.x.x*distance,y:0,z:frame.axes.x.z*distance}:{x:distance,y:0,z:distance};
 // A common offset must be possible for EVERY root. Never silently detach or distort a group.
 for(const delta of [offset,{x:-offset.x,y:0,z:-offset.z},{x:0,y:0,z:0}]){
  const planned=clone(copies),all=[...items,...planned];let valid=true;
  try{for(const id of roots){const root=planned.find(o=>o.id===id),moved=planFurnitureTranslation(root,all,walls,delta);
   if(Math.abs(moved[0].x-root.x-delta.x)>1e-5||Math.abs(moved[0].z-root.z-delta.z)>1e-5){valid=false;break;}
   for(const row of moved)Object.assign(planned.find(o=>o.id===row.id),row);
  }}catch{valid=false;}
  if(valid)return {items:planned,ids:planned.map(o=>o.id),inPlace:delta.x===0&&delta.z===0,assets:clone(clipboard.assets)};
 }
 throw Error('Kopiornas fästen kan inte bevaras. Inget klistrades in.');
}
