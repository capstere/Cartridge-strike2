import {AUTHORING_LIMITS} from '../project-limits.mjs?v=5.7.3';
/** Editor-only curtains and blinds as lightweight wall-mounted architectural decorations. */
import {isWall} from './architecture.mjs?v=5.8.0';
import {projectToWall} from './paint-over-wall.mjs?v=5.8.0';
const R=n=>Math.round(n*1000)/1000;
export const TREATMENTS_MAX=AUTHORING_LIMITS.treatments;
export const TREATMENT_TYPES=Object.freeze(['curtain','blind']);
export const CURTAIN_STYLES=Object.freeze(['sheer','white-opaque','botanical-sheer']);
// Old curtains without a style stay sheer; newly placed curtains default to opaque white.
export function nextTreatmentId(list){let n=1;const used=new Set(list.map(x=>x.id));while(used.has('BYGG-T-'+String(n).padStart(4,'0')))n++;return 'BYGG-T-'+String(n).padStart(4,'0');}
export function treatmentPosition(item,entries){
 const wall=entries.find(x=>x.id===item.wallId&&!x.deleted&&isWall(x.kind));
 if(!wall)return null;
 const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],len=Math.hypot(dx,dz);
 if(len<.25)return null;
 const t=(item.t0+item.t1)/2,side=item.side===-1?-1:1,normal=[-dz/len,dx/len];
 return {wall,length:len,width:(item.t1-item.t0)*len,center:[wall.a[0]+dx*t+normal[0]*side*(wall.thickness/2+.035),
 wall.a[1]+dz*t+normal[1]*side*(wall.thickness/2+.035)],
 angle:-Math.atan2(dz,dx)+(side===-1?Math.PI:0)};
}
export function validateTreatment(item,entries){
 if(!item||typeof item!=='object'||!/^BYGG-T-\d{1,5}$/.test(item.id)||!TREATMENT_TYPES.includes(item.type))
  throw Error('Ogiltigt fönstertillbehör.');
 if(typeof item.wallId!=='string'||!Number.isFinite(item.t0)||!Number.isFinite(item.t1)||
  item.t0<0||item.t1>1||item.t1-item.t0<.01||(item.side!==1&&item.side!==-1))
  throw Error('Fäst gardin/persienn längs en giltig vägg.');
 const pos=treatmentPosition(item,entries);if(!pos)throw Error('Väggen för gardin/persienn finns inte.');
 if(pos.width<.24||pos.width>8)throw Error('Gardinen/persiennen måste vara 24 cm–8 m bred.');
 if(item.style!==undefined&&(item.type!=='curtain'||!CURTAIN_STYLES.includes(item.style)))throw Error('Okänd gardintyp.');
 if(item.type==='blind'&&!['window','glazed'].includes(pos.wall.kind))throw Error('Persienner kan bara fästas på fönster och glasväggar.');
 if(item.type==='curtain'&&pos.wall.height<1.8)throw Error('För låg vägg för tak-till-golv-gardin.');
 return item;
}
export function createCurtain(entries,list,wallId,start,end,{side=1,style='white-opaque'}={}){
 if(list.length>=TREATMENTS_MAX)throw Error(`Redigerarens resursgräns är ${TREATMENTS_MAX} gardiner/persienner. Spara en säkerhetskopia.`);
 const wall=entries.find(x=>x.id===wallId&&!x.deleted&&isWall(x.kind));
 if(!wall)throw Error('Börja på en vägg eller fönsterlinje.');
 const a=projectToWall(start,wall),b=projectToWall(end,wall);
 if(!a||!b||a.distance>.28||b.distance>.28)throw Error('Dra gardinen längs samma vägg.');
 const result={id:nextTreatmentId(list),type:'curtain',wallId,t0:R(Math.min(a.t,b.t)),t1:R(Math.max(a.t,b.t)),side,style};
 return validateTreatment(result,entries);
}
export function createBlind(entries,list,wallId,{side=1}={}){
 if(list.length>=TREATMENTS_MAX)throw Error(`Redigerarens resursgräns är ${TREATMENTS_MAX} gardiner/persienner. Spara en säkerhetskopia.`);
 const wall=entries.find(x=>x.id===wallId&&!x.deleted&&['window','glazed'].includes(x.kind));
 if(!wall)throw Error('Klicka på ett FÖNSTER eller en GLASVÄGG för att montera persiennen.');
 const p={id:nextTreatmentId(list),type:'blind',wallId,t0:.015,t1:.985,side};
 return validateTreatment(p,entries);
}
export function parseTreatments(input,entries){
 if(input==null)return [];
 if(!Array.isArray(input)||input.length>TREATMENTS_MAX)throw Error('Ogiltig eller för stor lista med gardiner/persienner.');
 const ids=new Set();
 return input.map(row=>{validateTreatment(row,entries);if(ids.has(row.id))throw Error('Dubbelt tillbehörs-ID.');ids.add(row.id);return {...row};});
}

/** 3D face normal wins. From above choose the only walkable room side.
 * Shared-glass walls between two rooms can be flipped explicitly in the editor.
 */
export function curtainSideForHit(wall,point,floors=[]){
 const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],len=Math.hypot(dx,dz);
 if(!(len>.001))return 1;
 const nx=-dz/len,nz=dx/len;
 const normal=point?.normal;
 if(normal&&Number.isFinite(normal.x)&&Number.isFinite(normal.z)&&Math.hypot(normal.x,normal.z)>.5)
  return normal.x*nx+normal.z*nz<0?-1:1;
 const signed=(point.x-wall.a[0])*nx+(point.z-wall.a[1])*nz;
 if(Math.abs(signed)>.015)return signed<0?-1:1;
 const t=Math.max(0,Math.min(1,((point.x-wall.a[0])*dx+(point.z-wall.a[1])*dz)/(len*len)));
 const cx=wall.a[0]+dx*t,cz=wall.a[1]+dz*t;
 const inside=(x,z)=>floors.some(f=>{const p=f.polygon||[[f.x0,f.z0],[f.x1,f.z0],[f.x1,f.z1],[f.x0,f.z1]];let yes=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;});
 const plus=inside(cx+nx*.3,cz+nz*.3),minus=inside(cx-nx*.3,cz-nz*.3);
 return plus!==minus?(plus?1:-1):1;
}
