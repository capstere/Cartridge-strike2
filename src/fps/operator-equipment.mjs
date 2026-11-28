// Adapted from Riposte: Frontline, 06g-body and 06ga-tenues (MIT, BenDBSS).
// Donor rest coordinates face -Z; the Quaternius export faces +Z. Equipment
// shares the operator skeleton and its original inverse bind matrices.
import * as T from '../../vendor/three/three.module.js';

const hood = [
  [1.795,-.02,.012,.012,.012,0],[1.782,-.02,.07,.074,.08,0],
  [1.75,-.02,.108,.113,.123,0],[1.705,-.02,.122,.125,.136,.32],
  [1.655,-.022,.126,.124,.142,.78],[1.6,-.022,.122,.118,.138,.82],
  [1.545,-.018,.118,.11,.128,.7],[1.49,-.008,.15,.124,.13,.42],
  [1.44,0,.215,.15,.142,.26],[1.375,.004,.245,.16,.152,.2]
];
const poncho = [
  [1.505,0,.066,.058,.066,0],[1.497,0,.15,.11,.115,.1],
  [1.494,0,.215,.14,.136,.2],[1.455,0,.29,.172,.158,.3],
  [1.38,0,.32,.2,.174,.4],[1.26,0,.322,.214,.186,.48],
  [1.12,0,.3,.216,.198,.6],[.98,0,.27,.222,.214,.76],
  [.84,0,.25,.23,.24,1.1],[.66,0,.235,.24,.28,1.95],[.55,0,.225,.24,.3,2.2]
];
const leaves = [0x5f6b38,0x717d40,0x7d7552,0x4f5a33,0x8c8660,0x686038,0x9a9468];

function kitGeometry(outfit, skeleton, teamTrim, near) {
  const positions=[], colors=[], triangles=[], bones=[], weights=[];
  const boneIndex = new Map(skeleton.bones.map((bone, index) => [bone.name,index]));
  const headHeight = skeleton.boneInverses[boneIndex.get('Head')].clone().invert().elements[13];
  const heightScale = headHeight / 1.60;
  const tint = new T.Color();
  function vertex(x,y,z,color,a,b=a,blend=0) {
    positions.push(x*heightScale,y*heightScale,z*heightScale);
    tint.setHex(color); colors.push(tint.r,tint.g,tint.b);
    bones.push(boneIndex.get(a),boneIndex.get(b),0,0);
    weights.push(1-blend,blend,0,0);
  }
  function part(shape,x,y,z,color,bone,pitch=0) {
    const offset=positions.length/3;
    shape.rotateX(pitch); shape.translate(x,y,z);
    const p=shape.getAttribute('position');
    for (let i=0; i<p.count; i++) vertex(p.getX(i),p.getY(i),p.getZ(i),color,bone);
    if (shape.index) for (const index of shape.index.array) triangles.push(offset+index);
    else for (let i=0; i<p.count; i++) triangles.push(offset+i);
    shape.dispose();
  }
  function box(x,y,z,w,h,d,color,bone) {
    part(new T.BoxGeometry(w,h,d),x,y,z,color,bone);
  }
  function cylinder(x,y,z,radius,length,color,bone,pitch=0) {
    part(new T.CylinderGeometry(radius,radius,length,near?10:6),x,y,z,color,bone,pitch);
  }
  function garment(rings,isHood) {
    const n=near?26:12, offset=positions.length/3;
    for (const [row,[y,cz,w,front,back,gap]] of rings.entries()) {
      for (let col=0; col<=n; col++) {
        const angle=gap+(Math.PI*2-2*gap)*col/n, s=Math.sin(angle), c=Math.cos(angle);
        const fold=Math.sin(7*angle+row*1.3)*.006*Math.min(1,Math.max(0,(1.7-y)/.25));
        const x=Math.sign(s)*Math.abs(s)**.89*w+fold*s;
        const z=-cz+Math.sign(c)*Math.abs(c)**.89*(c>=0?front:back)+fold*c;
        const fabric=isHood?leaves[(row*3+col*5)%leaves.length]:outfit.shirt;
        const side=x>0?'upperarm_l':'upperarm_r';
        const follow=isHood?T.MathUtils.smoothstep(y,1.46,1.56):
          Math.abs(s)*T.MathUtils.smoothstep(y,1.08,1.42)*.35;
        vertex(x,y,z,fabric,'spine_03',isHood?'Head':side,follow);
        if (!row || !col) continue;
        const p=offset+row*(n+1)+col;
        triangles.push(p-n-2,p-1,p, p-n-2,p,p-n-1);
      }
    }
  }
  const id=outfit.id, chest='spine_03', head='Head';
  if (id==='sniper') {
    garment(hood,true);
    // Seeded strips lie on the hood and shoulder mantle; one draw with the hood.
    const count=near?48:12;
    for (let i=0; i<count; i++) {
      const f=(i*.618033989)%1, a=.88+f*(2*Math.PI-1.76);
      const y=1.43+.26*((i*.381966011+.27)%1), c=Math.cos(a), s=Math.sin(a);
      const width=T.MathUtils.lerp(.22,.132,T.MathUtils.smoothstep(y,1.43,1.55));
      const x=s*width,z=c*.145+.018, base=positions.length/3;
      const color=leaves[i%leaves.length], b=y>1.52?head:chest;
      vertex(x-.014*c,y,z+.014*s,color,b);
      vertex(x+.014*c,y+.003,z-.014*s,color,b);
      vertex(x+.02*s,y-.045-.025*f,z+.02*c,color,b);
      triangles.push(base,base+1,base+2);
    }
  } else {
    const helmet=new T.SphereGeometry(1,near?18:10,near?9:5,0,Math.PI*2,0,Math.PI*.58);
    helmet.scale(.139,.138,.153);
    part(helmet,0,1.688,.004,id==='smg'?0x3c4148:outfit.shirt,head);
    if (id==='shotgun') {
      garment(poncho,false);
      box(0,1.14,.19,.15,.1,.02,0x35322d,chest);
      for (let row=0; row<2; row++) for (let i=0; i<5; i++) {
        const x=-.056+i*.028, y=1.165-row*.052, z=.204-row*.006;
        cylinder(x,y,z,.0105,.05,0xa8261c,chest,-.12);
        if (near) cylinder(x,y-.029,z+.0035,.0112,.012,0xc09a48,chest,-.12);
      }
    } else {
      box(0,1.295,-.183,.205,.277,.105,outfit.vest,chest);
      if (id==='smg') {
        box(0,1.73,.135,.074,.034,.036,0x2a2c31,head);
        for (const sign of [-1,1]) {
          cylinder(sign*.03,1.734,.157,.0175,.066,0x34383e,head,1.25);
          if (near) cylinder(sign*.03,1.745,.189,.014,.005,0x203628,head,1.25);
        }
      } else {
        cylinder(-.124,1.47,-.19,.004,.28,0x3a3a36,chest);
        box(0,1.673,.128,.192,.037,.026,0xb0601a,head);
      }
    }
  }
  // The reference places recognition bands on both arms. Use the existing team
  // trim so team ID survives a change of uniform or weapon.
  for (const side of [-1,1]) {
    const bone=side>0?'upperarm_l':'upperarm_r';
    const m=skeleton.boneInverses[boneIndex.get(bone)].clone().invert();
    const p=new T.Vector3(0,.09,0).applyMatrix4(m).divideScalar(heightScale);
    const band=new T.CylinderGeometry(.060,.058,.033,near?12:6);
    band.applyQuaternion(new T.Quaternion().setFromRotationMatrix(m));
    part(band,p.x,p.y,p.z,teamTrim,bone);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(bones,4));
  geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
  geometry.setIndex(triangles); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

export function addOperatorEquipment(root,outfit,trim,materials,ownedGeometry) {
  if (!outfit?.shirt) return;
  let skin;
  root.traverse(node => {if (!skin && node.isSkinnedMesh) skin=node;});
  const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.88,side:T.DoubleSide});
  materials.set(material,material);
  const detail=new T.LOD();
  detail.name='operator-kit-'+outfit.id;
  for (const near of [true,false]) {
    const geometry=kitGeometry(outfit,skin.skeleton,trim,near);
    const mesh=new T.SkinnedMesh(geometry,material);
    mesh.name=detail.name+(near?'-near':'-far');
    mesh.bind(skin.skeleton,skin.bindMatrix);
    mesh.frustumCulled=false;
    mesh.visible=near;
    mesh.receiveShadow=true;
    ownedGeometry.push(geometry);
    detail.addLevel(mesh,near?0:13,.12);
  }
  root.add(detail);
}

// Riposte 06e-gear camoFacet/camoLeaf, using the original base-outfit seeds
// and mid-tone palettes. Each shared tile is generated once, for both views.
const patterns = {
  assault:[417,['#a8987a','#5f5e4c','#45453b']],
  smg:[911,['#5f6878','#33363c','#6e7480']],
  sniper:[263,['#717550','#857c5c','#5d6842']],
  shotgun:[577,['#62533f','#a6957a','#54483a']]
};
const swatches=new Map();
export function uniformSwatch(outfit) {
  if (!patterns[outfit?.id] || typeof document==='undefined') return null;
  if (swatches.has(outfit.id)) return swatches.get(outfit.id);
  const [seed,palette]=patterns[outfit.id];
  let state=seed;
  function random() {
    state=(state+0x6d2b79f5)|0;
    let t=Math.imul(state^(state>>>15),1|state);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  }
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#'+outfit.shirt.toString(16).padStart(6,'0');
  ctx.fillRect(0,0,64,64);
  const leaf=outfit.id==='sniper';
  for (const color of palette) {
    ctx.fillStyle=color;
    for (let i=0;i<(leaf?45:21);i++) {
      const x=random()*64,y=random()*64,angle=random()*Math.PI*2;
      const radius=(leaf?2.5:3.5)+random()*4;
      const path=new Path2D();
      if (leaf) {
        path.moveTo(-radius,0);
        path.quadraticCurveTo(0,radius*.52,radius,0);
        path.quadraticCurveTo(0,-radius*.52,-radius,0);
      } else {
        const n=4+Math.floor(random()*4);
        for (let k=0;k<n;k++) {
          const a=(k+(random()-.5)*.6)*Math.PI*2/n;
          const r=radius*(.55+random()*.65), px=Math.cos(a)*r, py=Math.sin(a)*r*.68;
          if (k) path.lineTo(px,py); else path.moveTo(px,py);
        }
      }
      path.closePath();
      for (const ox of [-64,0,64]) for (const oy of [-64,0,64]) {
        const tx=x+ox,ty=y+oy;
        if (tx+radius*1.2<0 || ty+radius*1.2<0 || tx-radius*1.2>64 || ty-radius*1.2>64) continue;
        ctx.setTransform(Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),tx,ty);
        ctx.fill(path);
      }
    }
  }
  const tile=new T.CanvasTexture(canvas);
  tile.colorSpace=T.SRGBColorSpace;
  tile.wrapS=tile.wrapT=T.RepeatWrapping;
  tile.repeat.set(3,3);
  tile.userData.sharedWeapon=true;
  swatches.set(outfit.id,tile);
  return tile;
}
export function disposeUniformSwatches() {
  for (const tile of swatches.values()) tile.dispose();
  swatches.clear();
}
