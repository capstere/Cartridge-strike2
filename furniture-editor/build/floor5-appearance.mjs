/** Display-only refinements for the prepared Floor 5. Never rewrites project data.
 * Explicit paint wins; a later floor-type choice also overrides this scoped pass.
 */
export function preparedFloorFinish(project,id,surface){
 if(!project.intent?.floor5Preparation)return null;
 if(['I12','I13'].includes(id)&&surface==='dark-gloss-laminate')return 'service-vinyl';
 if(['I01','I02','I04'].includes(id)&&surface==='vinyl')return id==='I02'?'cold-lab-vinyl':'lab-vinyl';
 if(['I31','I33','I21'].includes(id)&&surface==='dark-large-stone')return 'quiet-stone';
 return null;
}
