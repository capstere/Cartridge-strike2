import {AUTHORING_LIMITS} from '../project-limits.mjs?v=5.7.3';
/** Portable, editor-only wall-mounted value-word posters. Never changes game collisions. */
export const POSTER_MAX=AUTHORING_LIMITS.posters;
export const POSTER_IMAGE_MAX=100000; // base64 data payload characters, ~75 KB compressed
export const POSTER_COLORS=Object.freeze(['navy','white','blue','orange']);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const round=n=>Math.round(n*1000)/1000;
const wallLike=e=>e&&!e.deleted&&['wall','glazed','window'].includes(e.kind);
export const posterId=(existing)=>{
 const taken=new Set(existing.map(e=>e.id));let n=1;
 while(taken.has('BYGG-P-'+String(n).padStart(4,'0'))&&n<=POSTER_MAX+1000)n++;
 return 'BYGG-P-'+String(n).padStart(4,'0');
};
export function locatePoster(poster,walls){
 const wall=walls.find(w=>w.id===poster.wallId&&wallLike(w));
 if(!wall)return null;
 const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],length=Math.hypot(dx,dz);
 if(length<.3)return null;
 const ang=-Math.atan2(dz,dx),nx=-dz/length,nz=dx/length,side=poster.side===-1?-1:1;
 return {x:wall.a[0]+dx*poster.t+nx*side*(Math.max(wall.thickness||.09,.025)/2+.015),
  z:wall.a[1]+dz*poster.t+nz*side*(Math.max(wall.thickness||.09,.025)/2+.015),
  y:poster.y,angle:ang+(side===-1?Math.PI:0),length,wall};
}
export function validatePoster(p,walls){
 if(!p||typeof p!=='object'||!/^BYGG-P-\d{1,5}$/.test(p.id))throw Error('Ogiltigt affisch-ID.');
 if(typeof p.wallId!=='string'||p.wallId.length>100)throw Error('Affischen saknar giltig vägg.');
 if(!finite(p.t)||p.t<0||p.t>1||!finite(p.y)||p.y<.3||p.y>5.9||
    !finite(p.width)||p.width<.2||p.width>2.5||!finite(p.height)||p.height<.2||p.height>3||
    (p.side!==1&&p.side!==-1))throw Error('Affischens mått eller placering är ogiltiga.');
 if(typeof p.text!=='string'||p.text.length>140||typeof p.subtitle!=='string'||p.subtitle.length>140||
    !POSTER_COLORS.includes(p.color))throw Error('Affischens text eller färg är ogiltig.');
 if(p.image!==undefined&&p.image!==''&&(
   typeof p.image!=='string'||p.image.length>POSTER_IMAGE_MAX||
   !/^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(p.image)
 ))throw Error('Affischbilden måste vara en säker komprimerad PNG/JPG/WebP (högst cirka 75 kB).');
 const place=locatePoster(p,walls);
 if(!place)throw Error('Affischens vägg finns inte eller är borttagen.');
 if(p.width>place.length-.08)throw Error('Affischen är bredare än väggens fria längd.');
 if(p.t*place.length<p.width/2+.03||(1-p.t)*place.length<p.width/2+.03)
  throw Error('Flytta affischen lite längre från vägghörnet.');
 if(p.y-p.height/2<.1||p.y+p.height/2>place.wall.height-.04)
  throw Error('Affischen måste få plats mellan golv och väggens överkant.');
 return p;
}
export function makePoster(wall,existing,t=.5,side=1,options={}){
 if(!wallLike(wall))throw Error('Välj en vägg, inte en dörr eller öppning.');
 const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
 if(length<.36)throw Error('Väggen är för kort för en affisch.');
 const width=round(Math.min(.75,length-.12));
 const height=round(Math.min(1.05,(wall.height||2.4)-.2));
 if(width<.2||height<.2)throw Error('Väggen har inte plats för en affisch.');
 const safeT=clamp(t,(width/2+.04)/length,1-(width/2+.04)/length);
 const p={id:posterId(existing),wallId:wall.id,t:round(safeT),y:round(Math.min(wall.height-height/2-.05,1.55)),
  side:side===-1?-1:1,width,height,text:'VÅRA VÄRDEORD',subtitle:'Skriv ditt värdeord här',color:'navy',...options};
 validatePoster(p,[wall]);return p;
}
export function parsePosters(raw,walls){
 if(raw===undefined||raw===null)return [];
 if(!Array.isArray(raw)||raw.length>POSTER_MAX)throw Error(`Redigerarens resursgräns är ${POSTER_MAX} affischer. Spara en säkerhetskopia.`);
 const out=[],ids=new Set();
 for(const p of raw){validatePoster(p,walls);if(ids.has(p.id))throw Error('Dubbelt affisch-ID.');
  ids.add(p.id);out.push({...p});}
 return out;
}
export function serializePosters(posters){return posters.map(p=>({...p})).sort((a,b)=>a.id.localeCompare(b.id));}
