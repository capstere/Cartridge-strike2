/** Original deterministic facility dressing, anchored to approved polygons/doors.
 * No new topology, external assets, real procedures or gameplay RNG. */
const bounds=p=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
const inside=(x,z,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
export function createFacilityDetails(data,description){
 const props=[],boxes=[],facades=[],rooms=new Map(data.rooms.map(r=>[r.id,r])),excluded=new Map(data.excludedRooms.map(r=>[r.id,r]));
 const add=(id,type,roomId,x,z,w,d,h,yaw=0,options={})=>{const p={id,type,roomId,x,z,w,d,h,yaw,...options};props.push(p);return p;};
 function solid(p,name,u,y,v,w,h,d){const c=Math.cos(p.yaw),s=Math.sin(p.yaw);boxes.push({id:p.id+'-'+name,roomId:p.roomId,x:p.x+c*u+s*v,y,z:p.z-s*u+c*v,w,h,d,angle:p.yaw,material:'furniture',color:[.88,.9,.89],detailVisual:true});}
 function restroom(id,x0,z0,x1,z1,front){
  // The six north bays and four east bays come from actual partition spans.
  const yaw=front==='south'?0:front==='north'?Math.PI:Math.PI/2;
  let x,z,bx,bz;
  if(front==='south'){x=x0+.30;z=z0+.39;bx=x1-.20;bz=z0+.23;}
  else if(front==='north'){x=x1-.30;z=z1-.39;bx=x0+.20;bz=z1-.23;}
  else{x=x0+.39;z=z0+.40;bx=x0+.22;bz=z1-.28;}
  const roomId=id.startsWith('WC-L')?'I06':id==='WC-WEST'?'I07':'I15';
  const toilet=add(id+'-toilet','toilet',roomId,x,z,.40,.60,.79,yaw,{bay:[x0,z0,x1,z1]});
  solid(toilet,'bowl',0,.24,.055,.36,.48,.47);solid(toilet,'tank',0,.48,-.21,.40,.62,.16);
  const basin=add(id+'-basin','basin',roomId,bx,bz,.30,.26,.83,yaw,{bay:[x0,z0,x1,z1]});
  solid(basin,'basin',0,.79,0,.30,.13,.26);
 }
 const lab=rooms.get('I06'),east=rooms.get('I15');
 if(lab){const b=bounds(lab.polygon),cuts=[b[0],...data.walls.filter(w=>Math.abs(w.a[0]-w.b[0])<.001&&w.a[0]>b[0]+.1&&w.a[0]<b[2]-.1&&Math.min(w.a[1],w.b[1])<4&&Math.max(w.a[1],w.b[1])>5.3).map(w=>w.a[0]),b[2]].sort((a,b)=>a-b);for(let i=0;i<cuts.length-1;i++)restroom('WC-L'+(i+1),cuts[i],b[1],cuts[i+1],5.385366,'south');}
 if(east){const b=bounds(east.polygon),cuts=[b[0],...data.walls.filter(w=>Math.abs(w.a[0]-w.b[0])<.001&&w.a[0]>b[0]+.1&&w.a[0]<25&&Math.min(w.a[1],w.b[1])>11.5&&Math.min(w.a[1],w.b[1])<11.9&&Math.max(w.a[1],w.b[1])>13.3&&Math.max(w.a[1],w.b[1])<13.6).map(w=>w.a[0])].sort((a,b)=>a-b);for(let i=0;i<cuts.length-1;i++)restroom('WC-E'+(i+1),cuts[i],11.8041,cuts[i+1],b[3],'north');restroom('WC-E5',25.8356,b[1],b[2],b[3],'north');}
 const west=rooms.get('I07');if(west){const b=bounds(west.polygon);restroom('WC-WEST',b[0]+.12,b[1]+.12,b[2]-.12,b[3]-.12,'south');}
 // Wall-side appliances use the existing long counter envelope; no island added.
 const counter=data.obstacles.find(o=>o.id==='V1-KITCHEN-3');
 if(counter){const [x0,z0,x1,z1]=bounds(counter.polygon),z=(z0+z1)/2;
  for(const [i,type] of ['fridge','fridge','freezer'].entries()){
   const p=add('KITCHEN-'+type+'-'+i,type,'I09',x0+.43+i*.82,z,.76,.58,1.96,Math.PI);solid(p,'body',0,.98,0,.76,1.96,.58);
  }
  const sink=add('KITCHEN-sink','sink','I09',x0+4.05,z,.94,.55,.91,Math.PI);solid(sink,'counter',0,.43,0,.94,.86,.55);
  const dish=add('KITCHEN-dishwasher','dishwasher','I09',x0+3.10,z,.70,.58,.87,Math.PI);solid(dish,'body',0,.43,0,.70,.86,.58);
  for(let i=0;i<2;i++){const p=add('KITCHEN-microwave-'+i,'microwave','I09',x1-1.1-i*.78,z,.66,.47,.39,Math.PI,{baseY:.915});solid(p,'body',0,1.11,0,.66,.39,.47);}
  // Replace only the redundant counter section under the tall appliances.
  const cut=x0+2.48;
  description.boxes=description.boxes.flatMap(b=>{
   if(!b.id.startsWith(counter.id+'-'))return [b];
   if(b.id.endsWith('-body')||b.id.endsWith('-top')){const right=b.x+b.w/2;return [{...b,x:(cut+right)/2,w:right-cut}];}
   return b.x<cut?[]:[b];
  });
 }
 const eastCounter=data.obstacles.find(o=>o.id==='V1-I19-COUNTER-3');
 if(eastCounter){const b=bounds(eastCounter.polygon);add('PANTRY-east-sink','sink','I19',b[0]+.55,(b[1]+b[3])/2,.80,.48,.91,Math.PI);add('PANTRY-east-micro','microwave','I19',35.3,14.23,.62,.46,.38,Math.PI,{baseY:.915});}
 // Two observed-through-glass volumes: inferred from the requested positions.
 // They remain excluded; these are fictional generic lab fittings, not a factual reconstruction.
 function inLab(id,x,z,w,d){const r=excluded.get(id);return r&&[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].every(([u,v])=>inside(x+u,z+v,r.polygon));}
 for(const [roomId,slots] of [
  ['X21',[[-13,19.0],[-9,19.0],[-5,19.0],[-13,23.8],[-9,23.8],[-5,23.8]]],
  ['X06',[[-13.4,-14.5],[-10.3,-14.5],[-7.6,-14.5],[-13.4,-17.5],[-10.3,-17.5]]]
 ]){
  slots.forEach(([x,z],i)=>{if(!inLab(roomId,x,z,2.0,.76))return;const p=add('LAB-'+roomId+'-bench-'+i,'lab-bench',roomId,x,z,2.0,.76,.90,i%2?Math.PI:0,{displayOnly:true,instrument:i%3});solid(p,'bench',0,.44,0,2,.88,.76);solid(p,'instrument',0,1.18,0,.68,.56,.50);});
  const back=roomId==='X21'?[[-3.0,22],[-3.0,24]]:[[-12.5,-19.0],[-10.5,-19.0]];
  back.forEach(([x,z],i)=>{if(!inLab(roomId,x,z,.85,.72))return;const p=add('LAB-'+roomId+'-cold-'+i,i?'lab-cabinet':'freezer',roomId,x,z,.85,.72,2.12,0,{displayOnly:true});solid(p,'body',0,1.06,0,.85,2.12,.72);});
 }
 // Blue exterior skins follow only boundaries exposed to outdoor void, not corridor faces.
 const occupied=[...data.floorPolygons,...data.excludedRooms.map(r=>r.polygon)];
 const inBuilding=(x,z)=>occupied.some(p=>inside(x,z,p));
 for(const w of data.walls){
  if(w.surfaceType==='glazed'||w.surfaceType==='window')continue;
  const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],len=Math.hypot(dx,dz);if(len<.55)continue;
  const x=(w.a[0]+w.b[0])/2,z=(w.a[1]+w.b[1])/2,nx=-dz/len,nz=dx/len;
  const plus=inBuilding(x+nx*.22,z+nz*.22),minus=inBuilding(x-nx*.22,z-nz*.22);
  if(plus===minus)continue;const side=plus?-1:1,off=(w.thickness||.11)/2+.012;
  facades.push({id:'FAC-'+w.id,x:x+nx*side*off,z:z+nz*side*off,y:1.43,w:len,h:2.84,d:.015,yaw:-Math.atan2(dz,dx),side});
 }
 return {version:'facility-details-1',props,boxes,facades,counts:{toilets:props.filter(p=>p.type==='toilet').length,basins:props.filter(p=>p.type==='basin').length,kitchen:props.filter(p=>p.id.startsWith('KITCHEN')).length,labProps:props.filter(p=>p.displayOnly).length,facades:facades.length},assumptions:['Generic decorative lab equipment in X21 and X06, inferred from user locations.','No new access to excluded rooms or outside floor.','WC equipment follows existing partitions; no small closets are reclassified as WC.']};
}
