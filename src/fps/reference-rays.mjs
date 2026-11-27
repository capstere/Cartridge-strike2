// Riposte's rayWorld / queryBoxesRay (MIT), using the shared 4 m grid and
// the CS2 hit record. Navigation-only volumes never intercept a shot.
import {rayProps} from './reference-prop-ray.mjs';

export function referenceRays(spec,terrain){
  const {index}=terrain,candidates=[],seen=new Set(),size=index.size;
  function crossedBoxes(ox,oz,dx,dz,max){
    seen.clear();candidates.length=0;
    let x=Math.floor(ox/size),z=Math.floor(oz/size);
    const incX=Math.sign(dx),incZ=Math.sign(dz);
    const stepX=incX?size/Math.abs(dx):Infinity,stepZ=incZ?size/Math.abs(dz):Infinity;
    let crossX=incX?((x+(incX>0?1:0))*size-ox)/dx:Infinity;
    let crossZ=incZ?((z+(incZ>0?1:0))*size-oz)/dz:Infinity;
    for(;;){
      for(const box of index.at((x+.5)*size,(z+.5)*size)){
        if(!seen.has(box)){seen.add(box);candidates.push(box);}
      }
      if(Math.min(crossX,crossZ)>max)break;
      if(crossX<crossZ){x+=incX;crossX+=stepX;}
      else{z+=incZ;crossZ+=stepZ;}
    }
    return candidates;
  }
  function raycast(origin,direction,max=100,{vision=false}={}){
    const ox=origin.x,oy=origin.y??1.5,oz=origin.z;
    const length=Math.hypot(direction.x,direction.y||0,direction.z);
    if(length<1e-7||max<=0||!Number.isFinite(max))return null;
    const dx=direction.x/length,dy=(direction.y||0)/length,dz=direction.z/length;
    let best=max,hit=null;
    const save=(t,id,material,nx,ny,nz)=>{
      if(t<0||t>=best)return;
      best=t;hit={distance:t,id,material,normal:{x:nx,y:ny,z:nz}};
    };
    if(dy<-.000001){
      let t=-oy/dy,material='ground',normal={x:0,y:1,z:0};
      const x=ox+dx*t,z=oz+dz*t;
      if(t>0&&t<best){
        const hole=spec.holes.find(h=>(x-h.x)**2+(z-h.z)**2<h.r*h.r);
        if(hole){
          const px=x-hole.x,pz=z-hole.z,a=dx*dx+dz*dz,b=2*(px*dx+pz*dz),c=px*px+pz*pz-hole.r**2;
          const wall=a>1e-9?(-b+Math.sqrt(Math.max(0,b*b-4*a*c)))/(2*a):Infinity;
          const bottom=hole.y/dy;
          if(wall<bottom){t+=wall;material=hole.wall;normal={x:-(px+dx*wall)/hole.r,y:0,z:-(pz+dz*wall)/hole.r};}
          else{t+=bottom;material=hole.m;}
        }else if(terrain.lowerSurface(x,z)<0){t=(spec.water.y-oy)/dy;material='water';}
        save(t,'ground',material,normal.x,normal.y,normal.z);
      }
    }
    for(const b of crossedBoxes(ox,oz,dx,dz,best)){
      if(b.noRay)continue;
      let near=-Infinity,far=Infinity,axis=0,sign=0;
      const origins=[ox,oy,oz],dirs=[dx,dy,dz],mins=[b.x0,b.y0,b.z0],maxs=[b.x1,b.y1,b.z1];
      for(let j=0;j<3;j++){
        if(Math.abs(dirs[j])<1e-9){if(origins[j]<mins[j]||origins[j]>maxs[j]){far=-Infinity;break;}continue;}
        const a=(mins[j]-origins[j])/dirs[j],c=(maxs[j]-origins[j])/dirs[j];
        if(Math.min(a,c)>near){near=Math.min(a,c);axis=j;sign=dirs[j]>0?-1:1;}
        far=Math.min(far,Math.max(a,c));
      }
      if(far>=near&&near>=0)save(near,b.id,b.material,axis===0?sign:0,axis===1?sign:0,axis===2?sign:0);
    }
    const prop=rayProps(spec.rayProps,ox,oy,oz,dx,dy,dz,best,vision);
    if(prop)hit=prop;
    if(hit)hit.point={x:ox+dx*hit.distance,y:oy+dy*hit.distance,z:oz+dz*hit.distance};
    return hit;
  }
  function segmentClear(a,b,opts){
    const delta={x:b.x-a.x,y:(b.y??1.5)-(a.y??1.5),z:b.z-a.z};
    const d=Math.hypot(delta.x,delta.y,delta.z);
    return d<.015||!raycast(a,delta,d-.015,opts);
  }
  return {raycast,segmentClear};
}
