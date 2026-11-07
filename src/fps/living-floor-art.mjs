import {ROOM_NAMES} from './player-names.mjs';
/** Original fictional in-game graphics.
 * Poster layouts, dashboards, notes and labels below are fictional decoration.
 * No company credentials, internal production records or SOP instructions.
 */
import * as THREE from '../../vendor/three/three.module.js';
import { CORE_VALUES } from './living-floor-plan.mjs';
export const VALUE_TILES=Object.freeze([0,1,2,3,4,14]);
export const ART_TILES={values:0,board:5,bulletin:6,ppe:7,coffee:8,display:9,inventory:10,freightboard:11,art:12,mirror:15};
function wrap(c,text,x,y,width,size,lineHeight){c.font=`700 ${size}px Arial`;let row='',yy=y;for(const word of text.split(' ')){const next=row?row+' '+word:word;if(c.measureText(next).width>width&&row){c.fillText(row,x,yy);yy+=lineHeight;row=word;}else row=next;}if(row)c.fillText(row,x,yy);return yy;}
function texture(canvas){const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;}
export function createLivingArt(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;const c=canvas.getContext('2d');
 const accents=['#63d3cc','#7aa9ff','#e6bc74','#c899e5','#e6b457','#ee8f79'];
 for(let tile=0;tile<16;tile++){
  c.save();c.translate((tile%4)*512,Math.floor(tile/4)*512);c.beginPath();c.rect(0,0,512,512);c.clip();c.fillStyle='#f0eee6';c.fillRect(0,0,512,512);
  if(tile<5||tile===14){
   const valueIndex=tile===14?5:tile, bag=valueIndex>=4;
   const g=c.createLinearGradient(0,0,512,512);g.addColorStop(0,'#0d2647');g.addColorStop(1,'#123d55');c.fillStyle=g;c.fillRect(0,0,512,512);
   c.fillStyle=accents[valueIndex];c.fillRect(30,34,6,28);c.font='700 27px Arial';c.fillText(bag?'TEAM STATUS':'UNIT 05',52,59);c.font='13px Arial';c.fillStyle='#c2d4de';c.fillText(bag?'WORKPLACE HUMOUR / GAME EDITION':'FOLLOW THE SIGNAL.',34,104);
   c.fillStyle='#ffffff';wrap(c,CORE_VALUES[valueIndex],34,178,420,46,53);
   c.globalAlpha=.32;c.strokeStyle=accents[valueIndex];c.lineWidth=3;
   for(let i=0;i<7;i++){c.beginPath();c.arc(390,390,45+i*25,-Math.PI*.88,Math.PI*.68);c.stroke();}
   c.globalAlpha=1;c.fillStyle=accents[valueIndex];c.font='700 18px Arial';c.fillText('0'+(valueIndex+1),35,458);c.fillRect(80,445,210,2);c.font='11px Arial';c.fillStyle='#c2d4de';c.fillText(bag?'FICTIONAL GAME SIGN':'ORIGINAL GAME ART',34,486);
  }else if(tile===5||tile===11||tile===10){
   c.fillStyle='#193c4b';c.fillRect(0,0,512,85);c.fillStyle='#fff';c.font='700 26px Arial';c.fillText(tile===11?'TECHNICAL STORAGE':tile===10?'MATERIAL & FÖRVARING':'TEAM BOARD',24,40);c.font='13px Arial';c.fillText('DEMONSTRATION  ·  INGA VERKLIGA DRIFTDATA',24,66);
   for(let k=0;k<4;k++){c.fillStyle=['#578aaa','#77aa9d','#cfa76c','#aa94b5'][k];c.fillRect(20+k*121,106,111,37);c.fillStyle='#fff';c.font='bold 18px Arial';c.fillText(['A','B','C','D'][k],65+k*121,132);for(let j=0;j<3;j++){c.fillStyle=j===1?'#e9d993':'#dce6df';c.fillRect(24+k*121,162+j*93,103,72);c.fillStyle='#4c676d';for(let q=0;q<3;q++)c.fillRect(33+k*121,177+j*93+q*15,63+q*5,3);}}
   c.fillStyle='#4d6970';c.font='16px Arial';c.fillText(tile===11?'SUPPLIES  •  COLLECTION':'Planera  ·  Utför  ·  Följ upp',24,478);
  }else if(tile===6){
   c.fillStyle='#b9986c';c.fillRect(0,0,512,512);c.fillStyle='#183f52';c.fillRect(0,0,512,62);c.fillStyle='#fff';c.font='700 25px Arial';c.fillText('UNIT 05 / NOTICE BOARD',23,40);
   for(let k=0;k<6;k++){const x=22+(k%3)*164,y=90+Math.floor(k/3)*194;c.save();c.translate(x+70,y+80);c.rotate((k%3-1)*.035);c.fillStyle=['#faf8ef','#c8d7d0','#ecd9a6'][k%3];c.shadowColor='#594b3e';c.shadowBlur=5;c.fillRect(-65,-74,135,163);c.shadowBlur=0;c.fillStyle='#ad6050';c.beginPath();c.arc(1,-62,5,0,Math.PI*2);c.fill();c.fillStyle='#294c57';c.font='700 13px Arial';c.fillText(['FIKA','QUALITY','TEAM','IDEAS','PLAN','NOTES'][k],-51,-40);for(let i=0;i<6;i++)c.fillRect(-51,-15+i*13,90-i%3*13,2);c.restore();}
  }else if(tile===7){
   c.fillStyle='#166979';c.fillRect(0,0,512,140);c.fillStyle='#fff';c.font='700 42px Arial';c.fillText('LABOMRÅDE',26,67);c.font='20px Arial';c.fillText('NORTH / ANALYSIS / ISOLATION',26,107);
   for(let k=0;k<3;k++){const x=92+k*163;c.strokeStyle='#166979';c.lineWidth=6;c.beginPath();c.arc(x,233,48,0,Math.PI*2);c.stroke();c.fillStyle='#166979';c.font='bold 34px Arial';c.fillText(['01','02','03'][k],x-20,244);}
   c.fillStyle='#254855';c.font='22px Arial';c.fillText('Utrustning • Material • Arbetsyta',28,348);c.font='15px Arial';c.fillText('SIMULERAD MILJÖ',28,422);c.fillText('Inte en arbets- eller skyddsinstruktion.',28,451);
  }else if(tile===8){
   c.fillStyle='#274f4b';c.fillRect(0,0,512,512);c.strokeStyle='#e2bf82';c.lineWidth=8;c.beginPath();c.arc(260,285,91,0,Math.PI);c.lineTo(169,195);c.lineTo(351,195);c.closePath();c.stroke();c.beginPath();c.arc(365,244,39,-Math.PI*.5,Math.PI*.5);c.stroke();c.fillStyle='#f4e9d3';c.font='700 65px Arial';c.fillText('FIKA',34,105);c.font='25px Arial';c.fillText('En paus. En kopp. Ett samtal.',34,420);c.fillStyle='#e2bf82';c.fillRect(34,452,320,3);
  }else if(tile===9){
   c.fillStyle='#112630';c.fillRect(0,0,512,512);c.fillStyle='#8ce2c8';c.font='700 37px Arial';c.fillText('UNIT 05',25,58);c.fillStyle='#bfd2d9';c.font='18px Arial';c.fillText('WORKSPACE  /  DEMO',25,94);
   for(let k=0;k<4;k++){c.fillStyle='#294753';c.fillRect(25,128+k*81,462,60);c.fillStyle=accents[k];c.fillRect(25,128+k*81,5,60);c.font='23px Arial';c.fillText(['Orientering','Material','Team','Övningsmiljö'][k],49,166+k*81);}
  }else if(tile===15){
   const g=c.createLinearGradient(0,0,512,512);g.addColorStop(0,'#7c999f');g.addColorStop(.5,'#c8d7d8');g.addColorStop(1,'#8ba1a5');c.fillStyle=g;c.fillRect(0,0,512,512);c.strokeStyle='#dce6e5';c.lineWidth=5;for(let k=0;k<5;k++){c.beginPath();c.moveTo(k*125,0);c.lineTo(512,k*125);c.stroke();}
  }else{
   c.fillStyle=['#d8e1d5','#d6dfe7','#e5dac9'][tile-12];c.fillRect(0,0,512,512);const cols=['#315b61','#789b95','#c2ad88'];
   for(let k=0;k<5;k++){c.fillStyle=cols[k%3];c.beginPath();c.moveTo(-10,180+k*80);for(let x=0;x<540;x+=16)c.lineTo(x,180+k*80+Math.sin(x*.009+k)*65);c.lineTo(530,530);c.lineTo(-10,530);c.fill();}c.fillStyle='#ede8d8';c.beginPath();c.arc(370,108,43,0,Math.PI*2);c.fill();
  }
  c.restore();
 }
 const atlas=texture(canvas);atlas.name='living-posters-original-art';
 const labelsCanvas=document.createElement('canvas');labelsCanvas.width=1024;labelsCanvas.height=1024;const l=labelsCanvas.getContext('2d');
 const names=['SAMPLE SUPPLIES','SAMPLE VESSELS','REKVISITION','MATERIAL','UPPHÄMTNING','DEMO / OFFLINE','CARGO LIFT','UNIT 05','FÖRRÅD','TEAM SPACE',ROOM_NAMES.I02,ROOM_NAMES.I01,ROOM_NAMES.I04,'FIKA','SERVICE','EL / TEKNIK'];
 names.forEach((name,k)=>{const x=k%4*256,y=Math.floor(k/4)*256;l.fillStyle='#eff0e9';l.fillRect(x,y,256,256);l.fillStyle=k===6?'#315b72':'#244e54';l.fillRect(x,y,256,40);l.fillStyle='#fff';l.font='bold 14px Arial';l.fillText('UNIT 05',x+14,y+27);l.fillStyle='#21414c';wrap(l,name,x+14,y+100,224,25,32);l.fillStyle='#263c40';for(let i=0;i<38;i++)l.fillRect(x+16+i*5,y+181,1+(i*7%3),36);l.font='12px Arial';l.fillText('SIMULERAT / DEKORATION',x+14,y+240);});
 const labels=texture(labelsCanvas);labels.name='living-supply-labels';
 const screen=document.createElement('canvas');screen.width=1024;screen.height=512;const sc=screen.getContext('2d'),display=texture(screen);let last=-1;
 function update(time){const tick=Math.floor(Math.max(0,time)/3);if(tick===last)return;last=tick;sc.fillStyle='#112b38';sc.fillRect(0,0,1024,512);sc.fillStyle='#6dc8bf';sc.fillRect(0,0,1024,12);sc.fillStyle='#e5efea';sc.font='bold 36px Arial';sc.fillText('UNIT 05   /   TEAM SPACE',35,64);sc.font='18px Arial';sc.fillText('SIMULERING · INGA VERKLIGA PRODUKTIONSDATA',36,100);for(let k=0;k<4;k++){sc.fillStyle='#274c5b';sc.fillRect(35+k*245,132,224,105);sc.fillStyle=accents[k];sc.font='bold 32px Arial';sc.fillText(['A','B','C','D'][k],57+k*245,178);sc.fillRect(57+k*245,204,80+((tick+k)%5)*18,5);}sc.strokeStyle='#7ccec1';sc.lineWidth=3;sc.beginPath();for(let x=0;x<92;x++){const y=340-Math.sin(x*.11)*23-Math.cos(x*.036)*15;sc.lineTo(45+x*10,y);}sc.stroke();sc.fillStyle='#a7c2ca';sc.font='22px Arial';sc.fillText('Workspace  •  Material  •  Övning',36,466);sc.fillStyle='#6dc8bf';sc.beginPath();sc.arc(971,65,7,0,Math.PI*2);sc.fill();display.needsUpdate=true;}
 update(0);
 return {atlas,labels,display,update,dispose(){atlas.dispose();labels.dispose();display.dispose();}};
}
