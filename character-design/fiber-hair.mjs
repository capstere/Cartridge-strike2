/** Thin, tapered hair ribbons with an authored strand alpha texture, not tube locks. */
import * as T from '../vendor/three/three.module.js';
import {heightNormal} from './surface-textures.mjs?v=53';
import {anatomy,hairGeometry} from './anatomy-accessories.mjs?v=6.1.2';
export function makeFiberHair(avatar,style,color,settings={}){
 const lengthScale=(settings.hairLength??100)/100,volumeScale=(settings.hairVolume??100)/100;
 const a=anatomy(avatar),group=new T.Group(),cap=hairGeometry(a,style),pos=cap.attributes.position,normal=cap.attributes.normal;
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=512;const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,128,512);
 let seed=412;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<36;i++){const x=rand()*128;ctx.strokeStyle='rgba(255,255,255,'+(.4+rand()*.6)+')';ctx.lineWidth=.5+rand()*1.1;ctx.beginPath();ctx.moveTo(x,0);ctx.bezierCurveTo(x-3,170,x+4,370,x+(rand()-.5)*12,500-rand()*50);ctx.stroke();}
 const pixels=ctx.getImageData(0,0,128,512);for(let i=0;i<pixels.data.length;i+=4){pixels.data[i+3]=pixels.data[i+1];pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;}ctx.putImageData(pixels,0,0);const alpha=new T.CanvasTexture(canvas);alpha.colorSpace=T.SRGBColorSpace;
 const material=new T.MeshPhysicalMaterial({color,roughness:.7,specularIntensity:.22,metalness:0,map:alpha,alphaTest:.18,side:T.DoubleSide,anisotropy:.4,sheen:.12,sheenColor:new T.Color(color).multiplyScalar(1.4)});material.name='fiber-hair';
 const cover=document.createElement('canvas');cover.width=1024;cover.height=512;const paint=cover.getContext('2d');paint.fillStyle='#aaa';paint.fillRect(0,0,1024,512);
 for(let i=0;i<1200;i++){const x=rand()*1024,shade=Math.floor(130+rand()*105);paint.strokeStyle='rgb('+shade+','+shade+','+shade+')';paint.lineWidth=.35+rand()*.65;paint.beginPath();paint.moveTo(x,-2);paint.bezierCurveTo(x+8,170,x-10,350,x+4,514);paint.stroke();}
 // Feather the scalp underlayer at its actual curved hairline. Bake alpha into
 // the colour map so the edge is identical in the editor and exported GLB.
 const coverPixels=paint.getImageData(0,0,1024,512);for(let y=0;y<512;y++)for(let x=0;x<1024;x++){const feather=Math.max(0,Math.min(1,(511-y)/28));coverPixels.data[(y*1024+x)*4+3]=Math.round(255*feather*(feather>=1?1:.86+.14*Math.sin(x*1.7)**2));}paint.putImageData(coverPixels,0,0);
 const coverMap=new T.CanvasTexture(cover);coverMap.colorSpace=T.SRGBColorSpace;const scalpUV=new Float32Array(pos.count*2);for(let i=0;i<pos.count;i++){scalpUV[i*2]=Math.atan2(pos.getX(i),pos.getZ(i)-a.centerZ)/(Math.PI*2)+.5;const front=T.MathUtils.clamp((pos.getZ(i)-a.centerZ)/Math.max(.03,a.depth*.5),-1,1),line=a.top-(front>0?.079-.008*Math.cos(pos.getX(i)/Math.max(.01,a.width)*Math.PI*2):.135-.060*front);scalpUV[i*2+1]=T.MathUtils.clamp((pos.getY(i)-line-.008)/(a.top+.012-line),0,1);}cap.setAttribute('uv',new T.Float32BufferAttribute(scalpUV,2));
 const capMaterial=new T.MeshStandardMaterial({color,roughness:.9,map:coverMap,transparent:true,depthWrite:false,normalMap:heightNormal(cover,.5),normalScale:new T.Vector2(.2,.2)});capMaterial.name='fiber-scalp';const base=new T.Mesh(cap,capMaterial);base.name='fiber-scalp';group.add(base);
 const vertices=[],uv=[],indices=[],areas=[];let total=0;const va=new T.Vector3(),vb=new T.Vector3(),vc=new T.Vector3();
 for(let i=0;i<pos.count;i+=3){va.fromBufferAttribute(pos,i);vb.fromBufferAttribute(pos,i+1);vc.fromBufferAttribute(pos,i+2);total+=vb.sub(va).cross(vc.sub(va)).length()/2;areas.push(total);}
 const count=style==='buzz'?350:1200,length={buzz:.004,short:.028,curly:.065,bob:.16,long:.30,ponytail:.22,mohawk:.09}[style]||.03;
 for(let h=0;h<count;h++){
  const pick=rand()*total;let tri=areas.findIndex(v=>v>=pick);tri=Math.max(0,tri)*3;const u=Math.sqrt(rand()),v=rand(),bary=[1-u,u*(1-v),u*v];
  const root=new T.Vector3(),n=new T.Vector3();for(let j=0;j<3;j++){root.addScaledVector(va.fromBufferAttribute(pos,tri+j),bary[j]);n.addScaledVector(vb.fromBufferAttribute(normal,tri+j),bary[j]);}n.normalize();
  const sign=root.x<-.008?-1:1,down=new T.Vector3(0,-1,0),tangent=down.clone().addScaledVector(n,n.y);
  const frontal=root.z>a.centerZ+.025,high=n.y>.55;
  if(high||frontal)tangent.lerp(new T.Vector3(sign*.95,-.15,-.25),high?.85:.65);tangent.normalize();
  const side=new T.Vector3().crossVectors(n,tangent).normalize();if(side.lengthSq()<.01)side.set(1,0,0);
  const len=length*lengthScale*(.8+rand()*.4),width=style==='buzz'?.001:.0018,start=vertices.length/3,steps=12;const tailX=(rand()-.5)*.018;const pony=style==='ponytail'?new T.CatmullRomCurve3([root.clone(),new T.Vector3(sign*a.width*.43,a.top-.045,a.centerZ-.025),new T.Vector3(tailX,a.top-.115,a.centerZ-a.depth*.57),new T.Vector3(tailX,a.top-.115-.085*lengthScale,a.centerZ-a.depth*.70),new T.Vector3(tailX*.4,a.top-.115-.225*lengthScale,a.centerZ-a.depth*.60)]):null;
  for(let j=0;j<=steps;j++){
   const t=j/steps,travel=Math.min(len,.10),p=root.clone().addScaledVector(tangent,travel*Math.sin(t*Math.PI/2)).addScaledVector(down,Math.max(0,len-travel*.4)*t*t).addScaledVector(n,.003*Math.sin(Math.PI*t));
   if(pony)p.copy(pony.getPoint(t));
   // Root stays attached; volume lifts the guide away from the scalp, not the entire head.
   p.addScaledVector(n,(volumeScale-1)*.035*Math.sin(Math.PI*t));
   const curl=style==='curly'?Math.sin(t*18+h)*.003*t:Math.sin(t*5+h)*.0008*t;p.addScaledVector(side,curl);
   // Keep long strands outside a conservative head envelope, especially eyes.
   const cy=a.top-.13,rx=a.width*.46,rz=a.depth*.46,dy=(p.y-cy)/.14,cross=Math.sqrt(Math.max(0,1-dy*dy));
   if(Math.abs(dy)<1){let x=p.x,z=p.z-a.centerZ,rad=Math.hypot(x/rx,z/rz);if(rad<cross*1.045){if(rad<1e-5){x=sign*.001;z=-.001;rad=Math.hypot(x/rx,z/rz);}const k=cross*1.045/rad;p.x=x*k;p.z=a.centerZ+z*k;}}
   const outward=new T.Vector3(p.x/(rx*rx),(p.y-cy)/(.15*.15),(p.z-a.centerZ)/(rz*rz)).normalize(),flow=pony?pony.getTangent(t):tangent.clone().multiplyScalar(travel*Math.PI/2*Math.cos(t*Math.PI/2)).addScaledVector(down,2*Math.max(0,len-travel*.4)*t),ribbonSide=new T.Vector3().crossVectors(outward,flow).normalize();if(ribbonSide.lengthSq()<.01)ribbonSide.copy(side);
   for(const s of [-1,1]){const q=p.clone().addScaledVector(ribbonSide,s*width*(1-t*.95));vertices.push(...q.toArray());uv.push(s<0?0:1,t);}if(j<steps){const k=start+j*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const fibers=new T.Mesh(g,material);fibers.name='individual-hair-ribbons';fibers.userData.strands=count;group.add(fibers);if(style==='ponytail'){const tie=new T.Mesh(new T.TorusGeometry(.019,.003,6,20),new T.MeshStandardMaterial({color:'#242020',roughness:.95}));tie.name='fiber-hair-tie';tie.position.set(0,a.top-.115,a.centerZ-a.depth*.57);group.add(tie);}
 group.userData.textureOwner=true;group.name='fiber-hair-'+style;return group;
}
