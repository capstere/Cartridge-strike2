// Hash the resolved physical input, including scope and furniture, not just the
// LevelProject's path. Both browser and server produce this canonical payload.
// V8/Node and Chromium libm differ by a few ULPs in atan2/sin. Quantize only
// this fingerprint to 1e-9 (well below physics epsilon); never mutate geometry.
// Exact source bytes and simulation/config hashes remain separate strict gates.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined&&typeof value[k]!=='function').map(k=>[k,canonical(value[k])])):typeof value==='number'?Number(value.toFixed(9)):value;
export function collisionContract(world){
  const d=world.data;
  return JSON.stringify(canonical({version:1,boxes:world.staticBoxes,surfaces:world.description.surfaces,
    floorPolygons:d.floorPolygons,excludedRooms:d.excludedRooms,rooms:d.rooms,obstacles:d.obstacles,
    doors:d.doors,anchors:world.anchors}));
}
