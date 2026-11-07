/** Cache the immutable map layer, like Riposte's buildMinimapStatic.
 * Original local artwork/rules; no enemy radar, no world mutation.
 * Static geometry + objective letters are cached for compact/expanded sizes;
 * live friendly markers retain the app's existing 10 Hz HUD cadence.
 */
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
    const key = `${w}/${h}/${!!expanded}`;
    let layer = this.layers.get(key);
    if (layer) return layer;
    const canvas = this.createCanvas(); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'), d = world.data;
    let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
    for (const poly of d.floorPolygons) for (const [x,z] of poly) {
      xmin = Math.min(xmin,x); xmax = Math.max(xmax,x);
      zmin = Math.min(zmin,z); zmax = Math.max(zmax,z);
    }
    if (!(xmax > xmin) || !(zmax > zmin)) throw new Error('Invalid minimap bounds');
    const scale = Math.min((w-14)/(xmax-xmin),(h-14)/(zmax-zmin));
    const ox = (w-(xmax-xmin)*scale)/2, oz = (h-(zmax-zmin)*scale)/2;
    const xof = x => ox+(x-xmin)*scale, zof = z => oz+(z-zmin)*scale;
    ctx.fillStyle = '#3d525a';
    for (const poly of d.floorPolygons) {
      ctx.beginPath();
      poly.forEach((p,i) => i ? ctx.lineTo(xof(p[0]),zof(p[1])) : ctx.moveTo(xof(p[0]),zof(p[1])));
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#afc2c6'; ctx.lineWidth = .5;
    for (const wall of d.walls) {
      ctx.beginPath();ctx.moveTo(xof(wall.a[0]),zof(wall.a[1]));
      ctx.lineTo(xof(wall.b[0]),zof(wall.b[1]));ctx.stroke();
    }
    if (expanded && world.tactical) {
      ctx.save(); ctx.lineWidth = 2;
      for (const [i,lane] of world.tactical.lanes.entries()) {
        ctx.strokeStyle = lane.color; ctx.beginPath();
        lane.points.forEach((p,n) => n ? ctx.lineTo(xof(p.x),zof(p.z)) : ctx.moveTo(xof(p.x),zof(p.z)));
        ctx.stroke();ctx.fillStyle=lane.color;ctx.font='bold 10px sans-serif';
        ctx.fillText(lane.label,8,h-20+i*12);
      }
      ctx.restore();
    }
    for (const [p,label,color] of [[world.anchors.bomb,'B','#e9ae67'],[world.anchors.rescue,'R','#7ce4cd'],[world.anchors.hostages[0],'H','#ccebdc']]) {
      ctx.font='bold 11px sans-serif';ctx.fillStyle=color;
      ctx.fillText(label,xof(p.x)-3,zof(p.z)-4);
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
