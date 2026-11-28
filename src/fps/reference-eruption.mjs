// MIT Riposte, 01-core.js SkyShader (h21, vn, fbm, fbm3, plume and fountain).
// The original angular shader samples only the crater region of the background.
export const eruptionShader = `uniform vec3 sunDir, uVolc;
uniform vec4 uPlume, uErupt;
uniform float uTime;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
float fbm3(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<3;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
vec3 plume(vec3 col, vec3 d, float h){
      vec2 v0 = vec2(cos(uVolc.x), sin(uVolc.x)), dh = normalize(d.xz);
      float da = atan(v0.x * dh.y - v0.y * dh.x, dot(v0, dh)), U = uVolc.y, Hc = uVolc.z, yh = (h - Hc) / max(uPlume.x - Hc, 0.05);
      if (yh < -0.04 || yh > 1.0) return col;
      float ce = sqrt(max(1.0 - h * h, 0.03));
      float ax = min(uPlume.y * pow(max(yh, 0.0), 2.4), 1.2), w = U * (1.4 + 5.0 * yh) * (1.0 + 2.2 * smoothstep(0.55, 0.95, yh)) / ce, u = (da - ax) / w;
      if (abs(u) > 2.2) return col;
      float n1 = fbm(vec2(u * 1.3 + 5.0, yh * 5.0 - uTime * 0.05)), n2 = fbm3(vec2(u * 3.0 - 3.0, yh * 11.0 - uTime * 0.09));
      float edge = abs(u) + (n1 - 0.5) * 0.9 + (n2 - 0.5) * 0.35;
      float dens = (1.0 - smoothstep(0.55, 1.05, edge)) * smoothstep(-0.04, 0.02, yh) * (1.0 - smoothstep(0.82, 1.0, yh));
      vec3 lat = vec3(-v0.y, 0.0, v0.x);
      float sh = 0.55 + 0.7 * n2 + 0.25 * clamp(u * dot(lat, sunDir), -1.0, 1.0);
      vec3 pc = mix(vec3(0.04, 0.032, 0.03), vec3(0.17, 0.13, 0.11), smoothstep(0.1, 0.8, yh)) * sh;
      pc += vec3(1.0, 0.3, 0.06) * uPlume.w * exp(-max(yh, 0.0) * 9.0) * (0.25 + 0.6 * (1.0 - n2));
      if (uErupt.z > 0.01) {
        float ly = 0.12 + fract(uErupt.w * 7.31) * 0.45, lx = (fract(uErupt.w * 3.17) - 0.5) * 0.9;
        float bx = lx + 0.4 * (vn(vec2(yh * 30.0, uErupt.w * 13.0)) - 0.5) + 0.14 * (vn(vec2(yh * 95.0, uErupt.w * 29.0)) - 0.5);
        float inY = smoothstep(ly - 0.14, ly - 0.11, yh) * (1.0 - smoothstep(ly + 0.11, ly + 0.14, yh)), bolt = exp(-pow((u - bx) * 22.0, 2.0)) * inY;
        pc += vec3(0.8, 0.74, 1.0) * uErupt.z * (exp(-pow((u - lx) * 1.1, 2.0) - pow((yh - ly) * 7.0, 2.0)) * 1.2 + bolt * 7.0);
        dens = max(dens, bolt * uErupt.z);
      }
      return mix(col, pc, clamp(dens * uPlume.z, 0.0, 0.97));
    }
vec3 fountain(vec3 col, vec3 d, float h){
      vec2 v0 = vec2(cos(uVolc.x), sin(uVolc.x)), dh = normalize(d.xz);
      float da = atan(v0.x * dh.y - v0.y * dh.x, dot(v0, dh)), U = uVolc.y, ce = sqrt(max(1.0 - h * h, 0.03)), x = da * ce / U, y = (h - uVolc.z) / (U * ce);
      if (abs(x) > 6.0 || y < -1.5 || y > 9.0) return col;
      float fl = vn(vec2(uTime * 5.0, 1.7)), hj = 1.8 + 1.4 * fl, wj = 0.22 + max(y + 0.6, 0.0) * 0.16;
      float jet = exp(-pow(x / wj, 2.0)) * smoothstep(-1.2, -0.6, y) * (1.0 - smoothstep(hj * 0.5, hj, y)) * (0.65 + 0.35 * vn(vec2(x * 9.0, y * 4.0 - uTime * 9.0)));
      vec3 e = vec3(2.8, 1.05, 0.25) * jet * uErupt.x;
      for (int i = 0; i < 14; i++) {
        float fi = float(i), ph = fract(uTime * (0.22 + 0.06 * fract(fi * 0.37)) + fi * 0.618);
        float bx = (fract(fi * 0.73) - 0.5) * 7.0 * ph, by = -0.4 + (6.0 + 3.5 * fract(fi * 0.41)) * ph - 8.0 * ph * ph;
        vec2 q = vec2(x - bx, y - by) * U;
        e += vec3(2.4, 0.75, 0.12) * uErupt.y * exp(-dot(q, q) / 0.0000065) * (1.0 - ph * 0.6);
      }
      return col + e;
    }
`;
