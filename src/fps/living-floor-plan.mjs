/** Deterministic, source-preserving set dressing. Large props are real physics
 * records; wall art is flush to existing opaque walls. Never invent a doorway.
 * I12 appearance: user-supplied Hissrum12 Layout Studio V5.0.2, estimated model.
 */
import { insidePolygon, distanceSegment } from './physics.mjs';
export const LIVING_VERSION='living-floor-1';
// Original fictional wall slogans. Stable slots keep all wall placement unchanged.
export const WALL_TEXTS=Object.freeze([
 'Explore the unknown','Stay in formation','Chart a new path','Follow the signal','SUPPLIES READY','STORAGE CLEAR'
]);
export const CORE_VALUES=WALL_TEXTS; // Compatibility for existing callers; not an official values register.
export const VALUE_SOURCE='Original fictional game slogans';
export const CREForm=Object.freeze({
 ipt:{w:.82,d:.52,h:1.12,innerW:.75,innerD:.45,levels:[.34,.93]},
 jars:{w:.87,d:.47,h:1.04,innerW:.80,innerD:.40,levels:[.10,.55,.995]},
 requisition:{w:.97,d:.67,h:1.80,innerW:.90,innerD:.60,levels:[.60,1.20]}
});
export const bounds=p=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
const category=id=>['I01','I02','I04'].includes(id)?'lab':['I03','I29','I38','I21','I30'].includes(id)?'service':['I09','I10','I19'].includes(id)?'pantry':['I14','I16','I17','I22','I23','I24','I28'].includes(id)?'meeting':['I06','I07','I15'].includes(id)?'washroom':id==='I12'?'freight':'office';
const half=b=>Math.abs(Math.cos(b.angle||0))*b.w/2+Math.abs(Math.sin(b.angle||0))*b.d/2;
const depth=b=>Math.abs(Math.sin(b.angle||0))*b.w/2+Math.abs(Math.cos(b.angle||0))*b.d/2;
export function createLivingPlan(data,description){
 const rooms=data.rooms.filter(r=>r.status==='included'),roomMap=new Map(rooms.map(r=>[r.id,r]));
 const routes=data.routes.flatMap(r=>r.segments.flatMap(s=>s.points.slice(1).map((p,i)=>[s.points[i],p])));
 const excluded=[...data.excludedRooms,...data.rooms.filter(r=>r.status==='uncertain')];
 const props=[],boxes=[],mounts=[],rejected=[],coverage={};
 const obstacles=description.boxes.filter(b=>b.y-b.h/2<1.8&&b.y+b.h/2>.15&&!['glass','frosted','emissive','light'].includes(b.material));
 const protectedPoints=data.targets.filter(t=>['L1','L2'].includes(t.id)).map(t=>({p:t.point,r:t.id==='L2'?2.5:1.5}));
 const hostage=data.routes.find(r=>r.id==='S16')?.segments.at(-1)?.points.at(-1);
 if(hostage)protectedPoints.push({p:hostage,r:1.9});
 const entry=data.doors.find(d=>d.id==='D06');if(entry)protectedPoints.push({p:[entry.center[0]-1.55,entry.center[1]-.18],r:2.2});
 const inRoom=(r,x,z)=>insidePolygon(x,z,r.polygon);
 function fits(room,x,z,w,d){
  const radius=Math.hypot(w,d)/2;
  if(routes.some(([a,b])=>distanceSegment(x,z,a,b)<radius+.48))return false;
  if(protectedPoints.some(t=>Math.hypot(x-t.p[0],z-t.p[1])<t.r+radius))return false;
  if(data.doors.some(t=>Math.hypot(x-t.center[0],z-t.center[1])<radius+.85))return false;
  for(const dx of [-w/2,0,w/2])for(const dz of [-d/2,0,d/2]){
   if(!inRoom(room,x+dx,z+dz)||excluded.some(o=>insidePolygon(x+dx,z+dz,o.polygon)))return false;
   if(data.walls.some(a=>distanceSegment(x+dx,z+dz,a.a,a.b)<.12))return false;
  }
  if(obstacles.some(b=>Math.abs(x-b.x)<w/2+half(b)+.10&&Math.abs(z-b.z)<d/2+depth(b)+.10))return false;
  return !props.some(p=>Math.abs(x-p.x)<(w+p.w)/2+.18&&Math.abs(z-p.z)<(d+p.d)/2+.18);
 }
 function put(roomId,type,w,d,h,near=[.5,.5],variant=0){
  if(data.layoutPresentation?.suppressedLivingTypes?.[roomId]?.includes(type))return false;
  const room=roomMap.get(roomId);if(!room)return false;
  const [x0,z0,x1,z1]=bounds(room.polygon),tx=x0+(x1-x0)*near[0],tz=z0+(z1-z0)*near[1],candidates=[];
  for(let x=x0+w/2+.18;x<x1-w/2-.17;x+=.32)for(let z=z0+d/2+.18;z<z1-d/2-.17;z+=.32)candidates.push({x,z,cost:Math.hypot(x-tx,z-tz)});
  candidates.sort((a,b)=>a.cost-b.cost);
  const pos=candidates.find(p=>fits(room,p.x,p.z,w,d));if(!pos){rejected.push({roomId,type,reason:'no route-safe physical footprint'});return false;}
  const p={id:`living-${roomId}-${type}-${props.length}`,roomId,type,x:pos.x,z:pos.z,w,d,h,variant,source:roomId==='I12'?'Hissrum12_Layout_Studio_V5_0_2_Creform_Update.zip; adapted within accepted I12':'standard furnishing / artistic placement; not photo verified'};
  props.push(p);coverage[roomId]=(coverage[roomId]||0)+1;
  const part=(name,u,y,v,pw,ph,pd,finish)=>boxes.push({id:p.id+'-'+name,roomId,x:p.x+u,y,z:p.z+v,w:pw,h:ph,d:pd,angle:0,material:'living-'+finish,color:[.6,.65,.65],livingVisual:true,livingOwner:p.id,finish});
  if(type==='creform'){
   const s=CREForm[variant],px=(s.innerW+.028)/2,pz=(s.innerD+.028)/2;
   for(const x of[-px,px])for(const z of[-pz,pz]){part(`post-${x}-${z}`,x,(h+.10)/2,z,.028,h-.10,.028,'blue');part(`wheel-${x}-${z}`,x,.065,z,.08,.13,.06,'rubber');}
   for(const y of s.levels){
    for(const z of[-pz,pz])part('shelf-width-'+y+z,0,y,z,s.innerW+.028,.028,.028,'blue');
    for(const x of[-px,px])part('shelf-side-'+y+x,x,y,0,.028,.028,s.innerD+.028,'blue');
    // Each support spans WIDTH, not depth, as in the user's CREFORM source.
    for(let z=-pz+.075;z<pz-.04;z+=.085)part('cross-width-'+y+z,0,y,z,s.innerW+.028,.024,.024,'blue');
   }
   for(const z of[-pz,pz])part('top-rail-'+z,0,h-.04,z,s.innerW+.028,.028,.028,'blue');
   for(let i=0;i<2;i++)part('tote-'+i,(i-.5)*.30,s.levels.at(-1)+.10,0,.27,.18,Math.min(.35,d-.07),'bluebox');
  }else if(type==='shelf'){
   for(const x of[-w/2+.025,w/2-.025])for(const z of[-d/2+.025,d/2-.025])part(`post-${x}-${z}`,x,h/2,z,.035,h,.035,'steel');
   for(let i=0;i<4;i++)part('shelf-'+i,0,.16+i*(h-.20)/3,0,w,.035,d,'steel');
   for(let i=0;i<3;i++)for(let k=0;k<3;k++)part('carton-'+i+k,(k-1)*w*.30,.34+i*(h-.20)/3,.015,w*.25,.31,d*.80,i===1?'bluebox':'cardboard');
  }else if(type==='bins'){
   const count=3;
   for(let k=0;k<count;k++){const x=(k-1)*w/3;part('bin-'+k,x,.44,0,w/3-.055,.78,d-.12,'yellow');part('lid-'+k,x,.86,0,w/3-.025,.055,d-.065,'cream');for(const s of[-1,1])part('caster-'+k+s,x+s*(w/6-.09),.065,.15,.08,.13,.065,'rubber');}
  }else if(type==='pallet'){
   part('wood-base',0,.10,0,w,.18,d,'wood');
   for(let k=0;k<3;k++)part('box-'+k,(k-1)*w*.29,.42,0,w*.27,.48,d*.78,'cardboard');
  }else if(type==='planter'){
   part('pot',0,.26,0,w,.50,d,'ceramic');part('stem',0,.85,0,.035,1.2,.035,'wood');
  }else if(type==='sofa'){
   part('base',0,.31,0,w,.42,d,'teal');part('back',0,.76,d/2-.09,w,.52,.18,'teal');
   for(const side of[-1,1])part('arm'+side,side*(w/2-.08),.59,0,.16,.23,d,'teal');
  }else if(type==='coffee-table'){
   part('top',0,.46,0,w,.045,d,'wood');part('stem',0,.22,0,.05,.44,.05,'steel');part('base',0,.025,0,w*.60,.05,d*.60,'steel');
  }else if(type==='bench'){
   part('seat',0,.46,0,w,.08,d,'wood');for(const s of[-1,1])part('leg'+s,s*(w/2-.13),.22,0,.05,.44,d*.75,'steel');
  }else{
   part('body',0,h/2,0,w,h,d,['kitchen','sink','credenza'].includes(type)?'cream':type==='locker'?'bluebox':'cream');
   if(['kitchen','sink','credenza'].includes(type))part('worktop',0,h+.025,0,w+.035,.05,d+.025,'stone');
   if(type==='kitchen')part('coffee-machine',w*.25,h+.23,-.04,.34,.39,.31,'rubber');
  }
  return p;
 }
 // Freight staging rather than the inherited, generic sofa in the hostage room.
 put('I12','bins',2.05,.72,.89,[.17,.12]);
 put('I12','creform',.82,.52,1.12,[.82,.30],'ipt');
 put('I12','creform',.87,.47,1.04,[.82,.50],'jars');
 put('I12','creform',.97,.67,1.80,[.18,.67],'requisition');
 put('I12','pallet',1.20,.80,.68,[.32,.50]);
 put('I12','locker',1.4,.38,1.82,[.22,.92]);
 for(const r of rooms){
  if(r.id==='I12'||data.layoutPresentation?.suppressedAutoFurnitureRooms?.includes(r.id))continue;
  const cat=category(r.id);
  if(cat==='pantry'){put(r.id,'kitchen',1.6,.58,.87,[.25,.15]);put(r.id,'fridge',.67,.63,1.87,[.82,.18]);}
  if(cat==='meeting'){put(r.id,'credenza',1.2,.40,.74,[.72,.16]);if(['I17','I24'].includes(r.id))put(r.id,'planter',.42,.42,1.50,[.84,.82]);}
  if(cat==='service'){put(r.id,'shelf',1.45,.52,1.94,[.15,.30]);if(['I21','I38'].includes(r.id)){put(r.id,'shelf',1.45,.52,1.94,[.78,.72]);put(r.id,'creform',.97,.67,1.8,[.70,.25],'requisition');}}
  if(cat==='washroom')put(r.id,'sink',.65,.40,.79,[.35,.16]);
  if(cat==='lab'){put(r.id,'creform',.82,.52,1.12,[.85,.78],'ipt');put(r.id,'locker',.90,.39,1.85,[.20,.80]);}
  if(cat==='office'){
   if(['I26','I25','I31','I33','I13','I11'].includes(r.id)){
    put(r.id,'planter',.44,.44,1.65,[.15,.14]);put(r.id,'planter',.44,.44,1.65,[.85,.82]);
    put(r.id,['I25','I33'].includes(r.id)?'sofa':'bench',1.55,.56,['I25','I33'].includes(r.id)?1.02:.5,[.50,.75]);
   }
   if(r.id==='I18'||r.id==='I27')put(r.id,'shelf',1.1,.42,1.75,[.72,.75]);
  }
 }
 if(data.layoutPresentation?.lobbyRoomId==='I33'){
  put('I33','planter',.48,.48,1.65,[.83,.17]);
  put('I33','planter',.48,.48,1.65,[.83,.81]);
  put('I33','sofa',.84,.76,.96,[.57,.23]);
  put('I33','sofa',.84,.76,.96,[.57,.78]);
  put('I33','coffee-table',1.0,.62,.46,[.67,.50]);
 }
 // Mounts use actual opaque WALL records. Their local normal must face the named room.
 const walls=description.boxes.filter(b=>/^WALL-\d+$/.test(b.id)&&b.material==='wall'&&b.h>2);
 const used=[];
 function mounted(room,kind,w,h,variant,along=null){
  const centre=room.polygon.reduce((a,p)=>[a[0]+p[0]/room.polygon.length,a[1]+p[1]/room.polygon.length],[0,0]),candidates=[];
  if(along!==null){const [x0,z0,x1,z1]=bounds(room.polygon);if(x1-x0>z1-z0)centre[0]=x0+(x1-x0)*along;else centre[1]=z0+(z1-z0)*along;}
  for(const b of walls){
   if(b.w<w+.26)continue;const a=b.angle||0,tx=Math.cos(a),tz=-Math.sin(a),nx=Math.sin(a),nz=Math.cos(a);
   for(const side of[-1,1])for(let u=-b.w/2+w/2+.15;u<b.w/2-w/2-.14;u+=Math.max(1.6,w+.6)){
    const x=b.x+tx*u+nx*side*(b.d/2+.025),z=b.z+tz*u+nz*side*(b.d/2+.025);
    if(room.id==='I12'&&(z<bounds(room.polygon)[1]+.4||x<bounds(room.polygon)[0]+.3))continue;
    if(!inRoom(room,x+nx*side*.12,z+nz*side*.12))continue;
    if(![-w/2,w/2].every(v=>inRoom(room,x+tx*v+nx*side*.12,z+tz*v+nz*side*.12)))continue;
    if(used.some(m=>Math.hypot(m.x-x,m.z-z)<(m.w+w)/2+.55))continue;
    if(data.doors.some(d=>Math.hypot(d.center[0]-x,d.center[1]-z)<w/2+.45))continue;
    candidates.push({x,z,y:1.63,yaw:a+(side<0?Math.PI:0),host:b.id,w,h,score:Math.hypot(x-centre[0],z-centre[1])});
   }
  }
  candidates.sort((a,b)=>a.score-b.score);const c=candidates[0];if(!c)return;
  const m={...c,id:`mount-${room.id}-${mounts.length}`,roomId:room.id,kind,variant};mounts.push(m);used.push(m);coverage[room.id]=(coverage[room.id]||0)+1;
 }
 let value=0;
 for(const r of data.corridors){
  const [x0,z0,x1,z1]=bounds(r.polygon),n=Math.min(4,Math.max(1,Math.floor(Math.max(x1-x0,z1-z0)/10)));
  for(let i=0;i<n;i++)mounted(r,'values',.68,.94,value++%WALL_TEXTS.length,n===1?.5:.12+.76*i/(n-1));
  if(n>2)mounted(r,'bulletin',1.3,.85,0);
 }
 for(const r of rooms){
  const cat=category(r.id);
  if(cat==='meeting'){mounted(r,'board',1.55,.92,0);mounted(r,'display',1.10,.64,0);}
  else if(cat==='lab'){mounted(r,'ppe',.80,.72,0);mounted(r,'labboard',1.25,.85,0);}
  else if(cat==='pantry'){mounted(r,'coffee',.65,.85,0);mounted(r,'bulletin',1.2,.85,0);}
  else if(cat==='washroom')mounted(r,'mirror',.65,.68,0);
  else if(r.id==='I12')mounted(r,'freightboard',1.25,.86,0);
  else if(cat==='service')mounted(r,'inventory',.90,.72,0);
  else{mounted(r,'art',.85,1.10,Number(r.id.slice(1))%3);if(r.id==='I26')mounted(r,'bulletin',1.6,.90,0);}
 }
 return {version:LIVING_VERSION,props,boxes,mounts,coverage,rejected,values:[...CORE_VALUES],source:VALUE_SOURCE,assumptions:['Inspiration, not measured reconstruction.','No new openings or excluded-room access.','The imported Hissrum12 dimensions remain estimated; its furniture is adapted within the reviewed I12 footprint.','All added floor props participate in movement, bullet cover and bot navigation.']};
}
