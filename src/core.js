// ─────────────────────────────────────────────────────────────────────────────
//  Math, noise, terrain, layout
// ─────────────────────────────────────────────────────────────────────────────
const HALF = 2.6;            // block half-size (5.2 × 5.2)
const YB = -1.5;             // block bottom / studio floor
const GRID = 128;            // shallow-water grid
const G_WATER = 4.6;         // wave gravity (slow, jelly-like)
const G_BODY = 9.8;          // rigid-body gravity

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
};

// mat4, column-major
const m4 = {
  id() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  chain(...ms) { return ms.reduce((acc, m) => m4.mul(acc, m)); },
  T(x, y, z) { const m = m4.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
  S(x, y = x, z = x) { const m = m4.id(); m[0] = x; m[5] = y; m[10] = z; return m; },
  RX(a) { const m = m4.id(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
  RY(a) { const m = m4.id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
  RZ(a) { const m = m4.id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
  persp(fovy, aspect, n, f) {
    const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = t / aspect; m[5] = t; m[10] = f / (n - f); m[11] = -1; m[14] = (n * f) / (n - f);
    return m;
  },
  ortho(l, r, b, t, n, f) {
    const m = m4.id();
    m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = 1 / (n - f);
    m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = n / (n - f);
    return m;
  },
  lookAt(eye, tgt, up) {
    const z = v3.norm(v3.sub(eye, tgt)), x = v3.norm(v3.cross(up, z)), y = v3.cross(z, x);
    const m = m4.id();
    m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
    m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
    m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
    m[12] = -v3.dot(x, eye); m[13] = -v3.dot(y, eye); m[14] = -v3.dot(z, eye);
    return m;
  },
  basis(x, y, z, p) { // columns
    const m = m4.id();
    m[0] = x[0]; m[1] = x[1]; m[2] = x[2];
    m[4] = y[0]; m[5] = y[1]; m[6] = y[2];
    m[8] = z[0]; m[9] = z[1]; m[10] = z[2];
    m[12] = p[0]; m[13] = p[1]; m[14] = p[2];
    return m;
  },
  inv(m) {
    const a = m, o = new Float32Array(16);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return m4.id();
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
  pt(m, p) {
    const x = p[0], y = p[1], z = p[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w];
  },
  dir(m, p) {
    const x = p[0], y = p[1], z = p[2];
    return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
  },
};

// quaternions [x, y, z, w]
const q4 = {
  id: () => [0, 0, 0, 1],
  axis(ax, a) { const s = Math.sin(a / 2); const n = v3.norm(ax); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a / 2)]; },
  mul(a, b) {
    return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  },
  norm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; },
  conj: (q) => [-q[0], -q[1], -q[2], q[3]],
  rot(q, v) {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
  },
  integrate(q, w, dt) {
    const dq = q4.mul([w[0] * 0.5 * dt, w[1] * 0.5 * dt, w[2] * 0.5 * dt, 0], q);
    return q4.norm([q[0] + dq[0], q[1] + dq[1], q[2] + dq[2], q[3] + dq[3]]);
  },
  mat(q, p) {
    const [x, y, z, w] = q;
    const m = m4.id();
    m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y + z * w); m[2] = 2 * (x * z - y * w);
    m[4] = 2 * (x * y - z * w); m[5] = 1 - 2 * (x * x + z * z); m[6] = 2 * (y * z + x * w);
    m[8] = 2 * (x * z + y * w); m[9] = 2 * (y * z - x * w); m[10] = 1 - 2 * (x * x + y * y);
    if (p) { m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; }
    return m;
  },
};

// deterministic noise
function hash2(ix, iz) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
function fbm2(x, z) {
  let s = 0, a = 0.5;
  for (let i = 0; i < 4; i++) { s += a * vnoise2(x, z); x = x * 2.03 + 1.7; z = z * 2.03 + 9.2; a *= 0.5; }
  return s;
}
let rngState = 1234567;
const rnd = () => { rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();

// ── island terrain (block-local; sea level y = 0) ───────────────────────────
const IC = [-0.55, -0.85];                 // island centre
const HUMP = [IC[0] - 0.2, IC[1] - 0.35];  // jungle hump
const COVE = [IC[0] + 0.6, IC[1] + 0.74];  // bay facing the viewer
function terrainRaw(x, z) {
  let h = -0.93 + (fbm2(x * 0.7 + 3.1, z * 0.7 - 1.7) - 0.5) * 0.24 + 0.05 * Math.sin(x * 1.3 + z * 0.7);
  const dx = x - IC[0], dz = z - IC[1];
  const ang = Math.atan2(dz, dx);
  const r = Math.hypot(dx * 0.92, dz * 1.08) * (1 + 0.09 * Math.sin(ang * 3 + 1.2) + 0.05 * Math.sin(ang * 5 + 0.4));
  // sandy spit reaching west toward Skull Rock
  const spit = Math.exp(-(((x + 1.45) ** 2) / 0.16 + ((z + 0.52) ** 2) / 0.05));
  const s = Math.max(smoothstep(1.8, 0.86, r), spit * 0.7);
  const plateau = 0.11 + 0.05 * (fbm2(x * 2.1, z * 2.1) - 0.5);
  h = lerp(h, plateau, s);
  const hr = ((x - HUMP[0]) ** 2) / 0.5 + ((z - HUMP[1]) ** 2) / 0.32;
  h += 0.64 * Math.exp(-hr * 1.6) * (0.85 + 0.3 * fbm2(x * 3, z * 3));
  // the cove
  const cr = Math.hypot(x - COVE[0], (z - COVE[1]) * 1.1);
  const cm = smoothstep(0.6, 0.28, cr);
  h = lerp(h, -0.16 - 0.14 * (1 - cr / 0.6), cm);
  return h;
}

// fine terrain grid for fast physics lookups
const TG_N = 256;
const TG = new Float32Array(TG_N * TG_N);
for (let j = 0; j < TG_N; j++) for (let i = 0; i < TG_N; i++) {
  TG[j * TG_N + i] = terrainRaw(-HALF + (i / (TG_N - 1)) * 2 * HALF, -HALF + (j / (TG_N - 1)) * 2 * HALF);
}
function H(x, z) {
  const gx = clamp(((x + HALF) / (2 * HALF)) * (TG_N - 1), 0, TG_N - 1.001);
  const gz = clamp(((z + HALF) / (2 * HALF)) * (TG_N - 1), 0, TG_N - 1.001);
  const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, k = j * TG_N + i;
  return lerp(lerp(TG[k], TG[k + 1], fx), lerp(TG[k + TG_N], TG[k + TG_N + 1], fx), fz);
}
function Hn(x, z) {
  const e = 0.02;
  return v3.norm([H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)]);
}

// ── layout ───────────────────────────────────────────────────────────────────
const at = (x, z, dy = 0) => [x, H(x, z) + dy, z];
const WIND_BASE = 0.1; // radians, direction the breeze blows toward (offshore)
const LAYOUT = {
  fire: at(-0.36, -0.5),
  chest: at(-0.76, -0.47),
  xMark: [-0.05, -0.72],
  shovel: at(0.03, -0.82),
  ship: [0.98, 0.04, 0.86],
  skull: { c: [-1.9, 0.38, -0.44], s: 0.36, yaw: Math.atan2(0.62, 0.78) },
  wreck: [-0.95, 1.4],
  palms: [],
};
{
  const sh = LAYOUT.ship;
  const b = [-Math.cos(WIND_BASE), -Math.sin(WIND_BASE)];
  const ax = sh[0] + b[0] * 1.15, az = sh[2] + b[1] * 1.15;
  LAYOUT.anchor = [ax, H(ax, az) + 0.02, az];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Mesh builder — vertices: pos3 nrm3 col3 uv2 (mat, obj, flex)
// ─────────────────────────────────────────────────────────────────────────────
const VSTRIDE = 14;
class MB {
  constructor() { this.v = []; this.idx = []; this.n = 0; }
  push(p, nr, c, uv, mat, obj, flex) {
    this.v.push(p[0], p[1], p[2], nr[0], nr[1], nr[2], c[0], c[1], c[2], uv[0], uv[1], mat, obj, flex);
    return this.n++;
  }
  // parametric surface: fn(u, v) → { p, n?, c?, f? }
  surf(nu, nv, fn, o = {}) {
    const M = o.M || null, base = this.n;
    const col = o.col || [1, 1, 1], mat = o.mat || 0, obj = o.obj || 0;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const uu = i / nu, vv = j / nv;
      const r = fn(uu, vv);
      let nr = r.n;
      if (!nr) {
        const e = 1e-3;
        const pu0 = fn(Math.max(uu - e, 0), vv).p, pu1 = fn(Math.min(uu + e, 1), vv).p;
        const pv0 = fn(uu, Math.max(vv - e, 0)).p, pv1 = fn(uu, Math.min(vv + e, 1)).p;
        const c = v3.cross(v3.sub(pu1, pu0), v3.sub(pv1, pv0));
        nr = v3.len(c) < 1e-12 ? (o.poleN ? o.poleN(uu, vv, r.p) : [0, 1, 0]) : v3.norm(c);
        if (o.flip) nr = v3.mul(nr, -1);
      }
      let p = r.p;
      if (M) { p = m4.pt(M, p); nr = v3.norm(m4.dir(M, nr)); }
      const f = r.f !== undefined ? r.f : (o.flexFn ? o.flexFn(uu, vv) : (o.flex || 0));
      this.push(p, nr, r.c || col, r.uv || [uu, vv], r.mat !== undefined ? r.mat : mat, obj, f);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      if (o.skip && o.skip(i, j)) continue;
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      this.idx.push(a, b, d, a, d, c);
    }
  }
  box(M, sx, sy, sz, col, mat = 0, obj = 0, flex = 0) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const F = [
      [[1, 0, 0], [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]]],
      [[-1, 0, 0], [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]]],
      [[0, 1, 0], [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]]],
      [[0, -1, 0], [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]]],
      [[0, 0, 1], [[hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [-hx, -hy, hz]]],
      [[0, 0, -1], [[-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [hx, -hy, -hz]]],
    ];
    for (const [nr, ps] of F) {
      const b = this.n;
      const nw = v3.norm(m4.dir(M, nr));
      ps.forEach((p, k) => this.push(m4.pt(M, p), nw, col, [k & 1, k >> 1], mat, obj, flex));
      this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  // cylinder along +y from 0..h; r(v) may vary
  cyl(M, r0, r1, h, seg, col, mat = 0, obj = 0, o = {}) {
    const rf = o.rf || ((v) => lerp(r0, r1, v));
    this.surf(seg, o.nv || 1, (uu, vv) => {
      const a = uu * Math.PI * 2, r = rf(vv);
      const dr = (rf(Math.min(vv + 0.01, 1)) - rf(Math.max(vv - 0.01, 0))) / 0.02;
      return { p: [Math.cos(a) * r, vv * h, Math.sin(a) * r], n: v3.norm([Math.cos(a), -dr / h, Math.sin(a)]), c: o.colFn ? o.colFn(uu, vv) : col, f: o.flexFn ? o.flexFn(vv) : o.flex || 0 };
    }, { M, mat, obj });
    if (o.caps !== false) {
      for (const top of [0, 1]) {
        const y = top * h, r = rf(top), nr = [0, top ? 1 : -1, 0];
        const cm = o.capMat !== undefined ? o.capMat : mat;
        const cc = o.capCol || col;
        const cf = o.capFlex !== undefined ? o.capFlex(top) : (o.flexFn ? o.flexFn(top) : o.flex || 0);
        const nw = v3.norm(m4.dir(M, nr));
        const c0 = this.push(m4.pt(M, [0, y, 0]), nw, cc, [0.5, 0.5], cm, obj, cf);
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          this.push(m4.pt(M, [Math.cos(a) * r, y, Math.sin(a) * r]), nw, cc, [0, 0], cm, obj, cf);
        }
        for (let i = 0; i < seg; i++) this.idx.push(c0, c0 + 1 + i, c0 + 2 + i);
      }
    }
  }
  sphere(M, rx, ry, rz, nu, nv, col, mat = 0, obj = 0, o = {}) {
    this.surf(nu, nv, (uu, vv) => {
      const th = uu * Math.PI * 2, ph = vv * Math.PI;
      const d = [Math.sin(ph) * Math.cos(th), -Math.cos(ph), Math.sin(ph) * Math.sin(th)];
      const k = o.disp ? 1 + o.disp(d) : 1;
      return { p: [d[0] * rx * k, d[1] * ry * k, d[2] * rz * k], n: o.disp ? undefined : v3.norm([d[0] / rx, d[1] / ry, d[2] / rz]), c: o.colFn ? o.colFn(d) : col };
    }, { M, mat, obj, flex: o.flex || 0, poleN: (uu, vv) => [0, vv < 0.5 ? -1 : 1, 0] });
  }
  tube(a, b, r, seg, col, mat = 0, obj = 0, o = {}) {
    const d = v3.sub(b, a), L = v3.len(d);
    if (L < 1e-6) return;
    const y = v3.mul(d, 1 / L);
    const ref = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const x = v3.norm(v3.cross(ref, y)), z = v3.cross(x, y);
    this.cyl(m4.basis(x, y, z, a), r * (o.r0 || 1), r * (o.r1 || 1), L, seg, col, mat, obj, o);
  }
  build() { return { verts: new Float32Array(this.v), idx: new Uint32Array(this.idx), count: this.idx.length }; }
}
