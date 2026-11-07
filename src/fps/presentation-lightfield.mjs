/** One bounded startup bake of broad indirect-light contrast from existing lamps.
 * This is a low-resolution approximation, NOT a path tracer, GI solver or survey.
 * Lamps and collision geometry are read, never added, opened or moved.
 */
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const saturate = v => Math.max(0, Math.min(1, v));
export function fieldBounds(description) {
  const polygons = description.floorPolygons || description.surfaces?.filter(s => s.y < .05).map(s => s.polygon) || [];
  const points = polygons.flat();
  if (!points.length) return [-1, -1, 1, 1];
  return [Math.min(...points.map(p => p[0])) - .2, Math.min(...points.map(p => p[1])) - .2,
    Math.max(...points.map(p => p[0])) + .2, Math.max(...points.map(p => p[1])) + .2];
}
export function lampSample(point, lamps, visible) {
  const near=[];
  for(const lamp of lamps){
    const distance2=(lamp.x-point.x)**2+(lamp.z-point.z)**2;if(distance2>=64)continue;
    let at=0;while(at<near.length&&near[at].distance2<=distance2)at++;
    if(at>=4)continue;near.splice(at,0,{x:lamp.x,y:lamp.y,z:lamp.z,distance2});if(near.length>4)near.pop();
  }
  let energy = 0, tested = 0;
  for (const lamp of near) {
    tested++;
    if (visible && !visible(point, { x: lamp.x, y: lamp.y - .06, z: lamp.z })) continue;
    energy += .75 * (1 - Math.sqrt(lamp.distance2) / 8) ** 2 / (1 + lamp.distance2 * .08);
  }
  // Keep an occupied office legible even when all direct samples are occluded.
  const gain = .56 + Math.min(.62, Math.sqrt(energy) * .47);
  return { gain, tested };
}
export async function bakeLightfield(world, fixtures, { maxSize = 96, yieldRows = 8 } = {}) {
  const bounds = fieldBounds(world.description), spanX = Math.max(.1, bounds[2] - bounds[0]), spanZ = Math.max(.1, bounds[3] - bounds[1]);
  maxSize = Math.max(8, Math.min(192, Math.round(maxSize)));
  const width = Math.max(8, Math.round(maxSize * spanX / Math.max(spanX, spanZ)));
  const height = Math.max(8, Math.round(maxSize * spanZ / Math.max(spanX, spanZ)));
  const data = new Uint8Array(width * height * 4), lamps = [];
  for (const f of fixtures || []) if (Number.isFinite(f.x) && Number.isFinite(f.z) && !lamps.some(l => Math.hypot(l.x - f.x, l.z - f.z) < .2)) {
    lamps.push({ x: f.x, y: finite(f.y, 2.66), z: f.z });
  }
  let checks = 0;
  const visible = typeof world.segmentClear === 'function' ? (a, b) => world.segmentClear(a, b, { vision: false }) : null;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const point = { x: bounds[0] + (col + .5) / width * spanX, y: .22, z: bounds[1] + (row + .5) / height * spanZ };
      const sample = lamps.length ? lampSample(point, lamps, visible) : { gain: 1, tested: 0 };
      checks += sample.tested;
      const room = world.roomAt?.(point.x, point.z), lab = ['I01','I02','I03'].includes(room?.id);
      const tint = lab ? [1, 1, 1] : [1, .985, .96];
      const at = (row * width + col) * 4;
      for (let c = 0; c < 3; c++) data[at + c] = Math.round(saturate(sample.gain * tint[c] / 1.3) * 255);
      data[at + 3] = 255;
    }
    if (yieldRows > 0 && row % yieldRows === yieldRows - 1) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { data, width, height, bounds, checks, sources: lamps.length, multiplier: 1.3 };
}
