/** Local-only poster art: generated value-word typography or uploaded raster artwork. */
const themes={
 navy:{bg:'#163852',fg:'#ffffff',edge:'#5faac8',secondary:'#d1e2ed'},
 white:{bg:'#f7f8f6',fg:'#243d48',edge:'#afc1c7',secondary:'#4b6570'},
 blue:{bg:'#246caa',fg:'#ffffff',edge:'#d2e7f7',secondary:'#e0f1fa'},
 orange:{bg:'#e97633',fg:'#ffffff',edge:'#fee0bc',secondary:'#fff4e4'}
};
function fillWrapped(ctx,str,width,x,y,maxLines,lineHeight){
 const words=str.trim().split(/\s+/),lines=[];let line='';
 for(const word of words){
  const candidate=line?line+' '+word:word;
  if(ctx.measureText(candidate).width<=width||!line)line=candidate;
  else{lines.push(line);line=word;}
 }
 if(line)lines.push(line);
 for(const [i,part] of lines.slice(0,maxLines).entries())ctx.fillText(part,x,y+i*lineHeight,width);
}
export function posterCanvas(p){
 const canvas=document.createElement('canvas');canvas.width=640;canvas.height=Math.round(640*p.height/p.width);
 canvas.height=Math.max(200,Math.min(1250,canvas.height));
 const ctx=canvas.getContext('2d'),theme=themes[p.color]||themes.navy;
 ctx.fillStyle=theme.bg;ctx.fillRect(0,0,canvas.width,canvas.height);
 const w=canvas.width,h=canvas.height;
 ctx.strokeStyle=theme.edge;ctx.lineWidth=15;ctx.strokeRect(16,16,w-32,h-32);
 ctx.fillStyle=theme.fg;ctx.textAlign='center';ctx.textBaseline='middle';
 const font=Math.min(70,Math.max(32,h*.1));
 ctx.font='900 '+font+'px Arial, sans-serif';
 fillWrapped(ctx,p.text,w*.78,w/2,h*.32,4,font*1.18);
 ctx.fillStyle=theme.secondary;ctx.font='600 '+Math.min(37,Math.max(21,h*.045))+'px Arial, sans-serif';
 fillWrapped(ctx,p.subtitle,w*.8,w/2,h*.68,3,Math.min(50,h*.06));
 return canvas;
}
export function createPosterTexture(THREE,p,onReady){
 const canvas=posterCanvas(p);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 texture.anisotropy=2;
 if(p.image){
  const image=new Image();
  image.onload=()=>{
   if(!texture.image)return;
   const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
   ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);
   const scale=Math.min(w/image.width,h/image.height);
   ctx.drawImage(image,(w-image.width*scale)/2,(h-image.height*scale)/2,image.width*scale,image.height*scale);
   texture.needsUpdate=true;onReady?.();
  };
  image.onerror=()=>{onReady?.();};
  image.src=p.image;
 }
 return texture;
}
export async function compressPosterImage(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)
  throw Error('Välj en JPG, PNG eller WebP under 8 MB.');
 let bitmap;
 try{bitmap=await createImageBitmap(file);}catch{throw Error('Det gick inte att öppna bilden. Välj en annan JPG/PNG/WebP.');}
 try{
  for(const size of [768,640,512,416,320]){
   const factor=Math.min(size/Math.max(bitmap.width,bitmap.height),1);
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor));
   const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   for(const quality of [.85,.72,.60,.48,.34]){
    const encoded=canvas.toDataURL('image/jpeg',quality);
    if(encoded.length<98000)return encoded;
   }
  }
  throw Error('Bilden kunde inte komprimeras. Testa en mindre bild.');
 }finally{bitmap.close?.();}
}
