/* One geographical source: generated floor5-data.js, derived from the accepted review. */
(function(root){'use strict';
 const floor5=typeof module==='object'&&module.exports?require('./floor5-data.js'):root.SpelFloor5;
 function createSource(D){
 const H=2.85,RADIUS=.20,doorsById=new Map(D.doors.map(d=>[d.id,d]));
 const PHOTO_GLAZING=new Set(['WALL-124']);
 // Photo-supported finishes only: these IDs retain their reviewed boundary and collider.
 const palette={wall:[.96,.965,.96],trim:[.40,.41,.40],floor:[.20,.23,.27],lab:[.84,.85,.84],office:[.20,.23,.27],officeCarpet:[.431,.404,.396],ceiling:[.96,.965,.955],teal:[.35,.37,.37],blocked:[.38,.39,.39],wood:[.64,.59,.49],metal:[.64,.66,.66],dark:[.065,.078,.088],white:[.96,.965,.955],blue:[.11,.19,.33]};
 const distanceSegment=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);};
 function inside(x,z,p){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if(((a[1]>z)!==(b[1]>z))&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
 function touchPoly(x,z,r,p){if(inside(x,z,p))return true;return p.some((a,i)=>distanceSegment(x,z,a,p[(i+1)%p.length])<r-1e-5);}
 const bounds=p=>[Math.min(...p.map(a=>a[0])),Math.min(...p.map(a=>a[1])),Math.max(...p.map(a=>a[0])),Math.max(...p.map(a=>a[1]))];
 const floorAreas=D.floorPolygons.map(p=>({polygon:p,bounds:bounds(p)}));
 const onFloor=(x,z)=>floorAreas.some(a=>x>=a.bounds[0]-1e-7&&x<=a.bounds[2]+1e-7&&z>=a.bounds[1]-1e-7&&z<=a.bounds[3]+1e-7&&(inside(x,z,a.polygon)||a.polygon.some((p,i)=>distanceSegment(x,z,p,a.polygon[(i+1)%a.polygon.length])<1e-6)));
 function zone(s){const r=D.rooms.find(r=>r.status!=='uncertain'&&inside(s.x,s.z,r.polygon));if(r)return r;const c=D.corridors.find(r=>inside(s.x,s.z,r.polygon));return c||{id:'corridor',name:'Korridor · våning 5'};}
 const labRoom=r=>['I01','I02','I03','I04','I29'].includes(r.id);
 const roomColor=r=>D.__custom?(r.surface==='vinyl'?palette.lab:r.surface==='office-carpet'?palette.officeCarpet:palette.floor):labRoom(r)?palette.lab:/RESTROOM|STÄD|PENTRY/.test(r.name)?[.49,.49,.46]:palette.floor;
 let cachedKey='',cachedScene=null;
 const geometryKey=s=>D.doors.filter(d=>d.accessCardConfirmed).map(d=>`${d.id}:${!!s.doors[d.id]}`).join('|');
 function build(s){
  const key=geometryKey(s);if(cachedScene&&key===cachedKey)return cachedScene;
  const scene={boxes:[],surfaces:[],labels:[],colliders:[],rooms:D.rooms,doors:D.doors,walls:D.walls,blockedPolygons:[],floorPolygons:D.floorPolygons};
  const box=(id,x,y,z,w,h,d,color,material='wall',angle=0)=>scene.boxes.push({id,x,y,z,w,h,d,color:palette[color]||color,material,angle,...(/-curtain\d+$/.test(id)?{decorative:true}:{})});
  const segmentBox=(id,a,b,y,h,thickness,color,material='wall')=>{const dx=b[0]-a[0],dz=b[1]-a[1];box(id,(a[0]+b[0])/2,y,(a[1]+b[1])/2,Math.hypot(dx,dz),h,thickness,color,material,-Math.atan2(dz,dx));};
  D.floorPolygons.forEach((p,i)=>{scene.surfaces.push({id:'floor-'+i,polygon:p,y:0,color:palette.floor,material:'carpet'},{id:'ceiling-'+i,polygon:p,y:H,color:palette.ceiling,material:'ceiling'});});
  [...D.rooms.filter(r=>r.status!=='uncertain'),...(D.__custom?D.corridors:[])].forEach(r=>scene.surfaces.push({id:'finish-'+r.id,polygon:r.polygon,y:.006,color:roomColor(r),material:D.__custom?r.surface:labRoom(r)||/RESTROOM|STÄD|PENTRY/.test(r.name)?'vinyl':'carpet'}));
  function glazed(id,a,b,height=H,glazingStyle='standard'){
   const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
   segmentBox(id,a,b,height/2,height,.035,[.72,.81,.81],'glass');
   segmentBox(id+'-frost',a,b,glazingStyle==='office-band'?1.43:1.22,glazingStyle==='office-band'?.68:.46,.044,glazingStyle==='office-band'?[.80,.82,.80]:[.84,.87,.83],'frosted');
   if(glazingStyle==='office-band'){
    // Generic stacked signal-bars, not a copied logo. They do not affect collision.
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
    const count=Math.max(1,Math.round(length/1.60));
    for(let i=0;i<count;i++){
     const t=(i+.5)/count,cx=a[0]+dx*t,cz=a[1]+dz*t;
     for(let j=0;j<3;j++){
      const bar=.13+j*.07,shift=(j-1)*.12;
      const u=[cx+ux*(shift-bar/2),cz+uz*(shift-bar/2)];
      const v=[cx+ux*(shift+bar/2),cz+uz*(shift+bar/2)];
      segmentBox(id+'-signal-'+i+'-'+j,u,v,1.31+j*.12,.045,.056,[.06,.34,.62],'blue-graphic');
      scene.boxes.at(-1).decorative=true;
     }
    }
   }
   segmentBox(id+'-top',a,b,height-.06,.12,.10,'trim','metal');
   segmentBox(id+'-base',a,b,.045,.09,.10,'trim','metal');
   const panels=Math.max(1,Math.round(length/1.12));
   for(let i=0;i<=panels;i++)box(id+'-post'+i,a[0]+(b[0]-a[0])*i/panels,height/2,a[1]+(b[1]-a[1])*i/panels,.036,height,.036,'metal','metal');
  }
  for(const w of D.walls){
   const height=w.height||H,thickness=w.thickness||.11;
   if(w.surfaceType==='glazed'){
    glazed(w.id,w.a,w.b,height,w.glazingStyle);
   }else if(w.surfaceType==='window'){
    const a=w.a,b=w.b,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    const sill=D.__custom?w.sill??.9:.84,header=D.__custom?Math.min(.3,height-sill-.15):.30;
    const glassHeight=D.__custom?height-sill-header:1.71,glassY=D.__custom?sill+glassHeight/2:1.695;
    segmentBox(w.id+'-sill-wall',a,b,sill/2,sill,thickness,'wall');
    segmentBox(w.id+'-header',a,b,D.__custom?height-header/2:2.70,header,thickness,'wall');
    segmentBox(w.id+'-glass',a,b,glassY,glassHeight,.035,[.72,.81,.81],'glass');
    segmentBox(w.id+'-sill',a,b,D.__custom?sill+.01:.85,.045,.18,'white','metal');
    segmentBox(w.id+'-top',a,b,D.__custom?height-header-.01:2.55,.055,.10,'white','metal');
    const n=Math.max(1,Math.ceil(length/1.55));
    for(let i=0;i<=n;i++)box(w.id+'-mullion'+i,a[0]+dx*i/n,D.__custom?glassY:1.70,a[1]+dz*i/n,.045,D.__custom?glassHeight:1.74,.045,'white','metal');
   }else if(!w.surfaceType&&PHOTO_GLAZING.has(w.id)){glazed(w.id,w.a,w.b,height);
    const length=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]),n=Math.max(1,Math.round(length/1.12));
    for(let i=0;i<n;i++)box(w.id+'-curtain'+i,w.a[0]+length*(i+.1)/n,1.43,w.a[1]+.16,.23,2.65,.045,[.79,.81,.77],'fabric');
   }
   else if(!w.surfaceType&&w.id==='WALL-324'){
    // P21/P22/P33: office facade windows. The unphotographed southern facade stays solid.
    const end=D.pdfToWorld([738.76,391.8]);
    segmentBox(w.id+'-south',end,w.b,height/2,height,thickness,'wall');
    segmentBox(w.id,w.a,end,.39,.78,thickness,'wall');
    segmentBox(w.id+'-head',w.a,end,2.70,.30,thickness,'wall');
    segmentBox(w.id+'-daylight',w.a,end,1.66,1.75,.028,[.65,.80,.87],'emissive');
    const n=Math.ceil(Math.hypot(end[0]-w.a[0],end[1]-w.a[1])/1.55);
    for(let i=0;i<=n;i++){const z=w.a[1]+(end[1]-w.a[1])*i/n;box(w.id+'-mullion'+i,w.a[0]-.045,1.68,z,.12,1.8,.075,'white','metal');
     box(w.id+'-curtain'+i,w.a[0]-.20,1.65,z,.08,1.88,.22,[.74,.76,.69],'fabric');}
    segmentBox(w.id+'-sill',w.a,end,.80,.05,.32,'white');
   }else segmentBox(w.id,w.a,w.b,height/2,height,thickness,'wall');
   segmentBox(w.id+'-skirt',w.a,w.b,.045,.09,thickness+.016,'trim');
   scene.colliders.push({id:w.id,a:w.a,b:w.b,thickness,kind:'wall'});
  }
  const exclusions=[...D.excludedRooms,...D.rooms.filter(r=>r.status==='uncertain')];
  for(const r of exclusions){scene.blockedPolygons.push({id:r.id,polygon:r.polygon});}
  // Non-walkable room volumes remain complete behind translucent corridor fronts.
  for(const r of exclusions){scene.surfaces.push({id:r.id+'-closed-floor',polygon:r.polygon,y:0,color:palette.floor,material:'carpet'},{id:r.id+'-closed-ceiling',polygon:r.polygon,y:H,color:palette.ceiling,material:'ceiling'});}
  function chair(id,x,z,angle=0,size=.42){
   box(id+'-seat',x,.47,z,size,.085,size,'dark');
   box(id+'-back',x,.77,z+size*.40,size,.50,.07,'dark','fabric',angle);
   box(id+'-stem',x,.25,z,.055,.40,.055,'metal','metal');
   box(id+'-feet-x',x,.065,z,size*.96,.045,.05,'dark');box(id+'-feet-z',x,.065,z,.05,.045,size*.96,'dark');
  }
  function monitor(id,x,y,z,angle=0){
   box(id+'-screen',x,y+.30,z,.54,.34,.055,'dark','metal',angle);
   box(id+'-stand',x,y+.085,z,.045,.17,.06,'metal','metal');box(id+'-base',x,y+.017,z,.24,.034,.15,'dark');
  }
  for(const o of D.obstacles){
   if(o.collision!=='none')scene.blockedPolygons.push({id:o.id,polygon:o.polygon});
   const [x0,z0,x1,z1]=bounds(o.polygon),cx=(x0+x1)/2,cz=(z0+z1)/2,w=x1-x0,d=z1-z0;
   if(D.__custom){box(o.id,o.x??cx,(o.elevation||0)+(o.height||.8)/2,o.z??cz,o.w||w,o.height||.8,o.d||d,'wood','furniture',o.yaw||0);if(o.studioVisual)scene.boxes.at(-1).studioVisual=true;continue;}
   if(o.kind==='uncertain-area'){box(o.id,cx,.95,cz,w,1.9,d,'blocked');continue;}
   if(o.kind==='authored-dining-table'){
    box(o.id+'-top',cx,.755,cz,w,.055,d,'white','table');
    for(const x of [x0+.065,x1-.065])for(const z of [z0+.12,z1-.12])box(o.id+'-leg'+x+z,x,.36,z,.045,.72,.045,'metal','metal');
    continue;
   }
   if(o.kind==='authored-chair'){
    const a=o.yaw||0,s=Math.sin(a),c=Math.cos(a);
    box(o.id+'-seat',cx,.46,cz,w,.075,d,'blue','fabric');
    box(o.id+'-back',cx+s*.15,.73,cz+c*.15,w,.48,.06,'blue','fabric',a);
    for(const x of [-w*.32,w*.32])for(const z of [-d*.32,d*.32])box(o.id+'-leg'+x+z,cx+x,.225,cz+z,.026,.45,.026,'metal','metal');
    continue;
   }
   if(o.kind==='authored-sofa'){
    const a=o.yaw||0,c=Math.cos(a),s=Math.sin(a),vertical=Math.abs(s)>.5,ww=vertical?d:w,dd=vertical?w:d;
    const local=(id,u,y,v,pw,ph,pd,col='blue')=>box(o.id+'-'+id,cx+c*u+s*v,y,cz-s*u+c*v,pw,ph,pd,col,'fabric',a);
    local('base',0,.32,0,ww,.32,dd);local('back',0,.73,dd/2-.07,ww,.52,.14);
    for(const side of [-1,1])local('arm'+side,side*(ww/2-.065),.57,0,.13,.22,dd);
    for(const side of [-1,1])local('cushion'+side,side*ww*.235,.51,-.02,ww*.44,.10,dd*.7);
    continue;
   }
   if(o.kind==='authored-coffee-table'){
    box(o.id+'-top',cx,.46,cz,w,.04,d,'wood','table');box(o.id+'-leg',cx,.22,cz,.045,.44,.045,'metal','metal');
    box(o.id+'-foot',cx,.025,cz,w*.65,.05,d*.65,'metal','metal');continue;
   }
   if(o.kind==='authored-counter'){
    box(o.id+'-body',cx,.43,cz,w,.86,d,'white');
    box(o.id+'-top',cx,.885,cz,w+.025,.05,d+.025,'wood','table');
    const n=Math.max(1,Math.ceil(w/.8));
    for(let i=1;i<n;i++)box(o.id+'-seam'+i,x0+w*i/n,.44,z0-.007,.012,.76,.012,'metal','metal');
    continue;
   }
   const desk=/desk|office/i.test(o.kind||o.id),h=desk?.75:.88;
   const halfDepth=desk?Math.min(d/2,.63):d/2,topPoly=desk?[[x0,cz-halfDepth],[x1,cz-halfDepth],[x1,cz+halfDepth],[x0,cz+halfDepth]]:o.polygon;
   // Thin tops, open legroom: all fittings stay inside the pre-existing occupied footprint.
   scene.surfaces.push({id:o.id+'-top',polygon:topPoly,y:h,color:palette.white,material:'table'});
   topPoly.forEach((a,i)=>segmentBox(o.id+'-edge'+i,a,topPoly[(i+1)%topPoly.length],h-.025,.05,.022,'white'));
   for(const x of [x0+.09,x1-.09])for(const z of [cz-halfDepth+.09,cz+halfDepth-.09])box(o.id+'-leg'+x+z,x,h/2,z,.055,h,.055,'metal','metal');
   if(desk){
    const deep=d>1.2,screenZ=deep?cz:z0+.08;
    box(o.id+'-blue-divider',cx,1.03,screenZ,Math.max(.1,w-.04),.58,.065,'blue','fabric');
    const nx=Math.max(1,Math.floor(w/1.35));
    for(let i=0;i<nx;i++){
     const x=x0+(i+.5)*w/nx;
     const mz=deep?cz+.16:cz+.015;monitor(o.id+'-monitor'+i,x,h,mz);
     if(deep){monitor(o.id+'-monitor-reverse'+i,x,h,cz-.16,Math.PI);chair(o.id+'-chair'+i,x,z1-.20,0,.32);}
     box(o.id+'-keyboard'+i,x,h+.011,Math.min(z1-.06,mz+.23),.32,.021,.115,'dark');
     if(i===0&&d>.6)box(o.id+'-drawer',x0+.22,.34,z0+.28,.35,.64,.43,'white');
    }
   }else{
    const index=Number(o.id.slice(1));
    if(o.roomId==='I01'&&[1,2,4,5].includes(index)){
     // P28–P32: photo-inspired cabinet shapes; GX placement inferred, within traced benches.
     const longX=w>=d,fw=longX?w-.12:d-.12,dep=Math.max(.1,Math.min(longX?d:w,.78)-.10),angle=longX?0:Math.PI/2;
     box(o.id+'-instrument',cx,1.04,cz,longX?fw:dep,2.04,longX?dep:fw,'white');
     const normal=longX?[0,-1]:[-1,0],fx=cx+normal[0]*(dep/2+.006),fz=cz+normal[1]*(dep/2+.006);
     box(o.id+'-cabinet-glass',fx,1.19,fz,fw-.11,1.44,.024,[.12,.17,.20],'metal',angle);
     const cols=Math.max(2,Math.floor(fw/.35));
     for(let col=0;col<cols;col++)for(let row=0;row<4;row++){
      const delta=(col-(cols-1)/2)*(fw-.22)/cols;
      box(o.id+'-module'+col+'-'+row,fx+(longX?delta:-.018),.64+row*.30,fz+(longX?-.018:delta),longX?.14:.025,.13,longX?.025:.14,[.22,.48,.50]);
     }
    }else if(o.roomId==='I02'&&[13,15].includes(index)){
     // P23–P27: photo-inspired enclosures, PQC placement inferred; no controls or SOP claims.
     box(o.id+'-hood',cx,1.65,cz,w*.91,.36,d*.91,'white');
     for(const x of [x0+.07,x1-.07])box(o.id+'-hood-post'+x,x,1.24,cz,.065,.72,d*.83,'metal','metal');
     box(o.id+'-hood-window',cx,1.28,z0+.06,Math.max(.1,w-.2),.61,.025,[.64,.79,.81],'glass');
     box(o.id+'-hood-light',cx,1.46,cz,w*.65,.025,d*.5,[.78,.94,.96],'emissive');
    }else if(w>.6&&d>.45){
     monitor(o.id+'-lab-monitor',cx,h,cz);
     if(index%3===0){box(o.id+'-instrument-small',x0+w*.25,h+.22,cz,w*.27,.44,d*.65,'white');box(o.id+'-display',x0+w*.25,h+.28,z0+.035,w*.18,.18,.018,[.10,.27,.32]);}
     if(index%4===0)box(o.id+'-bin',x1-.17,.27,z1-.19,.28,.54,.30,[.86,.72,.08]);
    }
   }
  }
  const named={D06:'South Atrium',D08:'North Laboratory',D13:'Analysis Chamber',D14:'North Laboratory ↔ Analysis Chamber',D16:'Isolation Laboratory',D56:'Supply Storage',D07:'Operations Office'};
  for(const d of D.doors){
   if(d.removed)continue;
   const [a,b]=[d.a,d.b],width=d.width||Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/width,dz=(b[1]-a[1])/width,n=[-dz,dx],c=d.center;
   const pass=d.kind.startsWith('open-passage'),closed=d.blocked||d.lockedUntilImplemented||(d.accessCardConfirmed&&!s.doors[d.id]);
   const col=d.blocked?'blocked':'teal';
   if(d.lockedUntilImplemented)scene.colliders.push({id:d.id,a,b,thickness:.08,kind:d.doorType});
   if(!pass){
    segmentBox(d.id+'-threshold',a,b,.012,.024,.13,[.62,.52,.33],'metal');
    for(const [i,p] of [a,b].entries())box(d.id+'-jamb'+i,p[0],1.15,p[1],.065,2.3,.065,d.doorStyle==='office'?[.45,.44,.43]:'trim');
    segmentBox(d.id+'-lintel',a,b,2.57,.56,.12,d.doorStyle==='office'?[.55,.53,.52]:'wall');
    if(d.doorType==='elevator'&&!d.startElevator){
     segmentBox(d.id+'-sealed-leaf',a,b,1.14,2.28,.08,'metal','metal');
     // Two brushed-metal sliding panels; no imaginary open shaft or floor travel.
     const yaw=-Math.atan2(b[1]-a[1],b[0]-a[0]);
     box(d.id+'-seam',c[0]+n[0]*.048,1.14,c[1]+n[1]*.048,.016,2.24,.012,'dark','metal',yaw);
     box(d.id+'-display',c[0]+n[0]*.09,2.43,c[1]+n[1]*.09,.22,.13,.024,'dark','metal',yaw);
     box(d.id+'-floor-number',c[0]+n[0]*.108,2.43,c[1]+n[1]*.108,.035,.065,.01,[.2,.65,.6],'emissive',yaw);
    }else if(d.doorType==='terrace'){
     glazed(d.id+'-terrace',a,b,2.28);
     segmentBox(d.id+'-pushbar',a,b,1.02,.035,.13,'metal','metal');
    }else if(closed){
     segmentBox(d.id+'-leaf',a,b,1.085,2.17,.08,col,'metal');
     scene.colliders.push({id:d.id,a,b,thickness:.08,kind:'door'});
     // Inset glass and push strip are visual fittings only; door span remains source-derived.
     const ga=[c[0]-dx*width*.27,c[1]-dz*width*.27],gb=[c[0]+dx*width*.27,c[1]+dz*width*.27];
     segmentBox(d.id+'-glass',ga,gb,1.53,.60,.086,[.52,.65,.67],'metal');
     segmentBox(d.id+'-bar',ga,gb,.99,.035,.13,'metal');
    }
   }
   if(d.accessCardConfirmed){
    const p=[a[0]-dx*.16,a[1]-dz*.16];box(d.id+'-reader',p[0],1.27,p[1],.12,.23,.12,'dark');box(d.id+'-status',p[0],1.32,p[1],.125,.03,.125,s.doors[d.id]?[.20,.75,.50]:[.90,.60,.18]);
   }
   if(named[d.id]||d.blocked){
    const title=named[d.id]||(d.blocked?'EJ TILLGÄNGLIGT':'');
    for(const side of [-1,1])scene.labels.push({text:title+'\n'+(d.accessCardConfirmed?'ACCESS':'PASSAGE'),x:c[0]+n[0]*.095*side,y:2.45,z:c[1]+n[1]*.095*side,yaw:Math.atan2(n[0]*side,n[1]*side),width:Math.max(1.05,Math.min(2.2,width+.55)),height:.35,color:'#ecf2eb',accent:d.blocked?'#536360':'#245b57'});
   }
  }
  if(!D.__custom||!D.shellOnly){
  // Ceiling lighting follows the geographical polygons, with no extra partitions.
  for(const r of [...D.rooms.filter(r=>r.status!=='uncertain'),...D.corridors]){
   const [x0,z0,x1,z1]=bounds(r.polygon),spanX=x1-x0,spanZ=z1-z0,nx=Math.max(1,Math.round(spanX/2.4)),nz=Math.max(1,Math.round(spanZ/2.4));
   for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
    const x=x0+(i+.5)*spanX/nx,z=z0+(j+.5)*spanZ/nz;
    if(inside(x,z,r.polygon)&&!exclusions.some(e=>inside(x,z,e.polygon))){
     const id='light-'+r.id+i+'-'+j;
     if(r.id.startsWith('C')){const radius=.115;scene.surfaces.push({id,polygon:Array.from({length:16},(_,k)=>[x+Math.cos(k*Math.PI/8)*radius,z+Math.sin(k*Math.PI/8)*radius]),y:H-.034,color:[1,.96,.83],material:'emissive'});}
     else box(id,x,H-.03,z,Math.min(.58,spanX*.5),.022,Math.min(.58,spanZ*.5),[.99,.98,.88],'emissive');
    }
   }
  }
  // P01/D35: west pantry finish is known; furnishing positions are approximate and kept clear of doors.
  const pantry=D.rooms.find(r=>r.id==='I10');if(pantry){const [x0,z0,x1,z1]=bounds(pantry.polygon);
   box('pantry-blue-wall',(x0+x1)/2,1.5,z0+.07,x1-x0-.1,2.65,.04,[.22,.31,.40]);
   box('pantry-display',(x0+x1)/2,1.75,z0+.105,1.10,.65,.04,[.14,.20,.25]);
   box('pantry-display-lit',(x0+x1)/2,1.75,z0+.13,1.01,.57,.012,[.64,.80,.82],'emissive');
  }
  }
  // Exact target is a free standing place beside the desk, not inside its excluded volume.
  const k=D.targets.find(t=>t.id==='K');if(k)scene.labels.push({text:'KONTORSPLATS',x:k.point[0]+.8,y:1.35,z:k.point[1]+.55,yaw:0,width:1.25,height:.25,color:'#f6f2e7',accent:'#245b57'});
  cachedScene=scene;cachedKey=key;return scene;
 }
 function canOccupy(s,x,z,scene=build(s),radius=RADIUS){
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  for(let i=0;i<16;i++){const a=i*Math.PI/8;if(!onFloor(x+Math.cos(a)*radius,z+Math.sin(a)*radius))return false;}
  if(scene.colliders.some(c=>distanceSegment(x,z,c.a,c.b)<radius+c.thickness/2-1e-5))return false;
  return !scene.blockedPolygons.some(o=>touchPoly(x,z,radius,o.polygon));
 }
 function targets(s){return D.doors.filter(d=>d.accessCardConfirmed&&!d.blocked).map(d=>{
  const [x,z]=d.center,dx=d.b[0]-d.a[0],dz=d.b[1]-d.a[1],l=Math.hypot(dx,dz),n=[-dz/l,dx/l],side=(s.x-x)*n[0]+(s.z-z)*n[1]>=0?1:-1;
  return {id:d.id,label:(s.doors[d.id]?'Stäng dörren':'Använd passerkort')+' · '+d.id,x:x+n[0]*.20*side,z:z+n[1]*.20*side,floor:5,door:d};
 });}
 function canInteract(s,t,scene=build(s)){
  if(!t||s.panel||Math.hypot(t.x-s.x,t.z-s.z)>1.45)return false;
  const n=Math.ceil(Math.hypot(t.x-s.x,t.z-s.z)/.06);
  for(let i=1;i<n;i++){const x=s.x+(t.x-s.x)*i/n,z=s.z+(t.z-s.z)*i/n;
   if(scene.colliders.some(c=>c.id!==t.id&&distanceSegment(x,z,c.a,c.b)<c.thickness/2))return false;
   if(scene.blockedPolygons.some(o=>inside(x,z,o.polygon)))return false;
  }return true;
 }
 function nearest(s,scene=build(s)){
  return targets(s).filter(t=>{if(!canInteract(s,t,scene))return false;const dx=t.x-s.x,dz=t.z-s.z,n=Math.hypot(dx,dz);return n<.3||(dx*Math.sin(s.yaw)-dz*Math.cos(s.yaw))/n>.25;}).sort((a,b)=>Math.hypot(a.x-s.x,a.z-s.z)-Math.hypot(b.x-s.x,b.z-s.z))[0]||null;
 }
 return {data:D,RADIUS,build,geometryKey,zone,rooms:()=>D.rooms,canOccupy,targets,canInteract,nearest,inside,distanceSegment,doorsById};
 }
 const api=createSource(floor5);
 root.SpelWorld=api;root.SpelWorldForLevel=createSource;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
