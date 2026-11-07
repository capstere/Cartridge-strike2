/** Original fictional Cartridge Strike equipment. No commercial label, logo,
 * measured proprietary contours or external assets. Presentation only:
 * never changes projectile positions, collisions, damage, fuse or gameplay RNG.
 */
import * as THREE from '../../vendor/three/three.module.js';
import { RoundedBoxGeometry } from '../../vendor/three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

export const THROWABLE_CARTRIDGES = Object.freeze({
  he: Object.freeze({ label: 'HE', subtitle: 'BURST', color: '#c86735' }),
  flash: Object.freeze({ label: 'FLASH', subtitle: 'LIGHT', color: '#b79426' }),
  smoke: Object.freeze({ label: 'SMOKE', subtitle: 'SCREEN', color: '#318878' }),
});
export const CARTRIDGE_VISUAL = 'throwable-cartridge-v1';
const templates = new Map();
const Y = new THREE.Vector3(0, 1, 0);
const floorPoint = new THREE.Vector3();
const settlingQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));

function ownShared(resource) {
  resource.userData.sharedWeapon = true;
  resource.userData.sharedThrowableCartridge = true;
  return resource;
}
function labelTexture(type) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 320;
  const c = canvas.getContext('2d');
  if (!c) return null;
  const style = THROWABLE_CARTRIDGES[type];
  c.fillStyle = '#edf2ed'; c.fillRect(0, 0, 256, 320);
  c.fillStyle = style.color; c.fillRect(0, 0, 256, 25); c.fillRect(0, 183, 256, 48);
  c.textAlign = 'center'; c.fillStyle = '#17323d';
  c.font = 'bold 20px sans-serif'; c.fillText('CARTRIDGE', 128, 61);
  c.font = 'bold 17px sans-serif'; c.fillText('STRIKE', 128, 84);
  c.font = `900 ${type === 'he' ? 78 : 50}px sans-serif`; c.fillText(style.label, 128, 159);
  c.fillStyle = '#ffffff'; c.font = 'bold 22px sans-serif'; c.fillText(style.subtitle, 128, 215);
  // Deterministic decorative barcode, not a real product identifier.
  c.fillStyle = '#17323d';
  for (let i = 0, x = 28; i < 37; i++) { const w = i % 3 === 0 ? 4 : 2; c.fillRect(x, 251, w, 30); x += w + 2; }
  c.font = '14px monospace'; c.fillText('CS-05 / GAME PROP', 128, 305);
  const map = ownShared(new THREE.CanvasTexture(canvas));
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 2;
  return map;
}
function buildTemplate(type) {
  const root = new THREE.Group(); root.name = `cartridge-${type}`;
  const material = (name, color, roughness) => {
    const m = ownShared(new THREE.MeshStandardMaterial({color, roughness, metalness: 0}));
    m.name = `cartridge-${name}`; return m;
  };
  const white = material('shell', 0xe8eee9, .48);
  const blue = material('blue-foot', 0x0874bc, .49);
  const dark = material('seams', 0x42606b, .65);
  const frost = material('reaction-tube', 0xc4e5e8, .36);
  const paper = material('label', 0xffffff, .83); paper.map = labelTexture(type);
  if (!paper.map) paper.color.set(THROWABLE_CARTRIDGES[type].color);
  const buckets = new Map();
  function add(geometry, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz); geometry.translate(x, y, z);
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(g);
  }
  const box = (mat, x, y, z, w, h, d, radius = 0) =>
    add(radius ? new RoundedBoxGeometry(w, h, d, 1, radius) : new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const bar = (a, b, width, mat) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const g = new THREE.BoxGeometry(width, delta.length(), width);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, delta.normalize()));
    g.translate(...start.add(end).multiplyScalar(.5).toArray()); add(g, mat);
  };
  const body = new RoundedBoxGeometry(.118, .146, .087, 1, .006);
  const positions = body.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const taper = .91 + .09 * (positions.getY(i) / .146 + .5);
    positions.setX(i, positions.getX(i) * taper); positions.setZ(i, positions.getZ(i) * taper);
  }
  body.computeVertexNormals(); add(body, white, 0, .100, 0);
  box(blue, 0, .014, 0, .128, .028, .097, .004);
  box(blue, 0, .030, 0, .120, .006, .092, .002);
  for (const x of [-.047, .047]) {
    box(blue, x, .004, 0, .014, .008, .086, .002);
    box(white, x, .099, -.041, .004, .122, .005);
  }
  for (const z of [-.032, -.013, .006, .025]) box(dark, 0, .005, z, .068, .002, .003);
  // Closed lid, seam, rear hinges and front latch. No military pin.
  box(dark, 0, .174, 0, .120, .0025, .088, .001);
  box(white, 0, .184, 0, .130, .018, .098, .005);
  box(white, 0, .194, 0, .108, .004, .079, .002);
  for (const x of [-.039, .039]) add(new THREE.CylinderGeometry(.006, .006, .019, 10), blue, x, .182, -.051, 0, 0, Math.PI / 2);
  box(blue, 0, .173, .050, .027, .020, .007, .002);
  box(dark, 0, .176, .054, .015, .003, .002);
  // Original stylised rear reaction tube, not measured commercial tooling.
  box(blue, 0, .059, -.049, .021, .037, .012, .002);
  const reaction = [[0, .040, -.051], [0, .040, -.071], [0, .064, -.092], [0, .088, -.071], [0, .088, -.051]];
  for (let i = 0; i < reaction.length; i++) bar(reaction[i], reaction[(i + 1) % reaction.length], .005, frost);
  bar([0, .064, -.051], [0, .064, -.083], .003, frost);
  add(new THREE.PlaneGeometry(.087, .112), paper, 0, .102, .044);
  add(new THREE.PlaneGeometry(.079, .075), paper, 0, .125, -.044, 0, Math.PI);
  for (const [mat, pieces] of buckets) {
    const geometry = mergeGeometries(pieces, false);
    for (const piece of pieces) piece.dispose();
    if (!geometry) throw new Error('Cartridge material batch could not be created');
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); ownShared(geometry);
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = mat.name;
    mesh.castShadow = false; mesh.receiveShadow = true; root.add(mesh);
  }
  root.userData = {visualModel: CARTRIDGE_VISUAL, type, cosmeticOnly: true,
    originalDesign: true, components: ['tapered-shell', 'blue-foot', 'closed-lid', 'hinges', 'latch', 'reaction-tube', 'type-label']};
  return root;
}
export function createThrowableCartridge(type = 'he', scale = 1) {
  if (!Object.hasOwn(THROWABLE_CARTRIDGES, type)) throw new TypeError(`Not a throwable Cartridge: ${type}`);
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Cartridge scale must be positive');
  if (!templates.has(type)) templates.set(type, buildTemplate(type));
  const model = templates.get(type).clone(true); model.scale.setScalar(scale); return model;
}
function visualSeed(id) {
  let n = 2166136261;
  for (const c of String(id)) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
  return n / 4294967296;
}
export function createThrownCartridge(grenade, time) {
  const root = new THREE.Group(), shell = createThrowableCartridge(grenade.type || grenade.kind, 1.1);
  shell.position.y = -.108; root.add(shell); root.name = `thrown-cartridge-${grenade.id}`;
  const bounds = new THREE.Box3().setFromObject(root), corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push([x, y, z]);
  const seed = visualSeed(grenade.id);
  root.userData = {visualModel: CARTRIDGE_VISUAL, type: grenade.type || grenade.kind,
    lastTime: time, seed, corners, settled: 0, cosmeticOnly: true};
  root.rotation.set(seed * 2, seed * Math.PI * 2, -.2);
  updateThrownCartridge(root, grenade, time); return root;
}
export function updateThrownCartridge(model, grenade, time) {
  const data = model.userData;
  const elapsed = Number.isFinite(time) ? Math.max(0, Math.min(.1, time - data.lastTime)) : 0;
  if (Number.isFinite(time)) data.lastTime = time;
  const horizontal = Math.hypot(grenade.vx || 0, grenade.vz || 0);
  const radius = Number.isFinite(grenade.radius) && grenade.radius > 0 ? grenade.radius : .10;
  const nearFloor = grenade.y <= radius + .012;
  const grounded = nearFloor && Math.abs(grenade.vy || 0) < .65 && horizontal < .65;
  if (grounded) {
    const amount = 1 - Math.exp(-elapsed * 12);
    model.quaternion.slerp(settlingQuaternion, amount);
    data.settled += (1 - data.settled) * amount;
  } else {
    data.settled = 0;
    const speed = .35 + Math.min(1, (horizontal + Math.abs(grenade.vy || 0)) / 8);
    model.rotation.x += elapsed * (4.5 + data.seed * 3) * speed;
    model.rotation.y += elapsed * (1.6 + data.seed) * speed;
    model.rotation.z += elapsed * (data.seed - .5) * 2 * speed;
  }
  model.position.set(grenade.x, grenade.y, grenade.z);
  // Use the actual spherical collision radius to detect floor contact. Smoothly
  // lower the cosmetic side-resting body to the floor; never move the projectile.
  if (nearFloor) {
    let bottom = Infinity;
    for (const corner of data.corners) {
      floorPoint.fromArray(corner).applyQuaternion(model.quaternion);
      bottom = Math.min(bottom, floorPoint.y);
    }
    const floorY = .003 - bottom;
    model.position.y = Math.max(floorY, grenade.y + (floorY - grenade.y) * data.settled);
  }
  return model;
}
/** Final renderer teardown only: never dispose when a single grenade expires. */
export function disposeThrowableCartridges() {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  for (const root of templates.values()) root.traverse(o => {
    if (!o.isMesh) return; geometries.add(o.geometry); materials.add(o.material);
    if (o.material.map) textures.add(o.material.map);
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  for (const t of textures) t.dispose();
  templates.clear();
}
