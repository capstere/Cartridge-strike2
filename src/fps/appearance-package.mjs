// Installed packages describe colors and an existing operator kit. They never
// choose a URL, change a rig, register an unlock or supply executable code.
export const APPEARANCE_FORMAT='cartridge-strike-operator-palette';
export const MAX_PUBLIC_PALETTES=12;
const kits=new Set(['assault','smg','sniper','shotgun']);
const colors=['shirt','vest','glove','accent'];

function fields(value,names,description){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).length!==names.length||names.some(name=>!Object.hasOwn(value,name)))
    throw Error('Invalid '+description+' fields.');
}
function label(value,max){
  return typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f<>]/.test(value);
}
export function validateAppearancePackage(pack){
  fields(pack,['format','version','id','name','role','kit','palette','rigs','rights'],'operator palette');
  if(pack.format!==APPEARANCE_FORMAT||pack.version!==1)throw Error('Unsupported operator palette format or version.');
  if(typeof pack.id!=='string'||!/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(pack.id))throw Error('Invalid operator palette ID.');
  if(!label(pack.name,40)||!label(pack.role,64)||!kits.has(pack.kit))throw Error('Invalid outfit label or kit.');
  fields(pack.palette,colors,'palette color');
  if(colors.some(k=>!/^#[\da-f]{6}$/i.test(pack.palette[k])||typeof pack.palette[k]!=='string'))throw Error('Use a six-digit RGB color for each material.');
  fields(pack.rigs,['male','female'],'operator rig fingerprint');
  if(Object.values(pack.rigs).some(hash=>typeof hash!=='string'||!/^[\da-f]{64}$/.test(hash)))throw Error('Both shipped rig hashes are required.');
  fields(pack.rights,['creator','license'],'palette attribution');
  if(!label(pack.rights.creator,100)||!['project-original','MIT','CC0-1.0'].includes(pack.rights.license))throw Error('An attributed palette with supported rights is required.');
  return pack;
}
export function installedPalettes(manifest,reserved){
  fields(manifest,['version','packages'],'outfit registry');
  if(manifest.version!==1||!Array.isArray(manifest.packages)||manifest.packages.length>MAX_PUBLIC_PALETTES)
    throw Error('Unsupported outfit registry version or package count.');
  const ids=new Set(reserved);
  return manifest.packages.map(pack=>{
    validateAppearancePackage(pack);
    if(ids.has(pack.id))throw Error('Reserved or duplicate outfit ID: '+pack.id);
    ids.add(pack.id);
    const palette=Object.fromEntries(colors.map(k=>[k,parseInt(pack.palette[k].slice(1),16)]));
    return Object.freeze({id:pack.id,name:pack.name,role:pack.role,kit:pack.kit,...palette});
  });
}
