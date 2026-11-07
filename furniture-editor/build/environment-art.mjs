import * as T from '../../vendor/three/three.module.js';
import {FIXTURES} from './environment-layout.mjs';

export function decorRandom(seed){
 let state=seed>>>0;
 return ()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
}
const line=(ctx,pts,color,width=2)=>{
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
 pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
};
function label(c,value,x,y,size,color='#243c46',weight='600',width=244){
 c.fillStyle=color;c.font=weight+' '+size+'px Arial, sans-serif';c.fillText(value,x,y,width);
}
function paper(c,w,h,color){c.fillStyle=color;c.fillRect(0,0,w,h);}
function arrow(c,x,y,sign){
 const slope=sign*17;line(c,[[x-slope,y],[x+slope,y]],'white',6);
 line(c,[[x,y-14],[x+slope,y],[x,y+14]],'white',6);
}
function runningExit(c,w,h,record){
 paper(c,w,h,'#14724b');c.strokeStyle='#e3f5e4';c.lineWidth=1.5;c.strokeRect(3,3,w-6,h-6);
 const k=h/82;c.save();c.scale(k,k);c.fillStyle='#f4fff1';c.fillRect(13,13,5,57);c.fillRect(13,13,28,5);
 c.beginPath();c.arc(47,24,5,0,Math.PI*2);c.fill();line(c,[[36,37],[43,31],[53,39],[62,39]],'white',4);
 line(c,[[43,33],[37,45],[48,52],[55,63]],'white',6);line(c,[[38,44],[29,58],[19,61]],'white',5);c.restore();
 label(c,'UTGÅNG',81,h*.43,15,'#d4f1de');label(c,record.title,81,h*.72,22,'white','700',104);
 arrow(c,222,h*.51,record.arrow==='right'?1:-1);
}
function board(c,w,h,art){
 paper(c,w,h,'#eff3e9');const ink='#35596d',red='#b65c4b',green='#53856f';
 const title={coffee:'Kaffe per möte',formula:'Hypotes 07',trend:'Prognosgruppen',botany:'Herbarium 05',orbit:'Projekt Komet',memo:'Internpost'}[art]||'Veckans försök';
 label(c,title,12,25,19,ink,'italic 600');line(c,[[13,30],[132,28]],green,2);
 if(art==='formula'){
  label(c,'Δt = (fika)² / möten',17,54,17,ink,'italic');label(c,'n = 1 kopp',25,78,14,green);
  line(c,[[151,96],[165,65],[170,60],[170,47],[184,47],[184,61],[204,97],[151,97]],ink,2);
  line(c,[[160,82],[173,78],[192,83]],green,3);label(c,'omtest på måndag',18,h-11,12,red,'italic');
 }else{
  for(let i=0;i<4;i++)line(c,[[23,45+i*14],[155,45+i*14]],'#cbd8cf',1);
  line(c,[[24,40],[24,98],[159,98]],ink);
  const path=art==='trend'?[[25,93],[47,80],[65,84],[88,60],[104,76],[124,45],[149,35]]:[[25,89],[48,85],[67,69],[91,75],[112,55],[134,63],[151,43]];
  line(c,path,green,3);label(c,'må      ti      on      to      fr',23,112,9,ink);
  c.fillStyle='#f0da90';c.fillRect(168,43,72,48);label(c,art==='coffee'?'+ 3 koppar':'Se bilaga',174,63,12,ink);label(c,'11:05',178,81,13,red);
  label(c,art==='coffee'?'Kontrollgrupp: te':'Felstapel i nästa version',12,h-9,11,ink,'italic');
 }
}
function screen(c,w,h,art){
 const bg='#132733',cyan='#81c5c4',warm='#dec388';paper(c,w,h,bg);
 if(art==='bars'){
  const colors=['#bdc4bb','#c2b477','#74a9ab','#7aa581','#aa84a3','#ad807a','#687eaa'];
  colors.forEach((color,i)=>{c.fillStyle=color;c.fillRect(i*w/7,h*.20,w/7+1,h*.53);});
  label(c,'BILDKONTROLL   05',10,h*.15,12,'#c8dbd4');label(c,'SIGNAL / REFERENS',10,h*.91,11,'#c4d2d7');return;
 }
 if(art==='standby'){
  line(c,[[20,h*.31],[w-20,h*.31]],'#35525c',1);label(c,'NO SIGNAL',40,h*.56,29,'#b9ccd0','500');
  label(c,'INPUT 02     •     VILOLÄGE',49,h*.78,11,'#88a4a8');return;
 }
 label(c,art==='instrument'?'ANALYS  /  KANAL B':'UNIT 05 / STATUS',11,20,13,cyan);
 for(let i=0;i<5;i++)line(c,[[12,36+i*15],[166,36+i*15]],'#28444d',1);
 const pts=Array.from({length:28},(_,i)=>[12+i*5.5,70-13*Math.sin(i*.52)-(i%9===4?16:0)]);
 line(c,pts,cyan,2);label(c,art==='instrument'?'pH 7,2':'98,4 %',177,59,17,warm);
 label(c,'STABIL',179,78,10,cyan);label(c,'SYS 05  ·  LOKAL VISNING',12,h-12,10,'#a3b8be');
}
function artwork(c,w,h,r){
 const red='#b7423b',green='#207c64',ink='#263e48';
 if(r.kind==='display'){if(['coffee','formula','trend','orbit'].includes(r.art))board(c,w,h,r.art);else screen(c,w,h,r.art);return;}
 if(r.kind==='exit'){runningExit(c,w,h,r);return;}
 if(r.kind==='board'){board(c,w,h,r.art);return;}
 if(r.kind==='room'||r.kind==='wayfinding'){
  paper(c,w,h,'#254750');c.fillStyle='#caaa6c';c.fillRect(0,0,7,h);
  label(c,r.title,18,h*.52,Math.min(31,h*.36),'#f6f0df','700',224);
  label(c,r.subtitle,18,h*.80,Math.min(16,h*.20),'#c6d9d3','500',225);return;
 }
 if(r.kind==='print'){
  paper(c,w,h,'#e6ddc9');const colors=['#264557','#c76b50','#739a90','#d5ac67'];
  if(r.art==='botany'){
   line(c,[[84,148],[124,100],[148,41]],colors[0],4);
   for(let i=0;i<4;i++){c.fillStyle=colors[i];c.beginPath();c.ellipse(97+i*15,119-i*21,26,10,i%2?-.72:.53,0,Math.PI*2);c.fill();}
  }else for(let i=0;i<4;i++){c.strokeStyle=colors[i];c.lineWidth=10;c.beginPath();c.ellipse(121,82,82-i*13,52-i*8,(i-1.5)*.42,0,Math.PI*1.8);c.stroke();}
  label(c,r.art==='botany'?'HERBARIUM / BLAD 05':'BANOR / STUDIE 05',17,h-16,12,ink);return;
 }
 if(r.kind==='notice'||r.kind==='rota'){
  paper(c,w,h,'#ece7d8');c.fillStyle='#497b82';c.fillRect(0,0,w,13);
  label(c,r.title||(r.art==='coffee'?'MEDDELANDE / REPRO':'FRÅN FIKARÅDET'),14,54,21,ink);
  const rows=r.kind==='rota'?['MÅN    TEAM A','TIS      TEAM B','ONS    TEAM C','TOR    TEAM D','FRE    TEAM E']:(r.art==='coffee'?['Skrivaren känner av','brådska. Andas ut.','Försök sedan igen.']:['Försvunnen tesked','Sågs senast vid','kaffemaskinen.','Hittelön: en påtår.']);
  rows.forEach((t,i)=>{const y=88+i*30;label(c,t,18,y,16,ink,'500');line(c,[[16,y+7],[234,y+7]],'#c3cac1',1);});
  c.fillStyle='#c47c62';c.fillRect(w-28,17,12,12);return;
 }
 if(r.kind==='clock'){
  const cx=w/2,cy=h/2,rad=Math.min(w,h)*.47;c.fillStyle='#eeeae0';c.beginPath();c.arc(cx,cy,rad,0,Math.PI*2);c.fill();
  for(let i=0;i<12;i++){const a=i*Math.PI/6;line(c,[[cx+Math.sin(a)*rad*.82,cy-Math.cos(a)*rad*.82],[cx+Math.sin(a)*rad*.94,cy-Math.cos(a)*rad*.94]],ink,3);}
  line(c,[[cx-rad*.40,cy-rad*.27],[cx,cy],[cx+rad*.63,cy-rad*.40]],ink,7);return;
 }
 if(r.kind==='extinguisher'){
  paper(c,w,h,red);c.fillStyle='white';c.fillRect(105,57,48,78);
  line(c,[[109,56],[108,40],[147,39],[161,53],[170,92]],'white',8);label(c,'SLÄCKARE',29,h-16,24,'white','700',202);return;
 }
 if(r.kind==='eyewash'||r.kind==='firstAid'||r.kind==='ppe'){
  paper(c,w,h,r.kind==='ppe'?'#325e82':green);
  if(r.kind==='firstAid'){c.fillStyle='white';c.fillRect(113,h*.16,30,h*.48);c.fillRect(88,h*.33,80,h*.16);}
  else if(r.kind==='eyewash'){
   line(c,[[56,h*.36],[84,h*.22],[128,h*.17],[171,h*.22],[200,h*.36],[166,h*.49],[128,h*.52],[89,h*.48],[56,h*.36]],'white',6);
   c.fillStyle='white';c.beginPath();c.arc(128,h*.35,14,0,7);c.fill();
   for(let i=0;i<3;i++)line(c,[[90+i*36,h*.66],[100+i*36,h*.55]],'white',4);
  }else{c.strokeStyle='white';c.lineWidth=7;c.strokeRect(50,h*.25,67,h*.32);c.strokeRect(139,h*.25,67,h*.32);line(c,[[117,h*.34],[139,h*.34]],'white',7);}
  label(c,{'eyewash':'ÖGONDUSCH','ppe':'SKYDDSGLAS','firstAid':'FÖRSTA HJÄLPEN'}[r.kind],18,h*.87,24,'white','700',220);return;
 }
 if(r.kind==='vent'){paper(c,w,h,'#9ba6a5');for(let i=0;i<6;i++)line(c,[[7,8+i*(h-12)/6],[248,8+i*(h-12)/6]],'#43565a',3);return;}
 if(r.kind==='callpoint'){paper(c,w,h,red);c.fillStyle='#eee5cd';c.fillRect(43,h*.34,170,h*.47);label(c,'BRANDLARM',21,h*.23,29,'white','700',214);line(c,[[90,h*.56],[168,h*.56]],red,8);return;}
 if(r.kind==='thermostat'){paper(c,w,h,'#d5d6c9');c.fillStyle='#536962';c.fillRect(24,22,208,h*.53);label(c,'21,0°',40,h*.52,44,'#e4ead6');return;}
 paper(c,w,h,'#d8dcca');label(c,r.title||'UNIT 05 / SERVICE',10,h*.64,Math.min(31,h*.42),ink,'700');
}

export function artKey(r){return JSON.stringify([r.kind,r.art,r.title,r.subtitle,r.arrow]);}
const texture=canvas=>{
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;return map;
};
function rect(x,y,w,h,width,height){return [(x+2)/width,1-(y+h-2)/height,(x+w-2)/width,1-(y+2)/height];}
export function makeArtAtlas(records){
 const unique=new Map(records.map(r=>[artKey(r),r])),tw=256,th=144,cols=Math.min(8,Math.max(1,unique.size));
 const canvas=document.createElement('canvas');canvas.width=cols*tw;canvas.height=Math.max(1,Math.ceil(unique.size/cols))*th;
 const c=canvas.getContext('2d'),tiles=new Map();let i=0;
 for(const [key,r] of unique){
  const x=i%cols*tw,y=Math.floor(i/cols)*th;
  const aspect=r.kind==='display'||r.kind==='extinguisher'?(r.kind==='display'?1.78:1.05):FIXTURES[r.kind][0]/FIXTURES[r.kind][1];
  const h=Math.min(355,256/aspect);c.save();c.translate(x,y);c.beginPath();c.rect(0,0,tw,th);c.clip();c.scale(tw/256,th/h);
  artwork(c,256,h,r);c.restore();tiles.set(key,rect(x,y,tw,th,canvas.width,canvas.height));i++;
 }
 return {map:texture(canvas),tiles};
}
export function makeSignalAtlas(seed){
 const width=128,height=72,frames=8,c=document.createElement('canvas');c.width=width*2;c.height=height*frames;
 const ctx=c.getContext('2d'),random=decorRandom(seed);for(let frame=0;frame<frames;frame++){
  const y=frame*height,img=ctx.createImageData(width,height);
  for(let n=0;n<img.data.length;n+=4){const level=57+Math.floor(random()*61);img.data.set([level,level+4,level+4,255],n);}
  ctx.putImageData(img,0,y);ctx.save();ctx.translate(width,y);ctx.scale(.5,.5);screen(ctx,256,144,'instrument');ctx.fillStyle='#6b9695';ctx.globalAlpha=.46;ctx.fillRect(13+(frame%3)*12,58+(frame%4)*5,150,3);ctx.restore();
 }
 return {map:texture(c),tiles:{snow:rect(0,0,width,height,c.width,c.height),glitch:rect(width,0,width,height,c.width,c.height)},frames};
}
