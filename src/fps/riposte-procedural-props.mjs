/** Standalone original Three.js 0.180-compatible adaptations of MIT
 * procedural prefab ideas from Riposte: Frontline, BenDBSS 2026.
 * No game-state ownership, no external resources. +Y up, meters.
 * See ../../licenses/riposte-MIT.txt and upstream/src/02f-props.js.
 */
export const PROP_CATALOG=Object.freeze([
 ['pallet','Industrial timber pallet','1.2 x 0.8 m logistics'],
 ['barrel','Steel storage barrel','industrial storage'],
 ['jersey','Jersey concrete barrier','outdoor cover'],
 ['sandbags','Sandbag barrier','tactical cover'],
 ['rack','Pallet storage rack','warehouse storage'],
 ['container','Corrugated shipping container','20-foot outdoor storage'],
 ['hvac','Outdoor HVAC condenser','mechanical rooftop'],
 ['generator','Enclosed utility generator','industrial power'],
 ['reel','Cable reel','logistics'],
 ['bollard','Safety bollard','industrial marker'],
 ['jerrycan','Service jerrycan','pickup-ready container'],
 ['worktable','Industrial work table','laboratory / workshop']
]);
const PAL={steel:0x56646a,dark:0x26343b,teal:0x165b63,wood:0x8c6f4b,
 concrete:0x858984,orange:0xdc612b,ivory:0xb4b7af,rubber:0x1a242a};
export function createPrefab(THREE,id,{detail=1}={}){
 if(!THREE?.Mesh||!THREE?.Group)throw new TypeError('THREE namespace required');
 if(!PROP_CATALOG.some(x=>x[0]===id))throw new RangeError('Unknown prefab: '+id);
 const lod=detail<=0?0:detail>=2?2:1;
 const group=new THREE.Group();group.name='RiposteReuse_'+id;
 const materials=new Map(),geometry=[];
 const material=k=>{if(!materials.has(k))materials.set(k,new THREE.MeshStandardMaterial({
  color:PAL[k],roughness:k==='steel'?.42:.76,metalness:k==='steel'?.7:k==='dark'?.45:0}));
  return materials.get(k);
 };
 const add=(name,geo,mat,pos=[0,0,0])=>{const o=new THREE.Mesh(geo,material(mat));
  o.name=name;o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;
  group.add(o);geometry.push(geo);return o;
 };
 const box=(n,s,p,m='steel')=>add(n,new THREE.BoxGeometry(...s),m,p);
 const cylinder=(n,r,h,p,m='steel',segments=(lod===0?20:lod===1?12:8))=>
  add(n,new THREE.CylinderGeometry(r,r,h,segments),m,p);
 const tube=(n,major,minor,p,m='rubber')=>
  add(n,new THREE.TorusGeometry(major,minor,lod===0?8:5,lod===0?24:12),m,p);
 let collision={center:[0,.5,0],size:[1,1,1]};
 switch(id){
 case 'pallet':
  for(const x of [-.47,0,.47])box('stringer',[.10,.10,.78],[x,.09,0],'dark');
  for(const z of [-.33,-.165,0,.165,.33])box('deck-board',[1.2,.028,.118],[0,.16,z],'wood');
  for(const z of [-.32,.32])for(const x of [-.47,0,.47])box('block',[.1,.10,.13],[x,.045,z],'wood');
  collision={center:[0,.1,0],size:[1.2,.2,.8]};break;
 case 'barrel':
  cylinder('drum',.285,.82,[0,.43,0],'teal');
  for(const y of [.07,.26,.60,.82])cylinder('rib',.295,.034,[0,y,0],'steel',lod===0?24:12);
  cylinder('top',.278,.014,[0,.843,0],'dark');
  if(lod<2)cylinder('cap',.037,.018,[.12,.857,.08],'steel',10);
  collision={center:[0,.43,0],size:[.6,.86,.6]};break;
 case 'jersey':{
  const profile=[[-.24,0],[.24,0],[.24,.09],[.16,.20],[.12,.48],[.12,.78],[-.12,.78],[-.12,.48],[-.16,.20],[-.24,.09]];
  const shape=new THREE.Shape();profile.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:2,steps:1,bevelEnabled:false});
  g.rotateY(Math.PI/2);g.translate(-1,0,0);add('barrier',g,'concrete');
  box('reflector',[1.78,.04,.015],[0,.60,-.139],'orange');
  collision={center:[0,.39,0],size:[2,.78,.48]};break;
 }
 case 'sandbags':
  for(let i=0;i<(lod===2?2:3);i++)for(let j=0;j<4-(i%2);j++){
    const g=new THREE.SphereGeometry(1,lod===0?12:8,lod===0?8:5);g.scale(.27,.11,.2);
    add('sandbag',g,'wood',[-.85+j*.53+(i%2)*.25,.11+i*.19,0]);
  }
  collision={center:[0,.30,0],size:[2,.61,.4]};break;
 case 'rack':
  for(const x of [-1.3,1.3])for(const z of [-.5,.5])box('upright',[.075,2.8,.075],[x,1.4,z],'teal');
  for(const y of [.53,1.42,2.30]){
    for(const z of [-.52,.52])box('beam',[2.66,.09,.08],[0,y,z],'orange');
    if(lod<2)for(const x of [-.78,0,.78])box('strut',[.06,.04,1.03],[x,y,0],'dark');
  }
  collision={center:[0,1.4,0],size:[2.7,2.8,1.1]};break;
 case 'container':{
  box('container-shell',[2.44,2.6,6.06],[0,1.3,0],'teal');
  const ribCount=lod===0?18:lod===1?11:6;
  for(const side of [-1,1])for(let i=0;i<ribCount;i++)
    box('corrugation',[.038,2.34,.055],[side*1.235,1.30,-2.83+i*5.66/(ribCount-1)],'dark');
  for(const x of [-1.18,1.18])for(const y of [.11,2.48])
    box('corner-rail',[.08,.08,6.1],[x,y,0],'steel');
  for(const x of [-.88,.88])box('door-lock',[.045,2.2,.045],[x,1.29,3.052],'steel');
  collision={center:[0,1.3,0],size:[2.44,2.6,6.06]};break;
 }
 case 'hvac':{
  box('housing',[1.22,.70,.54],[0,.39,0],'ivory');
  box('roof',[1.26,.035,.58],[0,.75,0],'steel');
  const n=lod===0?11:lod===1?7:4;
  for(let i=0;i<n;i++)box('fin',[.03,.49,.016],[-.53+i*1.06/(n-1),.42,.28],'dark');
  tube('fan-guard',.20,.012,[0,.42,.294],'steel');
  if(lod<2)for(let a=0;a<4;a++){
    const b=box('fan-blade',[.055,.18,.012],[Math.sin(a*Math.PI/2)*.10,.42+Math.cos(a*Math.PI/2)*.10,.306],'dark');
    b.rotation.z=a*Math.PI/2;
  }
  collision={center:[0,.4,0],size:[1.26,.75,.58]};break;
 }
 case 'generator':{
  box('chassis',[1.45,.12,.73],[0,.10,0],'dark');
  box('housing',[1.34,.76,.70],[0,.55,0],'teal');
  box('door',[.78,.56,.015],[.08,.55,-.36],'steel');
  const n=lod===0?9:lod===1?5:3;
  for(let i=0;i<n;i++)box('radiator',[.045,.52,.02],[-.6+i*.32/(n-1),.54,.365],'dark');
  for(const x of [-.55,.55])box('skid',[.22,.08,.9],[x,.04,0],'dark');
  cylinder('exhaust',.1,.16,[.48,1.01,-.18],'steel',10);
  collision={center:[0,.51,0],size:[1.5,1.03,.9]};break;
 }
 case 'reel':{
  const core=cylinder('core',.22,.73,[0,.46,0],'wood');core.rotation.z=Math.PI/2;
  for(const x of [-.43,.43]){
    const disc=cylinder('disc',.55,.055,[x,.46,0],'wood',lod===0?24:12);disc.rotation.z=Math.PI/2;
  }
  if(lod<2)for(let i=0;i<5;i++){const t=tube('cable',.245+i*.016,.014,[0,.46,0],'dark');t.rotation.y=Math.PI/2;}
  collision={center:[0,.55,0],size:[.95,1.1,1.1]};break;
 }
 case 'bollard':
  cylinder('post',.08,.9,[0,.46,0],'teal',lod===0?20:8);
  cylinder('base',.17,.045,[0,.02,0],'dark',lod===0?20:8);
  cylinder('alert',.085,.09,[0,.76,0],'orange',lod===0?20:8);
  collision={center:[0,.45,0],size:[.34,.9,.34]};break;
 case 'jerrycan':
  box('can',[.4,.48,.17],[0,.30,0],'teal');
  cylinder('spout',.048,.12,[.13,.56,0],'steel',10);
  if(lod<2){box('handle',[.20,.04,.05],[0,.565,0],'dark');
   for(const x of [-.09,.09])box('handle-post',[.035,.10,.04],[x,.515,0],'dark');}
  collision={center:[0,.3,0],size:[.4,.6,.17]};break;
 case 'worktable':
  box('top',[1.8,.06,.86],[0,.78,0],'ivory');
  for(const x of [-.82,.82])for(const z of [-.36,.36])
    box('leg',[.055,.75,.055],[x,.385,z],'dark');
  for(const z of [-.36,.36])box('brace',[1.64,.035,.035],[0,.20,z],'teal');
  if(lod<2)box('side-rail',[1.65,.045,.035],[0,.67,.38],'steel');
  collision={center:[0,.40,0],size:[1.8,.82,.86]};break;
 }
 group.userData={kind:'riposte-reuse-prefab',id,detail:lod,colliders:[{type:'box',...collision}],
  provenance:'Original adaptation; Riposte MIT concepts credited in upstream/LICENSE'};
 let released=false;
 function dispose(){if(released)return;released=true;group.removeFromParent();geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
 return {group,dispose,colliders:group.userData.colliders};
}
