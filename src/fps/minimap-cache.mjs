import {roomDisplayName} from './player-names.mjs';

const START_LIFTS = [['analyst-start-lift', 'analysts'], ['counter-analyst-start-lift', 'counterAnalysts']];
const LANDMARKS = [
  ['analysis-chamber', 'I02'],
  ['service-atrium', 'I13'],
  ['commons', 'I09'],
  ['south-atrium', 'I11'],
  ['operations-office', 'I26'],
  ['lounge', 'I25'],
  ['connecting-passage', 'BYGG-G-0001'],
];
const SITES = [
  {id: 'bomb-site', label: 'Bomb site', roomId: 'I01', letter: 'B', color: '#f5c47c',
    align: 'above', point: anchors => anchors.bomb},
  {id: 'hostage-start', label: 'Hostage start', roomId: 'I12', letter: 'H', color: '#b9e6d5',
    align: 'right', point: anchors => anchors.hostages?.[0]},
  {id: 'rescue-zone', label: 'Rescue zone', roomId: 'I31', letter: 'R', color: '#7ce4cd',
    align: 'left', point: anchors => anchors.rescue},
];

function roomCenter(world, id) {
  const polygon = world.data.rooms?.find(room => room.id === id)?.polygon
    ?? world.data.corridors?.find(room => room.id === id)?.polygon;
  if (!polygon?.length) return null;
  let area = 0, x = 0, z = 0;
  for (const [i, a] of polygon.entries()) {
    const b = polygon[(i + 1) % polygon.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    area += cross;
    x += (a[0] + b[0]) * cross;
    z += (a[1] + b[1]) * cross;
  }
  return area ? {x: x / (3 * area), z: z / (3 * area)} : null;
}

/** Published Floor 5 navigation points. Coordinates come from the loaded level.
 * @returns {{id: string, label: string, x: number, z: number, roomId: string, classicOnly: boolean}[]}
 */
export function floor5MapAnchors(world, classic = false) {
  const anchors = [];
  const add = (id, label, point, roomId, classicOnly = false) => {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) return;
    anchors.push({id, label, x: point.x, z: point.z, roomId, classicOnly});
  };
  for (const [id, team] of START_LIFTS) {
    const roomId = world.project?.gameplay?.startElevators?.find(lift => lift.team === team)?.floorId;
    if (roomId) add(id, roomDisplayName(roomId), world.anchors?.[team]?.[0], roomId);
  }
  for (const [id, roomId] of LANDMARKS) add(id, roomDisplayName(roomId), roomCenter(world, roomId), roomId);
  if (classic && world.anchors) {
    for (const site of SITES) {
      const point = site.point(world.anchors);
      if (!point) continue;
      const roomId = point.roomId ?? world.roomAt?.(point.x, point.z)?.id ?? site.roomId;
      add(site.id, `${site.label} · ${roomDisplayName(roomId)}`, point, roomId, true);
    }
  }
  return anchors;
}

/** Project-authored room landmarks double as the team's finite, validated ping targets. */
export function multiplayerMapAnchors(world, classic = false) {
  if (world.project?.mode !== 'new-level') return floor5MapAnchors(world, classic);
  return [...world.data.rooms, ...world.data.corridors].map(room => ({
    id: room.id, label: roomDisplayName(room), ...roomCenter(world, room.id),
    roomId: room.id, classicOnly: false,
  }));
}

const CALLOUTS = {
  'analyst-start-lift': {detail: 'Analysts', color: '#a9d1f5', align: 'right'},
  'counter-analyst-start-lift': {detail: 'Counter Analysts', color: '#fac090', align: 'above-left'},
  'connecting-passage': {color: '#ccdce3', align: 'above'},
};

function mapCallout(ctx, w, h, x, y, title, detail, color, align, letter) {
  const bold = 'bold 12px sans-serif', normal = '11px sans-serif';
  const height = detail ? 31 : 18;
  const badgeWidth = letter ? 17 : 0;
  ctx.font = bold;
  const titleWidth = ctx.measureText(title).width;
  ctx.font = normal;
  const detailWidth = detail ? ctx.measureText(detail).width : 0;
  const width = Math.ceil(Math.max(titleWidth, detailWidth)) + 10 + badgeWidth;
  let left = x - width / 2, top = y - height - 14;
  if (align === 'left' || align === 'right') {
    left = align === 'left' ? x - width - 8 : x + 8;
    top = y - height / 2;
  } else if (align === 'above-left') {
    left = x - width + 6;
  } else if (align === 'below') {
    top = y + 8;
  }
  left = Math.round(Math.max(4, Math.min(left, w - width - 4)));
  top = Math.round(Math.max(4, Math.min(top, h - height - 4)));
  const endX = Math.max(left, Math.min(x, left + width));
  const endY = Math.max(top, Math.min(y, top + height));

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.stroke();
  ctx.fillStyle = '#0b141d';
  ctx.fillRect(x - 3, y - 3, 6, 6);
  ctx.fillRect(left, top, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x - 2, y - 2, 4, 4);
  ctx.fillRect(left, top, 2, height);
  if (letter) ctx.fillRect(left + 5, top + 5, 13, 13);

  ctx.textBaseline = 'middle';
  ctx.font = bold;
  if (letter) {
    ctx.fillStyle = '#0b141d';
    ctx.textAlign = 'center';
    ctx.fillText(letter, left + 11.5, top + 12);
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.fillText(title, left + 5 + badgeWidth, top + (detail ? 10 : 9));
  if (detail) {
    ctx.font = normal;
    ctx.fillStyle = '#e4edf0';
    ctx.fillText(detail, left + 5 + badgeWidth, top + 23);
  }
}

function roomLabel(ctx, w, x, y, label, passage = false, vertical = false) {
  ctx.font = passage ? 'bold 10px sans-serif' : 'bold 11px sans-serif';
  const halfWidth = ctx.measureText(label).width / 2 + 3;
  if (!vertical) x = Math.max(halfWidth + 4, Math.min(x, w - halfWidth - 4));
  ctx.save();
  ctx.translate(x, y);
  if (vertical) ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#17242c';
  ctx.fillStyle = passage ? '#c1d3da' : '#f1f5f7';
  ctx.strokeText(label, 0, 0);
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

function drawFloor5Labels(ctx, world, classic, w, h, xof, zof, anchors) {
  const callouts = [];
  for (const anchor of anchors) {
    const style = CALLOUTS[anchor.id] ?? SITES.find(site => site.id === anchor.id);
    if (style) callouts.push([anchor, style]);
    else roomLabel(ctx, w, xof(anchor.x), zof(anchor.z), anchor.label);
  }
  if (!classic) {
    for (const {id, roomId, align} of SITES) {
      const point = roomCenter(world, roomId);
      if (point) mapCallout(ctx, w, h, xof(point.x), zof(point.z), roomDisplayName(roomId), null,
        '#ccdce3', id === 'hostage-start' ? 'below' : align);
    }
  }
  for (const id of ['C02', 'C03', 'C05', 'C22']) {
    const point = roomCenter(world, id);
    if (point) roomLabel(ctx, w, xof(point.x), zof(point.z), roomDisplayName(id), true, id === 'C03');
  }
  for (const [anchor, style] of callouts) {
    const [title, room] = anchor.label.split(' · ');
    mapCallout(ctx, w, h, xof(anchor.x), zof(anchor.z), title, room ?? style.detail,
      style.color, style.align, style.letter);
  }
}

function drawOnlineTeammates(ctx, layer, game, expanded) {
  let player;
  ctx.strokeStyle = '#0b141d';
  ctx.fillStyle = '#7ce4cd';
  ctx.lineWidth = 1.4;
  for (const actor of game.actors) {
    if (actor.team !== game.team || !actor.alive) continue;
    if (actor.isPlayer) { player = actor; continue; }
    const x = layer.ox + (actor.x - layer.xmin) * layer.scale;
    const y = layer.oz + (actor.z - layer.zmin) * layer.scale;
    ctx.beginPath(); ctx.arc(x, y, expanded ? 2.6 : 1.9, 0, Math.PI * 2); ctx.stroke(); ctx.fill();
  }
  if (!player) return;
  const x = layer.ox + (player.x - layer.xmin) * layer.scale;
  const y = layer.oz + (player.z - layer.zmin) * layer.scale;
  const dx = -Math.sin(player.yaw), dy = -Math.cos(player.yaw);
  const size = expanded ? 1 : .8;
  ctx.beginPath();
  ctx.moveTo(x + dx * 8 * size, y + dy * 8 * size);
  ctx.lineTo(x + (-dx * 4 + dy * 4.5) * size, y + (-dy * 4 - dx * 4.5) * size);
  ctx.lineTo(x - dx * size, y - dy * size);
  ctx.lineTo(x + (-dx * 4 - dy * 4.5) * size, y + (-dy * 4 + dx * 4.5) * size);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#fff';
  ctx.stroke(); ctx.fill();
}

/** Cache the static geometry and labels. Live markers use the normal HUD cadence. */
export class MinimapCache {
  constructor(canvas, createCanvas = () => document.createElement('canvas')) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.createCanvas = createCanvas;
    this.world = null;
    this.layers = new Map();
    this.stats = {builds:0, draws:0, hiddenSkips:0};
  }
  invalidate() { this.layers.clear(); }
  layer(world, expanded) {
    if (world !== this.world) { this.world = world; this.invalidate(); }
    const w = this.canvas.width, h = this.canvas.height;
    const online = !!world.networkSlice, classic = online && !!world.networkClassic;
    const onlineExpanded = online && expanded;
    const key = `${w}/${h}/${!!expanded}/${online}/${classic}`;
    let layer = this.layers.get(key);
    if (layer) return layer;
    const canvas = this.createCanvas(); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'), d = world.data;
    let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
    const include = ([x,z]) => {
      xmin = Math.min(xmin,x); xmax = Math.max(xmax,x);
      zmin = Math.min(zmin,z); zmax = Math.max(zmax,z);
    };
    for (const poly of d.floorPolygons) for (const p of poly) include(p);
    if (online) for (const wall of d.walls) {
      include(wall.a); include(wall.b);
    }
    if (!(xmax > xmin) || !(zmax > zmin)) throw new Error('Invalid minimap bounds');
    const scale = Math.min((w-14)/(xmax-xmin),(h-14)/(zmax-zmin));
    const ox = (w-(xmax-xmin)*scale)/2, oz = (h-(zmax-zmin)*scale)/2;
    const xof = x => ox+(x-xmin)*scale, zof = z => oz+(z-zmin)*scale;
    const fillPolygon = poly => {
      ctx.beginPath();
      poly.forEach((p,i) => i ? ctx.lineTo(xof(p[0]),zof(p[1])) : ctx.moveTo(xof(p[0]),zof(p[1])));
      ctx.closePath(); ctx.fill();
    };
    ctx.fillStyle = onlineExpanded ? '#2b3c46' : '#3d525a';
    for (const poly of d.floorPolygons) fillPolygon(poly);
    if (onlineExpanded) {
      ctx.fillStyle = '#526773';
      for (const room of d.corridors ?? []) fillPolygon(room.polygon);
      ctx.fillStyle = '#364a55';
      for (const room of d.rooms ?? []) fillPolygon(room.polygon);
    }
    ctx.strokeStyle = onlineExpanded ? '#c1d3db' : '#afc2c6';
    ctx.lineWidth = onlineExpanded ? .8 : .5;
    for (const wall of d.walls) {
      ctx.beginPath();ctx.moveTo(xof(wall.a[0]),zof(wall.a[1]));
      ctx.lineTo(xof(wall.b[0]),zof(wall.b[1]));ctx.stroke();
    }
    if (!online && expanded && world.tactical) {
      ctx.save(); ctx.lineWidth = 2;
      for (const [i,lane] of world.tactical.lanes.entries()) {
        ctx.strokeStyle = lane.color; ctx.beginPath();
        lane.points.forEach((p,n) => n ? ctx.lineTo(xof(p.x),zof(p.z)) : ctx.moveTo(xof(p.x),zof(p.z)));
        ctx.stroke();ctx.fillStyle=lane.color;ctx.font='bold 10px sans-serif';
        ctx.fillText(lane.label,8,h-20+i*12);
      }
      ctx.restore();
    }
    if (online) {
      if (onlineExpanded) {
        const anchors = multiplayerMapAnchors(world, classic);
        if (world.project?.mode === 'new-level') {
          for (const anchor of anchors) roomLabel(ctx, w, xof(anchor.x), zof(anchor.z), anchor.label);
        } else drawFloor5Labels(ctx, world, classic, w, h, xof, zof, anchors);
      }
      else if (classic) for (const {point, letter, color} of SITES) {
        const p = point(world.anchors);
        if (!p) continue;
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(letter, xof(p.x) - 3, zof(p.z) - 4);
      }
    } else {
      for (const [p,label,color] of [[world.anchors.bomb,'B','#e9ae67'],[world.anchors.rescue,'R','#7ce4cd'],[world.anchors.hostages[0],'H','#ccebdc']]) {
        if (!p) continue;
        ctx.font='bold 11px sans-serif';ctx.fillStyle=color;
        ctx.fillText(label,xof(p.x)-3,zof(p.z)-4);
      }
    }
    layer = {canvas, scale, ox, oz, xmin, zmin};
    // Compact + expanded only. Resizing cannot grow an unbounded canvas cache.
    if (this.layers.size >= 2) this.layers.delete(this.layers.keys().next().value);
    this.layers.set(key,layer);this.stats.builds++;
    return layer;
  }
  draw(world, game, expanded = false, visible = true) {
    if (!visible) { this.stats.hiddenSkips++; return false; }
    const ctx = this.context, l = this.layer(world,expanded);
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    ctx.drawImage(l.canvas,0,0);
    if (world.networkSlice) {
      const ping=game.teamPing;
      if(ping?.anchor&&ping.expiresAt>game.state.time){
        const {x,z}=ping.anchor;
        ctx.beginPath();
        ctx.arc(l.ox+(x-l.xmin)*l.scale,l.oz+(z-l.zmin)*l.scale,expanded?8:5,0,Math.PI*2);
        ctx.lineWidth=2;
        ctx.strokeStyle='#f5c47c';
        ctx.stroke();
      }
      drawOnlineTeammates(ctx, l, game, expanded);
      this.stats.draws++;
      return true;
    }
    // drawImage does not transfer canvas state: preserve the old .5px heading.
    ctx.lineWidth = .5;
    for (const a of game.actors) {
      if (a.team !== game.team || !a.alive) continue;
      const x = l.ox+(a.x-l.xmin)*l.scale, y = l.oz+(a.z-l.zmin)*l.scale;
      ctx.fillStyle = a.isPlayer ? '#fff' : '#7ce4cd';
      ctx.beginPath();ctx.arc(x,y,a.isPlayer?3:1.9,0,Math.PI*2);ctx.fill();
      if (a.isPlayer) {
        ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(x,y);
        ctx.lineTo(x-Math.sin(a.yaw)*9,y-Math.cos(a.yaw)*9);ctx.stroke();
      }
    }
    this.stats.draws++;
    return true;
  }
  dispose() { this.invalidate();this.world=null; }
}
