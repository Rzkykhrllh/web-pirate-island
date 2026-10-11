// ─────────────────────────────────────────────────────────────────────────────
//  Simulation: shallow water, block wobble, ship, rigid bodies, particles
// ─────────────────────────────────────────────────────────────────────────────
class Water {
  constructor(N) {
    this.N = N; this.dx = (2 * HALF) / N;
    this.eta = new Float32Array(N * N);
    this.u = new Float32Array((N + 1) * N);
    this.v = new Float32Array(N * (N + 1));
    this.D = new Float32Array(N * N);
    this.terr = new Float32Array(N * N);
    this.P = new Float32Array(N * N);
    this.lap = new Float32Array(N * N);
    this.du = new Float32Array((N + 1) * N);
    this.dv = new Float32Array(N * (N + 1));
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -HALF + (i + 0.5) * this.dx, z = -HALF + (j + 0.5) * this.dx;
      const h = terrainRaw(x, z);
      this.terr[j * N + i] = h;
      this.D[j * N + i] = Math.max(0, -h);
    }
    const wet = (k) => this.D[k] > 0.015;
    for (let j = 0; j < N; j++) for (let i = 1; i < N; i++) {
      const L = j * N + i - 1, R = j * N + i;
      this.du[j * (N + 1) + i] = wet(L) && wet(R) ? Math.min(this.D[L], this.D[R]) : 0;
    }
    for (let j = 1; j < N; j++) for (let i = 0; i < N; i++) {
      const B = (j - 1) * N + i, T = j * N + i;
      this.dv[j * N + i] = wet(B) && wet(T) ? Math.min(this.D[B], this.D[T]) : 0;
    }
    this.wet = new Uint8Array(N * N);
    for (let k = 0; k < N * N; k++) this.wet[k] = wet(k) ? 1 : 0;
  }
  reset() { this.eta.fill(0); this.u.fill(0); this.v.fill(0); this.P.fill(0); }
  cell(x, z) {
    const N = this.N;
    return [clamp(Math.floor((x + HALF) / this.dx), 0, N - 1), clamp(Math.floor((z + HALF) / this.dx), 0, N - 1)];
  }
  sample(arr, x, z) {
    const N = this.N;
    const gx = clamp((x + HALF) / this.dx - 0.5, 0, N - 1.001), gz = clamp((z + HALF) / this.dx - 0.5, 0, N - 1.001);
    const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, k = j * N + i;
    return lerp(lerp(arr[k], arr[k + 1], fx), lerp(arr[k + N], arr[k + N + 1], fx), fz);
  }
  etaAt(x, z) { return this.sample(this.eta, x, z); }
  // free surface (hull pressure added back) — what floating things feel
  surfaceAt(x, z) { return this.sample(this.eta, x, z) + this.sample(this.P, x, z); }
  isWet(x, z) { const [i, j] = this.cell(x, z); return this.wet[j * this.N + i] === 1; }
  velAt(x, z) {
    const N = this.N, [i, j] = this.cell(x, z);
    return [(this.u[j * (N + 1) + i] + this.u[j * (N + 1) + i + 1]) * 0.5, (this.v[j * N + i] + this.v[(j + 1) * N + i]) * 0.5];
  }
  bump(x, z, amp, rad) {
    const N = this.N, r = Math.ceil((rad * 2.5) / this.dx);
    const [ci, cj] = this.cell(x, z);
    for (let j = Math.max(0, cj - r); j <= Math.min(N - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(N - 1, ci + r); i++) {
      const k = j * N + i;
      if (!this.wet[k]) continue;
      const px = -HALF + (i + 0.5) * this.dx, pz = -HALF + (j + 0.5) * this.dx;
      const d2 = ((px - x) ** 2 + (pz - z) ** 2) / (rad * rad);
      this.eta[k] += amp * Math.exp(-d2);
    }
  }
  push(x, z, vx, vz, rad) {
    const N = this.N, r = Math.ceil((rad * 2) / this.dx);
    const [ci, cj] = this.cell(x, z);
    for (let j = Math.max(0, cj - r); j <= Math.min(N - 1, cj + r); j++) for (let i = Math.max(1, ci - r); i <= Math.min(N - 1, ci + r); i++) {
      const px = -HALF + i * this.dx, pz = -HALF + (j + 0.5) * this.dx;
      const w = Math.exp(-((px - x) ** 2 + (pz - z) ** 2) / (rad * rad));
      const k = j * (N + 1) + i;
      if (this.du[k] > 0) this.u[k] += vx * w;
    }
    for (let j = Math.max(1, cj - r); j <= Math.min(N - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(N - 1, ci + r); i++) {
      const px = -HALF + (i + 0.5) * this.dx, pz = -HALF + j * this.dx;
      const w = Math.exp(-((px - x) ** 2 + (pz - z) ** 2) / (rad * rad));
      const k = j * N + i;
      if (this.dv[k] > 0) this.v[k] += vz * w;
    }
  }
  // hull pressure footprint: the ship's displaced volume handed back to the sea
  setShipPressure(ship) {
    const N = this.N, P = this.P;
    P.fill(0);
    const f = q4.rot(ship.q, [0, 0, 1]);
    const fx = f[0], fz = f[2], fl = Math.hypot(fx, fz) || 1;
    const ax = fx / fl, az = fz / fl;
    const depth = clamp(0.06 + (0.02 - ship.p[1]) * 0.9, 0.02, 0.16);
    const cx = ship.p[0] + ax * 0.03, cz = ship.p[2] + az * 0.03;
    const [ci, cj] = this.cell(cx, cz), r = Math.ceil(0.7 / this.dx);
    for (let j = Math.max(0, cj - r); j <= Math.min(N - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(N - 1, ci + r); i++) {
      const k = j * N + i;
      if (!this.wet[k]) continue;
      const px = -HALF + (i + 0.5) * this.dx - cx, pz = -HALF + (j + 0.5) * this.dx - cz;
      const lz = px * ax + pz * az, lx = -px * az + pz * ax;
      const e = 1 - (lz / 0.58) ** 2 - (lx / 0.17) ** 2;
      if (e > 0) P[k] = depth * Math.sqrt(e);
    }
  }
  step(dt, gx, gz, damp, tension) {
    const N = this.N, dx = this.dx, g = G_WATER;
    const eta = this.eta, u = this.u, v = this.v, P = this.P, lap = this.lap;
    const inv = 1 / dx;
    if (tension > 0) {
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        const k = j * N + i;
        lap[k] = (eta[k - 1] + eta[k + 1] + eta[k - N] + eta[k + N] - 4 * eta[k]) * inv * inv;
      }
    }
    const fr = Math.exp(-damp * dt);
    for (let j = 0; j < N; j++) {
      const row = j * (N + 1), crow = j * N;
      for (let i = 1; i < N; i++) {
        const k = row + i;
        if (this.du[k] === 0) { u[k] = 0; continue; }
        const L = crow + i - 1, R = crow + i;
        let a = -g * ((eta[R] + P[R]) - (eta[L] + P[L])) * inv + gx;
        if (tension > 0) a += tension * (lap[R] - lap[L]) * inv;
        u[k] = (u[k] + a * dt) * fr;
      }
    }
    for (let j = 1; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (this.dv[k] === 0) { v[k] = 0; continue; }
        const B = (j - 1) * N + i, T = k;
        let a = -g * ((eta[T] + P[T]) - (eta[B] + P[B])) * inv + gz;
        if (tension > 0) a += tension * (lap[T] - lap[B]) * inv;
        v[k] = (v[k] + a * dt) * fr;
      }
    }
    const du = this.du, dv = this.dv;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (!this.wet[k]) continue;
        const ul = j * (N + 1) + i;
        const div = (du[ul + 1] * u[ul + 1] - du[ul] * u[ul] + dv[k + N] * v[k + N] - dv[k] * v[k]) * inv;
        eta[k] -= div * dt;
      }
    }
  }
  energy() {
    let e = 0;
    const eta = this.eta;
    for (let k = 0; k < eta.length; k += 3) e += eta[k] * eta[k];
    return e * 3 / eta.length;
  }
}

// ── the jelly block: tip (rigid tilt) + wobble (shear and squash) ────────────
class Block {
  constructor() { this.reset(); }
  reset() {
    this.tx = 0; this.tz = 0; this.vx = 0; this.vz = 0; this.targetX = 0; this.targetZ = 0; this.held = false;
    this.sx = 0; this.sz = 0; this.svx = 0; this.svz = 0; this.sq = 0; this.sqv = 0;
  }
  impulse(shx, shz, squash) { this.svx += shx; this.svz += shz; this.sqv += squash; }
  step(dt, firm) {
    const k = this.held ? 60 : 26 + 30 * firm, c = this.held ? 12 : 3.2;
    const ax = -k * (this.tx - this.targetX) - c * this.vx;
    const az = -k * (this.tz - this.targetZ) - c * this.vz;
    this.vx += ax * dt; this.vz += az * dt;
    this.tx += this.vx * dt; this.tz += this.vz * dt;
    // the jelly lags the tip: shear driven by angular acceleration
    const kw = 90 + 260 * firm, cw = 2.6 + 3 * firm;
    this.svx += (-kw * this.sx - cw * this.svx + az * 0.012) * dt;
    this.svz += (-kw * this.sz - cw * this.svz - ax * 0.012) * dt;
    this.sx += this.svx * dt; this.sz += this.svz * dt;
    this.sqv += (-kw * 1.4 * this.sq - cw * this.sqv - (Math.abs(this.vx) + Math.abs(this.vz)) * 0.04) * dt;
    this.sq += this.sqv * dt;
    this.sx = clamp(this.sx, -0.08, 0.08); this.sz = clamp(this.sz, -0.08, 0.08); this.sq = clamp(this.sq, -0.08, 0.08);
  }
  matrix() {
    const R = m4.mul(m4.RX(this.tx), m4.RZ(this.tz));
    const lift = HALF * (Math.abs(Math.sin(this.tx)) + Math.abs(Math.sin(this.tz)));
    return m4.chain(m4.T(0, YB + lift, 0), R, m4.T(0, -YB, 0));
  }
  gravityLocal(g) {
    // world gravity expressed in the tipped block frame
    const R = m4.mul(m4.RX(this.tx), m4.RZ(this.tz));
    const Ri = m4.inv(R);
    return m4.dir(Ri, [0, -g, 0]);
  }
}

// ── the ship ─────────────────────────────────────────────────────────────────
class Ship {
  constructor() {
    this.pts = [];
    for (const z of [-0.44, -0.22, 0, 0.22, 0.42]) {
      const w = SHIP.halfAt(z, -0.02) * 0.9;
      this.pts.push([w, -0.04, z], [-w, -0.04, z]);
    }
    this.I = [0.13, 0.14, 0.055];
    this.reset();
  }
  reset() {
    const L = LAYOUT.ship;
    this.p = [L[0], 0.0, L[2]];
    this.v = [0, 0, 0];
    this.q = q4.axis([0, 1, 0], Math.atan2(-Math.cos(WIND_BASE), -Math.sin(WIND_BASE)));
    this.w = [0, 0, 0];
    this.tow = null;
    this.gunIdx = 0;
    const bow = v3.add(this.p, q4.rot(this.q, [0, 0.07, 0.56]));
    this.rode = v3.len(v3.sub(LAYOUT.anchorRing, bow)) * 1.01;
  }
  world(lp) { return v3.add(this.p, q4.rot(this.q, lp)); }
  local(wp) { return q4.rot(q4.conj(this.q), v3.sub(wp, this.p)); }
  applyImpulse(J, at) {
    this.v = v3.add(this.v, J);
    const T = v3.cross(v3.sub(at, this.p), J);
    const Tl = q4.rot(q4.conj(this.q), T);
    const wl = [Tl[0] / this.I[0], Tl[1] / this.I[1], Tl[2] / this.I[2]];
    this.w = v3.add(this.w, q4.rot(this.q, wl));
  }
  step(dt, gL, water, wind) {
    let F = [0, 0, 0], T = [0, 0, 0];
    const p = this.p, q = this.q;
    const up = v3.norm(v3.mul(gL, -1));
    const add = (f, at) => { F = v3.add(F, f); T = v3.add(T, v3.cross(v3.sub(at, p), f)); };
    add(gL, this.world([0, -0.1, 0])); // ballast keeps her upright
    const kB = 20, cB = 1.4;
    for (const lp of this.pts) {
      const wp = this.world(lp);
      const vp = v3.add(this.v, v3.cross(this.w, v3.sub(wp, p)));
      const sub = clamp(water.surfaceAt(wp[0], wp[2]) - wp[1], 0, 0.22);
      if (sub <= 0) continue;
      const wv = water.velAt(wp[0], wp[2]);
      const rel = [vp[0] - wv[0] * 0.6, vp[1], vp[2] - wv[1] * 0.6];
      let f = v3.mul(up, kB * sub);
      f = v3.add(f, v3.mul(up, -cB * v3.dot(rel, up)));
      const vl = q4.rot(q4.conj(q), rel);
      const s = Math.min(sub / 0.06, 1);
      f = v3.add(f, q4.rot(q, [-3.4 * vl[0] * s, 0, -0.28 * vl[2] * s]));
      add(f, wp);
    }
    // breeze on the sails, centre of effort aloft and slightly aft
    add([wind[0], 0, wind[1]], this.world([0, 0.45, -0.06]));
    // elastic anchor rode
    const bow = this.world([0, 0.07, 0.56]);
    const A = LAYOUT.anchorRing;
    const d = v3.sub(A, bow), len = v3.len(d);
    if (len > this.rode) {
      const dir = v3.mul(d, 1 / len);
      const vb = v3.add(this.v, v3.cross(this.w, v3.sub(bow, p)));
      const mag = 5.0 * (len - this.rode) - 0.8 * Math.min(v3.dot(vb, dir), 0);
      add(v3.mul(dir, clamp(mag, 0, 6)), bow);
    }
    if (this.tow) {
      const t = this.tow;
      add([(t[0] - p[0]) * 5 - this.v[0] * 1.6, 0, (t[2] - p[2]) * 5 - this.v[2] * 1.6], this.world([0, 0, 0.1]));
    }
    // integrate
    this.v = v3.add(this.v, v3.mul(F, dt));
    this.v = v3.mul(this.v, Math.exp(-0.25 * dt));
    this.p = v3.add(this.p, v3.mul(this.v, dt));
    const Tl = q4.rot(q4.conj(q), T);
    let wl = q4.rot(q4.conj(q), this.w);
    wl = [wl[0] + (Tl[0] / this.I[0]) * dt, wl[1] + (Tl[1] / this.I[1]) * dt, wl[2] + (Tl[2] / this.I[2]) * dt];
    this.w = v3.mul(q4.rot(q, wl), Math.exp(-0.9 * dt));
    this.q = q4.integrate(this.q, this.w, dt);
    // keel touching the sea bed / shore
    for (const lp of [[0, -0.13, -0.4], [0, -0.13, 0], [0, -0.1, 0.45], [0.12, -0.03, 0], [-0.12, -0.03, 0]]) {
      const wp = this.world(lp);
      const g = H(wp[0], wp[2]);
      if (wp[1] < g) {
        this.p[1] += (g - wp[1]) * 0.5;
        const n = Hn(wp[0], wp[2]);
        this.p[0] += n[0] * 0.01; this.p[2] += n[2] * 0.01;
        if (this.v[1] < 0) this.v[1] *= 0.3;
        this.v[0] *= 0.97; this.v[2] *= 0.97;
      }
    }
    const lim = HALF - 0.45;
    for (const a of [0, 2]) if (Math.abs(this.p[a]) > lim) { this.p[a] = Math.sign(this.p[a]) * lim; this.v[a] *= -0.3; }
    if (this.p[1] < -0.6) this.p[1] = -0.6;
  }
  colliders() {
    return [[this.world([0, -0.01, -0.36]), 0.16], [this.world([0, -0.01, 0.02]), 0.17], [this.world([0, -0.01, 0.36]), 0.13]];
  }
}

// ── rigid bodies: cannonballs, barrels, doubloons ────────────────────────────
const BT = { BALL: 0, BARREL: 1, COIN: 2, CRATE: 3, FRUIT: 4 };
const BODY_SPEC = [
  { r: 0.032, dens: 6.0, drag: 1.4, e: 0.25, fr: 2.5, mass: 0.12 },
  { r: 0.05, dens: 0.42, drag: 3.2, e: 0.3, fr: 3.5, mass: 0.08 },
  { r: 0.022, dens: 5.0, drag: 7.5, e: 0.12, fr: 9.0, mass: 0.02 },
  { r: 0.056, dens: 0.48, drag: 3.4, e: 0.25, fr: 4.0, mass: 0.1 },
  { r: 0.034, dens: 0.72, drag: 3.6, e: 0.3, fr: 3.0, mass: 0.02 },
];
class Body {
  constructor(type, slot) { this.type = type; this.slot = slot; this.active = false; this.age = 0; }
  spawn(p, v) {
    this.active = true; this.p = p.slice(); this.v = v.slice(); this.q = q4.id(); this.w = [rr(-6, 6), rr(-6, 6), rr(-6, 6)];
    this.yaw = rr(0, 6.28); this.roll = 0; this.tiltA = 0; this.tiltB = 0; this.flutter = 1; this.seed = rnd() * 100;
    this.age = 0; this.noShip = 0; this.inWater = false; this.grounded = false; this.held = false; this.restT = 0; this.sub = 0;
    const s = BODY_SPEC[this.type];
    this.r = s.r; this.spec = s;
  }
  matrix() {
    if (!this.active) return m4.S(0);
    if (this.type === BT.BALL || this.type === BT.FRUIT) return q4.mat(this.q, this.p);
    if (this.type === BT.CRATE) return m4.chain(m4.T(this.p[0], this.p[1] - 0.006, this.p[2]), m4.RY(this.yaw), m4.RX(this.tiltA * 0.25), m4.RZ(this.tiltB * 0.25));
    if (this.type === BT.BARREL) return m4.chain(m4.T(this.p[0], this.p[1] - 0.004, this.p[2]), m4.RY(this.yaw), m4.RZ(this.tiltA * 0.3), m4.RX(this.roll));
    return m4.chain(m4.T(this.p[0], this.p[1] - this.r + 0.004, this.p[2]), m4.RY(this.yaw), m4.RX(this.tiltA), m4.RZ(this.tiltB));
  }
}

class Particles {
  constructor(max) {
    this.max = max; this.n = 0;
    const F = () => new Float32Array(max);
    this.px = F(); this.py = F(); this.pz = F(); this.vx = F(); this.vy = F(); this.vz = F();
    this.age = F(); this.life = F(); this.s0 = F(); this.s1 = F(); this.r = F(); this.g = F(); this.b = F(); this.a = F();
    this.kind = F(); this.seed = F(); this.drag = F(); this.grav = F(); this.flag = F();
    this.inst = new Float32Array(max * 12);
    this.count = 0;
    this.scale = 1;
  }
  clear() { this.n = 0; }
  spawn(kind, p, v, life, s0, s1, c, a, drag = 1, grav = 0, flag = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.px[i] = p[0]; this.py[i] = p[1]; this.pz[i] = p[2]; this.vx[i] = v[0]; this.vy[i] = v[1]; this.vz[i] = v[2];
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.r[i] = c[0]; this.g[i] = c[1]; this.b[i] = c[2]; this.a[i] = a; this.kind[i] = kind; this.seed[i] = rnd();
    this.drag[i] = drag; this.grav[i] = grav; this.flag[i] = flag;
  }
  update(dt, water, wind) {
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      let dead = this.age[i] >= this.life[i];
      if (!dead) {
        const f = Math.exp(-this.drag[i] * dt);
        this.vx[i] = this.vx[i] * f + wind[0] * (1 - f) * 0.35;
        this.vz[i] = this.vz[i] * f + wind[1] * (1 - f) * 0.35;
        this.vy[i] = this.vy[i] * f + this.grav[i] * dt;
        this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
        if (this.flag[i] === 1 && Math.abs(this.px[i]) < HALF && Math.abs(this.pz[i]) < HALF && this.py[i] > water.etaAt(this.px[i], this.pz[i]) - 0.01) dead = true; // bubble reached the surface
        if (this.flag[i] === 2 && Math.abs(this.px[i]) < HALF && Math.abs(this.pz[i]) < HALF && this.py[i] < water.etaAt(this.px[i], this.pz[i]) && this.vy[i] < 0) dead = true; // spray landed
      }
      if (dead) {
        const j = --this.n;
        for (const arr of [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.age, this.life, this.s0, this.s1, this.r, this.g, this.b, this.a, this.kind, this.seed, this.drag, this.grav, this.flag]) arr[i] = arr[j];
        continue;
      }
      i++;
    }
  }
  // write live particles + this frame's immediate sprites
  pack(extra) {
    const o = this.inst;
    let c = 0;
    const put = (x, y, z, s, r, g, b, a, kind, t, seed) => {
      if (c >= this.max) return;
      const k = c * 12;
      o[k] = x; o[k + 1] = y; o[k + 2] = z; o[k + 3] = s;
      o[k + 4] = r; o[k + 5] = g; o[k + 6] = b; o[k + 7] = a;
      o[k + 8] = kind; o[k + 9] = t; o[k + 10] = seed; o[k + 11] = 0;
      c++;
    };
    for (let i = 0; i < this.n; i++) {
      const t = this.age[i] / this.life[i];
      const fade = Math.min(t / 0.08, 1) * (1 - smoothstep(0.55, 1, t));
      const s = lerp(this.s0[i], this.s1[i], Math.sqrt(t));
      const a = this.a[i];
      if (a > 0) put(this.px[i], this.py[i], this.pz[i], s, this.r[i] * a * fade, this.g[i] * a * fade, this.b[i] * a * fade, a * fade, this.kind[i], t, this.seed[i]);
      else put(this.px[i], this.py[i], this.pz[i], s, this.r[i] * fade, this.g[i] * fade, this.b[i] * fade, 0, this.kind[i], t, this.seed[i]);
    }
    for (const e of extra) put(...e);
    this.count = c;
    return c;
  }
}
