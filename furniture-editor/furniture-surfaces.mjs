/** Real shelves/worktops in catalogued furniture, measured from the model base. */
import {LIBRARY_MAP} from './library/catalog.mjs?v=5.8.0';

export function furnitureSurfaces(item){
 const entry=LIBRARY_MAP.get(item?.assetId);
 if(!entry?.supportSurfaces||item.deleted||Math.abs(item.wallRoll||0)>1e-6)return [];
 const sx=item.w/entry.width,sy=item.height/entry.height,sz=item.d/entry.depth;
 return entry.supportSurfaces.map((surface,index)=>({index,
  x:(surface.x||0)*sx,z:(surface.z||0)*sz,
  y:surface.y*sy,width:surface.width*sx,depth:surface.depth*sz,
  clearance:Number.isFinite(surface.clearance)?surface.clearance*sy:null,
  label:surface.label||`Hyllplan ${index+1}`}));
}

/** Axis-aligned footprint of an item in its support's local frame. */
export function footprintOnSurface(item,relativeYaw){
 const c=Math.abs(Math.cos(relativeYaw)),s=Math.abs(Math.sin(relativeYaw));
 return {width:c*item.w+s*item.d,depth:s*item.w+c*item.d};
}

export function mountedSurface(item,support){
 const surfaces=furnitureSurfaces(support);
 return surfaces[item?.mountSurface]||surfaces.at(-1)||null;
}

export function mountedElevation(item,support){
 const surface=mountedSurface(item,support);
 return (support.elevation||0)+(surface?surface.y:support.height-.008);
}
