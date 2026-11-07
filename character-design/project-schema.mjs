import {roleOf,roleSelection,DWARF_PALETTES} from '../src/fps/character-roles.mjs?v=6.1.2';
import {makeCreative,validateCreative,creativeBrief} from './creative-schema.mjs?v=6.1.2';
import {bodyRegions} from './body-proportions.mjs';
/** Portable, deterministic v2 concept format. No browser or 3D dependencies. */
export const FORMAT='cartridge-strike-character-project';
export const VERSION=2;
export const REQUIRED_CLIPS=Object.freeze(['Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop','Jump_Loop','Crouch_Idle_Loop','Crouch_Fwd_Loop','Pistol_Idle_Loop','Pistol_Shoot','Pistol_Reload','Death01']);
export const ANCHORS=Object.freeze({root:'Fristående / kropp',Head:'Huvud',spine_03:'Bröst / rygg',pelvis:'Midja',hand_l:'Vänster hand',hand_r:'Höger hand',foot_l:'Vänster fot',foot_r:'Höger fot',upperarm_l:'Vänster överarm',upperarm_r:'Höger överarm',clavicle_l:'Vänster axel',clavicle_r:'Höger axel'});
export const SHAPES=Object.freeze({box:'Kub / låda',sphere:'Kula',cylinder:'Cylinder',cone:'Kon',torus:'Ring',glb:'Importerad GLB'});
export const PALETTES=Object.freeze({
  analysts:{jacket:'#22435e',pants:'#22435e',vest:'#132d42',skin:'#e8d1b9',hair:'#49372a',boots:'#243039',accent:'#5aa8cf'},
  counterAnalysts:{jacket:'#9b967c',pants:'#9b967c',vest:'#505b42',skin:'#c6a486',hair:'#261e19',boots:'#243039',accent:'#c9ad65'},
  civilian:{jacket:'#dedecf',pants:'#475462',vest:'#b9babb',skin:'#e8d1b9',hair:'#49372a',boots:'#343b42',accent:'#468e8c'},
  blank:{jacket:'#7c8794',pants:'#7c8794',vest:'#7c8794',skin:'#d6ac8e',hair:'#3e2921',boots:'#35373b',accent:'#d7a54b'}
});
export const PRESETS=Object.freeze({
  cap:{label:'Keps',shape:'box',anchor:'Head',position:[0,1.748,-.01],dimensions:[.29,.08,.27],color:'#354953'},
  glasses:{label:'Glasögon',shape:'box',anchor:'Head',position:[0,1.635,.11],dimensions:[.24,.045,.055],color:'#222d39'},
  beard:{label:'Skägg',shape:'box',anchor:'Head',position:[0,1.518,.117],dimensions:[.16,.075,.065],color:'#413127'},
  hair:{label:'Hår / uppsättning',shape:'sphere',anchor:'Head',position:[0,1.765,0],dimensions:[.26,.13,.23],color:'#36261e'},
  helmet:{label:'Hjälm',shape:'sphere',anchor:'Head',position:[0,1.75,-.005],dimensions:[.29,.16,.29],color:'#353f51'},
  backpack:{label:'Ryggsäck',shape:'box',anchor:'spine_03',position:[0,1.18,-.19],dimensions:[.3,.40,.17],color:'#394851'},
  badge:{label:'Märke',shape:'box',anchor:'spine_03',position:[.08,1.38,.185],dimensions:[.09,.08,.013],color:'#e2ac53'},
  shoulder:{label:'Axelskydd',shape:'sphere',anchor:'spine_03',position:[-.22,1.43,0],dimensions:[.18,.16,.17],color:'#435765'},
  wrist:{label:'Armband',shape:'torus',anchor:'hand_l',position:[-.34,1.18,.05],dimensions:[.105,.03,.105],color:'#54a6c8'}
});
const cssColor=s=>/^#[0-9a-fA-F]{6}$/.test(s);
const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
export function filename(value){return (String(value||'projekt').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,48))||'projekt';}
export function newProject({kind='character',newCharacter=false,gender='male',team='analysts',template='analysts',name,role=(team==='hostage'?'hostage':'player'),target,variant=0}={}){
  const isObject=kind==='object';
  const theme=role==='dwarf'?DWARF_PALETTES[variant]||DWARF_PALETTES[0]:PALETTES[template]||PALETTES.analysts;
  const result={
    format:FORMAT,version:VERSION,kind:isObject?'object':'character',
    name:name||(isObject?'Mitt 3D-objekt':newCharacter?'Min nya karaktär':'Min FPS-karaktär'),
    intent:newCharacter?'create':'revise',
    base:{gender:gender==='female'?'female':'male',team:['analysts','counterAnalysts','hostage'].includes(team)?team:'analysts',template:PALETTES[template]?template:'analysts',
      original_glb:'quaternius-operator-'+(gender==='female'?'female':'male')+'.glb'},
    palette:{...theme},body:{height:100,width:100,shoulders:100,chest:100,arms:100,waist:100},pose:'Idle_Loop',view_flip:false,
    parts:[],creative:makeCreative(),notes:{face:'',clothes:'',shoes:'',gear:'',general:''},
    // Reference files are opt-in local attachments; bytes live outside this portable JSON.
    references:[]
  };
  if(!isObject){
   result.runtime={version:1,role,target:target||(role==='dwarf'?`dwarf-variant-${variant}`:role==='hostage'?'hostage-0':`${team==='counterAnalysts'?'counterAnalysts':'analysts'}-0`)};
   if(role==='hostage')result.base.team='hostage';
   if(role==='dwarf'){result.base.original_glb='procedural-dwarf-v1';result.base.variant=variant;result.base.gender='male';result.base.template='civilian';result.creative.face.facialHair='Helskägg';result.creative.gloves='skin';result.name=name||'Min bot-dvärg';}
  }
  return result;
}
export function addPart(project,preset='box'){
  if(project.parts.length>=60)throw Error('Maximalt 60 delar per projekt.');
  const p=PRESETS[preset];
  const shape=p?p.shape:(SHAPES[preset]?preset:'box');
  const index=project.parts.reduce((n,a)=>Math.max(n,Number(a.id)||0),0)+1;
  const item={
    id:String(index),name:p?p.label:'Egen '+SHAPES[shape].toLowerCase(),
    shape,anchor:project.kind==='object'?'root':p?p.anchor:'spine_03',
    position:project.kind==='object'?[0,.4,0]:p?[...p.position]:[0,1.25,.16],
    rotation:[0,0,0],dimensions:p?[...p.dimensions]:[.25,.25,.25],
    color:p?p.color:'#56abc5',visible:true,
    ...(p?{preset,fitVersion:0}:{}),note:''
  };
  if(roleOf(project)==='dwarf'){item.position=[item.position[0]*.65,.23+(item.position[1]-.98)*.45,item.position[2]*.8];if(item.anchor==='Head')item.position[1]=.70+(p?.position[1]??1.7)-1.81;item.dimensions=item.dimensions.map(v=>Math.max(.01,v*.8));}
  project.parts.push(item);
  return item;
}
export function clonePart(project,id){
  const old=project.parts.find(p=>p.id===id);
  if(!old)throw Error('Delen finns inte.');
  const next=addPart(project,old.shape);
  Object.assign(next,JSON.parse(JSON.stringify(old)),{id:next.id,name:(old.name+' kopia').slice(0,80),position:[old.position[0]+.13,old.position[1],old.position[2]]});
  return next;
}
/** Duplicate the other side of a symmetric outfit without editing geometry. */
export function mirrorPart(project,id){
 const original=project.parts.find(p=>p.id===id);
 if(!original)throw Error('Delen finns inte.');
 const mirrored=clonePart(project,id);
 mirrored.name=(original.name+' (spegel)').slice(0,80);mirrored.mirrored=!original.mirrored;
 mirrored.position=[-original.position[0],original.position[1],original.position[2]];
 mirrored.rotation=[original.rotation[0],-original.rotation[1],-original.rotation[2]];
 const counterpart={hand_l:'hand_r',hand_r:'hand_l',foot_l:'foot_r',foot_r:'foot_l',upperarm_l:'upperarm_r',upperarm_r:'upperarm_l',clavicle_l:'clavicle_r',clavicle_r:'clavicle_l'};
 mirrored.anchor=counterpart[original.anchor]||original.anchor;
 return mirrored;
}
export function validateProject(data){
  if(!data||typeof data!=='object'||data.format!==FORMAT||data.version!==VERSION)throw Error('Inte ett Character Design Studio v2-projekt.');
  if(!['character','object'].includes(data.kind)||typeof data.name!=='string'||data.name.length>100)throw Error('Projektets typ eller namn är ogiltigt.');
  const b=data.base||{},dwarf=roleOf(data)==='dwarf';
  if(data.kind==='character'){roleSelection(data);if(data.runtime&&data.runtime.version!==1)throw Error('Okänd rollversion.');}
  if(!['male','female'].includes(b.gender)||!['analysts','counterAnalysts','hostage'].includes(b.team)||!PALETTES[b.template]||b.original_glb!==(dwarf?'procedural-dwarf-v1':'quaternius-operator-'+b.gender+'.glb'))throw Error('Okänd grundmodell.');
  if(dwarf&&(!Number.isInteger(b.variant)||b.variant<0||b.variant>4||data.creative?.realism?.head==='scan'))throw Error('Dvärgens grundutseende måste vara 1–5; porträttskanningen hör till människoriggen.');
  if(!data.palette||Object.keys(PALETTES.analysts).some(key=>!cssColor(data.palette[key])))throw Error('Ogiltiga klädfärger.');
  if(!data.body||!finite(data.body.height,80,120)||!finite(data.body.width,80,120))throw Error('Kroppsreglagen är utanför tillåtet område.');
  bodyRegions(data.body); // Missing regional fields in older projects mean neutral (100%).
  if((typeof data.pose!=='string'||data.pose.length>64||!(/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(data.pose)))||data.view_flip!==undefined&&typeof data.view_flip!=='boolean')throw Error('Okänd pose eller vyinställning.');
  if(!Array.isArray(data.parts)||data.parts.length>60||new Set(data.parts.map(p=>p.id)).size!==data.parts.length)throw Error('För många eller duplicerade delar.');
  for(const p of data.parts){
    if(!p||typeof p.id!=='string'||p.id.length>32||typeof p.name!=='string'||p.name.length>80||!SHAPES[p.shape]||!Object.hasOwn(ANCHORS,p.anchor)||!cssColor(p.color)||
      ![p.position,p.rotation,p.dimensions].every(a=>Array.isArray(a)&&a.length===3)||
      !p.position.every(n=>finite(n,-5,5))||!p.rotation.every(n=>finite(n,-180,180))||
      !p.dimensions.every(n=>finite(n,.01,4))||typeof p.visible!=='boolean'||typeof p.note!=='string'||p.note.length>1000)throw Error('Fel i en objektdel.');
    if(data.kind==='object'&&p.anchor!=='root')throw Error('Fristående objekt kan inte fästas på skelett.');
  }
  if(data.embeddedReferences!==undefined){
   if(!data.embeddedReferences||typeof data.embeddedReferences!=='object'||Array.isArray(data.embeddedReferences)||Object.keys(data.embeddedReferences).length>8)throw Error('Ogiltiga inbäddade tillgångar.');
   let total=0;for(const [name,value]of Object.entries(data.embeddedReferences)){if(!data.references.some(r=>r.name===name)||typeof value!=='string'||!value.length||value.length>17_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Skadad inbäddad fil.');total+=value.length;}if(total>26_000_000)throw Error('Tillgångarna är för stora.');
  }
  for(const part of data.parts)if(part.shape==='glb'&&(!data.references.some(r=>r.name===part.asset&&r.type==='glb')||!data.embeddedReferences?.[part.asset]))throw Error('GLB-tillbehörets originalfil saknas.');
  if(data.parts.some(p=>p.followsFace!==undefined&&typeof p.followsFace!=='boolean'))throw Error('Ogiltig passformsinställning.');
  if(data.parts.some(p=>p.preset!==undefined&&!Object.hasOwn(PRESETS,p.preset)||p.fitVersion!==undefined&&![0,1].includes(p.fitVersion)))throw Error('Okänt tillbehör.');
  if(data.parts.some(p=>p.mirrored!==undefined&&typeof p.mirrored!=='boolean'))throw Error('Ogiltig spegling.');
  if(data.parts.some(p=>p.hairReplacement!==undefined&&(typeof p.hairReplacement!=='boolean'||p.hairReplacement&&(p.shape!=='glb'||p.anchor!=='Head'))))throw Error('Ersättningshår behöver vara en GLB fäst vid Head.');
  if(data.artwork?.portraitFraming!==undefined&&!['legacy-headbone-v4','anatomical-v5'].includes(data.artwork.portraitFraming))throw Error('Okänd porträttinramning.');
  if(data.creative!==undefined)validateCreative(data.creative);
  if(!data.notes||Object.keys(newProject().notes).some(k=>typeof data.notes[k]!=='string'||data.notes[k].length>3000))throw Error('Ogiltiga designanteckningar.');
  if(!Array.isArray(data.references)||data.references.length>8||data.references.some(x=>!x||typeof x.name!=='string'||x.name.length>100||!['glb','blend','png','jpg','jpeg','webp'].includes(x.type)||!finite(x.bytes,0,12*1024*1024)))throw Error('Ogiltiga referenser.');
  return data;
}
export function animationContract(project,availableClips=[],availableBones=[]){
  const character=project.kind==='character';
  return {
    schema:'cartridge-strike-fps-rig-contract-v1',kind:project.kind,
    runtime_assignment:character?roleSelection(project):null,
    source_file:character?project.base.original_glb:null,
    existing_game_character_import:'src/fps/character-library.mjs?v=6.1.2',
    existing_game_actor_bridge:'src/fps/character-actors.mjs?v=6.1.2',
    studio_preview_file:'PREVIEW.glb',
    studio_preview_status:'Skinned design prototype with original clips; NOT gameplay-validated. Accessories may be rigid. Validate deformation, grip, collisions and materials before integration.',
    canonical_axes:{units:'meters',up:'+Y',front:'+Z',game_holder_rotation_y:'PI (the game turns actors to face -Z)'},
    reference_height_m:character?(roleOf(project)==='dwarf'?.86:1.69):null,
    dimensions_multiplier:character?{height:project.body.height/100,width:project.body.width/100}:null,
    regional_body_shape_percent:character?bodyRegions(project.body):null,
    required_animation_clips:character?(roleOf(project)==='dwarf'?['Idle_Loop','Walk_Loop','Death01']:[...REQUIRED_CLIPS]):[],
    observed_animation_clips:character?[...availableClips]:[],
    observed_bone_names:character?[...availableBones]:[],
    attachment_rule:character?'Parts attached to named bones use neutral root coordinates in meters and rotation in degrees. Reconstruct each bone-local rest matrix; test animation and skinning.':'Object parts use world/root coordinates in meters. Choose a sensible origin, pivot and collision when integrating.',
    quality_checks:character?[
      'Preserve original skeleton, hierarchy, bone names, bind poses, skin weights and motion clips',
      'Avoid rigid attachments that detach during crouch, jump, reload or death',
      'Validate hands and weapon alignment, first-person and third-person silhouettes',
      'Keep original model unchanged until a separate integration and regression run',
      'Optimize polygon count, draw calls, memory and mobile/WebGL performance',
      'Check all materials and avoid duplicated built-in runtime vest, boots, patches and headset'
    ]:[
      'Preserve the authored dimensions, shape placement, colors and intended object pivot',
      'Replace rough primitives with an efficient finished mesh if requested',
      'Provide a collision suggestion for the target game environment',
      'Optimize polygon count, draw calls, memory and mobile/WebGL performance',
      'Avoid altering any existing game runtime or publishing user-supplied models without review'
    ],
    deliverable:character?'Final skinned and animated character GLB plus four views and FPS integration notes':'Final optimized standalone prop GLB plus orthographic views and integration notes',
    prototype_only:true
  };
}
export function aiBrief(project,availableClips=[],availableBones=[]){
  validateProject(project);
  const c=animationContract(project,availableClips,availableBones);
  const lines=[
    '# CARTRIDGE STRIKE / 3D DESIGN HANDOFF',
    '',
    'Project: '+project.name,
    'Task: '+(project.kind==='object'?'Create a reusable 3D prop':project.intent==='create'?'Create a NEW, unique animated FPS character':'Revise the EXISTING animated FPS character'),
    '',
    '## Source and interpretation',
    project.kind==='character'?('Start from BASE_RIG.glb ('+project.base.original_glb+'); do NOT substitute an unrelated skeleton.'):'The project contains a precisely positioned 3D primitive prototype and JSON. The object is NOT an animated game character.',
    'The 4-angle reference PNG and annotations are creative direction, not exact topology.',
    'PREVIEW.glb is the complete visible design prototype with its existing skeleton and animation clips. Preserve its visible appearance. New hair and rigid accessories require animation/intersection review; it is NOT a verified game-ready asset.',
    'Use MANIFEST.json to map packaged references to their original names and hashes. Do not infer missing files.',
    'PROJECT.json is the canonical editable specification; ANIMATION_CONTRACT.json is the compatibility checklist.',
    '',
    '## Appearance',
    ...(project.kind==='character'?['Body height: '+project.body.height+'% of original. Body width: '+project.body.width+'% of original.', 'Regional bind-space torso/arm shape: '+JSON.stringify(bodyRegions(project.body))+'. Preserve mesh edits and source skin weights; test the skeleton and fit in every animation.', ...Object.entries(project.palette).map(([k,v])=>'Material '+k+': '+v)]:[]),
    ...Object.entries(project.notes).map(([k,v])=>k+': '+(v||'[unchanged / unspecified]')),
    ...(project.kind==='character'?creativeBrief(project.creative):[]),
    '',
    '## Modelled 3D components (coordinates in original unscaled model space, meters)',
    ...(project.parts.length?project.parts.map(p=>'- '+p.name+' ('+(p.preset?'modelled '+p.preset:p.shape)+'), anchor='+p.anchor+', pos=['+p.position.join(', ')+'], rotation degrees=['+p.rotation.join(', ')+'], dimensions m=['+p.dimensions.join(', ')+'], color='+p.color+', visible='+p.visible+', note='+(p.note||'none')):['No added primitive parts.']),
    '',
    '## Character animation and FPS integration',
    ...(project.kind==='character'?[
      'Original height is normalized to approximately 1.69m by the game.',
      'Preserve all source animation clips and compatible skinning, not just a static mesh.',
      'Critical animations: '+REQUIRED_CLIPS.join(', ')+'.',
      'Bone attachments must follow the body in idle, walk, run, jump, crouch, shooting, reloading and death.',
      'Retain handed weapon attachment/grip and check correct IK support hand alignment.',
      'The game builds clothing colors, boots, vest, radio, headset and patches at runtime. Merge/replace these deliberately; avoid overlapping meshes.',
      'Export optimized skinned GLB with embedded textures and animation. Test FPS runtime separately; no assertion that this concept ZIP is a ready-to-play 3D model.',
    ]:[
      'Create a reusable optimized prop GLB with sensible origin/pivot, dimensions and collision suggestion.',
      'Character animation requirements apply only if the prop is later attached to a character.',
    ]),
    '',
    '## Delivery acceptance',
    ...c.quality_checks.map((v,i)=>(i+1)+'. '+v),
    'Provide final game-ready .glb, 4 orthographic views, a change log, and an integration note describing any rig/material differences.',
    'The generated STATIC_PROTOTYPE.glb is a static shape concept; it is NOT the final rigged character and is not animation-complete.',
    'Reference files are inspiration; use only what the user has rights to include.'
  ];
  return lines.join('\n');
}

/** Upgrade provenance only for recognisable built-in presets. Preserve custom
 * transforms; untouched old defaults get one anatomical fitting pass. */
export function upgradeAccessories(project){
 for(const part of project.parts){
  if(part.preset||part.shape==='glb')continue;
  for(const [type,preset]of Object.entries(PRESETS)){
   if(part.shape!==preset.shape||!(part.name===preset.label||part.name.startsWith(preset.label+' kopia')||part.name.startsWith(preset.label+' (spegel)')))continue;
   part.preset=type;
   if(JSON.stringify(part.position)===JSON.stringify(preset.position)&&JSON.stringify(part.dimensions)===JSON.stringify(preset.dimensions)&&part.rotation.every(n=>n===0))part.fitVersion=0;
   else part.fitVersion=1;
   break;
  }
 }
}
