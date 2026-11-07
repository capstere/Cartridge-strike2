/** Generous authoring resource ceilings, NOT gameplay/performance budgets.
 * Save/import source data separately from physics validation and game optimization.
 * Lossless recovery remains available when a structural/resource check rejects a draft.
 */
export const AUTHORING_LIMITS=Object.freeze({
 furnitureRecords:10000,buildingParts:5000,sourceChanges:5000,floors:1000,
 posters:1000,treatments:1000,surfaceOverrides:10000,jsonBytes:16*1024*1024
});
export const MAX_FURNITURE_RECORDS=AUTHORING_LIMITS.furnitureRecords;
export const MAX_PROJECT_JSON_BYTES=AUTHORING_LIMITS.jsonBytes;
export function furnitureRecordCount(f){
 if(!f||!['placements','added','removed'].every(k=>Array.isArray(f[k])))return null;
 return f.placements.length+f.added.length+f.removed.length;
}
export function authoringStatus(project){
 const len=v=>Array.isArray(v)?v.length:0;
 const furniture=len(project?.furniture?.placements)+len(project?.furniture?.added);
 const parts=len(project?.architecture?.added);
 const large=furniture>1000||parts>1000;
 return {furniture,parts,large,message:`${furniture} möbelposter · ${parts} nya byggdelar. `+
  (large?'Stort byggprojekt: spara originalet; optimera en separat spelkopia senare.':'Bygg och spara först. Spelkontroll och optimering görs separat.')};
}
