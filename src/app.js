// ─────────────────────────────────────────────────────────────────────────────
//  App: state, time of day, game logic, interaction, UI
// ─────────────────────────────────────────────────────────────────────────────
const TOD = [
  // name, key light dir (toward light), colour, intensity, amb top, amb bottom, backdrop top, backdrop bottom, night, exposure, fire
  { name: 'Noon', dir: [-0.32, 0.88, -0.36], col: [1.0, 0.97, 0.92], I: 2.35, at: [0.52, 0.57, 0.66], ab: [0.47, 0.43, 0.38], bt: [0.86, 0.87, 0.88], bb: [0.97, 0.95, 0.92], night: 0, exp: 1.0, fire: 0.35 },
  { name: 'Afternoon', dir: [-0.6, 0.66, -0.45], col: [1.0, 0.92, 0.8], I: 2.3, at: [0.5, 0.53, 0.62], ab: [0.47, 0.41, 0.35], bt: [0.86, 0.83, 0.8], bb: [0.98, 0.93, 0.87], night: 0, exp: 1.0, fire: 0.4 },
  { name: 'Golden hour', dir: [-0.82, 0.34, -0.46], col: [1.0, 0.74, 0.45], I: 2.2, at: [0.5, 0.46, 0.5], ab: [0.5, 0.39, 0.3], bt: [0.92, 0.76, 0.66], bb: [1.0, 0.86, 0.72], night: 0.05, exp: 1.02, fire: 0.6 },
  { name: 'Sunset', dir: [-0.9, 0.12, -0.42], col: [1.0, 0.5, 0.28], I: 1.8, at: [0.44, 0.36, 0.44], ab: [0.48, 0.31, 0.26], bt: [0.86, 0.6, 0.58], bb: [1.0, 0.76, 0.6], night: 0.2, exp: 1.08, fire: 0.85 },
  { name: 'Dusk', dir: [0.55, 0.42, -0.72], col: [0.55, 0.58, 0.85], I: 0.5, at: [0.2, 0.2, 0.33], ab: [0.2, 0.15, 0.2], bt: [0.3, 0.28, 0.44], bb: [0.56, 0.42, 0.48], night: 0.6, exp: 1.15, fire: 1.15 },
  { name: 'Night', dir: [0.5, 0.62, -0.6], col: [0.5, 0.6, 0.92], I: 0.34, at: [0.09, 0.1, 0.19], ab: [0.07, 0.07, 0.1], bt: [0.06, 0.07, 0.15], bb: [0.15, 0.14, 0.23], night: 0.9, exp: 1.25, fire: 1.4 },
  { name: 'Midnight', dir: [0.25, 0.8, -0.55], col: [0.45, 0.55, 0.92], I: 0.26, at: [0.055, 0.07, 0.14], ab: [0.045, 0.045, 0.08], bt: [0.025, 0.035, 0.085], bb: [0.09, 0.09, 0.16], night: 1, exp: 1.35, fire: 1.55 },
];
const FLAVOURS = {
  turquoise: { absorb: [1.9, 0.42, 0.5], scatter: [0.06, 0.46, 0.48], surf: [0.2, 0.7, 0.7], accent: '#1f8f8f' },
  rum: { absorb: [0.32, 0.75, 1.75], scatter: [0.62, 0.34, 0.08], surf: [0.8, 0.5, 0.2], accent: '#b76a14' },
  kraken: { absorb: [1.5, 1.9, 0.32], scatter: [0.26, 0.12, 0.56], surf: [0.5, 0.25, 0.75], accent: '#7a45c2' },
};

function todSample(t) {
  const x = clamp(t, 0, 1) * (TOD.length - 1);
  const i = Math.min(Math.floor(x), TOD.length - 2), f = smoothstep(0, 1, x - i);
  const A = TOD[i], B = TOD[i + 1];
  const mix = (a, b) => (Array.isArray(a) ? a.map((v, k) => lerp(v, b[k], f)) : lerp(a, b, f));
  const o = {};
  for (const k of Object.keys(A)) if (k !== 'name') o[k] = mix(A[k], B[k]);
  o.dir = v3.norm(o.dir);
  o.name = TOD[Math.round(x)].name;
  o.moon = x > 3.5 ? 1 : 0;
  return o;
}

class App {
  constructor(renderer, ui) {
    this.r = renderer; this.ui = ui;
    this.water = new Water(GRID);
    this.block = new Block();
    this.ship = new Ship();
    this.parts = new Particles(3000);
    this.bodies = [];
    for (let i = 0; i < SLOT.NBALL; i++) this.bodies.push(new Body(BT.BALL, SLOT.BALL + i));
    for (let i = 0; i < SLOT.NBARREL; i++) this.bodies.push(new Body(BT.BARREL, SLOT.BARREL + i));
    for (let i = 0; i < SLOT.NCOIN; i++) this.bodies.push(new Body(BT.COIN, SLOT.COIN + i));
    for (let i = 0; i < SLOT.NCRATE; i++) this.bodies.push(new Body(BT.CRATE, SLOT.CRATE + i));
    for (let i = 0; i < SLOT.NFRUIT; i++) this.bodies.push(new Body(BT.FRUIT, SLOT.FRUIT + i));
    this.fruitCount = 0; this.crateTimer = 0;
    this.seedCrates();
    this.statics = this.buildColliders();
    this.cam = { yaw: Math.PI / 4, pitch: (27 * Math.PI) / 180, dist: 11.4, tYaw: Math.PI / 4, tPitch: (27 * Math.PI) / 180, tDist: 11.4 };
    this.t = 0; this.acc = 0;
    this.params = { firm: 0.55, damp: 0.35, tod: 0.32, flavour: 'turquoise' };
    this.paused = false;
    this.reduced = false;
    this.shots = 0;
    this.lid = { a: 0, v: 0, open: false };
    this.fireBoost = 0;
    this.palmBend = LAYOUT.palms.map(() => ({ b: [0, 0], v: [0, 0], target: null }));
    this.lively = 0;
    this.css = [1, 1];
    this.panelShift = [0, 0];
    this.fireflies = Array.from({ length: 16 }, () => ({ a: rnd() * 6.28, r: rr(0.15, 0.9), h: rr(0.2, 0.55), s: rr(0.2, 0.5), ph: rnd() * 10 }));
    this.bubbles = [];
    rngState = 31337;
    while (this.bubbles.length < 34) {
      const x = rr(-2.4, 2.4), z = rr(-2.4, 2.4), g = H(x, z);
      if (g > -0.35) continue;
      this.bubbles.push([x, rr(g + 0.08, -0.08), z, rr(0.008, 0.024), rnd() * 10]);
    }
    this.windVec = [0, 0];
  }
  buildColliders() {
    const S = [];
    const sk = LAYOUT.skull;
    S.push({ c: [sk.c[0], sk.c[1] + 0.1, sk.c[2]], r: sk.s * 1.0 });
    S.push({ c: [sk.c[0], sk.c[1] - 0.25, sk.c[2] + 0.05], r: sk.s * 0.85 });
    S.push({ c: [sk.c[0], sk.c[1] - 0.55, sk.c[2]], r: sk.s * 1.1 });
    S.push({ c: v3.add(LAYOUT.chest, [0, 0.05, 0]), r: 0.09 });
    S.push({ c: v3.add(LAYOUT.fire, [0, 0.05, 0]), r: 0.09 });
    S.push({ c: LAYOUT.crate, r: 0.07 });
    S.push({ c: LAYOUT.shotPile, r: 0.06 });
    S.push({ c: v3.add(LAYOUT.rowboat, [0, 0.02, 0]), r: 0.12 });
    for (const b of LAYOUT.barrelProps) S.push({ c: b, r: 0.05 });
    for (const b of LAYOUT.bushes) S.push({ c: b, r: 0.08 });
    this.caps = LAYOUT.palms.map((p) => ({ p }));
    return S;
  }

  // ── actions ──────────────────────────────────────────────────────────────
  fireGun() {
    const sh = this.ship;
    const camL = this.camLocal();
    const right = q4.rot(sh.q, [1, 0, 0]);
    const side = v3.dot(right, v3.sub(camL, sh.p)) >= 0 ? 1 : -1;
    const z = SHIP.guns[sh.gunIdx % SHIP.guns.length];
    sh.gunIdx++;
    const x = SHIP.halfAt(z, SHIP.gunY) + 0.05;
    const muzzle = sh.world([side * x, SHIP.gunY, z]);
    const dir = v3.norm(q4.rot(sh.q, [side, 0.0, 0]));
    const flat = v3.norm([dir[0], 0, dir[2]]);
    const ball = this.alloc(BT.BALL);
    const vel = v3.add(v3.add(v3.mul(flat, rr(2.2, 2.7)), [0, rr(1.4, 1.75), 0]), v3.mul(sh.v, 1));
    ball.spawn(v3.add(muzzle, v3.mul(flat, 0.04)), vel);
    ball.noShip = 0.35;
    sh.applyImpulse(v3.mul(flat, -0.11), sh.world([side * x, SHIP.gunY + 0.05, z]));
    // flash + smoke
    const P = this.parts;
    P.spawn(0, muzzle, v3.mul(flat, 0.3), 0.14, 0.11, 0.2, [3.2, 2.0, 0.8], 0, 4);
    for (let k = 0; k < 6; k++) P.spawn(1, v3.add(muzzle, v3.mul(flat, 0.02 * k)), v3.add(v3.mul(flat, rr(0.8, 1.8)), [rr(-0.1, 0.1), rr(0, 0.2), rr(-0.1, 0.1)]), rr(0.08, 0.16), 0.03, 0.05, [2.6, 1.2, 0.35], 0, 6);
    for (let k = 0; k < 12; k++) P.spawn(2, muzzle, v3.add(v3.mul(flat, rr(1, 3)), [rr(-0.6, 0.6), rr(-0.2, 0.9), rr(-0.6, 0.6)]), rr(0.25, 0.6), 0.008, 0.004, [3, 1.4, 0.4], 0, 2, -3);
    for (let k = 0; k < 14; k++) {
      const v = v3.add(v3.mul(flat, rr(0.3, 1.5)), [rr(-0.12, 0.12), rr(0.02, 0.2), rr(-0.12, 0.12)]);
      P.spawn(3, v3.add(muzzle, v3.mul(flat, rr(0, 0.08))), v, rr(2.2, 3.4), rr(0.025, 0.04), rr(0.11, 0.18), [0.96, 0.95, 0.93], rr(0.35, 0.5), 1.6, 0.06);
    }
    this.water.bump(muzzle[0] + flat[0] * 0.25, muzzle[2] + flat[2] * 0.25, -0.012, 0.12);
    this.shots++;
    this.block.impulse(-flat[0] * 0.02, -flat[2] * 0.02, 0.01);
  }
  toggleChest() {
    this.lid.open = !this.lid.open;
    if (this.lid.open) {
      const C = LAYOUT.chest;
      for (let k = 0; k < 14; k++) this.parts.spawn(4, v3.add(C, [rr(-0.07, 0.07), rr(0.09, 0.16), rr(-0.05, 0.05)]), [0, rr(0.05, 0.2), 0], rr(0.4, 0.8), rr(0.02, 0.035), 0.0, [2.2, 1.7, 0.7], 0, 2);
    }
  }
  roarFire() {
    this.fireBoost = 1;
    const F = LAYOUT.fire;
    for (let k = 0; k < 40; k++) this.parts.spawn(2, v3.add(F, [rr(-0.03, 0.03), 0.06, rr(-0.03, 0.03)]), [rr(-0.4, 0.4), rr(0.8, 2.0), rr(-0.4, 0.4)], rr(0.6, 1.6), rr(0.006, 0.012), 0.003, [3, 1.3, 0.35], 0, 1.4, -1.5);
  }
  digX() {
    const X = LAYOUT.xMark, y = H(X[0], X[1]);
    for (let k = 0; k < 3; k++) {
      const c = this.alloc(BT.COIN);
      c.spawn([X[0] + rr(-0.02, 0.02), y + 0.04, X[1] + rr(-0.02, 0.02)], [rr(-0.5, 0.5), rr(1.6, 2.2), rr(-0.5, 0.5)]);
      c.w = [rr(-20, 20), 0, rr(-20, 20)];
    }
    for (let k = 0; k < 14; k++) this.parts.spawn(3, [X[0] + rr(-0.04, 0.04), y + 0.02, X[1] + rr(-0.04, 0.04)], [rr(-0.3, 0.3), rr(0.2, 0.6), rr(-0.3, 0.3)], rr(0.6, 1.1), 0.02, 0.08, [0.9, 0.8, 0.6], 0.5, 3, -0.4);
    for (let k = 0; k < 8; k++) this.parts.spawn(4, [X[0] + rr(-0.05, 0.05), y + rr(0.05, 0.15), X[1] + rr(-0.05, 0.05)], [0, 0.1, 0], rr(0.3, 0.6), 0.03, 0, [2, 1.6, 0.6], 0, 2);
  }
  dropCoins() {
    for (let k = 0; k < 5; k++) {
      const c = this.alloc(BT.COIN);
      c.spawn([rr(-0.6, 1.9), rr(1.1, 1.5), rr(0.3, 2.1)], [rr(-0.2, 0.2), 0, rr(-0.2, 0.2)]);
    }
  }
  dropBarrel() {
    let x, z, tries = 0;
    do { x = rr(-1.8, 2.0); z = rr(0.2, 2.1); tries++; } while ((H(x, z) > -0.3 || Math.hypot(x - this.ship.p[0], z - this.ship.p[2]) < 0.45) && tries < 20);
    const b = this.alloc(BT.BARREL);
    b.spawn([x, 1.3, z], [0, 0, 0]);
  }
  seaSpot(minDist = 0.45) {
    let x, z, tries = 0;
    do { x = rr(-2.1, 2.2); z = rr(-0.4, 2.2); tries++; }
    while ((H(x, z) > -0.3 || Math.hypot(x - this.ship.p[0], z - this.ship.p[2]) < minDist) && tries < 30);
    return [x, z];
  }
  seedCrates() {
    rngState = 9001;
    for (let k = 0; k < 5; k++) {
      const [x, z] = this.seaSpot(0.5);
      const c = this.alloc(BT.CRATE);
      c.spawn([x, 0.0, z], [0, 0, 0]);
    }
  }
  dropCrate() {
    const [x, z] = this.seaSpot(0.5);
    const c = this.alloc(BT.CRATE);
    c.spawn([x, 1.2, z], [0, 0, 0]);
  }
  breakCrate(c) {
    if (!c.active || c.type !== BT.CRATE) return;
    c.active = false; c.held = false;
    const P = this.parts, p = c.p;
    for (let k = 0; k < 26 * this.parts.scale + 6; k++) {
      const col = rnd() < 0.5 ? [0.74, 0.52, 0.27] : [0.42, 0.25, 0.11];
      P.spawn(6, v3.add(p, [rr(-0.04, 0.04), rr(-0.02, 0.05), rr(-0.04, 0.04)]), [rr(-1.1, 1.1), rr(0.6, 2.0), rr(-1.1, 1.1)], rr(0.6, 1.1), rr(0.008, 0.016), 0.008, col, 1, 0.4, -7, 2);
    }
    for (let k = 0; k < 6; k++) P.spawn(3, p, [rr(-0.2, 0.2), rr(0.1, 0.4), rr(-0.2, 0.2)], rr(0.6, 1.0), 0.03, 0.1, [0.75, 0.6, 0.42], 0.45, 3, -0.2);
    for (let k = 0; k < 6; k++) P.spawn(4, v3.add(p, [rr(-0.05, 0.05), rr(0.02, 0.08), rr(-0.05, 0.05)]), [0, 0.15, 0], rr(0.3, 0.6), 0.03, 0, [2.2, 1.5, 0.6], 0, 2);
    const n = 3 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const f = this.alloc(BT.FRUIT);
      f.spawn(v3.add(p, [0, 0.03, 0]), [rr(-0.7, 0.7), rr(1.2, 2.0), rr(-0.7, 0.7)]);
    }
    if (Math.abs(p[0]) < HALF && Math.abs(p[2]) < HALF) this.water.bump(p[0], p[2], -0.02, 0.07);
    this.block.impulse(rr(-1, 1) * 0.006, rr(-1, 1) * 0.006, -0.01);
  }
  collectFruit(f) {
    if (!f.active || f.type !== BT.FRUIT) return;
    f.active = false; f.held = false;
    this.fruitCount++;
    for (let k = 0; k < 10; k++) this.parts.spawn(4, v3.add(f.p, [rr(-0.03, 0.03), rr(0, 0.06), rr(-0.03, 0.03)]), [rr(-0.2, 0.2), rr(0.2, 0.6), rr(-0.2, 0.2)], rr(0.3, 0.6), rr(0.02, 0.035), 0, [2.4, 1.4, 0.5], 0, 2);
    this.parts.spawn(0, f.p, [0, 0.3, 0], 0.25, 0.05, 0.12, [1.6, 0.9, 0.3], 0, 3);
  }
  alloc(type) {
    let best = null, oldest = -1;
    for (const b of this.bodies) {
      if (b.type !== type) continue;
      if (!b.active) return b;
      if (b.age > oldest && !b.held) { oldest = b.age; best = b; }
    }
    return best;
  }
  reset() {
    this.water.reset(); this.block.reset(); this.ship.reset();
    for (const b of this.bodies) b.active = false;
    this.parts.clear();
    this.fruitCount = 0; this.crateTimer = 0;
    this.seedCrates();
    this.shots = 0; this.lid.open = false; this.fireBoost = 0;
    for (const p of this.palmBend) { p.b = [0, 0]; p.v = [0, 0]; p.target = null; }
  }
  resetView() { this.cam.tYaw = Math.PI / 4; this.cam.tPitch = (27 * Math.PI) / 180; this.cam.tDist = this.baseDist(); }

  // ── simulation ───────────────────────────────────────────────────────────
  splash(p, strength, isBall) {
    const W = this.water, P = this.parts;
    W.bump(p[0], p[2], -0.032 * strength, isBall ? 0.06 : 0.05);
    W.bump(p[0], p[2], 0.012 * strength, isBall ? 0.13 : 0.1);
    const n = Math.round((isBall ? 26 : 10) * Math.min(strength, 1.6) * this.parts.scale);
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.28, s = rr(0.3, 1.0);
      P.spawn(6, [p[0], p[1] + 0.01, p[2]], [Math.cos(a) * s * 0.6, rr(0.8, 2.0) * Math.min(strength, 1.4), Math.sin(a) * s * 0.6], rr(0.5, 0.9), rr(0.008, 0.014), 0.006, [0.95, 0.98, 1.0], 0.85, 0.6, -7, 2);
    }
    if (isBall) P.spawn(6, [p[0], p[1] + 0.03, p[2]], [0, 1.4, 0], 0.35, 0.03, 0.05, [0.95, 0.98, 1.0], 0.6, 2, -6, 2);
    for (let k = 0; k < (isBall ? 12 : 5); k++) P.spawn(5, [p[0] + rr(-0.03, 0.03), p[1] - rr(0.03, 0.1), p[2] + rr(-0.03, 0.03)], [rr(-0.1, 0.1), rr(0.1, 0.4), rr(-0.1, 0.1)], rr(0.8, 1.6), rr(0.006, 0.016), 0.01, [0.85, 0.95, 1.0], 0.7, 2, 0.8, 1);
    this.block.impulse(rr(-1, 1) * 0.01 * strength, rr(-1, 1) * 0.01 * strength, -0.02 * strength);
  }
  stepBodies(dt, gL) {
    const W = this.water, sh = this.ship, up = v3.norm(v3.mul(gL, -1));
    const shipCol = sh.colliders();
    const act = this.bodies.filter((b) => b.active);
    for (const b of act) {
      b.age += dt;
      const s = b.spec;
      if (b.held) continue;
      const prevY = b.p[1];
      b.v = v3.add(b.v, v3.mul(gL, dt));
      const inside = Math.abs(b.p[0]) < HALF && Math.abs(b.p[2]) < HALF;
      const surf = inside ? W.surfaceAt(b.p[0], b.p[2]) : -9;
      const sub = inside && W.isWet(b.p[0], b.p[2]) ? clamp((surf - (b.p[1] - b.r)) / (2 * b.r), 0, 1) : 0;
      b.sub = sub;
      if (sub > 0) {
        b.v = v3.add(b.v, v3.mul(up, (G_BODY * sub * dt) / s.dens));
        const wv = W.velAt(b.p[0], b.p[2]);
        const k = Math.exp(-s.drag * sub * dt);
        b.v = [lerp(wv[0], b.v[0], k), b.v[1] * k, lerp(wv[1], b.v[2], k)];
        if (b.type === BT.COIN && sub > 0.9 && !b.grounded) {
          b.v[0] += Math.sin(b.age * 7 + b.seed) * 1.2 * dt;
          b.v[2] += Math.cos(b.age * 5.3 + b.seed) * 1.2 * dt;
        }
        if (b.type === BT.BARREL || b.type === BT.CRATE || b.type === BT.FRUIT) { b.v[1] *= Math.exp(-6 * sub * dt); }
      }
      b.p = v3.add(b.p, v3.mul(b.v, dt));
      // water entry
      if (inside && prevY - b.r * 0.3 > surf && b.p[1] - b.r * 0.3 <= surf && b.v[1] < -0.35 && W.isWet(b.p[0], b.p[2])) {
        const str = clamp(-b.v[1] / 3, 0.25, 1.6) * (b.type === BT.COIN ? 0.25 : b.type === BT.BARREL ? 0.9 : 1);
        this.splash([b.p[0], surf, b.p[2]], str, b.type === BT.BALL);
        if (b.type === BT.BALL) W.push(b.p[0], b.p[2], b.v[0] * 0.15, b.v[2] * 0.15, 0.08);
      }
      // terrain
      b.grounded = false;
      const g = H(b.p[0], b.p[2]);
      const lift = b.type === BT.COIN ? 0.004 : b.r;
      if (b.p[1] - lift < g) {
        const n = Hn(b.p[0], b.p[2]);
        b.p[1] = g + lift;
        const vn = v3.dot(b.v, n);
        if (vn < 0) {
          if (vn < -1.2 && sub < 0.5 && g > 0.0) {
            for (let k = 0; k < 6; k++) this.parts.spawn(3, [b.p[0], g + 0.01, b.p[2]], [rr(-0.3, 0.3), rr(0.1, 0.5), rr(-0.3, 0.3)], rr(0.5, 0.9), 0.02, 0.07, [0.9, 0.8, 0.6], 0.45, 3, -0.3);
          }
          b.v = v3.sub(b.v, v3.mul(n, (1 + s.e) * vn));
        }
        const vt = v3.sub(b.v, v3.mul(n, v3.dot(b.v, n)));
        const fr = b.type === BT.BALL ? 0.8 : s.fr;
        b.v = v3.add(v3.mul(n, v3.dot(b.v, n)), v3.mul(vt, Math.exp(-fr * dt)));
        b.grounded = true;
        if (b.type === BT.BALL) b.w = v3.mul(v3.cross(n, b.v), 1 / b.r);
      }
      // static colliders
      for (const c of this.statics) this.pushOut(b, c.c, c.r, null);
      for (const pb of this.palmBend.keys()) {
        const P = LAYOUT.palms[pb];
        const d = [b.p[0] - P.base[0], b.p[2] - P.base[2]];
        const L = Math.hypot(d[0], d[1]);
        if (b.p[1] < P.top[1] && L < 0.045 + b.r && L > 1e-5) {
          const n = [d[0] / L, 0, d[1] / L];
          b.p[0] = P.base[0] + n[0] * (0.045 + b.r); b.p[2] = P.base[2] + n[2] * (0.045 + b.r);
          const vn = v3.dot(b.v, n);
          if (vn < 0) { b.v = v3.sub(b.v, v3.mul(n, 1.4 * vn)); const pbs = this.palmBend[pb]; pbs.v[0] -= n[0] * vn * 0.3; pbs.v[1] -= n[2] * vn * 0.3; }
        }
      }
      if (b.noShip > 0) b.noShip -= dt;
      else for (const [c, r] of shipCol) this.pushOut(b, c, r, sh);
      // block walls
      for (const a of [0, 2]) {
        if (Math.abs(b.p[a]) > HALF - b.r) { b.p[a] = Math.sign(b.p[a]) * (HALF - b.r); if (b.v[a] * b.p[a] > 0) b.v[a] *= -0.35; }
      }
      // orientation
      if (b.type === BT.BALL || b.type === BT.FRUIT) {
        if (b.type === BT.FRUIT && b.sub > 0.2) b.w = v3.mul(b.w, Math.exp(-2 * dt));
        b.q = q4.integrate(b.q, b.w, dt); if (!b.grounded) b.w = v3.mul(b.w, Math.exp(-0.5 * dt));
      }
      else if (b.type === BT.CRATE) {
        b.yaw += Math.sin(b.age * 0.5 + b.seed) * 0.25 * dt;
        b.tiltA = sub > 0 ? Math.sin(b.age * 1.7 + b.seed) * 0.35 : b.tiltA * 0.98;
        b.tiltB = sub > 0 ? Math.cos(b.age * 1.3 + b.seed * 2) * 0.35 : b.tiltB * 0.98;
      }
      else if (b.type === BT.BARREL) {
        const ax = [Math.cos(b.yaw), 0, -Math.sin(b.yaw)];
        const perp = [-ax[2], 0, ax[0]];
        b.roll += (v3.dot(b.v, perp) / b.r) * dt * (b.grounded || sub > 0 ? 1 : 0.3);
        b.yaw += Math.sin(b.age * 0.6 + b.seed) * 0.2 * dt;
        b.tiltA = sub > 0 ? Math.sin(b.age * 2 + b.seed) * 0.15 : b.tiltA * 0.98;
      } else {
        const moving = !b.grounded;
        const amp = moving ? (sub > 0.5 ? 0.9 : 0.35) : 0;
        b.flutter = lerp(b.flutter, amp, 1 - Math.exp(-4 * dt));
        b.tiltA = Math.sin(b.age * 6.2 + b.seed) * b.flutter;
        b.tiltB = Math.cos(b.age * 4.7 + b.seed) * b.flutter;
        if (moving) b.yaw += (sub > 0 ? 1.5 : 9) * dt;
      }
    }
    // body vs body
    for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
      const a = act[i], b = act[j];
      const d = v3.sub(b.p, a.p), rs = a.r + b.r;
      const d2 = v3.dot(d, d);
      if (d2 > rs * rs || d2 < 1e-10) continue;
      const L = Math.sqrt(d2), n = v3.mul(d, 1 / L), pen = rs - L;
      const ma = a.held ? 1e3 : a.spec.mass, mb = b.held ? 1e3 : b.spec.mass, wa = mb / (ma + mb), wb = ma / (ma + mb);
      a.p = v3.sub(a.p, v3.mul(n, pen * wa)); b.p = v3.add(b.p, v3.mul(n, pen * wb));
      const rv = v3.dot(v3.sub(b.v, a.v), n);
      if (rv < -0.9 && ((a.type === BT.BALL && b.type === BT.CRATE) || (b.type === BT.BALL && a.type === BT.CRATE))) {
        (this._toBreak || (this._toBreak = [])).push(a.type === BT.CRATE ? a : b);
      }
      if (rv < 0) {
        const J = (-(1.3) * rv) / (1 / ma + 1 / mb);
        a.v = v3.sub(a.v, v3.mul(n, J / ma)); b.v = v3.add(b.v, v3.mul(n, J / mb));
      }
    }
  }
  flushBreaks() {
    if (!this._toBreak) return;
    for (const c of this._toBreak) this.breakCrate(c);
    this._toBreak = null;
  }
  pushOut(b, c, r, ship) {
    const d = v3.sub(b.p, c), L = v3.len(d), R = r + b.r;
    if (L >= R || L < 1e-6) return;
    const n = v3.mul(d, 1 / L);
    b.p = v3.add(c, v3.mul(n, R));
    let vrel = b.v;
    if (ship) vrel = v3.sub(b.v, v3.add(ship.v, v3.cross(ship.w, v3.sub(b.p, ship.p))));
    const vn = v3.dot(vrel, n);
    if (vn < 0) {
      const J = -(1 + b.spec.e) * vn;
      b.v = v3.add(b.v, v3.mul(n, J));
      if (ship) {
        ship.applyImpulse(v3.mul(n, -J * b.spec.mass * 0.6), b.p);
        if (b.type === BT.BALL && -vn > 1.5) {
          for (let k = 0; k < 8; k++) this.parts.spawn(2, b.p, [rr(-0.8, 0.8), rr(0.2, 1.2), rr(-0.8, 0.8)], rr(0.2, 0.5), 0.008, 0.003, [2.5, 1.6, 0.6], 0, 2, -4);
          for (let k = 0; k < 5; k++) this.parts.spawn(3, b.p, [rr(-0.2, 0.2), rr(0.05, 0.3), rr(-0.2, 0.2)], rr(0.8, 1.4), 0.02, 0.07, [0.55, 0.42, 0.3], 0.5, 2);
        }
      }
    }
  }
  windAt(t) {
    const a = WIND_BASE + 0.26 * Math.sin(t * 0.05) + 0.1 * Math.sin(t * 0.13 + 1.3);
    const s = 0.34 + 0.08 * Math.sin(t * 0.21) + 0.04 * Math.sin(t * 0.77);
    return [Math.cos(a) * s, Math.sin(a) * s];
  }
  step(dt) {
    const firm = this.params.firm;
    this.block.step(dt, firm);
    const gB = this.block.gravityLocal(G_BODY);
    const gW = this.block.gravityLocal(G_WATER);
    this.windVec = this.windAt(this.t);
    this.ship.step(dt, gB, this.water, this.windVec);
    this.stepBodies(dt, gB);
    this.flushBreaks();
    this.crateTimer += dt;
    if (this.crateTimer > 5) {
      this.crateTimer = 0;
      if (this.bodies.filter((x) => x.active && x.type === BT.CRATE).length < 4) this.dropCrate();
    }
    this.water.step(dt, gW[0], gW[2], 0.05 + this.params.damp * 1.6, 0.00004 + firm * 0.00016);
    // palms: springy bend + wind sway
    this.palmBend.forEach((pb, k) => {
      const tgt = pb.target || [0, 0];
      const K = pb.target ? 70 : 38, C = pb.target ? 9 : 2.4;
      pb.v[0] += (-K * (pb.b[0] - tgt[0]) - C * pb.v[0]) * dt;
      pb.v[1] += (-K * (pb.b[1] - tgt[1]) - C * pb.v[1]) * dt;
      pb.b[0] += pb.v[0] * dt; pb.b[1] += pb.v[1] * dt;
      void k;
    });
    // chest lid spring with a bounce
    const tgt = this.lid.open ? -1.95 : 0;
    this.lid.v += (-90 * (this.lid.a - tgt) - 7 * this.lid.v) * dt;
    this.lid.a += this.lid.v * dt;
    if (this.lid.a > 0) { this.lid.a = 0; this.lid.v = -this.lid.v * 0.35; }
    if (this.lid.a < -2.05) { this.lid.a = -2.05; this.lid.v = -this.lid.v * 0.3; }
  }
  emit(dt) {
    const P = this.parts, F = LAYOUT.fire, t = this.t, sc = this.parts.scale;
    this.fireBoost = Math.max(0, this.fireBoost - dt * 0.45);
    const fire = this.tod.fire * (1 + this.fireBoost * 1.6);
    const nf = fire * 34 * dt * sc;
    for (let k = 0; k < Math.floor(nf) + (rnd() < nf % 1 ? 1 : 0); k++) {
      const a = rnd() * 6.28, r = rr(0, 0.035);
      P.spawn(1, [F[0] + Math.cos(a) * r, F[1] + 0.03, F[2] + Math.sin(a) * r], [rr(-0.04, 0.04), rr(0.22, 0.42) * (1 + this.fireBoost), rr(-0.04, 0.04)], rr(0.3, 0.6), rr(0.028, 0.045) * (1 + this.fireBoost * 0.5), 0.012, [1.9, 0.75, 0.2].map((c) => c * (0.7 + 0.5 * fire)), 0, 1.5, 0.15);
    }
    if (rnd() < (4 + this.fireBoost * 30) * dt * sc) P.spawn(2, [F[0] + rr(-0.03, 0.03), F[1] + 0.06, F[2] + rr(-0.03, 0.03)], [rr(-0.15, 0.15), rr(0.4, 0.9), rr(-0.15, 0.15)], rr(1.2, 2.4), 0.006, 0.003, [3, 1.2, 0.3], 0, 1.2, -0.1);
    if (rnd() < 4 * dt * sc) P.spawn(3, [F[0] + rr(-0.02, 0.02), F[1] + 0.17, F[2] + rr(-0.02, 0.02)], [rr(-0.03, 0.03), rr(0.12, 0.2), rr(-0.03, 0.03)], rr(2.6, 3.6), 0.025, rr(0.1, 0.15), [0.3, 0.3, 0.32], 0.2, 0.5, 0.02);
    if (this.lid.a < -1 && rnd() < 10 * dt) {
      const C = LAYOUT.chest;
      P.spawn(4, v3.add(C, [rr(-0.07, 0.07), rr(0.1, 0.18), rr(-0.05, 0.05)]), [0, 0.05, 0], rr(0.35, 0.7), rr(0.018, 0.03), 0, [2.2, 1.7, 0.75], 0, 2);
    }
    // spray from the bow in a chop
    const sp = Math.hypot(this.ship.v[0], this.ship.v[2]);
    if (sp > 0.3 && rnd() < sp * 20 * dt) {
      const b = this.ship.world([rr(-0.08, 0.08), 0.0, 0.5]);
      P.spawn(6, b, [rr(-0.3, 0.3), rr(0.4, 0.8), rr(-0.3, 0.3)], 0.6, 0.01, 0.006, [0.95, 0.98, 1], 0.8, 0.6, -6, 2);
    }
    // bubbles from sinking things
    for (const b of this.bodies) if (b.active && b.sub > 0.95 && !b.grounded && rnd() < 6 * dt) P.spawn(5, b.p, [rr(-0.05, 0.05), 0.3, rr(-0.05, 0.05)], 1.4, rr(0.006, 0.012), 0.014, [0.85, 0.95, 1], 0.7, 2, 0.7, 1);
    void t;
  }
  sprites() {
    // immediate sprites: halos, fireflies, trapped bubbles
    const S = [], night = this.tod.night, t = this.t, F = LAYOUT.fire;
    const fi = this.tod.fire * (1 + this.fireBoost) * this.flicker;
    const hk = 0.08 + 0.92 * night;
    S.push([F[0], F[1] + 0.1, F[2], 0.34 * (0.8 + 0.2 * fi), 0.5 * fi * hk, 0.2 * fi * hk, 0.05 * fi * hk, 0, 0, 0, 0.1]);
    if (night > 0.05) {
      const sh = this.ship;
      const lan = sh.world([0, SHIP.sheer(SHIP.zs) + 0.095, SHIP.zs - 0.035]);
      S.push([lan[0], lan[1], lan[2], 0.12, 0.9 * night, 0.55 * night, 0.22 * night, 0, 0, 0, 0.3]);
      const win = sh.world([0, 0.16, SHIP.zs - 0.03]);
      S.push([win[0], win[1], win[2], 0.16, 0.5 * night, 0.28 * night, 0.1 * night, 0, 0, 0, 0.5]);
      const sk = LAYOUT.skull, cy = Math.cos(sk.yaw), sy = Math.sin(sk.yaw);
      for (const sx of [-1, 1]) {
        const l = [sx * 0.34, 0.08, 0.8];
        const p = [sk.c[0] + (cy * l[0] + sy * l[2]) * sk.s, sk.c[1] + l[1] * sk.s, sk.c[2] + (-sy * l[0] + cy * l[2]) * sk.s];
        const g = night * (0.7 + 0.3 * Math.sin(t * 11 + sx) * Math.sin(t * 7.3));
        S.push([p[0], p[1], p[2], 0.11, 0.7 * g, 0.3 * g, 0.08 * g, 0, 0, 0, 0.7]);
      }
      for (const f of this.fireflies) {
        const a = f.a + t * f.s;
        const x = HUMP[0] + Math.cos(a) * f.r * 1.2, z = HUMP[1] + Math.sin(a * 1.3) * f.r * 0.9;
        const y = H(x, z) + f.h + 0.05 * Math.sin(t * 1.7 + f.ph);
        const blink = Math.max(0, Math.sin(t * 2.1 + f.ph)) ** 3 * night;
        if (blink > 0.02) {
          S.push([x, y, z, 0.035, 0.7 * blink, 0.95 * blink, 0.25 * blink, 0, 0, 0, 0]);
          S.push([x, y, z, 0.008, 1.8 * blink, 2.2 * blink, 0.9 * blink, 0, 2, 0, 0]);
        }
      }
    }
    for (const b of this.bubbles) {
      const y = b[1] + 0.006 * Math.sin(t * 1.3 + b[4]);
      const a = 0.55;
      S.push([b[0] + 0.004 * Math.sin(t * 0.9 + b[4]), y, b[2], b[3], 0.85 * a, 0.95 * a, 1.0 * a, a, 5, 0, b[4]]);
    }
    return S;
  }

  // ── per-frame ────────────────────────────────────────────────────────────
  baseDist() {
    const a = (this.fitW || this.css[0]) / this.css[1];
    return 12.8 * Math.max(1, 1.45 / a);
  }
  camLocal() { return m4.pt(this.invBlock || m4.id(), this.camPos || [0, 5, 10]); }
  update(dtReal) {
    const dt = Math.min(dtReal, 1 / 20);
    if (!this.paused) {
      this.t += dt;
      this.acc += dt;
      const h = 1 / 240;
      let n = 0;
      this.water.setShipPressure(this.ship);
      while (this.acc >= h && n < 10) { this.step(h); this.acc -= h; n++; }
      if (n >= 10) this.acc = 0;
      this.tod = todSample(this.params.tod);
      this.emit(dt);
      this.parts.update(dt, this.water, this.windVec);
    }
    this.tod = todSample(this.params.tod);
    this.flicker = 0.82 + 0.1 * Math.sin(this.t * 13.1) + 0.08 * Math.sin(this.t * 23.7 + 1.3) + 0.05 * Math.sin(this.t * 41);
    // liveliness
    let e = this.water.energy() * 2400 + v3.dot(this.ship.v, this.ship.v) * 3 + v3.dot(this.ship.w, this.ship.w) * 0.5;
    for (const b of this.bodies) if (b.active && !b.grounded) e += v3.dot(b.v, b.v) * 0.2;
    e += Math.abs(this.block.vx) + Math.abs(this.block.vz) + this.fireBoost * 0.5;
    this.lively = lerp(this.lively, 1 - Math.exp(-e * 1.2), 1 - Math.exp(-4 * dt));
    // camera easing
    const c = this.cam, k = 1 - Math.exp(-10 * dt);
    c.yaw = lerp(c.yaw, c.tYaw, k); c.pitch = lerp(c.pitch, c.tPitch, k); c.dist = lerp(c.dist, c.tDist, k);
  }
  render() {
    const R = this.r, U = R.uni, w = R.size[0], h = R.size[1];
    const c = this.cam;
    const target = c.target || [0, -0.2, 0];
    const eye = [target[0] + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw), target[1] + c.dist * Math.sin(c.pitch), target[2] + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw)];
    this.camPos = eye;
    const near = 0.5, far = 80;
    const proj = m4.persp((30 * Math.PI) / 180, w / h, near, far);
    proj[8] = this.panelShift[0]; proj[9] = this.panelShift[1];
    const view = m4.lookAt(eye, target, [0, 1, 0]);
    const vp = m4.mul(proj, view);
    this.viewProj = vp; this.invViewProj = m4.inv(vp);
    const blockM = this.block.matrix();
    this.blockM = blockM; this.invBlock = m4.inv(blockM);
    const td = this.tod;
    const L = td.dir;
    const lc = [0, -0.4, 0];
    const lview = m4.lookAt(v3.add(lc, v3.mul(L, 12)), lc, Math.abs(L[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]);
    const lproj = m4.ortho(-4.4, 4.4, -4.4, 4.4, 2, 24);
    const lvp = m4.mul(lproj, lview);
    const fl = FLAVOURS[this.params.flavour];
    U.set(vp, 0); U.set(this.invViewProj, 16); U.set(lvp, 32); U.set(blockM, 48); U.set(this.invBlock, 64);
    U.set([eye[0], eye[1], eye[2], this.t], 80);
    U.set([L[0], L[1], L[2], td.I], 84);
    U.set([td.col[0], td.col[1], td.col[2], td.night], 88);
    U.set([td.at[0], td.at[1], td.at[2], td.fire * (1 + this.fireBoost * 1.2)], 92);
    U.set([td.ab[0], td.ab[1], td.ab[2], td.exp], 96);
    const F = LAYOUT.fire;
    U.set([F[0], F[1], F[2], this.flicker], 100);
    U.set([td.bt[0], td.bt[1], td.bt[2], smoothstep(0.4, 0.9, td.night)], 104);
    U.set([td.bb[0], td.bb[1], td.bb[2], td.moon], 108);
    U.set([this.block.sx, this.block.sz, this.block.sq, YB], 112);
    U.set([...fl.absorb, 0], 116);
    U.set([...fl.scatter, 0], 120);
    U.set([...fl.surf, clamp(-this.lid.a / 1.9, 0, 1)], 124);
    U.set([w, h, 1 / w, 1 / h], 128);
    U.set([GRID, HALF, this.water.dx, this.reduced ? 1 : 0], 132);
    const wl = Math.hypot(this.windVec[0], this.windVec[1]) || 1;
    U.set([this.windVec[0] / wl, this.windVec[1] / wl, wl * 2.5, 0], 136);
    U.set([proj[0], proj[5], near, far], 140);
    // objects
    R.setObj(SLOT.SHIP, q4.mat(this.ship.q, this.ship.p));
    LAYOUT.palms.forEach((p, k) => {
      const pb = this.palmBend[k];
      const sway = Math.sin(this.t * 1.1 + k * 1.7) * 0.012 + Math.sin(this.t * 2.3 + k) * 0.005;
      const ws = 0.025 * (1 - this.params.firm * 0.2);
      const bx = pb.b[0] + this.windVec[0] * ws + sway * (this.reduced ? 0.3 : 1);
      const bz = pb.b[1] + this.windVec[1] * ws + sway * 0.6 * (this.reduced ? 0.3 : 1);
      R.setObj(p.slot, m4.T(p.base[0], p.base[1], p.base[2]), [bx, 0, bz, 1]);
    });
    const hg = LAYOUT.chestHinge;
    R.setObj(SLOT.LID, m4.chain(LAYOUT.chestM, m4.T(hg[0], hg[1], hg[2]), m4.RX(this.lid.a), m4.T(0, 0, -hg[2])));
    for (const b of this.bodies) R.setObj(b.slot, b.matrix());
    // anchor chain: a sagging curve from the bow to the anchor
    const bow = this.ship.world([0.06, 0.08, 0.5]), A = LAYOUT.anchorRing;
    const span = v3.len(v3.sub(A, bow));
    const slack = Math.max(0, this.ship.rode * 1.04 - span);
    const pts = [];
    for (let i = 0; i <= SLOT.NCHAIN; i++) {
      const s = i / SLOT.NCHAIN;
      const p = v3.lerp(bow, A, s);
      p[1] -= Math.sin(Math.PI * s) * (0.05 + slack * 1.2) * (1 - s * 0.3);
      const g = H(p[0], p[2]) + 0.006;
      if (p[1] < g) p[1] = g;
      pts.push(p);
    }
    for (let i = 0; i < SLOT.NCHAIN; i++) {
      const a = pts[i], b = pts[i + 1];
      const z = v3.norm(v3.sub(b, a));
      const ref = Math.abs(z[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      let x = v3.norm(v3.cross(ref, z)), y = v3.cross(z, x);
      if (i % 2) { const t = x; x = y; y = v3.mul(t, -1); }
      R.setObj(SLOT.CHAIN + i, m4.basis(x, y, z, v3.lerp(a, b, 0.5)));
    }
    const pc = this.parts.pack(this.sprites());
    R.frame(this.water.eta, pc, this.parts.inst, { ball: SLOT.NBALL, barrel: SLOT.NBARREL, coin: SLOT.NCOIN });
  }

  // ── picking ──────────────────────────────────────────────────────────────
  ray(sx, sy) {
    const x = (sx / this.css[0]) * 2 - 1, y = 1 - (sy / this.css[1]) * 2;
    const a = m4.pt(this.invViewProj, [x, y, 0]), b = m4.pt(this.invViewProj, [x, y, 1]);
    const o = m4.pt(this.invBlock, a), e = m4.pt(this.invBlock, b);
    return { o, d: v3.norm(v3.sub(e, o)), wo: a, wd: v3.norm(v3.sub(b, a)) };
  }
  static raySphere(o, d, c, r) {
    const oc = v3.sub(o, c), b = v3.dot(oc, d), cc = v3.dot(oc, oc) - r * r, h = b * b - cc;
    if (h < 0) return Infinity;
    const t = -b - Math.sqrt(h);
    return t > 0 ? t : Infinity;
  }
  static rayBox(o, d, lo, hi) {
    let t0 = -Infinity, t1 = Infinity, face = -1;
    for (let a = 0; a < 3; a++) {
      const inv = 1 / d[a];
      let ta = (lo[a] - o[a]) * inv, tb = (hi[a] - o[a]) * inv;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) { t0 = ta; face = a; }
      t1 = Math.min(t1, tb);
    }
    return t1 >= Math.max(t0, 0) ? { t: t0, face } : null;
  }
  pick(sx, sy) {
    const { o, d } = this.ray(sx, sy);
    let best = { kind: 'none', t: Infinity };
    const consider = (kind, t, extra) => { if (t < best.t) best = { kind, t, ...extra }; };
    // ship
    const sh = this.ship;
    const so = sh.local(o), sd = q4.rot(q4.conj(sh.q), d);
    for (const [lo, hi] of [[[-0.19, -0.14, -0.62], [0.19, 0.24, 0.66]], [[-0.3, 0.1, -0.75], [0.3, 1.25, 0.95]]]) {
      const hb = App.rayBox(so, sd, lo, hi);
      if (hb && hb.t > 0) consider('ship', hb.t);
    }
    for (const b of this.bodies) if (b.active) consider('body', App.raySphere(o, d, b.p, Math.max(b.r * 1.8, 0.05)), { body: b });
    consider('chest', App.raySphere(o, d, v3.add(LAYOUT.chest, [0, 0.06, 0]), 0.12));
    consider('fire', App.raySphere(o, d, v3.add(LAYOUT.fire, [0, 0.07, 0]), 0.12));
    const X = LAYOUT.xMark;
    consider('x', App.raySphere(o, d, [X[0], H(X[0], X[1]) + 0.01, X[1]], 0.1));
    LAYOUT.palms.forEach((p, k) => {
      const pb = this.palmBend[k];
      const top = [p.top[0] + pb.b[0], p.top[1], p.top[2] + pb.b[1]];
      let t = App.raySphere(o, d, top, 0.22);
      for (let s = 0.35; s < 1; s += 0.2) t = Math.min(t, App.raySphere(o, d, v3.lerp(p.base, top, s), 0.07));
      consider('palm', t, { palm: k });
    });
    // block: side faces tip it; through the top we hit water or land
    const hb = App.rayBox(o, d, [-HALF, YB, -HALF], [HALF, 0.06, HALF]);
    if (hb) {
      if (hb.face !== 1 && hb.t > 0) {
        const p = v3.add(o, v3.mul(d, hb.t));
        const n = hb.face === 0 ? [Math.sign(p[0]), 0, 0] : [0, 0, Math.sign(p[2])];
        consider('side', hb.t, { normal: n });
      } else {
        // march to the first surface (land or water)
        let t = Math.max(hb.t, 0);
        for (let k = 0; k < 400; k++) {
          const p = v3.add(o, v3.mul(d, t));
          if (Math.abs(p[0]) > HALF || Math.abs(p[2]) > HALF || p[1] < YB) break;
          const g = H(p[0], p[2]), wl = this.water.etaAt(p[0], p[2]);
          if (p[1] < Math.max(g, wl)) { consider(g < wl - 0.01 ? 'water' : 'land', t, { point: p }); break; }
          t += 0.012;
        }
      }
    }
    return best;
  }
  planeHit(sx, sy, y) {
    const { o, d } = this.ray(sx, sy);
    if (Math.abs(d[1]) < 1e-4) return null;
    const t = (y - o[1]) / d[1];
    return t > 0 ? v3.add(o, v3.mul(d, t)) : null;
  }
  camPlaneHit(sx, sy, through) {
    const { o, d } = this.ray(sx, sy);
    const cl = this.camLocal();
    const n = v3.norm([cl[0] - through[0], 0, cl[2] - through[2]]);
    const den = v3.dot(d, n);
    if (Math.abs(den) < 1e-4) return null;
    const t = v3.dot(v3.sub(through, o), n) / den;
    return t > 0 ? v3.add(o, v3.mul(d, t)) : null;
  }
}
