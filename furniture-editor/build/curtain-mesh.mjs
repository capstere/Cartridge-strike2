/** Shared Studio/FPS fabric: one continuous pleated sheet, never translucent boxes.
 * A double-sided transparent box draws several fabric layers and looks opaque.
 * The botanical artwork below is newly drawn; no reference photograph is shipped.
 */
import * as T from '../../vendor/three/three.module.js';
let botanicalTexture;
export function drawBotanicalCurtain(g,width=512,height=768){
 g.clearRect(0,0,width,height);g.save();g.scale(width/512,height/768);
 g.fillStyle='rgba(250,248,240,.25)';g.fillRect(0,0,512,768);
 // Broad muted terracotta petals and warm taupe shapes behind blue-grey leaves.
 const petal=(x,y,rx,ry,angle,color)=>{g.save();g.translate(x,y);g.rotate(angle);g.fillStyle=color;
  g.beginPath();g.moveTo(0,-ry);g.bezierCurveTo(rx,-ry*.85,rx*1.2,ry*.58,0,ry);
  g.bezierCurveTo(-rx*.95,ry*.7,-rx*.8,-ry*.75,0,-ry);g.fill();g.restore();};
 const leaf=(x,y,rx,ry,angle,color)=>{g.save();g.translate(x,y);g.rotate(angle);g.fillStyle=color;
  g.beginPath();g.moveTo(0,-ry);g.bezierCurveTo(rx*.72,-ry*1.08,rx*1.16,-ry*.32,rx*.86,ry*.22);
  g.bezierCurveTo(rx*.8,ry*.9,-rx*.22,ry*1.04,-rx*.55,ry*.55);
  g.bezierCurveTo(-rx*1.14,ry*.02,-rx*.9,-ry*.95,0,-ry);g.fill();g.restore();};
 // Neighbour copies make the repeat seamless without photographing the window.
 for(const ox of [-512,0,512])for(const oy of [-768,0,768]){
  g.save();g.translate(ox,oy);
  for(const [x,y,rx,ry,a] of [[85,130,69,141,-.4],[359,390,87,155,.28],[133,689,70,130,.5]])
   petal(x,y,rx,ry,a,'rgba(177,104,78,.55)');
  for(const [x,y,rx,ry,a] of [[410,75,80,115,.65],[242,239,61,112,-.7],[450,693,86,114,-.35]])
   petal(x,y,rx,ry,a,'rgba(169,156,131,.42)');
  g.lineCap='round';g.lineWidth=5;g.strokeStyle='rgba(75,94,99,.58)';
  g.beginPath();g.moveTo(18,480);g.bezierCurveTo(157,369,306,357,445,176);g.stroke();
  for(const [x,y,rx,ry,a] of [[97,400,39,72,-.9],[155,351,46,76,-.4],[222,360,43,69,1.2],[274,285,42,74,-.5],[333,275,44,65,1.1],[392,209,37,59,-.25]])
   leaf(x,y,rx,ry,a,'rgba(77,103,112,.65)');
  g.strokeStyle='rgba(115,120,107,.5)';g.lineWidth=4;g.beginPath();g.moveTo(213,751);g.bezierCurveTo(212,648,304,554,431,503);g.stroke();
  for(const [x,y,rx,ry,a] of [[224,670,39,58,-.7],[270,619,39,64,.65],[327,554,43,60,-.65],[388,544,40,65,.9]])
   leaf(x,y,rx,ry,a,'rgba(114,122,114,.55)');
  // Pale negative-space petals soften the large print, as on a light voile.
  petal(30,648,40,87,-.8,'rgba(247,243,230,.28)');
  petal(285,101,53,96,.5,'rgba(247,243,230,.25)');
  // Fixed-seed fine speckles. No runtime randomness or game RNG is consumed.
  for(let i=0;i<56;i++){const x=185+(i*37%70),y=450+(i*23%68);
   g.fillStyle='rgba(130,100,83,.3)';g.beginPath();g.arc(x,y,.6+(i%3)*.35,0,Math.PI*2);g.fill();}
  g.restore();
 }
 g.restore();
}
function botanicalMap(){
 if(botanicalTexture||typeof document==='undefined')return botanicalTexture||null;
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=768;
 drawBotanicalCurtain(canvas.getContext('2d'));
 botanicalTexture=new T.CanvasTexture(canvas);botanicalTexture.name='floor5-botanical-voile';
 botanicalTexture.colorSpace=T.SRGBColorSpace;botanicalTexture.wrapS=botanicalTexture.wrapT=T.RepeatWrapping;
 botanicalTexture.anisotropy=4;botanicalTexture.userData.studioShared=true;
 return botanicalTexture;
}
export function curtainFabricGeometry(width,height){
 if(!(width>=.24&&width<=8&&height>0&&height<=6))throw Error('Ogiltigt gardinmått.');
 const folds=Math.max(3,Math.round(width/.18)),steps=folds*6;
 const g=new T.PlaneGeometry(width,height,steps,4),pos=g.attributes.position,uv=g.attributes.uv;
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),y=pos.getY(i),t=(x+width/2)/width;
  pos.setZ(i,.008+.044*(.5-.5*Math.cos(t*folds*Math.PI*2)));
  uv.setXY(i,(x+width/2)/1.8,(y+height/2)/2.7);
 }
 g.computeVertexNormals();g.computeBoundingBox();g.userData.studioGeometry=true;
 return g;
}
export function createCurtainMesh(item,at){
 const style=item.style||'sheer',opaque=style==='white-opaque',pattern=style==='botanical-sheer';
 const bottom=.06,top=at.wall.height-.08,root=new T.Group();root.name='curtain-'+style;
 const material=new T.MeshStandardMaterial({color:opaque?0xf9f8f5:0xffffff,map:pattern?botanicalMap():null,
  side:T.DoubleSide,transparent:!opaque,opacity:opaque||pattern?1:.32,roughness:.92,depthWrite:opaque});
 material.forceSinglePass=true;material.userData.studioOwned=true;material.userData.curtainStyle=style;
 const fabric=new T.Mesh(curtainFabricGeometry(at.width,top-bottom),material);
 fabric.name='continuous-curtain-fabric';fabric.position.y=(top+bottom)/2;fabric.userData.editId=item.id;
 fabric.castShadow=opaque;fabric.receiveShadow=true;root.add(fabric);
 const metal=new T.MeshStandardMaterial({color:0xd8d8d4,metalness:.3,roughness:.45});metal.userData.studioOwned=true;
 const rod=new T.Mesh(new T.CylinderGeometry(.014,.014,at.width+.06,10),metal);
 rod.rotation.z=Math.PI/2;rod.position.set(0,top+.02,.024);rod.userData.editId=item.id;rod.userData.studioGeometry=true;root.add(rod);
 return root;
}
