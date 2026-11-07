/** Small reproducible CanvasTexture patterns shared by Designstudio and FPS.
 * UV coordinates represent model units in both renderers. No external downloads,
 * no source-model changes and no extra collision geometry.
 */
import * as T from '../../vendor/three/three.module.js';
import {PATTERN_SPECS,hasPattern} from './pattern-presets.mjs?v=5.6.1';
const patterns=new Map();
const S=256;
function canvasPattern(type){
 const c=document.createElement('canvas');c.width=c.height=S;
 const g=c.getContext('2d');
 const box=(x,y,w,h,base,shine)=>{g.fillStyle=base;g.fillRect(x,y,w,h);
  if(shine){g.fillStyle=shine;g.fillRect(x+4,y+4,Math.max(0,w-8),2);}};
 if(type==='dark-tile'){
  g.fillStyle='#121619';g.fillRect(0,0,S,S);
  const colors=['#2a3035','#252b30','#30363a','#272d32'];
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){
   box(x*64+3,y*64+3,58,58,colors[(x+2*y)%colors.length],'#383e42');
  }
 }else if(type==='dark-gloss-laminate'){
  g.fillStyle='#1e2428';g.fillRect(0,0,S,S);
  const colors=['#363c41','#3c4347','#41474b','#343b40'];
  for(let row=0;row<8;row++){
   const y=row*32,offset=[0,75,147,36][row%4];
   for(let x=-320+offset;x<400;x+=204){
    box(x+2,y+2,200,28,colors[row%colors.length],'#51575c');
    g.fillStyle='#464d50';g.fillRect(x+22,y+9,145,1);
    g.fillStyle='#30383b';g.fillRect(x+45,y+20,130,1);
   }
  }
 }else if(type==='dark-large-stone'){
  g.fillStyle='#b8bdbd';g.fillRect(0,0,S,S);
  const colors=['#43494b','#393f42','#484d50','#3c4346'];
  for(let row=-1;row<=2;row++)for(let col=-2;col<=2;col++){
   const x=col*S+(row%2?S/2:0),y=row*(S/2);
   box(x+4,y+4,S-8,S/2-8,colors[(Math.abs(row)+Math.abs(col))%colors.length],'#53595b');
  }
 }else if(type==='white-tile-gray-grout'){
  g.fillStyle='#969e9e';g.fillRect(0,0,S,S);
  const tiles=['#f4f5f3','#edeFED'.toLowerCase(),'#fafaf7','#f0f1ee'];
  for(let row=0;row<4;row++)for(let col=0;col<2;col++){
   box(col*128+3,row*64+3,122,58,tiles[(row+col)%4],'#ffffff');
  }
 }
 return c;
}
function texture(type){
 if(!patterns.has(type)){const t=new T.CanvasTexture(canvasPattern(type));
  t.userData.studioShared=true;t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;
  t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.LinearFilter;
  t.anisotropy=4;t.name='floor5-'+type;t.needsUpdate=true;patterns.set(type,t);}
 return patterns.get(type);
}
export function patternMaterial(type){
 if(!hasPattern(type))return null;
 const spec=PATTERN_SPECS[type];
 const material=new T.MeshStandardMaterial({
  map:texture(type),color:0xffffff,side:T.DoubleSide,roughness:spec.roughness,metalness:spec.metalness
 });
 material.userData.studioOwned=true;return material;
}

/** Tiny shared, deterministic maps: no concrete cracks or plank seams in lab/service vinyl.
 * Grain is confined to albedo +/- one code value and gloss; work surfaces stay clean.
 */
export function microFinishMaterial(type,color){
 const specs={'service-vinyl':['#4d5555',.58], 'lab-vinyl':['#c5cbc7',.62], 'cold-lab-vinyl':['#bdc9cb',.65]};
 if(type==='quiet-stone'){
  const key='quiet-stone';
  if(!patterns.has(key)){
   const c=canvasPattern('dark-large-stone'),g=c.getContext('2d');
   // Retain the existing tile layout, narrow the joint and reduce its contrast.
   g.fillStyle='#747c7d';g.fillRect(0,0,S,S);
   for(let row=-1;row<=2;row++)for(let col=-2;col<=2;col++){
    const x=col*S+(row%2?S/2:0),y=row*S/2;
    g.fillStyle=['#444b4e','#464d50','#42494c'][(Math.abs(row)+Math.abs(col))%3];g.fillRect(x+1,y+1,S-2,S/2-2);
   }
   const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.userData.studioShared=true;patterns.set(key,t);
  }
  const m=new T.MeshStandardMaterial({map:patterns.get(key),color:color||0xffffff,roughness:.70,side:T.DoubleSide});m.userData.studioOwned=true;return m;
 }
 const spec=specs[type];if(!spec)return null;
 if(!patterns.has('vinyl-grain')){
  for(const channel of ['grain','roughness']){
   const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),pixels=g.createImageData(128,128);let seed=7183;
   for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    // Broad, very faint polishing only changes roughness. No new decal geometry.
    const v=channel==='grain'?254+seed%2:Math.round(244+5*Math.sin(x/128*Math.PI*2)*Math.sin(y/128*Math.PI*2)+seed%4);
    const i=(y*128+x)*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;
   }
   g.putImageData(pixels,0,0);const t=new T.CanvasTexture(c);t.name='floor5-vinyl-'+channel;t.colorSpace=channel==='grain'?T.SRGBColorSpace:T.NoColorSpace;
   t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;t.userData.studioShared=true;patterns.set('vinyl-'+channel,t);
  }
 }
 const m=new T.MeshStandardMaterial({map:patterns.get('vinyl-grain'),roughnessMap:patterns.get('vinyl-roughness'),color:color||spec[0],roughness:spec[1],metalness:0,side:T.DoubleSide});
 m.userData.studioOwned=true;return m;
}
