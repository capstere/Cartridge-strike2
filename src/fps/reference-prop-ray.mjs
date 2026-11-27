// Riposte source 04b-physprops.js, propsRay (MIT). Shapes retain their authored rest transforms.
export function rayProps(B, ox, oy, oz, dx, dy, dz, maxT, vision) {
  let best = maxT, hit = null, bnx = 0, bny = 0, bnz = 0;

  for (let i = 0; i < B.length; i++) {
    const b = B[i]; if (vision && b.through) continue;
    const p = b.p, rx = p.x - ox, ry = p.y - oy, rz = p.z - oz, t0 = rx * dx + ry * dy + rz * dz, rad = b.rad;
    if (t0 < -rad || t0 > best + rad || rx * rx + ry * ry + rz * rz - t0 * t0 > rad * rad) continue;
    // Transform the ray into the baked body’s local space.
    const R = b.R, lox = R[0] * -rx + R[3] * -ry + R[6] * -rz, loy = R[1] * -rx + R[4] * -ry + R[7] * -rz, loz = R[2] * -rx + R[5] * -ry + R[8] * -rz;
    const ldx = R[0] * dx + R[3] * dy + R[6] * dz, ldy = R[1] * dx + R[4] * dy + R[7] * dz, ldz = R[2] * dx + R[5] * dy + R[8] * dz;
    for (const s of b.sh) {
      let t = -1, nx = 0, ny = 0, nz = 0;
      if (s[0] === 's') {
        const cx = lox - s[1], cy = loy - s[2], cz = loz - s[3], bb = cx * ldx + cy * ldy + cz * ldz, disc = bb * bb - (cx * cx + cy * cy + cz * cz - s[4] * s[4]);
        if (disc < 0) continue; t = -bb - Math.sqrt(disc); if (t < 0) continue;
        nx = (cx + ldx * t) / s[4]; ny = (cy + ldy * t) / s[4]; nz = (cz + ldz * t) / s[4];
      } else if (s[0] === 'b') {
        let tmin = -1e9, tmax = 1e9, ax = 0, sg = 1, miss = false;
        for (let a = 0; a < 3; a++) {
          const o = a === 0 ? lox - s[1] : a === 1 ? loy - s[2] : loz - s[3], dd = a === 0 ? ldx : a === 1 ? ldy : ldz, hh = s[4 + a];
          if (Math.abs(dd) < 1e-9) { if (o < -hh || o > hh) { miss = true; break; } continue; }
          let t1 = (-hh - o) / dd, t2 = (hh - o) / dd, sn = -1; if (t1 > t2) { const k = t1; t1 = t2; t2 = k; sn = 1; }
          if (t1 > tmin) { tmin = t1; ax = a; sg = sn; } if (t2 < tmax) tmax = t2;
        }
        if (miss || tmax < tmin || tmin < 0) continue;
        t = tmin; if (ax === 0) nx = sg; else if (ax === 1) ny = sg; else nz = sg;
      } else {
        const cx = lox - s[1], cz = loz - s[3], r = s[4], y0 = s[2] - s[5], y1 = s[2] + s[5], a = ldx * ldx + ldz * ldz;
        let th = 1e9;
        if (a > 1e-9) {
          const bb = cx * ldx + cz * ldz, disc = bb * bb - a * (cx * cx + cz * cz - r * r);
          if (disc >= 0) { const tt = (-bb - Math.sqrt(disc)) / a, y = loy + ldy * tt; if (tt >= 0 && y >= y0 && y <= y1) { th = tt; nx = (cx + ldx * tt) / r; ny = 0; nz = (cz + ldz * tt) / r; } }
        }
        if (Math.abs(ldy) > 1e-9) for (const [yc, sn] of [[y0, -1], [y1, 1]]) {
          const tt = (yc - loy) / ldy; if (tt < 0 || tt >= th) continue;
          const ex = cx + ldx * tt, ez = cz + ldz * tt; if (ex * ex + ez * ez <= r * r) { th = tt; nx = 0; ny = sn; nz = 0; }
        }
        if (th >= 1e9) continue; t = th;
      }
      if (t < best) { best = t; hit = b; bnx = R[0] * nx + R[1] * ny + R[2] * nz; bny = R[3] * nx + R[4] * ny + R[5] * nz; bnz = R[6] * nx + R[7] * ny + R[8] * nz; }
    }
  }
  if (!hit) return null;
  return {distance:best,normal:{x:bnx,y:bny,z:bnz},material:hit.material,id:"prop-"+hit.id};
}
