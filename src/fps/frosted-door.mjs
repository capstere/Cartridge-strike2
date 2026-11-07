/** Shared visual leaf only. Hinges, collision and opening logic remain in doors.mjs. */
import * as T from '../../vendor/three/three.module.js';
export function frostedDoorParts(width){
 const h=2.23,bottom=.035,rail=.055;
 return [
  {part:'glass',x:width/2,y:bottom+h/2,z:0,w:width-rail*2,h:h-rail*2,d:.018},
  ...[rail/2,width-rail/2].map(x=>({part:'frame',x,y:bottom+h/2,z:0,w:rail,h,d:.06})),
  ...[bottom+rail/2,bottom+h-rail/2].map(y=>({part:'frame',x:width/2,y,z:0,w:width-rail*2,h:rail,d:.06})),
  ...[-1,1].map(sign=>({part:'handle',x:width*.78,y:1.05,z:sign*.07,w:.17,h:.03,d:.03}))
 ];
}
export function frostedGlassMaterial(){return new T.MeshPhysicalMaterial({color:0xe1ecea,roughness:.68,metalness:0,transmission:.72,thickness:.018,ior:1.45,side:T.DoubleSide});}

/** Shared bathroom/WC sign. Only created in the browser's visual pipeline.
 * The sign is visual, not a collider; it inherits its door leaf's hinge pose.
 * The white disc with dark WC lettering faces both sides of the door.
 */
export function createWcDoorBadge(width){
 const canvas=document.createElement('canvas');
 canvas.width=canvas.height=192;
 const c=canvas.getContext('2d');
 if(!c)throw Error('2D canvas behövs för WC-skylten.');
 c.clearRect(0,0,192,192);
 c.fillStyle='#f5f7f4';c.beginPath();c.arc(96,96,88,0,2*Math.PI);c.fill();
 c.strokeStyle='#727e85';c.lineWidth=8;c.stroke();
 c.fillStyle='#26313a';c.font='bold 62px system-ui, sans-serif';
 c.textAlign='center';c.textBaseline='middle';c.fillText('WC',96,100);
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 const material=new T.MeshBasicMaterial({map:texture,transparent:true,side:T.FrontSide,depthWrite:false});
 material.userData.studioOwned=true;
 const geometry=new T.PlaneGeometry(.24,.24),group=new T.Group();
 for(const sign of [-1,1]){
  const disc=new T.Mesh(geometry,material);
  disc.name='WC-sign';disc.position.set(width*.50,1.72,sign*.060);
  if(sign<0)disc.rotation.y=Math.PI;
  group.add(disc);
 }
 return {group,dispose(){geometry.dispose();material.dispose();texture.dispose();}};
}
