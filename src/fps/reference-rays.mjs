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
      const ground=-oy/dy;
      if(ground>=0&&ground<best&&terrain.lowerSurface(ox+dx*ground,oz+dz*ground)===0)
        save(ground,'ground','ground',0,1,0);
      if(spec.water){
        const sea=(spec.water.y-oy)/dy;
        if(sea>=0&&sea<best&&terrain.lowerSurface(ox+dx*sea,oz+dz*sea)===spec.water.floor)
          save(sea,'ground','water',0,1,0);
      }
    }
    // The well is an open cylinder with an inward-facing wall and a bottom.
    // Projectiles already below its rim never cross the y=0 ground plane again.
    if(oy<=0||dy<0)for(const hole of spec.holes){
      const px=ox-hole.x,pz=oz-hole.z,radialSpeed=dx*dx+dz*dz;
      if(dy<-.000001){
        const t=(hole.y-oy)/dy;
        if(t>=0&&t<best&&(px+dx*t)**2+(pz+dz*t)**2<=hole.r**2)
          save(t,'well-bottom',hole.m,0,1,0);
      }
      if(radialSpeed<1e-12)continue;
      const projection=px*dx+pz*dz,offset=px*px+pz*pz-hole.r*hole.r;
      const discriminant=projection*projection-radialSpeed*offset;
      if(discriminant<0)continue;
      const t=(-projection+Math.sqrt(discriminant))/radialSpeed,y=oy+dy*t;
      if(t>=0&&t<best&&y>=hole.y&&y<=0)
        save(t,'well-wall',hole.wall,-(px+dx*t)/hole.r,0,-(pz+dz*t)/hole.r);
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
