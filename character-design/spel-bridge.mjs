/** Data-only handoff to Blender / SPEL. This is a preview, not a certified runtime asset. */
import {bodyRegions} from './body-proportions.mjs';
export const BRIDGE_VERSION=1;
export function makeSpelBridge(project,clips=[],bones=[]){
 if(!project||project.kind!=='character')throw Error('SPEL-överlämningen kräver en karaktär.');
 const b=bodyRegions(project.body);
 return {
  schema:'cartridge-strike-spel-bridge-v1',
  stage:'authoring_preview_not_game_ready',
  import_file:'SPEL_SOURCE.glb',
  same_geometry_as:'PREVIEW.glb',
  original_reference:'BASE_RIG.glb',
  project_file:'PROJECT.json',
  axes:{up:'+Y',front:'+Z',unit:'metre'},
  rig:{original:project.base.original_glb,observed_clips:[...clips],observed_bones:[...bones]},
  appearance:{
   gender:project.base.gender,
   height_percent:project.body.height,
   width_percent:project.body.width,
   regional_shape_percent:b,
   outfit:project.creative?.outfit||'original',
   hair:project.creative?.hair||'original',
   imported_hair_parts:project.parts.filter(p=>p.visible&&p.hairReplacement).map(p=>({name:p.name,source:p.asset,anchor:p.anchor})),
   shell_type:project.creative?.outfit==='hoodie'?'weighted_outer_shell':null
  },
  verification:{
   game_runtime_modified:false,
   blender_import_verified:false,
   spel_paint_roundtrip_verified:false,
   warning:'SPEL may reject skinned, head-attached, custom or complex geometry. Analyze first; never bypass a failed compatibility check.',
   checks:['Preserve skeleton, bone names, bind pose, weights and original animation clips',
    'Inspect deformation and clothing intersections in idle, walk, crouch, reload and death',
    'Inspect hair and attachments on the Head bone',
    'If modifying mesh, regenerate a new SPEL / Procreate export receipt for the new source',
    'Review normal maps and material compatibility before painting']
  }
 };
}
export function makeSpelGuide(project){
 if(!project||project.kind!=='character')return '';
 return '# Blender / SPEL-överlämning från Character Design Studio 6.0\n\n'
 +'1. Packa upp ZIP-paketet. Behåll BASE_RIG.glb, PROJECT.json och alla medföljande referenser.\n'
 +'2. I Blender 4.5 LTS: File → Import → glTF 2.0 och välj SPEL_SOURCE.glb.\n'
 +'   Alternativ: öppna SPEL Asset Factory och välj Importera GLB → SPEL_SOURCE.glb.\n'
 +'3. Kontrollera utseendet framifrån/sidan/bakifrån och spela Idle, Walk, Crouch och Reload.\n'
 +'4. Om allt ser rätt ut: spara en NY .blend-arbetsfil. Skriv aldrig över källmodellen.\n'
 +'5. SPEL:s Procreate-funktion är en SEPARAT kompatibilitetskontroll: välj Förbered karaktär för Procreate ENDAST om SPEL visar Kompatibel.\n'
 +'6. Måla OBJ/MTL/PNG på iPad och importera ZIP tillbaka till samma SPEL-källarbetskopia. Tidigare målningskvitton gäller inte automatiskt den ändrade geometrin.\n'
 +'7. Återexportera och återimportera GLB i en ren Blender-scen för kontroll av ben, klipp, UV, material och deformation.\n\n'
 +'VIKTIGT: Detta paket är en riktig skinnad DESIGNPROTOTYP med animationer, inte verifierad för FPS-runtime.\n'
 +'Anpassade hårmodeller är huvudben-fästa tillbehör, inte nya hårstrån med skinning. Hoodiens extra yta följer originalriggens skinnning men är inte ett skräddarsytt plagg.\n'
 +'SPEL 0.8 kanske avvisar sådana beroenden; använd inte ett tekniskt undantag eller radera benkopplingar för att kringgå kontrollen.\n';
}
