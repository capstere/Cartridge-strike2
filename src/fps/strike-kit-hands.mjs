/** Fitted CC0 Quaternius hands with original cuffs and cloth sleeves.
 * Metres; presentation only. Two shared-material skins and two sleeve draws.
 * Sleeves join the glove's wrist frame, rather than stretching a cylinder/cuff.
 */
import * as T from '../../vendor/three/three.module.js';
import {SHIRT_FRACTION} from './view-character-appearance.mjs?v=6.1.2';
import {AUTHORED_HANDS} from './authored-hand-data.mjs';
const TAU = Math.PI * 2;
const WRIST = -.082, CUFF_TOP = -.064, SEGMENTS = 20;
const handGeometry = new Map();

function gloveGeometry(source,side,own){
 if(handGeometry.has(side))return handGeometry.get(side);
 const positions=[],normals=[],uvs=[],skinIndices=[],skinWeights=[],indices=[],copies=new Map();
 const uvFor=(x,y,dorsal)=>[(dorsal?0:.5)+T.MathUtils.clamp((x*side+.055)/.11,0,1)*.5,T.MathUtils.clamp((y+.102)/.25,0,1)];
 function vertex(p,n,uv,si=[0,0,0,0],sw=[1,0,0,0]){const id=positions.length/3;positions.push(...p);normals.push(...n);uvs.push(...uv);skinIndices.push(...si);skinWeights.push(...sw);return id;}
 function copy(i,dorsal){const key=i+':'+dorsal;if(copies.has(key))return copies.get(key);const p=Array.from(source.positions.subarray(i*3,i*3+3)),n=Array.from(source.normals.subarray(i*3,i*3+3));const id=vertex(p,n,uvFor(p[0],p[1],dorsal),source.skinIndices.subarray(i*4,i*4+4),source.skinWeights.subarray(i*4,i*4+4));copies.set(key,id);return id;}
 // The stored Loop pass packs four children per authored triangle. Its three
 // corner children begin with the original vertices. Use those smoothed
 // corners, normals and rig weights at the scale the hands occupy on screen.
 for(let i=0;i<source.indices.length;i+=12){
  const triangle=[source.indices[i],source.indices[i+3],source.indices[i+6]];
  const dorsal=triangle.reduce((s,j)=>s+source.normals[j*3+2],0)>0;
  indices.push(...triangle.map(j=>copy(j,dorsal)));
 }
 const rings=[[WRIST,.028,.0215],[-.080,.029,.0225],[-.077,.029,.0225],[-.067,.0278,.021],[CUFF_TOP,.027,.0195]],ringIds=[];
 function outward(a,b,c){const va=new T.Vector3().fromArray(positions,a*3),vb=new T.Vector3().fromArray(positions,b*3),vc=new T.Vector3().fromArray(positions,c*3),normal=new T.Vector3().crossVectors(vb.clone().sub(va),vc.clone().sub(va));const mid=va.clone().add(vb).add(vc).divideScalar(3);if(normal.x*mid.x+normal.z*mid.z<0)indices.push(a,c,b);else indices.push(a,b,c);}
 for(const [y,rx,rz]of rings){const row=[],atlasY=T.MathUtils.mapLinear(y,WRIST,CUFF_TOP,-.101,-.076);for(let j=0;j<=SEGMENTS;j++){const a=j/SEGMENTS*TAU,x=Math.cos(a)*rx,z=Math.sin(a)*rz,n=new T.Vector3(Math.cos(a)/rx,0,Math.sin(a)/rz).normalize();row.push(vertex([x,y,z],n.toArray(),uvFor(x,atlasY,Math.sin(a)>=0)));}ringIds.push(row);}
 for(let r=0;r<ringIds.length-1;r++)for(let j=0;j<SEGMENTS;j++){const a=ringIds[r][j],b=ringIds[r+1][j],c=ringIds[r][j+1],d=ringIds[r+1][j+1];outward(a,b,c);outward(c,b,d);}
 // Bridge the authored oblique wrist cut into the fixed-size cuff. It is one
 // continuous surface, not a floating thumb/palm or a cuff placed over a gap.
 const boundary=source.metadata.wristBoundary.filter(i=>i<source.metadata.subdivision.weldedVertices)
  .map(i=>({i,p:Array.from(source.positions.subarray(i*3,i*3+3))}));
 let area=0;for(let j=0;j<boundary.length;j++){const p=boundary[j].p,q=boundary[(j+1)%boundary.length].p;area+=p[0]*q[2]-q[0]*p[2];}if(area<0)boundary.reverse();
 let first=0;for(let j=1;j<boundary.length;j++)if(boundary[j].p[0]>boundary[first].p[0])first=j;
 boundary.push(...boundary.splice(0,first));boundary.forEach((entry,j)=>entry.angle=j/boundary.length*TAU);

 const bridge=boundary.map(({p,angle})=>{const x=Math.cos(angle)*.026,z=Math.sin(angle)*.019,point=[(p[0]+x)/2,(p[1]+CUFF_TOP)/2,(p[2]+z)/2];return vertex(point,new T.Vector3(Math.cos(angle),0,Math.sin(angle)).toArray(),uvFor(point[0],(p[1]-.076)/2,point[2]>=0));});
 const edge=boundary.map(({i,p})=>copy(i,p[2]>=0));
 for(let j=0;j<edge.length;j++){const next=(j+1)%edge.length;outward(bridge[j],edge[j],bridge[next]);outward(bridge[next],edge[j],edge[next]);}
 // Zipper two loops with different vertex counts without leaving holes.
 const outer=ringIds.at(-1);let i=0,j=0;
 while(i<SEGMENTS||j<boundary.length){const ai=(i+1)/SEGMENTS*TAU,aj=j+1<boundary.length?boundary[j+1].angle:TAU+boundary[0].angle;
  const a=outer[i%SEGMENTS],b=bridge[j%bridge.length];
  if(i<SEGMENTS&&(j>=boundary.length||ai<=aj)){outward(a,b,outer[(i+1)%SEGMENTS]);i++;}else{outward(a,b,bridge[(j+1)%bridge.length]);j++;}
 }
 const geometry=own(new T.BufferGeometry());geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(skinIndices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(skinWeights,4));geometry.setIndex(indices);geometry.userData.sharedWeapon=true;
 handGeometry.set(side,geometry);
 geometry.addEventListener('dispose',()=>handGeometry.delete(side));
 return geometry;
}

export function createKitHand(parent,side,{material,own}){
 const root=new T.Group();root.name=side>0?'kit-trigger-hand':'kit-support-hand';parent.add(root);
 const source=AUTHORED_HANDS[side>0?'right':'left'],geometry=gloveGeometry(source,side,own);
 const bones=source.bones.map(b=>{const bone=new T.Bone();bone.name=b.name;bone.position.fromArray(b.position);bone.quaternion.fromArray(b.quaternion);bone.userData={rest:bone.quaternion.clone(),flexAxis:new T.Vector3(...b.flexAxis),bend:new T.Quaternion(),curl:0};return bone;});
 source.bones.forEach((b,i)=>{if(b.parent>=0)bones[b.parent].add(bones[i]);});
 const skin=new T.SkinnedMesh(geometry,material);skin.name='kit-skinned-glove';skin.frustumCulled=false;skin.add(bones[0]);skin.bind(own(new T.Skeleton(bones)));root.add(skin);
 const fingers=Array.from({length:5},(_,f)=>bones.slice(1+f*3,4+f*3));
 root.userData={fingers,skin,palm:bones[0],side,cuffEnd:WRIST,cuffLength:CUFF_TOP-WRIST,authoredAnatomy:true,sourceLicense:'CC0-1.0'};return root;
}

// At full shell contact the thumb and index hold the rim; the other fingers
// fold into the palm, progressively deeper towards the little finger.
const shellCurl = [[.10,.13,.08],[.32,.54,.38],[.41,.62,.43],[.49,.66,.46],[-.12,.18,.12]];
export function poseKitFingers(hand,grip,trigger=false,pinch=0){
 const rifle=hand.userData.weapon==='cr4';
 hand.userData.fingers.forEach((bs,f)=>{
  // Authored thumb opposition and metacarpal splay stay in the bind pose.
  // Different finger lengths need staggered curls, rather than one mitten pose.
  const angles=f===4?(trigger?[-.62,.12,.08]:rifle?[-.40,.22,.14]:[-.62,.12,.08]):trigger&&f===0?[.17,.40,.22]:[.48+f*.055,(rifle?.95:1.06)+f*.035,.62+f*.035];
  bs.forEach((bone,k)=>{const d=bone.userData;d.curl=-angles[k]*grip-shellCurl[f][k]*pinch;d.bend.setFromAxisAngle(d.flexAxis,d.curl);bone.quaternion.copy(d.rest).multiply(d.bend);});
 });
}

// Distances start at the back of the glove. Wrist, forearm belly, elbow
// and upper arm have distinct sections. Widths and depths are in metres.
const FOREARM = .27, UPPER_ARM = .32, ARM_LENGTH = FOREARM + UPPER_ARM;
const HEM = 1 - SHIRT_FRACTION;
const sections = [
 // Fraction of arm length, half width, half depth
 [0,.028,.0215], [.022,.027,.0205], [.055,.028,.021], [.10,.030,.022],
 [.16,.034,.025], [.23,.039,.029], [.30,.043,.033], [.355,.044,.035],
 [.395,.043,.0345], [.43,.041,.033], [FOREARM/ARM_LENGTH,.040,.032],
 [.49,.040,.032], [.53,.041,.0335], [.59,.044,.037], [.65,.047,.040],
 [HEM-.006,.048,.041], [HEM,.048,.041], [HEM+.010,.049,.042],
 [.74,.051,.044], [.83,.054,.048], [.92,.057,.053], [1,.059,.055]
];
const ROW = SEGMENTS + 1;
const RINGS = sections.length;

function crossSections(side, shortSleeves) {
  const shape = new Float32Array(RINGS * ROW * 2);
  for (let r = 0; r < RINGS; r++) {
    const [t, width, depth] = sections[r];
    const cloth = !shortSleeves || t >= HEM;
    const hem = shortSleeves && t >= HEM && t <= HEM + .010 ? .002 : 0;
    for (let j = 0; j <= SEGMENTS; j++) {
      const angle = (j % SEGMENTS) * TAU / SEGMENTS;
      const c = Math.cos(angle), s = Math.sin(angle);
      // More volume on the thumb side of the proximal forearm. Cloth has
      // ease over the skin, with a stitched hem and local compression folds.
      const muscle = .003 * side * Math.exp(-(((t - .29) / .13) ** 2));
      const wristFold = .0015 * Math.sin(71*t + s) * Math.exp(-(((t-.09)/.07) ** 2));
      const elbowFold = .0024 * Math.sin(82*t + 1.8*c) * Math.exp(-(((t-.465)/.095) ** 2));
      const fabric = cloth ? Math.min(1,t/.05) * (.0035 + wristFold + elbowFold + hem) : 0;
      const i = (r * ROW + j) * 2;
      shape[i] = (width + fabric) * c + muscle;
      shape[i+1] = (depth + fabric) * s;
      // Use the exact same loop as the glove at the join, including its centre.
      if (r === 0) shape[i] = width * c;
    }
  }
  return shape;
}

const contours = [-1,1].map(side => [crossSections(side,false), crossSections(side,true)]);

export function createKitSleeve(parent, side, {material, own}) {
  const geometry = own(new T.BufferGeometry()), uv = [], indices = [];
  for (let r = 0; r < RINGS; r++) {
    for (let j = 0; j <= SEGMENTS; j++) {
      uv.push(j/SEGMENTS*3, sections[r][0]*6);
      if (r+1 === RINGS || j === SEGMENTS) continue;
      const i = r*ROW + j;
      indices.push(i,i+1,i+ROW, i+1,i+ROW+1,i+ROW);
    }
  }
  for (const name of ['position','normal']) {
    geometry.setAttribute(name,new T.BufferAttribute(new Float32Array(RINGS*ROW*3),3).setUsage(T.DynamicDrawUsage));
  }
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
  geometry.userData.sharedWeapon = true;
  const sleeve = new T.Mesh(geometry,material);
  sleeve.name = 'kit-forearm-' + side;
  sleeve.frustumCulled = false;
  sleeve.receiveShadow = true;
  parent.add(sleeve);
  sleeve.userData = {
    side, rings:RINGS, segments:SEGMENTS, wrist:WRIST, last:new Float64Array(19).fill(NaN),
    wristPoint:new T.Vector3(), shoulder:new T.Vector3(), elbow:new T.Vector3(),
    axis:new T.Vector3(), pole:new T.Vector3(), fore:new T.Vector3(), upper:new T.Vector3(),
    x:new T.Vector3(), z:new T.Vector3(), wristAxis:new T.Vector3(), wristNormal:new T.Vector3(), elbowNormal:new T.Vector3(),
    previous:new T.Vector3(), transport:new T.Quaternion(), scratch:new T.Vector3(),
    centers:Array.from({length:RINGS},()=>new T.Vector3()), tangents:Array.from({length:RINGS},()=>new T.Vector3())
  };
  return sleeve;
}

// Solve two fixed lengths. At the end of the reach the shoulder can protract
// under the camera while the hand stays attached to its animated contact.
function solveArm(d, matrix, anchor) {
  const {wristPoint, shoulder, elbow, axis, pole, fore, upper, wristAxis, scratch} = d;
  wristPoint.set(0, WRIST, 0).applyMatrix4(matrix);
  wristAxis.setFromMatrixColumn(matrix,1).normalize().negate();
  axis.subVectors(wristPoint,anchor);
  const gap = axis.length();
  if (gap > 1e-6) axis.multiplyScalar(1/gap);
  else axis.set(0,0,-1);
  const reach = T.MathUtils.clamp(gap, UPPER_ARM-FOREARM+.025, ARM_LENGTH-.006);
  shoulder.copy(wristPoint).addScaledVector(axis,-reach);
  pole.set(d.side*.62,-1,.28).addScaledVector(wristAxis,.38).projectOnPlane(axis);
  if (pole.lengthSq() < 1e-6) pole.set(d.side,0,0).projectOnPlane(axis);
  pole.normalize();
  const along = (UPPER_ARM**2 - FOREARM**2 + reach**2) / (2*reach);
  const bend = Math.sqrt(Math.max(0, UPPER_ARM**2 - along**2));
  elbow.copy(shoulder).addScaledVector(axis,along).addScaledVector(pole,bend);
  fore.subVectors(elbow,wristPoint).normalize();
  upper.subVectors(shoulder,elbow).normalize();

  // A circular wrist bend leads tangentially into the straight forearm.
  // Its radius exceeds the cuff radius, even when the wrist turns sharply.
  const {wristNormal,elbowNormal} = d, wristRadius = .055;
  const cosW = T.MathUtils.clamp(fore.dot(wristAxis),-1,1);
  wristNormal.copy(fore).addScaledVector(wristAxis,-cosW).normalize();
  const ex = FOREARM*cosW, ey = FOREARM*Math.sqrt(1-cosW*cosW)-wristRadius;
  const straight = Math.sqrt(ex*ex+ey*ey-wristRadius*wristRadius);
  const sweep = Math.max(0,Math.atan2(ey,ex) + Math.atan2(wristRadius,straight));
  const wristArc = wristRadius*sweep, foreLength = wristArc+straight;
  fore.copy(wristAxis).multiplyScalar(Math.cos(sweep)).addScaledVector(wristNormal,Math.sin(sweep));

  // Round the elbow between the two shafts. A deeper flex needs a longer
  // tangent setback to keep the inside of the joint from folding over.
  const cosE = T.MathUtils.clamp(fore.dot(upper),-.99999,.99999);
  const elbowAngle = Math.acos(cosE), halfTan = Math.tan(elbowAngle/2);
  const setback = Math.min(.065*halfTan, straight*.93, UPPER_ARM*.85);
  const elbowRadius = setback/halfTan;
  elbowNormal.copy(upper).addScaledVector(fore,-cosE).normalize();
  scratch.copy(elbow).addScaledVector(fore,-setback);
  for (let r=0; r<RINGS; r++) {
    const distance = sections[r][0]*ARM_LENGTH;
    const fromElbow = distance < FOREARM ? (distance/FOREARM-1)*foreLength : distance-FOREARM;
    const fromWrist = foreLength+fromElbow;
    const center = d.centers[r], tangent = d.tangents[r];
    if (fromWrist < wristArc) {
      const angle = fromWrist/wristRadius;
      center.copy(wristPoint).addScaledVector(wristAxis,wristRadius*Math.sin(angle))
        .addScaledVector(wristNormal,wristRadius*(1-Math.cos(angle)));
      tangent.copy(wristAxis).multiplyScalar(Math.cos(angle)).addScaledVector(wristNormal,Math.sin(angle));
    } else if (fromElbow <= -setback) {
      center.copy(elbow).addScaledVector(fore,fromElbow);
      tangent.copy(fore);
    } else if (fromElbow < setback) {
      const angle = elbowAngle*(fromElbow+setback)/(2*setback);
      center.copy(scratch).addScaledVector(fore,elbowRadius*Math.sin(angle))
        .addScaledVector(elbowNormal,elbowRadius*(1-Math.cos(angle)));
      tangent.copy(fore).multiplyScalar(Math.cos(angle)).addScaledVector(elbowNormal,Math.sin(angle));
    } else {
      center.copy(elbow).addScaledVector(upper,fromElbow);
      tangent.copy(upper);
    }
  }
}

function writeSleeve(sleeve, matrix) {
  const d = sleeve.userData, {x,z,previous,transport,centers,tangents} = d;
  const shape = contours[d.side > 0 ? 1 : 0][d.privateShortSleeves ? 1 : 0];
  const {position,normal} = sleeve.geometry.attributes;
  const p = position.array, n = normal.array;
  x.setFromMatrixColumn(matrix,0).normalize();
  for (let r = 0; r < RINGS; r++) {
    const tangent = tangents[r];
    if (r > 0) {
      transport.setFromUnitVectors(previous,tangent);
      x.applyQuaternion(transport);
    }
    z.crossVectors(tangent,x).normalize();
    previous.copy(tangent);
    const center = centers[r];
    for (let j = 0; j <= SEGMENTS; j++) {
      const vertex = r*ROW+j, u = shape[vertex*2], v = shape[vertex*2+1];
      p[vertex*3] = center.x + x.x*u + z.x*v;
      p[vertex*3+1] = center.y + x.y*u + z.y*v;
      p[vertex*3+2] = center.z + x.z*u + z.z*v;
    }
  }

  // Differentiate the actual surface in both directions. Wrap the column
  // at the UV seam so both copies have the same lighting.
  for (let r = 0; r < RINGS; r++) {
    const lo = Math.max(0,r-1)*ROW, hi = Math.min(RINGS-1,r+1)*ROW;
    for (let j = 0; j < SEGMENTS; j++) {
      const a = (r*ROW+(j+SEGMENTS-1)%SEGMENTS)*3, b = (r*ROW+(j+1)%SEGMENTS)*3;
      const c = (lo+j)*3, e = (hi+j)*3;
      const ax=p[b]-p[a], ay=p[b+1]-p[a+1], az=p[b+2]-p[a+2];
      const bx=p[e]-p[c], by=p[e+1]-p[c+1], bz=p[e+2]-p[c+2];
      d.scratch.set(ay*bz-az*by, az*bx-ax*bz, ax*by-ay*bx).normalize().toArray(n,(r*ROW+j)*3);
    }
    const first = r*ROW*3;
    n.copyWithin(first+SEGMENTS*3,first,first+3);
  }
  position.needsUpdate = normal.needsUpdate = true;
}

export function fitKitSleeve(sleeve, hand, anchor) {
  hand.updateMatrix();
  const d = sleeve.userData, m = hand.matrix.elements, last = d.last;
  let dirty = last[16] !== anchor.x || last[17] !== anchor.y || last[18] !== anchor.z;
  for (let i=0; i<16 && !dirty; i++) dirty = last[i] !== m[i];
  if (!dirty) return false;
  last.set(m);
  anchor.toArray(last,16);
  solveArm(d,hand.matrix,anchor);
  writeSleeve(sleeve,hand.matrix);
  return true;
}
