// Adapted from Riposte's 06p-accessoires attachAll/ATT_BUILD.
// Copyright (c) 2026 BenDBSS. See licenses/riposte-MIT.txt.
// Mounts are in the authored Cartridge Strike model frame. They never affect hitboxes.
import * as T from '../../vendor/three/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {weaponFits, CAMOS} from './arsenal.mjs';
import {acquireFinish,releaseFinish} from './weapon-camo.mjs';

const installed = new WeakMap();
const EMPTY = Object.freeze([]);
const styles = {
  dark:[0x273039,.55,.54], edge:[0x596069,.44,.69], grip:[0x182027,.8,.1],
  tag:[0xbd8b52,.6,.2], glass:[0x5aa9b1,.18,.20], dot:[0xff5b39,0,0]
};
let palette, holders=0;
function acquireMaterials() {
  if (!palette) {
    palette={};
    for (const [name,[color,roughness,metalness]] of Object.entries(styles)) {
      const mat=name==='dot'?new T.MeshBasicMaterial({color}):new T.MeshStandardMaterial({color,roughness,metalness});
      if (name==='glass') {mat.transparent=true;mat.opacity=.16;mat.depthWrite=false;mat.side=T.DoubleSide;}
      mat.name='arsenal-'+name;palette[name]=mat;
    }
  }
  holders++;
}
function releaseMaterials(){
  if (--holders===0) {for (const mat of Object.values(palette))mat.dispose();palette=null;}
}
// Merge each rigid fitting into up to one draw per finish. Animated parts such
// as slides and magazines retain their original parent and timing.
function meshBuilder(parent,name,state) {
  const group=new T.Group(), parts=new Map();
  group.name='fitting-'+name;parent.add(group);state.groups.push(group);
  function part(geometry,finish,x,y,z) {
    geometry.translate(x,y,z);
    const g=geometry.index?geometry.toNonIndexed():geometry;
    if (g!==geometry) geometry.dispose();
    if (!parts.has(finish)) parts.set(finish,[]);
    parts.get(finish).push(g);
  }
  return {
    group,
    box(x,y,z,w,h,d,finish='dark',angle=0) {part(new T.BoxGeometry(w,h,d).rotateX(angle),finish,x,y,z);},
    tube(x,y,z,r,len,finish='edge',open=false) {
      part(new T.CylinderGeometry(r,r,len,16,1,open).rotateX(Math.PI/2),finish,x,y,z);
    },
    ring(x,y,z,outer,inner,finish='dark') {
      part(new T.TorusGeometry((outer+inner)/2,(outer-inner)/2,6,20),finish,x,y,z);
    },
    finish() {
      for(const [name,geometries] of parts) {
        const merged=mergeGeometries(geometries,false);
        for(const geo of geometries)geo.dispose();
        const m=new T.Mesh(merged,palette[name]);m.receiveShadow=true;
        if (name==='glass')m.renderOrder=3;
        group.add(m);state.geometry.push(merged);
      }
    }
  };
}
function installOptic(c,id) {
  const pistol=c.pistol, d=c.model.userData;
  const parent=pistol?d.slide:d.weapon;
  const b=meshBuilder(parent,id,c);
  const highRail=(c.id==='cr4'&&!d.heroKit)||c.id==='smg';
  const y0=pistol?(d.heroKit ? .082 : .076):(highRail ? .119 : .092);
  const z=pistol?-.022:-.117;
  const radius=pistol?.015:id==='acog'?.033:id==='holo'?.032:.026;
  const y=y0+radius+.019, depth=id==='acog'?.11:id==='holo'?.041:.016;
  b.box(0,y0+.004,z,radius*1.85,.010,depth+.03,'edge');
  b.box(0,y0+.013,z,radius*1.3,.018,depth);
  if(id==='acog'){
    b.tube(0,y,z,radius,depth,'dark',true);
    for(const end of [-1,1]) b.ring(0,y,z+end*depth/2,radius*1.11,radius*.86,'edge');
    b.box(0,y+radius,z,.019,.013,.019,'edge');
    b.box(0,y-.002,z+depth*.46,.002,.008,.002,'dot');
  }else{
    for(const side of [-1,1])b.box(side*radius,y,z,.005,radius*2,depth,'dark');
    for(const side of [-1,1])b.box(0,y+side*radius,z,radius*2+.005,.005,depth,'dark');
    if(id==='holo')b.ring(0,y,z+.003,.0085,.007,'dot');
  }
  b.box(0,y,z,radius*1.85,radius*1.85,.001,'glass');
  b.box(0,y,z+depth*.49,.0025,.0025,.001,'dot');
  // The same centre used by the geometry is projected onto the view camera.
  d.opticSight=[y,z-depth/2,y,z+depth/2];b.finish();
}
function installMuzzle(c,id){
  const muzzle=c.model.userData.muzzle;
  const lengths={sil:c.pistol?.115:c.id==='sniper'?.21:.17,comp:.046,brake:.065,choke:.05,long:.14};
  const len=lengths[id],rad=c.pistol?.018:id==='long'?.016:.026;
  const b=meshBuilder(c.model.userData.weapon,id,c);
  b.tube(0,muzzle.y,muzzle.z-len*.5,rad,len,'dark',true);
  b.ring(0,muzzle.y,muzzle.z-len,rad,rad*.59,'edge');
  for(let i=1;i<4;i++) {
    const z=muzzle.z-len*i/4;
    if(id==='comp') b.box(0,muzzle.y+rad,z,rad*.72,.003,len*.09,'edge');
    else b.tube(0,muzzle.y,z,rad*1.05,.005,'edge',true);
  }
  muzzle.z-=len;b.finish();
}
// Existing receiver batches contain both the stock and barrel. Compress just
// their vertices beyond the mount. The template and other players stay intact.
function shorten(c,id){
  const receiver=c.model.userData.weapon.getObjectByName('receiver');
  const muzzle=c.model.userData.muzzle;
  const boundary=id==='nostock'?.078:muzzle.z+.16, factor=id==='nostock'?.14:.36;
  const remap=z=>(id==='nostock'?z>boundary:z<boundary)?boundary+(z-boundary)*factor:z;
  for(const m of receiver.children) {
    if(!m.isMesh)continue;
    const source=m.geometry;source.computeBoundingBox();
    if(id==='nostock'?source.boundingBox.max.z<=boundary:source.boundingBox.min.z>=boundary)continue;
    const g=source.clone(),p=g.attributes.position;
    for(let i=0;i<p.count;i++)p.setZ(i,remap(p.getZ(i)));
    g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();m.geometry=g;
    c.originalGeometry.push([m,source]);c.geometry.push(g);
  }
  if(id==='short')muzzle.z=remap(muzzle.z);
}
function installGrip(c,id){
  const d=c.model.userData, b=meshBuilder(d.weapon,id,c);
  const z=d.support.z, y=c.id==='cr4'&&d.heroKit?-.032:-.023;
  b.box(0,y,z,.042,.014,.065,'edge');
  if(id==='bipod'){
    for(const side of [-1,1])b.box(side*.018,y-.011,z-.064,.011,.015,.150,'dark');
  }else{
    const angle=id==='agrip'?-.54:0;
    b.box(0,y-.049,z+(angle?.016:0),.027,.084,.033,'grip',angle);
    d.support.set(-.017,y-.047,z+(angle?.016:0));
  }
  b.finish();
}
function installMagazine(c,id){
  const d=c.model.userData, tube=c.id==='shotgun';
  const parent=tube?d.weapon:d.magazine;
  if(!parent)return;
  const b=meshBuilder(parent,id,c);
  if(tube) {
    if(id==='xmag')b.tube(0,.003,-.761,.017,.12,'grip');
    else b.box(-.032,.006,-.13,.009,.024,.040,'tag');
  }else{
    // Compute bounds in magazine space even if already animated for a reload.
    const bounds=new T.Box3();
    for(const child of parent.children) if(child.isMesh) {
      child.geometry.computeBoundingBox();child.updateMatrix();
      bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrix));
    }
    if(!bounds.isEmpty()) {
      const size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
      if(id==='xmag')b.box(center.x,bounds.min.y-size.y*.15,center.z,size.x*.94,size.y*.32,size.z*.68,'grip');
      else {
        b.box(center.x,bounds.min.y-.009,center.z,size.x*.86,.018,size.z*.55,'tag');
        b.box(center.x,bounds.min.y-.023,center.z,size.x*.48,.016,size.z*.27,'grip');
      }
    }
  }
  b.finish();
}
function installOther(c,id) {
  const d=c.model.userData,b=meshBuilder(d.weapon,id,c);
  if(id==='laser'){
    const x=c.pistol?0:-.044,y=c.pistol?-.032:.030,z=c.pistol?-.137:d.support.z;
    b.box(x,y,z,.025,.023,.065);b.tube(x,y,z-.035,.006,.008,'dot');
    d.laserEmitter=new T.Vector3(x,y,z-.042);
  }else if(id==='hstock'){
    b.box(0,.038,.235,.080,.046,.165,'grip');b.box(0,-.056,.335,.078,.16,.025,'edge');
  }
  b.finish();
}
function mount(c,id) {
  if(['red','holo','acog'].includes(id))installOptic(c,id);
  else if(['sil','comp','brake','choke','long'].includes(id))installMuzzle(c,id);
  else if(id==='short'||id==='nostock')shorten(c,id);
  else if(['vgrip','agrip','bipod'].includes(id))installGrip(c,id);
  else if(['xmag','fmag'].includes(id))installMagazine(c,id);
  else if(id==='laser'||id==='hstock')installOther(c,id);
  // Slugs and hollow-points are internal ammunition choices.
}
export function releaseWeaponFittings(model){
  const state=installed.get(model);
  if(!state)return;
  const d=model.userData;
  for(const node of state.groups)node.removeFromParent();
  for(const [node,material] of state.paint)node.material=material;
  // Both length changes can affect the same receiver leaf. Unwind in reverse.
  for(const [node,geometry] of state.originalGeometry.reverse())node.geometry=geometry;
  for(const g of state.geometry)g.dispose();
  if(state.camo)releaseFinish(state.camo);
  if(state.attachments.length)releaseMaterials();
  d.muzzle.copy(state.muzzle);d.support.copy(state.support);
  delete d.opticSight;delete d.laserEmitter;delete d.arsenalEquipment;
  installed.delete(model);
}
export function syncWeaponFittings(model,item) {
  if (!model)return;
  const d=model.userData, fits=item?.id===d.id;
  const ids=fits&&Array.isArray(item.attachments)?item.attachments:EMPTY;
  const camo=fits&&Object.hasOwn(CAMOS,item.camo)?item.camo:null;
  const old=installed.get(model);
  if(!old&&!ids.length&&!camo)return;
  if(old&&old.camo===camo&&old.attachments.length===ids.length&&ids.every((id,i)=>id===old.attachments[i]))return;
  releaseWeaponFittings(model);
  if(!d.muzzle||!d.support)return;
  const attachments=ids.filter(id=>weaponFits(d.id,id)).slice(0,4);
  if(!attachments.length&&!camo)return;
  const state={id:d.id,model,pistol:d.id==='p9'||d.id==='p12',attachments,camo,geometry:[],originalGeometry:[],groups:[],paint:[],
    muzzle:d.muzzle.clone(),support:d.support.clone()};
  installed.set(model,state);
  d.arsenalEquipment={attachments:[...attachments],camo};
  if(camo){
    const finish=acquireFinish(camo);
    d.weapon.traverse(node=>{
      if(node.isMesh&&node.material.userData.camoPaint) {
        state.paint.push([node,node.material]);node.material=finish;
      }
    });
  }
  if(attachments.length){acquireMaterials();for(const id of attachments)mount(state,id);}
}
