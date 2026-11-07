import {newRealism,validateRealism} from './realism-schema.mjs?v=53';
import {newSculpt,validateSculpt} from './sculpt-schema.mjs?v=6.1.2';
/** Extra creative options, backward-compatible with saved v2 design projects. */
export const OUTFITS=Object.freeze({
 original:'Originaluniform',tshirt:'T-shirt',hoodie:'Hoodie',jacket:'Jacka med dragkedja',
 polo:'Pikétröja',labcoat:'Labbrock',vest:'Skyddsväst',fieldjacket:'Studiojacka'
});
export const HAIRSTYLES=Object.freeze({
 original:'Originalfrisyr',bald:'Rakat / inget hår',short:'Kort',curly:'Lockigt',bob:'Page',long:'Långt',
 ponytail:'Hästsvans',mohawk:'Mohawk',buzz:'Snaggat',swept:'Kort, sidokammad'
});
export const FACE_CHOICES=Object.freeze({
 eyes:['Naturliga','Stora','Smala','Runda','Markerade'],
 eyebrows:['Naturliga','Tjocka','Tunna','Bågformade','Raka'],
 nose:['Naturlig','Smal','Bred','Uppåtvänd','Rak'],
 mouth:['Naturlig','Smalt leende','Fylligare läppar','Allvarlig','Brett leende'],
 jaw:['Naturlig','Rund','Kantig','Smal','Bred'],
 facialHair:['Ingen','Stubb','Kort skägg','Helskägg','Mustasch'],
 freckles:['Nej','Lätt','Tydliga']
});
export const REQUEST_ANIMATIONS=Object.freeze({
 wave:'Vinka',dance:'Dansa',celebrate:'Fira vinst',crouchJump:'Hoppa hukande',
 hitReact:'Reagera på träff',climb:'Klättra',slide:'Glida',sit:'Sitta',
 melee:'Närstrid',emote:'Personligt emote'
});
export const FONT_STYLES=Object.freeze({sans:'Sans-serif',serif:'Serif',mono:'Monospace'});
export function makeCreative(){
 return {
  outfit:'original',hair:'original',sculpt:newSculpt(),realism:newRealism(),
  fit:100,roughness:85,shoes:'sneakers',gloves:'original',vest:false,
  printTransform:{x:0,y:0,rotation:0,scale:100},
  face:{eyes:'Naturliga',eyebrows:'Naturliga',nose:'Naturlig',mouth:'Naturlig',jaw:'Naturlig',facialHair:'Ingen',freckles:'Nej',eyeColor:'#547a8d'},
  print:{text:'',color:'#ffffff',font:'sans',size:60,position:'front',
   imageData:null,imageName:null,imageMode:'print',imageScale:100},
  requestedAnimations:[],faceView:'front'
 };
}
/** Explicit opt-in for older designs; new character projects start here. */
export function applyStudioFoundation(project){
 const c=ensureCreative(project);c.outfit='fieldjacket';c.hair='swept';c.fit=100;c.vest=false;c.roughness=85;
 c.realism.head='original';c.realism.fiberHair=false;c.realism.fabric='cotton';c.realism.garment='none';
 project.base.template='civilian';Object.assign(project.palette,{skin:'#e8d1b9',hair:'#352922',jacket:'#465e68',pants:'#293740',boots:'#302e2b',accent:'#8faaa7'});
 return project;
}
export function ensureCreative(project){
 if(project.artwork?.faceViews&&!project.artwork.portraitFraming&&!/^5\./.test(project.studioVersion||''))project.artwork.portraitFraming='legacy-headbone-v4';
 if(!project.creative)project.creative=makeCreative();
 const defaults=makeCreative();
 for(const key of ['fit','roughness','shoes','gloves','vest','printTransform','sculpt','realism'])if(project.creative[key]===undefined)project.creative[key]=defaults[key];
 for(const key of ['hairLength','hairVolume','garmentLength'])if(project.creative.realism[key]===undefined)project.creative.realism[key]=100;
 return project.creative;
}
const hex=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);
export function validateCreative(c){
 if(!c||typeof c!=='object'||!Object.hasOwn(OUTFITS,c.outfit)||!Object.hasOwn(HAIRSTYLES,c.hair))throw Error('Okänd kläd- eller frisyrstil.');
 if(!c.face||!hex(c.face.eyeColor)||Object.entries(FACE_CHOICES).some(([k,values])=>!values.includes(c.face[k])))throw Error('Ogiltiga ansiktsinställningar.');
 for(const [key,min,max] of [['fit',85,120],['roughness',10,100]])if(c[key]!==undefined&&(!Number.isFinite(c[key])||c[key]<min||c[key]>max))throw Error('Ogiltig passform/material.');
 if(c.shoes!==undefined&&!['boots','sneakers'].includes(c.shoes)||c.gloves!==undefined&&!['original','skin'].includes(c.gloves)||c.vest!==undefined&&typeof c.vest!=='boolean')throw Error('Ogiltigt klädeslager.');
 if(c.printTransform!==undefined){const t=c.printTransform;if(!t||!Number.isFinite(t.x)||Math.abs(t.x)>100||!Number.isFinite(t.y)||Math.abs(t.y)>100||!Number.isFinite(t.rotation)||Math.abs(t.rotation)>180||!Number.isFinite(t.scale)||t.scale<25||t.scale>200)throw Error('Ogiltig tryckplacering.');}
 if(c.sculpt!==undefined)validateSculpt(c.sculpt);
 if(c.realism!==undefined)validateRealism(c.realism);
 const p=c.print||{};
 if(typeof p.text!=='string'||p.text.length>100||!hex(p.color)||!Object.hasOwn(FONT_STYLES,p.font)||
  !Number.isInteger(p.size)||p.size<20||p.size>120||!['front','back'].includes(p.position)||
  !['print','pattern'].includes(p.imageMode)||!Number.isInteger(p.imageScale)||p.imageScale<30||p.imageScale>200)throw Error('Ogiltigt tryck eller text.');
 if(p.imageData!==null&&p.imageData!==undefined&&
  (typeof p.imageData!=='string'||p.imageData.length>7_000_000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.imageData)))
  throw Error('PNG-mönstret får inte vara större än 7 MB som datatext.');
 if(p.imageName!==null&&p.imageName!==undefined&&(typeof p.imageName!=='string'||p.imageName.length>100))throw Error('Ogiltigt PNG-filnamn.');
 if(!Array.isArray(c.requestedAnimations)||c.requestedAnimations.length>10||new Set(c.requestedAnimations).size!==c.requestedAnimations.length||
   c.requestedAnimations.some(x=>!Object.hasOwn(REQUEST_ANIMATIONS,x)))throw Error('Ogiltiga önskade animationer.');
 if(!['front','left','right'].includes(c.faceView))throw Error('Ogiltig närbildsvy.');
 return c;
}
export function creativeBrief(c){
 if(!c)return [];
 const labels=Object.fromEntries(Object.entries(c.face).map(([key,value])=>[key,value]));
 const p=c.print;
 return [
  '',
  '## Clothing, facial design and custom textile artwork',
  'Selected clothing: '+OUTFITS[c.outfit]+' ('+c.outfit+'). This is a conceptual garment mockup and MUST be converted into deforming, correctly skinned clothes.',
  'Direct sculpt: PROJECT.json creative.sculpt contains per-rig, topology-signed, sparse bind-space vertex offsets and skin paint. PREVIEW.glb contains the actual sculpted, skinned geometry, UVs, weights and colour attributes. Preserve that appearance; do not reduce the authored sculpt to generic face presets.',
  'Surface/physics settings: '+JSON.stringify(c.realism||newRealism())+'. The optional Infinite scanned head is one adult male portrait with closed eyes, CC BY 3.0, transferred to the existing Head/Neck bones; it has no facial expression rig. Preserve attribution. It is not a photorealistic full-body replacement.',
  'Hair length/volume and garment length are percentages of the selected procedural style, with 100 as its default. Hair roots and ponytail tie stay attached; volume controls guide lift. Use PREVIEW.glb as the exact shape reference; garment rest geometry and constraints are regenerated for its selected length.',
  'Thin hair ribbons use an alpha strand texture and anisotropic material; they are not strand-level hair simulation. CLOTH_SIMULATION.json contains XPBD rest data, pins, constraints, body collision bone links and settings; CLOTH_SOLVER.mjs is the actual portable solver source. For simulated garments the reference images and preview are settled in Idle_Loop; PROJECT.pose remains the selected motion to test. PREVIEW.glb contains a frozen draped skinned mesh, not baked secondary physics. Port/bake the simulation for the game and validate body/self collisions. No self collision/sewing is implemented.',
  'Hair design: '+HAIRSTYLES[c.hair]+'. Sculpt hair and ensure it follows Head bone and does not clip with headgear.',
  ...(c.hair==='swept'?['The studio swept cut adapts the Quaternius male artist-authored hair volumes to either scalp, with opaque tapered combed locks. On a female project HAIR_SOURCE_MALE.glb supplies its unmodified source; on a male project the source is BASE_RIG.glb. It is rigidly Head-attached, not fiber simulation; hairLength/hairVolume do not change this authored cut. Preserve the exact geometry from PREVIEW.glb.']:[]),
  ...(c.outfit==='fieldjacket'?['The studio jacket reuses the original weighted garment shell. Its collar and projected zipper are independently skinned to the SAME skeleton with transferred garment weights; it is not independent cloth simulation. The original vest-shell is part of the body surface, not removable cloth; the extra vest option changes its colour. An independently tailored vest remains finishing work. Validate collar/neck, zipper and all layers in game poses.']:[]),
  ...Object.entries(labels).map(([key,value])=>'Face / '+key+': '+value),
  'Use FACE_FRONT.png, FACE_LEFT.png, FACE_RIGHT.png if provided as high-resolution traced detail references; face choices deform the cloned preview geometry; validate facial topology and expression quality before integration.',
  'Shirt text: '+(p.text||'[none]')+'; font='+p.font+', colour='+p.color+', size='+p.size+' px in 512px preview, position='+p.position+'.',
  'Textile uploaded: '+(p.imageData?'yes – see SHIRT_ARTWORK.png ('+(p.imageName||'custom art')+')':'none')+
   '; type='+p.imageMode+'; scale='+p.imageScale+'%.',
  'For pattern: seamlessly tile/repeat across garment UVs. For print: place artwork on '+p.position+' without stretching; keep transparent areas and legibility.',
  'Print is projected onto the skinned shirt preview. PROJECT.json printTransform stores x/y in cm, rotation in degrees and scale percent. Preserve the original PNG aspect ratio and transparency.',
  'Clothing layers / fit / material: '+JSON.stringify({fit:c.fit,roughness:c.roughness,shoes:c.shoes,gloves:c.gloves,vest:c.vest,printTransform:c.printTransform}),
  '',
  '## Additional animations requested (NOT included in original rig)',
  ...(c.requestedAnimations.length?c.requestedAnimations.map(id=>'- '+REQUEST_ANIMATIONS[id]+': create an original animation clip on the SAME original skeleton and document integration to game logic.'):['None requested.']),
  'Do not present requested additional animations as already available; original GLB animations are supplied separately.'
 ];
}
