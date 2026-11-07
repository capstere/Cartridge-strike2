/** Portable non-destructive per-rig sculpt data. Coordinates are bind-space metres. */
export const SCULPT_VERSION=1;
export const SCULPT_MAX_OFFSET=.06;
export function newSculpt(){return {version:SCULPT_VERSION,revision:0,models:{}};}
export function validateSculpt(s){
 if(!s||s.version!==1||!Number.isInteger(s.revision)||s.revision<0||s.revision>1e9||!s.models||typeof s.models!=='object'||Array.isArray(s.models))throw Error('Ogiltig skulptering.');
 if(Object.keys(s.models).some(k=>!['male','female','scan-male','scan-female','dwarf'].includes(k)))throw Error('Okänd skulpteringsrigg.');
 for(const model of Object.values(s.models)){
  if(!model||typeof model!=='object'||Array.isArray(model)||Object.keys(model).some(k=>!['face-skin','eyes','eyebrows'].includes(k)))throw Error('Okänd ansiktsyta.');
  for(const mesh of Object.values(model)){
   if(!mesh||!Number.isInteger(mesh.count)||mesh.count<1||mesh.count>50000||typeof mesh.topology!=='string'||!/^s1-[0-9a-f]{8}$/.test(mesh.topology))throw Error('Skulpteringens modellreferens är ogiltig.');
   for(const [key,stride]of [['deltas',4],['paint',5]]){
    const a=mesh[key];if(!Array.isArray(a)||a.length%stride||a.length>mesh.count*stride)throw Error('Skadade ansiktsdata.');const seen=new Set();
    for(let i=0;i<a.length;i+=stride){const id=a[i];if(!Number.isInteger(id)||id<0||id>=mesh.count||seen.has(id))throw Error('Ogiltig skulpteringspunkt.');seen.add(id);
     if(key==='deltas'){if(a.slice(i+1,i+4).some(v=>!Number.isFinite(v))||Math.hypot(...a.slice(i+1,i+4))>SCULPT_MAX_OFFSET+.000001)throw Error('Ansiktsändringen är för stor.');}
     else if(a.slice(i+1,i+5).some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Ogiltig målad färg.');
    }
   }
  }
 }
 return s;
}
export function brushWeight(distance,radius){if(distance>=radius||radius<=0)return 0;const t=1-distance/radius;return t*t*(3-2*t);}
