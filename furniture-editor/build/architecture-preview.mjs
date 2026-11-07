import {preparedFloorFinish} from './floor5-appearance.mjs';
import {microFinishMaterial} from './pattern-materials.mjs?v=5.6.1';
/** Real source wall/window/frame geometry and door poses, without a second game loop. */
import {frostedDoorParts,frostedGlassMaterial,createWcDoorBadge} from '../../src/fps/frosted-door.mjs?v=5.4.0';
import * as T from '../../vendor/three/three.module.js';
import {sceneArchitectureData} from '../../src/fps/level-adapter.mjs?v=5.9.0';
import {createDoors} from '../../src/fps/doors.mjs?v=5.1.0';
import {paintDescription,surfaceColor} from './surface-style.mjs?v=5.8.0';
import {hasPattern} from './pattern-presets.mjs?v=5.6.1';
import {patternMaterial} from './pattern-materials.mjs?v=5.6.1';
import {applyMetreUV} from '../../src/fps/materials.mjs?v=5.5.0';
let officeCarpetWeave=null;
function officeWeave(){
 if(officeCarpetWeave||typeof document==='undefined')return officeCarpetWeave;
 const c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d');
 const pixels=ctx.createImageData(96,96);let seed=0x9c783fd;
 for(let y=0;y<96;y++)for(let x=0;x<96;x++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const grain=219+(seed%25)-12+((x+y)%3===0?3:0),p=(y*96+x)*4;
  pixels.data[p]=grain;pixels.data[p+1]=grain;pixels.data[p+2]=grain;pixels.data[p+3]=255;
 }
 ctx.putImageData(pixels,0,0);
 officeCarpetWeave=new T.CanvasTexture(c);officeCarpetWeave.name='office-carpet-weave';officeCarpetWeave.userData.studioShared=true;
 officeCarpetWeave.colorSpace=T.SRGBColorSpace;officeCarpetWeave.wrapS=officeCarpetWeave.wrapT=T.RepeatWrapping;
 officeCarpetWeave.repeat.set(1.5,1.5);
 return officeCarpetWeave;
}
export function architecturePreview(project,scene,{lowWalls=false,openDoors=false,selected=null}={}){
 const root=new T.Group();root.name='studio-architecture';
 const {zones,walls,doors}=sceneArchitectureData(project,scene);
 const data={__custom:true,rooms:zones,corridors:[],floorPolygons:[],walls,doors,obstacles:[],excludedRooms:[],targets:[],routes:[]};
 const desc=paintDescription(globalThis.SpelWorldForLevel(data).build({doors:Object.fromEntries(doors.map(d=>[d.id,true]))}),data);
 const wallMap=new Map(walls.map(w=>[w.id,w])),sources=[...walls.map(w=>[w.id,w.sourceId]),...doors.map(d=>[d.id,d.id])].sort((a,b)=>b[0].length-a[0].length);
 const rgb=c=>Array.isArray(c)?new T.Color().setRGB(...c,T.SRGBColorSpace):new T.Color(c??'#eeeeee');
 function mesh(record,id){
  let h=record.h,y=record.y;const wall=wallMap.get(record.id);
  if(lowWalls&&wall?.surfaceType==='opaque'){h=Math.min(.8,h);y=h/2;}
  const glass=['glass','frosted'].includes(record.material),tiled=!record.studioColor&&!glass&&hasPattern(record.studioPattern);
  const material=tiled?patternMaterial(record.studioPattern):record.material==='door-frosted'?frostedGlassMaterial():new T.MeshStandardMaterial({color:record.material==='blue-graphic'?0x7c959d:record.studioColor||rgb(record.color),roughness:record.material==='metal'?(record.studioColor ? .57 : .40):.8,metalness:record.material==='metal'&&!record.studioColor ? .85 : 0,transparent:glass,opacity:glass?.28:1,depthWrite:!glass,side:T.DoubleSide});material.userData.studioOwned=true;
  const geometry=new T.BoxGeometry(record.w,h,record.d);if(tiled)applyMetreUV(geometry);
  const node=new T.Mesh(geometry,material);node.position.set(record.x,y,record.z);node.rotation.y=record.angle||0;node.userData.editId=id;node.userData.architecturePart=record.id;root.add(node);
  if(id===selected){const line=new T.LineSegments(new T.EdgesGeometry(node.geometry),new T.LineBasicMaterial({color:0xf5a735}));line.material.userData.studioOwned=true;line.position.copy(node.position);line.rotation.copy(node.rotation);root.add(line);}
 }
 for(const b of desc.boxes){const source=sources.find(([key])=>b.id===key||b.id.startsWith(key+'-'));if(source)mesh(b,source[1]);}
 const system=createDoors(data,{staticCanOccupy:()=>true});
 for(const door of system.doors){system.pose(door,openDoors&&door.id===selected?Math.PI/3:0);for(const leaf of door.leaves){
  const b=leaf.box,color=door.studioColor||(door.doorStyle==='frosted'?'#87989e':door.doorStyle==='wc'?'#f3f3ef':door.doorStyle==='office'?'#817c78':'#c4c3af');
  if(door.doorStyle==='frosted'){
   for(const p of frostedDoorParts(leaf.w)){const c=Math.cos(b.angle),s=Math.sin(b.angle);mesh({...p,id:b.id+'-'+p.part,x:leaf.x+c*p.x+s*p.z,z:leaf.z-s*p.x+c*p.z,angle:b.angle,color:p.part==='handle'?'#87989e':color,material:p.part==='glass'?'door-frosted':'metal'},door.id);}continue;
  }
  mesh({...b,color},door.id);
  if(door.doorStyle==='wc'){
   const badge=createWcDoorBadge(leaf.w);badge.group.position.set(leaf.x,0,leaf.z);badge.group.rotation.y=b.angle;
   for(const disc of badge.group.children){disc.userData.editId=door.id;disc.userData.architecturePart=door.id+'-WC-sign';}
   root.add(badge.group);
  }
  // Handles, kickplate and panel follow the same hinge pose; no gameplay state is changed.
  const c=Math.cos(b.angle),s=Math.sin(b.angle),local=(x,z)=>({x:b.x+c*x+s*z,z:b.z-s*x+c*z});
  for(const side of [-1,1]){const at=local(leaf.w*(door.doorStyle==='office'?.80:.30),side*.065);mesh({id:b.id+'-handle'+side,...at,y:1.05,w:Math.min(.17,leaf.w*.3),h:.035,d:.04,angle:b.angle,color:'#87989e',material:'metal'},door.id);const kick=local(0,side*.044);if(door.doorStyle!=='office')mesh({id:b.id+'-kick'+side,...kick,y:.27,w:leaf.w*.88,h:.33,d:.009,angle:b.angle,color:'#87989e',material:'metal'},door.id);}
 }}
 for(const source of scene.floors){const f={...source,surface:project.floorFinishes?.[source.id]||source.surface};const shape=new T.Shape(),points=f.polygon||[[f.x0,f.z0],[f.x1,f.z0],[f.x1,f.z1],[f.x0,f.z1]];points.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();const tiled=hasPattern(f.surface)&&!project.surfaceColors?.[f.id];
  const finish=preparedFloorFinish(project,f.id,f.surface);
  const material=finish?microFinishMaterial(finish,project.surfaceColors?.[f.id]):tiled?patternMaterial(f.surface):new T.MeshStandardMaterial({color:surfaceColor(project,f),roughness:f.surface==='vinyl'?.48:1,side:T.DoubleSide,...(f.surface==='office-carpet'&&officeWeave()?{map:officeWeave()}: {})});material.userData.studioOwned=true;const node=new T.Mesh(new T.ShapeGeometry(shape),material);node.rotation.x=Math.PI/2;node.position.y=-.025;node.userData.editId=f.id;node.userData.architecturePart='floor';root.add(node);}
 return root;
}
