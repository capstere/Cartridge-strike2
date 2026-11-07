/** Editor-only palette presets and dimensions. No FPS runtime writes. */
export const FINISH_COLORS=Object.freeze({
 white:'#edf0ed',silver:'#aab6bd',orange:'#df753c',black:'#22282c',
 blue:'#347bb5',gray:'#929ea5',red:'#bd3038',elevator:'#a5b6c0'
});
export const WALL_FINISHES=Object.freeze(['white','gray']);
export const DOOR_FINISHES=Object.freeze(['white','gray','red','elevator']);
export const CHAIR_ROLES=Object.freeze(['kitchen','office','conference']);
export const ASSET_ROLES=Object.freeze(['auto','table','chair','other']);
export const validFurnitureColor=value=>typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value);
const TABLE_KINDS=new Set(['table','desk','coffee-table']);
const TABLE_ASSETS=/table|desk|bord|skrivbord|sidetable/i;
const CHAIR_ASSETS=/chair|stol|arbeitsstuhl/i;
export function isTable(item){
 if(!item||['chair','other'].includes(item.assetRole))return false;
 if(item.assetRole==='table')return true;
 return TABLE_KINDS.has(item.kind)||(item.kind==='prop'&&(
  item.assetId?.includes(':table')||item.assetId?.includes(':desk')||TABLE_ASSETS.test(item.assetName||'')));
}
export function isChair(item){
 if(!item||['table','other'].includes(item.assetRole))return false;
 if(item.assetRole==='chair')return true;
 return item.kind==='chair'||(item.kind==='prop'&&(
  item.assetId?.includes(':chair')||CHAIR_ASSETS.test(item.assetName||'')));
}
export function chairRole(item){
 if(CHAIR_ROLES.includes(item?.chairRole))return item.chairRole;
 const label=String(item?.assetName||'').toLowerCase();
 if(/konferens|conference|meeting/.test(label))return 'conference';
 if(['I09','I10','I19'].includes(item?.roomId)&&!/(kontors|office|desk.?chair|arbetsstol)/i.test(label))return 'kitchen';
 return 'office';
}
export function chairColors(item){
 const role=chairRole(item);
 return role==='kitchen'?{body:FINISH_COLORS.orange,legs:FINISH_COLORS.silver}:
 role==='conference'?{body:FINISH_COLORS.blue,legs:FINISH_COLORS.black}:
 {body:FINISH_COLORS.black,legs:FINISH_COLORS.black};
}
export function architecturalFinish(kind,finish){
 const allowed=['wall','glazed','window'].includes(kind)?WALL_FINISHES:
 ['door','card-door','elevator-door','terrace-door','opening'].includes(kind)?DOOR_FINISHES:[];
 const preferred=kind==='elevator-door'?'elevator':
 ['door','card-door','terrace-door','opening'].includes(kind)?'gray':'white';
 return allowed.includes(finish)?finish:preferred;
}
export function editableDimensions(item){
 return isTable(item);
}
export function validateDimensions(w,d,existing){
 if(!editableDimensions(existing))throw Error('Endast bord och skrivbord kan ändra längd och bredd.');
 if(![w,d].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=.15&&v<=8))
  throw Error('Bordets längd och bredd ska vara mellan 0,15 och 8 meter.');
 return {w:Math.round(w*1000)/1000,d:Math.round(d*1000)/1000};
}
/** Used by model loader and explicit user-facing dimension fields. */
export function modelScale(size,item){
 if(!size||![size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>.0001))throw Error('Ogiltig GLB-storlek.');
 if(![item.w,item.height,item.d].every(v=>Number.isFinite(v)&&v>0))throw Error('Ogiltiga objektmått.');
 return {x:item.w/size.x,y:item.height/size.y,z:item.d/size.z};
}
/** A single pointer gesture can strafe in the floor plane in either view. */
export function cameraPanVector(dx,dy,zoom,screenHeight,right,up,top=false){
 const scale=zoom/Math.max(1,screenHeight);
 return top?{x:-dx*scale,z:-dy*scale}:
 {x:(-dx*right.x+dy*up.x)*scale,z:(-dx*right.z+dy*up.z)*scale};
}
