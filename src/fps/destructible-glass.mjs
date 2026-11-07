/** Authoritative per-pane state. Original geometry is split once at startup.
 * Glass is not left in the immutable Octree. Frames/floor scopes stay authoritative.
 * The breaking shot stops here; subsequent rays pass through the missing pane. */
export function prepareGlass(description,data){
 const walls=new Map(data.walls.map(w=>[w.id,w]));const specs=[];let max=0;
 for(const [id,w] of walls){if(!['glazed','window'].includes(w.surfaceType))continue;const pieces=description.boxes.filter(b=>b.id.startsWith(id)&&['glass','frosted'].includes(b.material)&&Math.abs(b.x-(w.a[0]+w.b[0])/2)<.05&&Math.abs(b.z-(w.a[1]+w.b[1])/2)<.05);if(!pieces.length)continue;
  const base=pieces.find(b=>b.material==='glass'),n=w.surfaceType==='window'?Math.max(1,Math.ceil(base.w/1.55)):Math.max(1,Math.round(base.w/1.12)),c=Math.cos(base.angle||0),s=Math.sin(base.angle||0);
  const replacements=[];
  for(let i=0;i<n;i++){const offset=-base.w/2+(i+.5)*base.w/n,glassId=id+'/pane-'+i,parts=pieces.map(b=>({...b,id:b.id+'-pane-'+i,glassId,x:b.x+c*offset,z:b.z-s*offset,w:Math.max(.02,base.w/n-.041),disabled:false}));replacements.push(...parts);specs.push({id:glassId,wallId:id,parts,x:base.x+c*offset,z:base.z-s*offset,y:base.y,w:base.w/n-.041,h:base.h,angle:base.angle||0});}
  const remove=new Set(pieces);description.boxes=description.boxes.filter(b=>!remove.has(b));description.boxes.push(...replacements);max+=n;
 }
 return {specs,count:max};
}
export function createGlassState(plan,physics,invalidate=()=>{}){
 const panes=new Map(plan.specs.map(s=>[s.id,{...s,broken:false}])),byBox=new Map();let revision=0;
 const actual=physics.staticBoxes.filter(b=>b.glassId);for(const b of actual)byBox.set(b.id,panes.get(b.glassId));
 function breakAt(hit){const pane=byBox.get(hit?.id);if(!pane||pane.broken)return null;pane.broken=true;for(const b of actual)if(b.glassId===pane.id)b.disabled=true;revision++;physics.updateGlassPassages?.();invalidate({pane});return {paneId:pane.id,x:hit.point?.x??pane.x,y:hit.point?.y??pane.y,z:hit.point?.z??pane.z,normal:hit.normal||{x:0,y:0,z:1}};}
 function reset(){if(![...panes.values()].some(p=>p.broken))return false;for(const p of panes.values())p.broken=false;for(const b of actual)b.disabled=false;revision++;physics.updateGlassPassages?.();invalidate({reset:true});return true;}
 return {panes,breakAt,reset,get revision(){return revision;},get brokenCount(){let n=0;for(const p of panes.values())if(p.broken)n++;return n;}};
}
