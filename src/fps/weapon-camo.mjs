// The seeded, repeatable finishes are adapted from Riposte 06q-camos and 05-audio.
// Copyright (c) 2026 BenDBSS. See licenses/riposte-MIT.txt.
import * as T from '../../vendor/three/three.module.js';
import {CAMOS} from './arsenal.mjs';

const TAU = 2 * Math.PI;
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CAMO_N = 256;

function camoWrap(g, fn) { for (const dx of [-CAMO_N, 0, CAMO_N]) for (const dy of [-CAMO_N, 0, CAMO_N]) { g.save(); g.translate(dx, dy); fn(); g.restore(); } }

function camoBlob(g, rnd, x, y, r, col, sq = 1, ang = 0) {
  camoWrap(g, () => {
    g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col; g.beginPath();
    for (let i = 0; i < 11; i++) { const a = i / 11 * TAU, rr = r * (0.55 + rnd() * 0.75), px = Math.cos(a) * rr, py = Math.sin(a) * rr * sq; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.closePath(); g.fill(); g.restore();
  });
}

function camoDigital(g, rnd, cols, cell) {
  const L = 12, lat = Array.from({ length: L * L }, () => rnd());
  const v = (x, y) => {
    x = x / CAMO_N * L; y = y / CAMO_N * L; const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = lat[(yi % L) * L + (xi % L)], b = lat[(yi % L) * L + ((xi + 1) % L)], c = lat[(((yi + 1) % L)) * L + (xi % L)], d = lat[((yi + 1) % L) * L + ((xi + 1) % L)];
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
  for (let y = 0; y < CAMO_N; y += cell) for (let x = 0; x < CAMO_N; x += cell) {
    const k = Math.floor((v(x + cell / 2, y + cell / 2) * 1.5 - 0.25 + (rnd() - 0.5) * 0.5) * cols.length);
    g.fillStyle = cols[Math.max(0, Math.min(cols.length - 1, k))]; g.fillRect(x, y, cell, cell);
  }
}
const CAMO_DRAW = {
  desert: (g, rnd) => {
    for (let i = 0; i < 46; i++) camoBlob(g, rnd, rnd() * CAMO_N, rnd() * CAMO_N, 16 + rnd() * 26, ['#d6c08a', '#8a6a3e', '#a58a52'][i % 3], 0.6 + rnd() * 0.4, rnd() * TAU);
    for (let i = 0; i < 26; i++) camoBlob(g, rnd, rnd() * CAMO_N, rnd() * CAMO_N, 5 + rnd() * 9, '#5e4d2e', 0.5 + rnd() * 0.5, rnd() * TAU);
  },
  foret: (g, rnd) => {
    for (let i = 0; i < 52; i++) camoBlob(g, rnd, rnd() * CAMO_N, rnd() * CAMO_N, 14 + rnd() * 24, ['#2c3a1e', '#6b5b36', '#7d8a4a', '#1b1f14'][i % 4], 0.55 + rnd() * 0.45, rnd() * TAU);
    for (let i = 0; i < 24; i++) camoBlob(g, rnd, rnd() * CAMO_N, rnd() * CAMO_N, 4 + rnd() * 7, '#0f120c', 0.6, rnd() * TAU);
  },
  urbain: (g, rnd) => camoDigital(g, rnd, ['#3b3d40', '#5a5d60', '#7a7d80', '#9a9da0', '#b5b8bb'], 8),
  neige: (g, rnd) => {
    for (let i = 0; i < 90; i++) camoBlob(g, rnd, rnd() * CAMO_N, rnd() * CAMO_N, 10 + rnd() * 24, ['#aab4bd', '#c9d1d8', '#7d8a96', '#d9dee3'][i % 4], 0.22 + rnd() * 0.2, (rnd() < 0.5 ? 0.45 : -0.45) + (rnd() - 0.5) * 0.4);
  },
  tigre: (g, rnd) => {
    for (let i = 0; i < 20; i++) camoBlob(g, rnd, rnd() * CAMO_N, rnd() * CAMO_N, 14 + rnd() * 20, i % 2 ? '#e0a04a' : '#8f4d1a', 0.5, rnd() * TAU);
    for (let i = 0; i < 17; i++) {
      const x0 = (i + rnd() * 0.5) * CAMO_N / 17, w = 5 + rnd() * 9, ph = rnd() * TAU, amp = 6 + rnd() * 10;
      camoWrap(g, () => {
        g.fillStyle = '#16110c'; g.beginPath();
        const L = [], R = [];
        for (let y = -8; y <= CAMO_N + 8; y += 4) { const cx = x0 + Math.sin(y * 0.045 + ph) * amp + Math.sin(y * 0.11 + ph * 2) * amp * 0.35, ww = w * (0.35 + 0.65 * Math.abs(Math.sin(y * 0.03 + ph))); L.push([cx - ww, y]); R.push([cx + ww, y]); }
        L.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); R.reverse().forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); g.fill();
      });
    }
  },
  cobalt: (g, rnd) => camoDigital(g, rnd, ['#0a1020', '#14264a', '#1c3768', '#2f5fb0', '#4b86d8'], 6),
  braise: (g, rnd) => {
    for (let i = 0; i < 30; i++) camoBlob(g, rnd, rnd() * CAMO_N, rnd() * CAMO_N, 10 + rnd() * 22, i % 2 ? '#22171a' : '#0c0808', 0.7, rnd() * TAU);
    for (let k = 0; k < 24; k++) {
      let x = rnd() * CAMO_N, y = rnd() * CAMO_N, a = rnd() * TAU; const pts = [[x, y]];
      for (let s = 0; s < 6 + Math.floor(rnd() * 8); s++) { a += (rnd() - 0.5) * 1.5; x += Math.cos(a) * (8 + rnd() * 14); y += Math.sin(a) * (8 + rnd() * 14); pts.push([x, y]); }
      for (const [col, wd] of [['#b32a0c', 4.5], ['#ff6a1f', 2.6], ['#ffd57a', 1.1]]) camoWrap(g, () => { g.strokeStyle = col; g.lineWidth = wd; g.lineCap = g.lineJoin = 'round'; g.beginPath(); pts.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); });
    }
  },
  or: (g, rnd) => {
    for (let i = 0; i < 2600; i++) { g.fillStyle = i % 2 ? 'rgba(255,232,150,0.16)' : 'rgba(110,72,0,0.14)'; g.fillRect(rnd() * CAMO_N, rnd() * CAMO_N, 1 + rnd() * 3, 1 + rnd() * 2); }
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,245,190,0.07)'; g.fillRect(rnd() * CAMO_N, 0, 1 + rnd() * 2, CAMO_N); }
  },
  diamant: (g, rnd) => {
    const cell = 32, cols = ['#8fc5f0', '#bfe3ff', '#e6f6ff', '#6ea8d8', '#a8d4f5'];
    for (let y = 0; y < CAMO_N; y += cell) for (let x = 0; x < CAMO_N; x += cell) for (const flip of [0, 1]) {
      g.fillStyle = cols[Math.floor(rnd() * cols.length)]; g.beginPath();
      if (flip) { g.moveTo(x + cell, y); g.lineTo(x + cell, y + cell); g.lineTo(x, y + cell); } else { g.moveTo(x, y); g.lineTo(x + cell, y); g.lineTo(x, y + cell); }
      g.closePath(); g.fill();
    }
    for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(rnd() * CAMO_N, rnd() * CAMO_N, 1.5, 1.5); }
  },

  holo: (g, rnd) => {
    const N = CAMO_N, W = [], img = g.createImageData(N, N), p = [0, 1, 2, 3].map(() => rnd() * TAU);
    for (let i = 0; i < 4; i++) W.push([1 + Math.floor(rnd() * 2), Math.floor(rnd() * 3) - 1, rnd() * TAU, 0.6 + rnd() * 0.4]);
    const A = W.reduce((s, w) => s + w[3], 0);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N * TAU, v = y / N * TAU, wu = u + 0.9 * Math.sin(2 * v + p[0]) + 0.5 * Math.sin(u + v + p[1]), wv = v + 0.9 * Math.sin(2 * u + p[2]) + 0.5 * Math.sin(u - v + p[3]);
      let f = 0; for (const [kx, ky, ph, a] of W) f += a * Math.sin(kx * wu + ky * wv + ph);
      const c = Math.round((f / A * 0.5 + 0.5) * 255), k = (y * N + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = c; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  },
};
const HOLO_COLS = [[0.5, 0.95, 1], [0.72, 0.64, 1], [1, 0.62, 0.92], [0.95, 0.96, 1], [0.62, 1, 0.86]];
const HOLO_GLSL = `vec3 holoColor(float t) {
  float u = fract(t) * ${HOLO_COLS.length}.0, s = smoothstep(0.0, 1.0, fract(u));
  ${HOLO_COLS.map((c, i) => `${i ? 'else ' : ''}if (u < ${i + 1}.0) return mix(vec3(${c.join(', ')}), vec3(${HOLO_COLS[(i + 1) % HOLO_COLS.length].join(', ')}), s);`).join('\n  ')}
  return vec3(1.0);
}`;
const CAMO_BASE = { desert: '#b89a64', foret: '#4a5a30', urbain: '#7a7d80', neige: '#e8ecef', tigre: '#c77a2d', cobalt: '#0f1b33', braise: '#151012', or: '#c9a02c', diamant: '#bfe3ff', holo: '#808080' };

// Instances in different rendering contexts can share the same logical finish.
// The final holder releases both the material and its small GPU texture.
const active = new Map();
export function acquireFinish(id) {
  if (!Object.hasOwn(CAMOS, id)) return null;
  let entry = active.get(id);
  if (!entry) {
    const polished = {or:[.95,.28], diamant:[.85,.16], holo:[.91,.19]}[id] || [.24,.62];
    const material = new T.MeshStandardMaterial({color:CAMO_BASE[id], metalness:polished[0], roughness:polished[1]});
    material.name = 'arsenal-finish-' + id;
    let texture = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = CAMO_N;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = CAMO_BASE[id];
      ctx.fillRect(0,0,CAMO_N,CAMO_N);
      CAMO_DRAW[id](ctx, seeded(CAMOS[id].seed * 7919));
      texture = new T.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.anisotropy = 2;
      material.color.setHex(0xffffff);
      material.onBeforeCompile = shader => {
        shader.uniforms.arsenalPaint = {value:texture};
        shader.uniforms.arsenalHolo = {value:id === 'holo' ? 1 : 0};
        const vary = 'varying vec3 paintPosition; varying vec3 paintNormal;';
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n'+vary)
          .replace('#include <begin_vertex>', '#include <begin_vertex>\npaintPosition=position; paintNormal=normal;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
          '#include <common>\n'+vary+'\nuniform sampler2D arsenalPaint; uniform float arsenalHolo;\n'+HOLO_GLSL)
          .replace('#include <map_fragment>', `#include <map_fragment>
            vec3 weight = pow(abs(normalize(paintNormal)),vec3(5.0));
            weight /= max(0.00001,weight.x+weight.y+weight.z);
            vec3 pos = paintPosition*5.88;
            vec3 paint = texture2D(arsenalPaint,pos.zy).rgb*weight.x
                       + texture2D(arsenalPaint,pos.xz).rgb*weight.y
                       + texture2D(arsenalPaint,pos.xy).rgb*weight.z;
            if (arsenalHolo>0.5) {
              vec3 N=normalize(vNormal), V=normalize(vViewPosition), R=reflect(-V,N);
              float rim=1.0-clamp(dot(N,V),0.0,1.0);
              paint=holoColor(paint.r*.7+rim*1.1+R.x*.55+R.y*.75+dot(paintPosition, vec3(.6,1.2,1.4)));
            }
            diffuseColor.rgb*=pow(paint,vec3(2.2));
          `);
      };
      material.customProgramCacheKey = () => 'cs3-arsenal-paint-v1';
    }
    entry = {material,texture,users:0};
    active.set(id,entry);
  }
  entry.users++;
  return entry.material;
}
export function releaseFinish(id) {
  const entry = active.get(id);
  if (!entry || --entry.users) return;
  entry.material.dispose();
  entry.texture?.dispose();
  active.delete(id);
}
