import {parseProject,exportProjectZip} from './level-project.mjs?v=5.9.0';
import {validateLevel} from './validate-level.mjs?v=5.9.0';
import {collectDraftFiles,exportDraftZip,draftText} from './draft-save.mjs?v=5.7.2';
/** Operate on one snapshot, never on an asynchronously changing editor object. */
export async function prepareProjectSave(project,readModel,{backupOnly=false}={}){
 const raw=draftText(project),snapshot=JSON.parse(raw),attachments=await collectDraftFiles(snapshot,readModel);
 let reason='Manuell säkerhetskopia';
 if(!backupOnly){try{
  if(attachments.missing.length)throw Error(`${attachments.missing.length} lokala tillgångar saknas. Se RECOVERY.json.`);
  const doc=parseProject(snapshot);
  doc.assets.local=[...attachments.files].map(([file,bytes])=>({assetId:'local:'+file.slice(14,-4),file,bytes:bytes.length,license:'private, unverified'}));
  // Saving is not an engine test. Explicitly invalidate stale playability data.
  doc.validation=validateLevel(doc,{engine:false});
  return {kind:'project',document:doc,bytes:await exportProjectZip(doc,attachments.files),missing:[],reason:null};
 }catch(e){reason=String(e.message||e);}}
 return {kind:'recovery',document:snapshot,bytes:await exportDraftZip(snapshot,{...attachments,reason}),missing:attachments.missing,reason};
}
