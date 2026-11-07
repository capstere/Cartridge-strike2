/** Reversible Floor 5 empty-interior preset; the source building is untouched.
 * The legacy emptyFixed bit is already supported by the version-2 project
 * resolver and old furniture-studio migration. Never infer deletion from
 * hidden rendering alone: baseline furniture IDs must also be removed.
 */
import {floor5Baseline} from './project-scene.mjs?v=5.8.0';
import {EDITABLE_KINDS} from '../core.mjs?v=5.8.0';

const ensureFloor5=(project,scene)=>{
 if(project?.mode!=='edit-floor5'||!Array.isArray(scene?.baselineItems)||!Array.isArray(scene?.items)||!Array.isArray(scene?.fixed))
  throw Error('Funktionen gäller bara Floor 5 med en giltig byggnadskopia.');
};

export function clearFloor5Interior(project,scene){
 ensureFloor5(project,scene);
 const count={furniture:scene.items.length,fixed:scene.fixed.length,
  posters:project.architecture.posters?.length||0,treatments:project.architecture.treatments?.length||0};
 scene.items.splice(0);
 scene.fixed.splice(0);
 // Version 2 consumers already understand this flag. It is a destructive
 // project edit, not a transient "hide furniture" visual toggle.
 project.legacyPatch={...(project.legacyPatch||{}),emptyFixed:true};
 project.architecture.posters=[];
 project.architecture.treatments=[];
 project.assets.library=[];
 project.assets.local=[];
 project.assets.posters=[];
 return count;
}

export function restoreFloor5Interior(project,scene){
 ensureFloor5(project,scene);
 const originals=scene.baselineItems.map(o=>({...o,original:{...o}}));
 const sourceIds=new Set(originals.map(o=>o.id));
 const personal=scene.items.filter(o=>!sourceIds.has(o.id));
 scene.items.splice(0,scene.items.length,...originals,...personal);
 const fixed=floor5Baseline().data.obstacles.filter(
  o=>!EDITABLE_KINDS[o.kind]&&o.kind!=='uncertain-area'
 );
 scene.fixed.splice(0,scene.fixed.length,...fixed);
 project.legacyPatch={...(project.legacyPatch||{}),emptyFixed:false};
 return {furniture:originals.length,fixed:fixed.length,personalPreserved:personal.length};
}
