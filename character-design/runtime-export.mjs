import {createRuntimeViewAppearance} from '../src/fps/view-character-appearance.mjs?v=6.1.2';
/** Export -> re-import -> shared engine validation. No original asset is changed. */
import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from '../vendor/three/addons/exporters/GLTFExporter.js';
import {ACTOR_FORMAT,ACTOR_VERSION,actorHash,inspectActorGLB,validateActorAsset} from '../src/fps/character-runtime-contract.mjs?v=6.1.2';
import {roleSelection,dwarfVariant} from '../src/fps/character-roles.mjs?v=6.1.2';
import {createDwarfAsset} from '../src/fps/dwarf-rig.mjs?v=6.1.2';
import {packZip} from './zip-export.mjs';
export async function runtimeExport(project,workbench){
 if(project.kind!=='character')throw Error('Välj spelkaraktär, gisslan eller bot-dvärg.');
 const {role,target}=roleSelection(project),gender=project.base.gender;
 if(project.creative?.realism?.garment!=='none')throw Error('Tygsimuleringen är en studioprototyp. Välj Tygplagg: Inget för direkt spelexport; spara annars Blender-paketet med hela designen.');
 await Promise.all(workbench.fashion.pendingImages);workbench.prepareHandoff();
 const bytes=await workbench.exportPreview();inspectActorGLB(bytes);const loader=new GLTFLoader();
 let source,sourceData,sourceIdentity;
 if(role==='dwarf'){source=createDwarfAsset(dwarfVariant(project));sourceData=await new GLTFExporter().parseAsync(source.scene,{binary:true,animations:source.animations});sourceIdentity={generator:'cartridge-dwarf-v1'};}
 else{const file='quaternius-operator-'+gender+'.glb',r=await fetch(new URL('../assets/fps/models/'+file,import.meta.url));if(!r.ok)throw Error('Originalmodellen saknas.');sourceData=await r.arrayBuffer();source=await loader.parseAsync(sourceData.slice(0),'');sourceIdentity={file,sha256:await actorHash(sourceData)};}
 const contract={format:ACTOR_FORMAT,version:ACTOR_VERSION,name:project.name,role,target,gender,rig:role==='dwarf'?'cartridge-dwarf-v1':'quaternius-operator-'+gender,
  source:sourceIdentity,file:'CHARACTER.glb',bytes:bytes.byteLength,sha256:await actorHash(bytes),front:'+Z',up:'+Y',
  view:{shortSleeves:['tshirt','polo','vest'].includes(project.creative?.outfit)},
  gameplay:'cosmetic-only; preserve AI, collision, health, weapons and objectives',footwear:role==='dwarf'?'dwarf-original':'ankle-fitted-v2',studioVersion:'6.1.2'};
 const loaded=await loader.parseAsync(bytes.slice(0),'');const report=validateActorAsset(loaded,contract,source);
 if(role==='player'){const appearance=createRuntimeViewAppearance(loaded,contract.view);appearance.dispose();report.firstPersonMaterialsMatched=true;}
 const files=[{name:'CHARACTER.glb',data:bytes},{name:'CHARACTER.json',data:JSON.stringify(contract,null,2)},{name:'PROJECT.json',data:JSON.stringify(project,null,2)},
  {name:'BASE_RIG.glb',data:sourceData},{name:'COMPATIBILITY.json',data:JSON.stringify(report,null,2)},
  {name:'README.txt',data:`Cartridge Strike · karaktärspaket 6.1.2\nRoll: ${role}\nSpelplats: ${target}\n\nCHARACTER.glb är din exporterade modell, inte en statisk skiss. Alla originalrörelser har kontrollerats efter återimport.\nPROJECT.json är designoriginalet. Behåll hela ZIP-filen och skicka den till implementeraren.\nInstallera med tools/install-character-package.mjs; registret väljer rätt roll utan ny specialkod. Inga spelregler ändras.\nAutomatisk kontroll ersätter inte visuell granskning av alla klädkombinationer. Fristående tygsimulering ingår inte.\n`}];
 return {bytes,contract,report,asset:loaded,source,files,zip:packZip(files)};
}
