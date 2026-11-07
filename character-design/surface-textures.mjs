import * as T from '../vendor/three/three.module.js';
/** Bake height detail into portable tangent normals. glTF does not export bumpMap. */
export function heightNormal(canvas,strength=1){
 const {width:w,height:h}=canvas,source=canvas.getContext('2d').getImageData(0,0,w,h).data,out=document.createElement('canvas');out.width=w;out.height=h;const ctx=out.getContext('2d'),image=ctx.createImageData(w,h),height=(x,y)=>source[(((y+h)%h)*w+(x+w)%w)*4]/255;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const dx=(height(x-1,y)-height(x+1,y))*strength,dy=(height(x,y-1)-height(x,y+1))*strength,n=1/Math.hypot(dx,dy,1),i=(y*w+x)*4;image.data[i]=(dx*n*.5+.5)*255;image.data[i+1]=(dy*n*.5+.5)*255;image.data[i+2]=(n*.5+.5)*255;image.data[i+3]=255;}ctx.putImageData(image,0,0);const t=new T.CanvasTexture(out);t.colorSpace=T.NoColorSpace;return t;
}
