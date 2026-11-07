/** Flat, decorative 5S markings in floor-plan X/Z coordinates. */
import {inside,distanceSegment} from '../core.mjs?v=5.8.0';
import {floorPolygon} from './floor-edge.mjs?v=5.7.3';

export const TAPE_WIDTH=.08;
const MAX_STRIPS=1000;
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=100);

export function validateFloorTape(strips=[]){
 if(!Array.isArray(strips)||strips.length>MAX_STRIPS)throw Error('Ogiltigt antal 5S-tejpremsor.');
 const ids=new Set();
 for(const strip of strips){
  if(!strip||typeof strip.id!=='string'||!/^TEJP-\d{4}$/.test(strip.id)||ids.has(strip.id)||
     !validPoint(strip.a)||!validPoint(strip.b)||Math.hypot(strip.a[0]-strip.b[0],strip.a[1]-strip.b[1])<.099999||
     !['solid','hazard'].includes(strip.style)||typeof strip.color!=='string'||!/^#[0-9a-f]{6}$/i.test(strip.color)){
   throw Error('5S-tejpen har ogiltiga ändpunkter, färg, mönster eller ID.');
  }
  ids.add(strip.id);
 }
}

// Floor coverage can change only where the stroke crosses a polygon edge.
// Midpoints between crossings also catch gaps and concave rooms.
function onContinuousFloor(a,b,floors){
 const dx=b[0]-a[0],dz=b[1]-a[1],cuts=[0,1],polygons=floors.map(floorPolygon);
 for(const poly of polygons)for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],ex=q[0]-p[0],ez=q[1]-p[1];
  const det=dx*ez-dz*ex;
  if(Math.abs(det)<1e-10)continue;
  const px=p[0]-a[0],pz=p[1]-a[1],t=(px*ez-pz*ex)/det,u=(px*dz-pz*dx)/det;
  if(t>0&&t<1&&u>=-1e-9&&u<=1+1e-9)cuts.push(t);
 }
 cuts.sort((x,y)=>x-y);
 for(let i=1;i<cuts.length;i++){
  if(cuts[i]-cuts[i-1]<1e-9)continue;
  const t=(cuts[i]+cuts[i-1])/2,x=a[0]+t*dx,z=a[1]+t*dz;
  if(!polygons.some(poly=>inside(x,z,poly)||poly.some((p,j)=>distanceSegment(x,z,p,poly[(j+1)%poly.length])<1e-8)))return false;
 }
 return true;
}

export function makeFloorTape(start,end,appearance,strips,floors){
 if(strips.length>=MAX_STRIPS)throw Error('Banan har redan 1 000 tejpremsor.');
 if(Math.hypot(end.x-start.x,end.z-start.z)<.099999)throw Error('Dra en längre tejpremsa.');
 const ids=new Set(strips.map(s=>s.id));let n=1;
 while(ids.has('TEJP-'+String(n).padStart(4,'0')))n++;
 const strip={id:'TEJP-'+String(n).padStart(4,'0'),a:[start.x,start.z],b:[end.x,end.z],...appearance};
 validateFloorTape([strip]);
 if(!onContinuousFloor(strip.a,strip.b,floors))throw Error('Dra hela tejpremsan på golvet.');
 return strip;
}

let tile;
export function hazardTile(){
 if(tile)return tile;
 tile=document.createElement('canvas');tile.width=tile.height=64;
 const ctx=tile.getContext('2d');ctx.fillStyle='#ffcf00';ctx.fillRect(0,0,64,64);
 ctx.fillStyle='#161616';
 for(const x of [-64,0]){
  ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+32,0);ctx.lineTo(x+96,64);ctx.lineTo(x+64,64);ctx.fill();
 }
 return tile;
}

export function drawPlanTape(ctx,strip,screen,dpr,selected=false){
 const [x,z]=screen(...strip.a),[endX,endZ]=screen(...strip.b);
 const length=Math.hypot(endX-x,endZ-z),worldLength=Math.hypot(strip.b[0]-strip.a[0],strip.b[1]-strip.a[1]);
 if(!worldLength||!length)return;
 const width=Math.max(3*dpr,TAPE_WIDTH*length/worldLength);
 ctx.save();ctx.translate(x,z);ctx.rotate(Math.atan2(endZ-z,endX-x));
 if(selected){ctx.fillStyle='#ed993a';ctx.fillRect(-dpr,-width/2-dpr,length+2*dpr,width+2*dpr);}
 ctx.scale(width/32,width/32);
 ctx.fillStyle=strip.style==='hazard'?ctx.createPattern(hazardTile(),'repeat'):strip.color;
 ctx.fillRect(0,-16,length*32/width,32);ctx.restore();
}
