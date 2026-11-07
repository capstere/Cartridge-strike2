/** Deterministic furnishing layer. Geometry, photo uncertainty and collision share one record. */
export const FURNISHING_VERSION = 'floor5-fps-0.7';

const colors = { white:[.88,.9,.89], dark:[.055,.067,.076], blue:[.14,.24,.35], green:[.18,.31,.20], wood:[.57,.44,.30], steel:[.53,.58,.59] };
const bounds = p => [Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];

export function createFurnishings(data, inherited, {inside,distanceSegment}) {
  const instances = [], boxes = [], labels = [];
  const routes=data.routes.flatMap(r=>r.segments.flatMap(s=>s.points.slice(1).map((p,i)=>[s.points[i],p])));
  const roomMap=new Map(data.rooms.map(r=>[r.id,r]));
  const allBlocked=[...data.excludedRooms,...data.rooms.filter(r=>r.status==='uncertain'),...data.obstacles];
  function safe(roomId,x,z,w,d) {
    const room=roomMap.get(roomId); if(!room||room.status!=='included'||data.layoutPresentation?.suppressedAutoFurnitureRooms?.includes(roomId))return false;
    const radius=Math.hypot(w,d)/2;
    // A protected envelope around every accepted walking line also preserves door approaches.
    if(routes.some(([a,b])=>distanceSegment(x,z,a,b)<radius+.48))return false;
    for(const [dx,dz] of [[0,0],[-w/2,-d/2],[-w/2,d/2],[w/2,-d/2],[w/2,d/2]]){
      if(!inside(x+dx,z+dz,room.polygon))return false;
      if(allBlocked.some(o=>inside(x+dx,z+dz,o.polygon)))return false;
      if(data.walls.some(wall=>distanceSegment(x+dx,z+dz,wall.a,wall.b)<.13))return false;
    }
    return !instances.some(p=>Math.abs(p.transform.x-x)<(p.footprint.w+w)/2+.1&&Math.abs(p.transform.z-z)<(p.footprint.d+d)/2+.1);
  }
  function furnish(roomId,prefab,x,z,w,d,source='standard office furnishing; placement is a design assumption'){
    if(!safe(roomId,x,z,w,d))return false;
    const id=`fps-${roomId}-${prefab}-${instances.length}`;
    const record={id,roomId,prefab,asset:'parametric',transform:{x,y:0,z,yaw:0},footprint:{w,d},source,collision:{type:'visible-box-parts',parts:[]}};
    instances.push(record);
    const part=(suffix,dx,y,dz,pw,h,pd,color='white',material='furniture')=>{
      const b={id:`${id}-${suffix}`,roomId,x:x+dx,y,z:z+dz,w:pw,h,d:pd,color:colors[color]||color,material,angle:0,furnishingId:id};
      boxes.push(b);record.collision.parts.push(b.id);return b;
    };
    function chair(suffix,dx,dz,face=1){
      const b=part(suffix,dx,.47,dz,.44,.94,.44,'dark','fabric');
      b.asset='chairDesk';b.angle=face===1?0:Math.PI;
      record.asset='Kenney Furniture Kit CC0 chairDesk; parametric table';
    }
    if(prefab==='desk'){
      const tw=w-.10,td=d-.55;
      part('top',0,.75,-.23,tw,.055,td,'white','table');
      for(const dx of [-tw/2+.10,tw/2-.10])for(const dz of [-td/2,td/2])part(`leg-${dx}-${dz}`,dx,.36,dz-.23,.055,.72,.055,'steel','metal');
      part('screen',0,1.00,-.35,.48,.30,.06,'dark').asset='computerScreen';
      part('keyboard',0,.789,-.12,.30,.02,.11,'dark');
      chair('chair',0,d/2-.24);
      record.asset='Kenney Furniture Kit CC0 chairDesk + computerScreen; parametric desk';
    }else if(prefab==='meeting-table'||prefab==='pantry-table'){
      const tw=w-.92,td=Math.max(.65,d-1.05);
      part('top',0,.75,0,tw,.065,td,'white','table');
      for(const dx of [-tw/2+.10,tw/2-.10])for(const dz of [-td/2+.10,td/2-.10])part(`leg-${dx}-${dz}`,dx,.36,dz,.065,.72,.065,'steel','metal');
      const n=Math.max(1,Math.round(tw/.8));
      for(let i=0;i<n;i++){const dx=(i-(n-1)/2)*tw/n;chair(`chair-a-${i}`,dx,-td/2-.30,-1);chair(`chair-b-${i}`,dx,td/2+.30);}
      part('notepad',-.2,.793,0,.22,.018,.27,[.9,.88,.76]);
      part('presentation-puck',.24,.805,0,.18,.04,.18,'dark');
    }else if(prefab==='sofa'){
      part('base',0,.27,0,w,.47,d,'blue','fabric');
      part('back',0,.73,d/2-.1,w,.48,.2,'blue','fabric');
      part('arm-l',-w/2+.1,.56,0,.2,.26,d,'blue','fabric');
      part('arm-r',w/2-.1,.56,0,.2,.26,d,'blue','fabric');
      for(let i=0;i<2;i++)part(`cushion-${i}`,(i-.5)*w/2,.53,-.04,w/2-.13,.12,d-.24,[.23,.31,.37],'fabric');
    }else if(prefab==='plant-cabinet'){
      part('cabinet',0,.5,0,w,1,d,'white').asset='bookcaseClosedDoors';
      part('seam',0,.5,-d/2-.004,.018,.92,.012,'steel');
      part('plant',0,1.35,0,.45,.70,.35,'green','plant').asset='pottedPlant';
      record.asset='Kenney Furniture Kit CC0 bookcaseClosedDoors + pottedPlant';
    }else if(prefab==='storage'){
      part('cabinet',0,1,0,w,2,d,'white').asset='bookcaseClosedDoors';
      record.asset='Kenney Furniture Kit CC0 bookcaseClosedDoors';
      part('door-line',0,1,-d/2-.004,.016,1.87,.012,'steel');
      part('handle-l',-.07,1.05,-d/2-.035,.035,.23,.045,'dark','metal');
      part('handle-r',.07,1.05,-d/2-.035,.035,.23,.045,'dark','metal');
    }else if(prefab==='printer'){
      part('body',0,.40,0,w,.75,d,'white');
      part('scanner',0,.83,0,w,.13,d,'dark');
      part('paper',0,.90,.05,w*.6,.025,d*.5,[.97,.97,.94]);
      part('panel',w*.28,.99,-d*.27,w*.3,.18,.08,'dark');
    }else if(prefab==='lab-cart'){
      part('lower-shelf',0,.16,0,w,.07,d,'steel','metal');
      part('top',0,.81,0,w,.06,d,'steel','metal');
      for(const dx of [-w/2+.04,w/2-.04])for(const dz of [-d/2+.04,d/2-.04])part(`post-${dx}-${dz}`,dx,.46,dz,.035,.82,.035,'steel','metal');
      part('handle',0,1.00,d/2-.035,w,.035,.035,'steel','metal');
      for(const dx of [-w/2+.07,w/2-.07])for(const dz of [-d/2+.07,d/2-.07])part(`wheel-${dx}-${dz}`,dx,.065,dz,.08,.12,.06,'dark');
    }
    return true;
  }
  // Conference geometry is placed only in actual reviewed meeting rooms. No new boundaries.
  for(const id of ['I14','I16','I17','I22','I23','I24','I28']){
    const r=roomMap.get(id),[x0,z0,x1,z1]=bounds(r.polygon);
    const width=Math.min(3.1,x1-x0-.65),depth=Math.min(2.2,z1-z0-.8);
    const candidates=[[.5,.52],[.65,.57],[.47,.67],[.5,.35]];
    for(const [u,v] of candidates)if(furnish(id,'meeting-table',x0+(x1-x0)*u,z0+(z1-z0)*v,width,depth))break;
    if(!instances.some(p=>p.roomId===id)){
      let placed=false;
      for(let x=x0+.8;x<x1-.7&&!placed;x+=.3)for(let z=z0+.7;z<z1-.7&&!placed;z+=.3)placed=furnish(id,'desk',x,z,1.35,1.2);
    }
  }
  for(const id of ['I09','I10']){
    const r=roomMap.get(id),[x0,z0,x1,z1]=bounds(r.polygon);
    for(const u of [.32,.70])furnish(id,'pantry-table',x0+(x1-x0)*u,z0+(z1-z0)*.55,2.0,1.85,id==='I10'?'P01/P02: white table, blue chairs; position approximate; D42 door conflict unchanged':'standard pantry table; no located photo');
  }
  for(const [id,prefab] of [['I25','sofa'],['I20','sofa'],['I21','storage'],['I38','storage'],['I18','printer'],['I27','printer'],['I26','plant-cabinet'],['I12','sofa']]){
    const r=roomMap.get(id),[x0,z0,x1,z1]=bounds(r.polygon);
    const w=prefab==='sofa'?1.8:1.1,d=prefab==='sofa'?.72:.50;
    for(const [u,v] of [[.5,.22],[.65,.8],[.2,.75],[.7,.5]])if(furnish(id,prefab,x0+(x1-x0)*u,z0+(z1-z0)*v,w,d,id==='I26'?'P21/P22/P33: low white cabinets with plants; placement approximate':'standard furnishing; placement assumed'))break;
  }
  // Add photo-inspired instruments on the already-traced bench footprints, never in an aisle.
  for(const o of data.obstacles.filter(o=>o.roomId==='I02'&&['F07','F10'].includes(o.id))){
    const [x0,z0,x1,z1]=bounds(o.polygon),x=(x0+x1)/2,z=(z0+z1)/2;
    const id=`fps-${o.id}-instrument`;
    const b={id,roomId:'I02',x,y:1.12,z,w:Math.min(.47,x1-x0-.08),h:.45,d:Math.min(.38,z1-z0-.08),color:colors.white,material:'furniture',angle:0};
    if(b.w>.08&&b.d>.08){boxes.push(b,{...b,id:id+'-red-cap',y:1.37,h:.06,color:[.54,.14,.10]});instances.push({id,roomId:'I02',prefab:'bench-instrument',asset:'parametric',transform:{x,y:.88,z,yaw:0},footprint:{w:b.w,d:b.d},source:'P27: white benchtop instruments with red tops; PQC photo placement remains preliminary',collision:{type:'visible-box-parts',parts:[id,id+'-red-cap']}});}
  }
  // Fictional game dressing in included rooms, protected by the same route envelopes.
  // These are generic empty supply carts, not a claim of actual equipment placement.
  for(const roomId of ['I01','I04']){
    const room=roomMap.get(roomId),[x0,z0,x1,z1]=bounds(room.polygon);let placed=false;
    for(let z=z0+.52;z<z1-.52&&!placed;z+=.4)for(let x=x0+.62;x<x1-.62&&!placed;x+=.4)
      placed=furnish(roomId,'lab-cart',x,z,.70,.46,'fictional FPS supply cart; no verified instrument placement');
  }
  // Reused inherited furniture is recorded with its actual source footprint and photo caveats.
  const inheritedManifest=data.obstacles.map(o=>({id:o.id,roomId:o.roomId||'I26',prefab:/desk/.test(o.kind)?'desk-bank':o.kind,asset:'src/world.js procedural furniture',transform:{sourcePolygon:o.id},collision:{type:'visible-box-and-surface-parts',sourcePolygon:o.polygon},source:o.roomId==='I01'?'P28–P32, preliminary GX photo mapping':o.roomId==='I02'?'P23–P27, preliminary PQC photo mapping':o.roomId==='I04'?'standard lab furnishing; NEG has no confirmed photo':'P21/P22/P33 and reviewed furniture footprint'}));
  return {version:FURNISHING_VERSION,instances:[...inheritedManifest,...instances],boxes,labels,assumptions:['No photo-derived change to walls or doors.',data.metadata.reviewRevision>=3?'D42 is confirmed as an ordinary door by owner v1; historical photo naming does not override it.':'D42 pantry/STÄD filename conflict remains unresolved.','PQC/GX photo attribution is preliminary; exact positions are design assumptions.']};
}
