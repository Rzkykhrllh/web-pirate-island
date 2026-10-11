// ─────────────────────────────────────────────────────────────────────────────
//  Procedural diorama geometry
// ─────────────────────────────────────────────────────────────────────────────
const MAT = { DEFAULT: 0, FLOOR: 1, TERRAIN: 2, STRATA: 3, GUMMY: 4, FROND: 5, TRUNK: 6, SAIL: 7, FLAG: 8, WINDOW: 9, LANTERN: 10, EMBER: 11, METAL: 12, GOLD: 13, GEM: 14, WOOD: 15, ROCK: 16, KELP: 18, GLASS: 19, HULL: 20, GRASS: 21, ROPE: 22, COAL: 23 };
const SLOT = { SHIP: 1, PALM0: 2, LID: 11, BALL: 16, NBALL: 40, BARREL: 56, NBARREL: 16, COIN: 72, NCOIN: 56, CHAIN: 128, NCHAIN: 34, CRATE: 168, NCRATE: 12, FRUIT: 180, NFRUIT: 40, TOTAL: 220 };

const COL = {
  wood: [0.45, 0.28, 0.14], woodDark: [0.28, 0.17, 0.09], iron: [0.12, 0.12, 0.13], gold: [1.0, 0.74, 0.28],
  sand: [0.95, 0.85, 0.63], rope: [0.36, 0.26, 0.16], sail: [0.95, 0.91, 0.82], black: [0.05, 0.05, 0.055],
};

// ── ship (local: +z bow, +y up, origin on the waterline amidships) ──────────
const SHIP = {
  zs: -0.56, ze: 0.62,
  t: (z) => (z - SHIP.zs) / (SHIP.ze - SHIP.zs),
  beam(z) {
    const t = SHIP.t(z);
    if (t < 0.62) return 0.165 * (0.8 + 0.2 * Math.sin(Math.min(t / 0.38, 1) * Math.PI / 2));
    return 0.165 * Math.pow(Math.max(Math.cos(((t - 0.62) / 0.38) * Math.PI / 2), 0), 0.75);
  },
  keel(z) { const t = SHIP.t(z); return 0.125 - 0.05 * smoothstep(0.78, 1, t) - 0.02 * smoothstep(0.12, 0, t); },
  sheer(z) { return 0.1 + 0.095 * smoothstep(-0.22, -0.32, z) + 0.045 * smoothstep(0.34, 0.5, z) + 0.02 * Math.pow(Math.abs(z) / 0.6, 2); },
  // half-width at height y for station z
  halfAt(z, y) {
    const d = SHIP.keel(z), s = SHIP.sheer(z);
    const u = clamp((y + d) / (s + d), 0, 1);
    return SHIP.beam(z) * Math.pow(Math.sin((u * Math.PI) / 2), 0.55) * (1 - 0.1 * Math.pow(u, 6));
  },
  guns: [-0.17, -0.02, 0.13, 0.28],
  gunY: 0.034,
  masts: [{ z: 0.3, h: 0.98 }, { z: 0.0, h: 1.16 }, { z: -0.37, h: 0.8 }],
};

function buildShip(mb) {
  const O = SLOT.SHIP;
  const NZ = 44, NU = 18;
  // hull sides (uv.x carries local height for crisp paint bands)
  for (const side of [1, -1]) {
    mb.surf(NU, NZ, (uu, vv) => {
      const z = lerp(SHIP.zs, SHIP.ze, vv);
      const d = SHIP.keel(z), s = SHIP.sheer(z);
      const y = lerp(-d, s, uu);
      const x = side * SHIP.halfAt(z, y);
      return { p: [x, y, z], uv: [y, z] };
    }, { mat: MAT.HULL, obj: O, flip: side < 0 });
  }
  // transom
  {
    const z = SHIP.zs, d = SHIP.keel(z), s = SHIP.sheer(z);
    mb.surf(NU, 2, (uu, vv) => {
      const y = lerp(-d, s, uu);
      const x = lerp(-1, 1, vv) * SHIP.halfAt(z, y);
      return { p: [x, y, z - 0.001 * Math.abs(x)], n: [0, 0, -1], uv: [Math.max(y, 0.07), z] };
    }, { mat: MAT.HULL, obj: O });
    // stern windows + gilded trim + lantern
    for (let k = 0; k < 4; k++) {
      const x = -0.075 + k * 0.05;
      mb.box(m4.T(x, 0.16, z - 0.004), 0.034, 0.036, 0.006, [1, 0.7, 0.3], MAT.WINDOW, O);
      mb.box(m4.T(x, 0.16, z - 0.007), 0.006, 0.04, 0.004, COL.gold, MAT.GOLD, O);
    }
    mb.box(m4.T(0, 0.185, z - 0.006), 0.2, 0.008, 0.008, COL.gold, MAT.GOLD, O);
    mb.box(m4.T(0, 0.134, z - 0.006), 0.2, 0.008, 0.008, COL.gold, MAT.GOLD, O);
    mb.tube([0, s - 0.01, z + 0.01], [0, s + 0.08, z - 0.03], 0.004, 5, COL.iron, MAT.METAL, O);
    mb.sphere(m4.T(0, s + 0.095, z - 0.035), 0.017, 0.022, 0.017, 10, 7, [1, 0.75, 0.4], MAT.LANTERN, O);
    mb.cyl(m4.T(0, s + 0.113, z - 0.035), 0.019, 0.004, 0.02, 8, COL.iron, MAT.METAL, O);
    // rudder
    mb.box(m4.T(0, -0.04, z - 0.012), 0.012, 0.15, 0.03, COL.woodDark, MAT.WOOD, O);
  }
  // deck
  mb.surf(4, NZ, (uu, vv) => {
    const z = lerp(SHIP.zs, SHIP.ze - 0.02, vv), s = SHIP.sheer(z) - 0.012;
    return { p: [lerp(-1, 1, uu) * SHIP.halfAt(z, s) * 0.97, s, z], n: [0, 1, 0] };
  }, { col: [0.62, 0.45, 0.27], mat: MAT.WOOD, obj: O });
  // rails
  for (const side of [1, -1]) {
    for (let k = 0; k < NZ; k++) {
      const z0 = lerp(SHIP.zs, SHIP.ze - 0.03, k / NZ), z1 = lerp(SHIP.zs, SHIP.ze - 0.03, (k + 1) / NZ);
      mb.tube([side * SHIP.halfAt(z0, SHIP.sheer(z0)), SHIP.sheer(z0) + 0.004, z0], [side * SHIP.halfAt(z1, SHIP.sheer(z1)), SHIP.sheer(z1) + 0.004, z1], 0.006, 4, [0.6, 0.38, 0.12], MAT.WOOD, O, { caps: false });
    }
  }
  // quarterdeck front bulkhead
  mb.box(m4.T(0, 0.15, -0.255), 0.29, 0.1, 0.012, [0.12, 0.09, 0.07], MAT.WOOD, O);
  // gunports + cannons
  for (const side of [1, -1]) {
    for (const z of SHIP.guns) {
      const x = SHIP.halfAt(z, SHIP.gunY);
      mb.box(m4.T(side * (x + 0.002), SHIP.gunY, z), 0.006, 0.03, 0.034, [0.02, 0.015, 0.012], MAT.DEFAULT, O);
      mb.box(m4.T(side * (x + 0.004), SHIP.gunY + 0.022, z), 0.004, 0.006, 0.042, [0.55, 0.3, 0.1], MAT.WOOD, O);
      mb.tube([side * (x - 0.02), SHIP.gunY, z], [side * (x + 0.035), SHIP.gunY, z], 0.0085, 8, [0.09, 0.09, 0.1], MAT.METAL, O, { r1: 0.85 });
    }
  }
  // bowsprit
  const bowTip = [0, 0.27, 0.98];
  mb.tube([0, 0.13, 0.5], bowTip, 0.011, 8, COL.woodDark, MAT.WOOD, O, { r1: 0.6 });
  // masts, yards, sails
  const yards = [];
  for (let k = 0; k < 3; k++) {
    const m = SHIP.masts[k], base = SHIP.sheer(m.z);
    mb.cyl(m4.T(0, base - 0.02, m.z), 0.016, 0.008, m.h, 10, [0.4, 0.26, 0.13], MAT.WOOD, O);
    mb.cyl(m4.T(0, base + m.h * 0.66, m.z), 0.04, 0.04, 0.012, 10, COL.woodDark, MAT.WOOD, O); // top
  }
  const square = [
    { m: 0, y0: 0.42, y1: 0.18, w0: 0.24, w1: 0.28 }, { m: 0, y0: 0.74, y1: 0.45, w0: 0.17, w1: 0.23 },
    { m: 1, y0: 0.49, y1: 0.19, w0: 0.29, w1: 0.33 }, { m: 1, y0: 0.89, y1: 0.52, w0: 0.2, w1: 0.27 },
  ];
  for (const sq of square) {
    const m = SHIP.masts[sq.m], base = SHIP.sheer(m.z);
    const yT = base + sq.y0, yB = base + sq.y1, z = m.z - 0.022;
    mb.tube([-sq.w0 - 0.02, yT + 0.008, m.z - 0.012], [sq.w0 + 0.02, yT + 0.008, m.z - 0.012], 0.0065, 6, COL.woodDark, MAT.WOOD, O, { r0: 0.7, r1: 0.7 });
    mb.surf(10, 8, (uu, vv) => {
      const s = lerp(-1, 1, uu);
      const hw = lerp(sq.w0, sq.w1, vv);
      const bil = 0.075 * Math.sin(Math.PI * Math.min(vv * 0.9 + 0.1, 1)) * (1 - 0.65 * s * s);
      return { p: [s * hw, lerp(yT, yB, vv) + 0.02 * vv * vv * (1 - s * s), z - bil], uv: [uu, 1 - vv] };
    }, { col: COL.sail, mat: MAT.SAIL, obj: O, flexFn: (uu, vv) => vv });
    yards.push({ m: sq.m, y: yT, w: sq.w0 });
  }
  // gaff sail on the mizzen
  {
    const m = SHIP.masts[2], base = SHIP.sheer(m.z);
    const luffB = base + 0.12, luffT = base + 0.6;
    const gaffEnd = [0, base + 0.72, m.z - 0.36], boomEnd = [0, base + 0.1, m.z - 0.42];
    mb.tube([0, luffT + 0.01, m.z - 0.012], [0, gaffEnd[1] + 0.01, gaffEnd[2]], 0.006, 6, COL.woodDark, MAT.WOOD, O);
    mb.tube([0, luffB - 0.01, m.z - 0.012], [0, boomEnd[1] - 0.01, boomEnd[2]], 0.0075, 6, COL.woodDark, MAT.WOOD, O);
    mb.surf(10, 8, (uu, vv) => {
      const top = v3.lerp([0, luffT, m.z - 0.02], gaffEnd, uu), bot = v3.lerp([0, luffB, m.z - 0.02], boomEnd, uu);
      const p = v3.lerp(bot, top, vv);
      p[0] += 0.05 * Math.sin(Math.PI * uu) * Math.sin(Math.PI * vv);
      return { p, uv: [uu, vv] };
    }, { col: COL.sail, mat: MAT.SAIL, obj: O, flexFn: (uu) => uu });
  }
  // jib to the bowsprit
  {
    const fm = SHIP.masts[0], base = SHIP.sheer(fm.z);
    const head = [0, base + 0.8, fm.z + 0.02], tack = [0, bowTip[1] - 0.01, bowTip[2] - 0.03], clew = [0.04, base + 0.12, 0.6];
    mb.surf(8, 8, (uu, vv) => {
      const a = v3.lerp(head, tack, uu);
      const p = v3.lerp(a, clew, vv * (1 - uu * 0.0));
      const q = v3.lerp(p, v3.lerp(head, clew, vv), 0);
      const k = vv * (1 - vv) * 4 * Math.sin(Math.PI * uu);
      return { p: [q[0] + 0.04 * k, lerp(a[1], clew[1], vv * (1 - uu)), lerp(a[2], clew[2], vv * (1 - uu))], uv: [uu, vv] };
    }, { col: COL.sail, mat: MAT.SAIL, obj: O, flexFn: (uu, vv) => vv });
  }
  // Jolly Roger at the main truck, streaming aft
  {
    const mm = SHIP.masts[1], top = SHIP.sheer(mm.z) + mm.h - 0.01;
    mb.surf(16, 6, (uu, vv) => ({ p: [0, top - vv * 0.13 - uu * 0.015, mm.z - 0.012 - uu * 0.24], uv: [uu, 1 - vv] }), { col: [0.05, 0.05, 0.05], mat: MAT.FLAG, obj: O });
  }
  // crow's nest
  {
    const mm = SHIP.masts[1], y = SHIP.sheer(mm.z) + 0.78;
    mb.cyl(m4.T(0, y, mm.z), 0.045, 0.05, 0.035, 12, COL.woodDark, MAT.WOOD, O);
  }
  // standing rigging
  const rope = (a, b, r = 0.0026) => mb.tube(a, b, r, 4, COL.rope, MAT.ROPE, O, { caps: false });
  for (let k = 0; k < 3; k++) {
    const m = SHIP.masts[k], base = SHIP.sheer(m.z);
    const head = base + m.h * 0.64;
    for (const side of [1, -1]) for (const dz of [-0.09, -0.04, 0.01]) {
      const z = m.z + dz, s = SHIP.sheer(z);
      rope([side * 0.012, head, m.z], [side * SHIP.halfAt(z, s) * 1.03, s + 0.01, z]);
    }
  }
  const mastTop = (k, f) => [0, SHIP.sheer(SHIP.masts[k].z) + SHIP.masts[k].h * f, SHIP.masts[k].z];
  rope(mastTop(0, 0.9), bowTip);
  rope(mastTop(0, 0.66), [0, 0.2, 0.86]);
  rope(mastTop(1, 0.9), mastTop(0, 0.66));
  rope(mastTop(1, 0.66), [0, SHIP.sheer(0.3) + 0.02, 0.36]);
  rope(mastTop(2, 0.9), mastTop(1, 0.6));
  for (const side of [1, -1]) {
    rope(mastTop(1, 0.95), [side * 0.15, SHIP.sheer(-0.3) + 0.01, -0.3]);
    rope(mastTop(0, 0.95), [side * 0.155, SHIP.sheer(0.12) + 0.01, 0.12]);
  }
  for (const y of yards) for (const side of [1, -1]) rope([side * y.w, y.y + 0.008, SHIP.masts[y.m].z - 0.012], [0, y.y + 0.12, SHIP.masts[y.m].z]);
  // cathead / chain fairlead at the bow
  mb.box(m4.T(0.06, 0.09, 0.5), 0.02, 0.02, 0.05, COL.woodDark, MAT.WOOD, O);
}

// ── palms (each palm has its own object slot so it can bend) ─────────────────
function buildPalm(mb, slot, h, lean, seed) {
  rngState = seed;
  const ringN = Math.round(h * 18);
  const trunkC = (v) => [lean[0] * Math.pow(v, 1.7), v * h, lean[1] * Math.pow(v, 1.7)];
  mb.surf(10, 30, (uu, vv) => {
    const a = uu * Math.PI * 2;
    const ring = Math.pow(Math.abs(Math.sin(vv * ringN * Math.PI)), 0.6);
    const r = lerp(0.046, 0.026, vv) * (0.9 + 0.12 * ring) + 0.015 * Math.exp(-vv * 18);
    const c = trunkC(vv);
    const shade = lerp(0.62, 1.0, ring);
    return { p: [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r], c: [0.8 * shade, 0.5 * shade, 0.24 * shade], f: vv };
  }, { mat: MAT.TRUNK, obj: slot });
  const top = trunkC(1);
  // coconuts
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + seed;
    mb.sphere(m4.T(top[0] + Math.cos(a) * 0.03, top[1] - 0.03, top[2] + Math.sin(a) * 0.03), 0.022, 0.024, 0.022, 8, 6, [0.42, 0.26, 0.12], MAT.GUMMY, slot, { flex: 1 });
  }
  const nLeaves = 8;
  for (let k = 0; k < nLeaves; k++) {
    const th = (k / nLeaves) * Math.PI * 2 + rr(-0.2, 0.2);
    const L = rr(0.36, 0.48), up = rr(0.35, 0.65);
    const dir = [Math.cos(th), 0, Math.sin(th)], side = [-Math.sin(th), 0, Math.cos(th)];
    const g = rr(0.85, 1.1);
    mb.surf(14, 4, (uu, vv) => {
      const s = lerp(-1, 1, vv);
      const spine = [dir[0] * uu * L, (up * uu - 1.15 * uu * uu) * L * 0.8, dir[2] * uu * L];
      const w = 0.17 * L * Math.sin(Math.PI * Math.min(uu * 1.12, 1)) * (0.62 + 0.38 * Math.abs(Math.sin(uu * 42)));
      return {
        p: [top[0] + spine[0] + side[0] * w * s, top[1] + spine[1] - Math.abs(s) * w * 0.4, top[2] + spine[2] + side[2] * w * s],
        c: [0.28 * g, 0.6 * g, 0.16 * g], uv: [uu, vv],
      };
    }, { mat: MAT.FROND, obj: slot, flex: 1 });
  }
  return { top };
}

// ── small props ──────────────────────────────────────────────────────────────
function barrelGeom(mb, M, obj, mat = MAT.WOOD) {
  // axis along local x, centred
  const R = m4.mul(M, m4.chain(m4.T(-0.055, 0, 0), m4.RZ(-Math.PI / 2)));
  mb.cyl(R, 0.04, 0.04, 0.11, 14, [0.55, 0.33, 0.15], mat, obj, {
    nv: 8, rf: (v) => 0.036 + 0.01 * Math.sin(Math.PI * v),
    colFn: (u) => { const s = 0.85 + 0.15 * Math.abs(Math.sin(u * Math.PI * 14)); return [0.55 * s, 0.33 * s, 0.15 * s]; },
    capCol: [0.42, 0.25, 0.12],
  });
  for (const v of [0.12, 0.88]) {
    const r = 0.037 + 0.01 * Math.sin(Math.PI * v) + 0.0012;
    mb.cyl(m4.mul(R, m4.T(0, v * 0.11 - 0.005, 0)), r, r, 0.01, 14, COL.iron, MAT.METAL, obj, { caps: false });
  }
}
function coinGeom(mb, M, obj, r = 0.026) {
  mb.cyl(m4.mul(M, m4.T(0, -0.003, 0)), r, r, 0.006, 16, COL.gold, MAT.GOLD, obj);
  mb.cyl(m4.mul(M, m4.T(0, 0.0005, 0)), r * 0.62, r * 0.62, 0.003, 12, [0.95, 0.66, 0.22], MAT.GOLD, obj, { caps: true });
}
function rock(mb, p, s, col, sy = 0.7, mat = MAT.ROCK) {
  const seed = p[0] * 13.1 + p[2] * 7.7;
  mb.sphere(m4.chain(m4.T(p[0], p[1], p[2]), m4.RY(seed)), s, s * sy, s * 1.1, 12, 8, col, mat, 0, {
    disp: (d) => 0.22 * (vnoise2(d[0] * 2.3 + seed, d[2] * 2.3 + d[1] * 1.7) - 0.5) + 0.08 * (vnoise2(d[0] * 6 + seed, d[1] * 6) - 0.5),
  });
}

function buildCamp(mb) {
  const F = LAYOUT.fire;
  // stone ring
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    rock(mb, [F[0] + Math.cos(a) * 0.085, F[1] + 0.008, F[2] + Math.sin(a) * 0.085], 0.024, [0.5, 0.47, 0.44], 0.65);
  }
  // coals
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4, r = 0.012 + (k % 3) * 0.012;
    mb.sphere(m4.T(F[0] + Math.cos(a) * r, F[1] + 0.008, F[2] + Math.sin(a) * r), 0.016, 0.01, 0.016, 7, 5, [0.1, 0.05, 0.03], MAT.COAL);
  }
  // teepee of logs, glowing ends at the base
  const apex = [F[0], F[1] + 0.14, F[2]];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const b = [F[0] + Math.cos(a) * 0.058, F[1] + 0.004, F[2] + Math.sin(a) * 0.058];
    mb.tube(b, v3.lerp(b, apex, 1.08), 0.0095, 7, [0.4, 0.25, 0.13], MAT.EMBER, 0, { flexFn: (v) => Math.pow(1 - v, 3) * 1.0 + (v > 0.97 ? 0.4 : 0), capFlex: (top) => (top ? 0.6 : 1) });
  }
  // tripod + pot
  const tri = [F[0], F[1] + 0.25, F[2]];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 1.0;
    mb.tube([F[0] + Math.cos(a) * 0.14, F[1] - 0.005, F[2] + Math.sin(a) * 0.14], [tri[0], tri[1] + 0.012, tri[2]], 0.0042, 5, COL.iron, MAT.METAL);
  }
  mb.tube([tri[0], tri[1], tri[2]], [tri[0], F[1] + 0.175, tri[2]], 0.0016, 4, COL.iron, MAT.METAL);
  mb.sphere(m4.T(F[0], F[1] + 0.155, F[2]), 0.034, 0.028, 0.034, 14, 8, [0.08, 0.08, 0.085], MAT.METAL);
  mb.cyl(m4.T(F[0], F[1] + 0.168, F[2]), 0.031, 0.031, 0.008, 14, [0.06, 0.06, 0.065], MAT.METAL);
  // two seating logs
  for (const [a, len] of [[2.6, 0.24], [4.4, 0.21]]) {
    const c = [F[0] + Math.cos(a) * 0.24, 0, F[2] + Math.sin(a) * 0.24];
    c[1] = H(c[0], c[2]) + 0.02;
    const t = [-Math.sin(a), 0, Math.cos(a)];
    mb.tube(v3.sub(c, v3.mul(t, len / 2)), v3.add(c, v3.mul(t, len / 2)), 0.027, 10, [0.5, 0.32, 0.17], MAT.WOOD, 0, { capCol: [0.82, 0.62, 0.38] });
  }
}

function buildChest(mb) {
  const C = LAYOUT.chest;
  const yaw = -0.55;
  const M = m4.chain(m4.T(C[0], C[1] - 0.005, C[2]), m4.RY(yaw));
  LAYOUT.chestM = M;
  const w = 0.17, h = 0.085, d = 0.105;
  mb.box(m4.mul(M, m4.T(0, h / 2, 0)), w, h, d, [0.46, 0.25, 0.12], MAT.WOOD);
  for (const x of [-0.065, 0, 0.065]) mb.box(m4.mul(M, m4.T(x, h / 2, 0)), 0.01, h + 0.004, d + 0.006, COL.iron, MAT.METAL);
  mb.box(m4.mul(M, m4.T(0, h - 0.004, d / 2 + 0.004)), 0.026, 0.026, 0.006, [0.85, 0.65, 0.25], MAT.GOLD);
  // heap of gold and gems inside
  rngState = 99;
  for (let k = 0; k < 46; k++) {
    const x = rr(-0.07, 0.07), z = rr(-0.04, 0.04);
    const y = h + 0.012 * (1 - (x * x) / 0.005 - (z * z) / 0.0016) + rr(-0.004, 0.006);
    coinGeom(mb, m4.mul(M, m4.chain(m4.T(x, y, z), m4.RX(rr(-0.6, 0.6)), m4.RZ(rr(-0.6, 0.6)))), 0, 0.012);
  }
  const gems = [[1, 0.1, 0.18], [0.1, 0.85, 0.35], [0.2, 0.35, 1.0], [0.9, 0.2, 0.9]];
  for (let k = 0; k < 7; k++) {
    mb.sphere(m4.mul(M, m4.T(rr(-0.06, 0.06), h + 0.016, rr(-0.035, 0.035))), 0.009, 0.011, 0.009, 4, 3, gems[k % 4], MAT.GEM);
  }
  mb.sphere(m4.mul(M, m4.T(0.03, h + 0.025, -0.01)), 0.022, 0.012, 0.022, 10, 6, COL.gold, MAT.GOLD);
  // lid (own slot, hinged on the back top edge; built around the hinge)
  const hinge = [0, h, -d / 2];
  LAYOUT.chestHinge = hinge;
  const lidR = d / 2;
  mb.surf(6, 10, (uu, vv) => {
    const a = vv * Math.PI;
    const x = lerp(-w / 2, w / 2, uu);
    return { p: [x, Math.sin(a) * lidR * 0.75, d / 2 - (lidR + Math.cos(a) * lidR)], n: [0, Math.sin(a), Math.cos(a)] };
  }, { col: [0.5, 0.28, 0.13], mat: MAT.WOOD, obj: SLOT.LID });
  for (const side of [-1, 1]) {
    mb.surf(10, 1, (uu, vv) => {
      const a = uu * Math.PI;
      return { p: [side * w / 2, Math.sin(a) * lidR * 0.75 * vv, d / 2 - (lidR + Math.cos(a) * lidR)], n: [side, 0, 0] };
    }, { col: [0.42, 0.23, 0.1], mat: MAT.WOOD, obj: SLOT.LID });
  }
  for (const x of [-0.065, 0, 0.065]) {
    mb.surf(1, 10, (uu, vv) => {
      const a = vv * Math.PI, r = lidR + 0.003;
      return { p: [x + (uu - 0.5) * 0.011, Math.sin(a) * r * 0.75, d / 2 - (lidR + Math.cos(a) * r)], n: [0, Math.sin(a), Math.cos(a)] };
    }, { col: COL.iron, mat: MAT.METAL, obj: SLOT.LID });
  }
}

function buildBeachProps(mb) {
  // shovel stuck in a heap of sand
  const S = LAYOUT.shovel;
  mb.sphere(m4.T(S[0], S[1] - 0.01, S[2]), 0.09, 0.045, 0.075, 14, 8, [0.93, 0.82, 0.6], MAT.DEFAULT, 0, { disp: (d) => 0.12 * (vnoise2(d[0] * 3, d[2] * 3) - 0.5) });
  const sh = m4.chain(m4.T(S[0] + 0.01, S[1] + 0.02, S[2]), m4.RZ(0.35), m4.RX(-0.2));
  mb.cyl(sh, 0.007, 0.007, 0.25, 6, [0.6, 0.42, 0.22], MAT.WOOD);
  mb.box(m4.mul(sh, m4.T(0, 0.25, 0)), 0.05, 0.012, 0.012, [0.5, 0.32, 0.16], MAT.WOOD);
  mb.box(m4.mul(sh, m4.T(0, -0.02, 0)), 0.05, 0.06, 0.005, [0.25, 0.25, 0.27], MAT.METAL);
  // barrels standing + one lying
  const bp = [[-0.6, -0.22, 0.0], [-0.5, -0.17, 1.1]];
  for (const [x, z, a] of bp) {
    const y = H(x, z);
    barrelGeom(mb, m4.chain(m4.T(x, y + 0.055, z), m4.RY(a), m4.RZ(Math.PI / 2)), 0);
  }
  barrelGeom(mb, m4.chain(m4.T(-0.53, H(-0.53, -0.29) + 0.04, -0.29), m4.RY(0.6)), 0);
  LAYOUT.barrelProps = bp.map(([x, z]) => [x, H(x, z) + 0.055, z]);
  // crate
  const cr = [-0.98, -0.25];
  const cy = H(cr[0], cr[1]);
  const CM = m4.chain(m4.T(cr[0], cy + 0.045, cr[1]), m4.RY(0.4));
  mb.box(CM, 0.1, 0.09, 0.1, [0.66, 0.48, 0.26], MAT.WOOD);
  for (const y of [-0.03, 0, 0.03]) for (const s of [1, -1]) {
    mb.box(m4.mul(CM, m4.T(0, y, s * 0.051)), 0.1, 0.018, 0.004, [0.56, 0.38, 0.19], MAT.WOOD);
    mb.box(m4.mul(CM, m4.T(s * 0.051, y, 0)), 0.004, 0.018, 0.1, [0.56, 0.38, 0.19], MAT.WOOD);
  }
  LAYOUT.crate = [cr[0], cy + 0.045, cr[1]];
  // pyramid of round shot
  const sp = [-0.2, -0.28];
  const sy = H(sp[0], sp[1]);
  const r = 0.022;
  for (let l = 0; l < 3; l++) {
    const n = 3 - l;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = sp[0] + (i - (n - 1) / 2) * r * 2, z = sp[1] + (j - (n - 1) / 2) * r * 2;
      mb.sphere(m4.T(x, sy + r + l * r * 1.42, z), r, r, r, 10, 7, [0.09, 0.09, 0.1], MAT.METAL);
    }
  }
  LAYOUT.shotPile = [sp[0], sy + 0.04, sp[1]];
  // rum bottle
  const rb = [-0.48, -0.36];
  const ry = H(rb[0], rb[1]);
  mb.cyl(m4.chain(m4.T(rb[0], ry, rb[1]), m4.RZ(0.12)), 0.017, 0.017, 0.055, 12, [0.18, 0.32, 0.12], MAT.GLASS, 0, { nv: 4, rf: (v) => (v < 0.7 ? 0.017 : lerp(0.017, 0.006, smoothstep(0.7, 1, v))) });
  mb.cyl(m4.chain(m4.T(rb[0] + 0.007, ry + 0.054, rb[1]), m4.RZ(0.12)), 0.006, 0.006, 0.03, 8, [0.18, 0.32, 0.12], MAT.GLASS);
  mb.cyl(m4.chain(m4.T(rb[0] + 0.011, ry + 0.083, rb[1]), m4.RZ(0.12)), 0.0055, 0.0055, 0.01, 8, [0.6, 0.45, 0.28], MAT.WOOD);
  // rowing boat pulled up on the cove beach
  const rp = [0.33, -0.67];
  const ryaw = 2.3;
  const RM = m4.chain(m4.T(rp[0], H(rp[0], rp[1]) + 0.03, rp[1]), m4.RY(ryaw), m4.RZ(0.12), m4.RX(-0.06));
  for (const side of [1, -1]) {
    mb.surf(8, 14, (uu, vv) => {
      const z = lerp(-0.17, 0.17, vv);
      const t = z / 0.17;
      const bw = 0.07 * Math.sqrt(Math.max(1 - Math.pow(Math.abs(t + 0.15 * (t < 0 ? 0 : 1)), 2.6), 0));
      const y = lerp(-0.03, 0.035 + 0.02 * t * t, uu);
      const x = side * bw * Math.pow(Math.sin((uu * Math.PI) / 2), 0.7);
      return { p: [x, y, z] };
    }, { M: RM, col: [0.42, 0.62, 0.66], mat: MAT.WOOD, flip: side < 0 });
  }
  mb.box(m4.mul(RM, m4.T(0, 0.012, 0.02)), 0.11, 0.008, 0.03, [0.72, 0.52, 0.3], MAT.WOOD);
  mb.box(m4.mul(RM, m4.T(0, -0.012, 0)), 0.05, 0.006, 0.26, [0.6, 0.42, 0.25], MAT.WOOD);
  for (const s of [1, -1]) mb.tube(m4.pt(RM, [s * 0.05, 0.02, -0.04]), m4.pt(RM, [s * 0.15, 0.0, 0.12]), 0.005, 5, [0.75, 0.55, 0.3], MAT.WOOD);
  LAYOUT.rowboat = m4.pt(RM, [0, 0, 0]);
}

function buildVegetation(mb) {
  rngState = 4242;
  // gummy bushes
  const bushes = [[-0.62, -1.05], [-1.1, -0.7], [-0.25, -1.0], [-0.9, -1.25], [-1.35, -1.25], [-0.4, -1.35], [-0.1, -1.55], [-1.2, -1.65], [-0.58, -1.9], [-1.05, -0.45], [-0.15, -0.6], [0.12, -1.18]];
  const greens = [[0.2, 0.62, 0.18], [0.36, 0.72, 0.2], [0.15, 0.5, 0.2], [0.45, 0.68, 0.16]];
  const flowers = [[1.0, 0.32, 0.52], [1.0, 0.78, 0.18], [0.95, 0.2, 0.2], [1.0, 0.55, 0.85]];
  LAYOUT.bushes = [];
  for (const [bx, bz] of bushes) {
    const n = 5 + Math.floor(rnd() * 3);
    const by = H(bx, bz);
    LAYOUT.bushes.push([bx, by + 0.05, bz]);
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, r = rr(0.0, 0.07);
      const x = bx + Math.cos(a) * r, z = bz + Math.sin(a) * r, s = rr(0.04, 0.075);
      const y = H(x, z) + s * 0.5 + rr(0, 0.03);
      mb.sphere(m4.T(x, y, z), s, s * 0.9, s, 12, 8, greens[k % 4], MAT.GUMMY);
      if (rnd() < 0.75) {
        const fa = rnd() * Math.PI * 2;
        const fp = [x + Math.cos(fa) * s * 0.8, y + s * 0.55, z + Math.sin(fa) * s * 0.8];
        const fc = flowers[Math.floor(rnd() * 4)];
        for (let p = 0; p < 5; p++) {
          const pa = (p / 5) * Math.PI * 2;
          mb.sphere(m4.T(fp[0] + Math.cos(pa) * 0.011, fp[1], fp[2] + Math.sin(pa) * 0.011), 0.009, 0.005, 0.009, 6, 4, fc, MAT.GUMMY);
        }
        mb.sphere(m4.T(fp[0], fp[1] + 0.003, fp[2]), 0.006, 0.005, 0.006, 6, 4, [1.0, 0.85, 0.2], MAT.GUMMY);
      }
    }
  }
  // ferns
  const ferns = [[-0.8, -0.85], [-1.25, -0.9], [-0.3, -1.2], [-0.7, -1.5], [-1.45, -1.05], [-0.05, -1.0], [-1.0, -1.85], [-0.2, -1.8]];
  for (const [fx, fz] of ferns) {
    const fy = H(fx, fz);
    for (let k = 0; k < 7; k++) {
      const th = (k / 7) * Math.PI * 2 + rnd();
      const L = rr(0.11, 0.17);
      const dir = [Math.cos(th), 0, Math.sin(th)], side = [-Math.sin(th), 0, Math.cos(th)];
      mb.surf(10, 2, (uu, vv) => {
        const s = lerp(-1, 1, vv);
        const w = 0.22 * L * Math.sin(Math.PI * uu) * (0.6 + 0.4 * Math.abs(Math.sin(uu * 30)));
        return { p: [fx + dir[0] * uu * L + side[0] * w * s, fy + (0.9 * uu - 1.0 * uu * uu) * L, fz + dir[2] * uu * L + side[2] * w * s], uv: [uu, vv] };
      }, { col: [0.22, 0.52, 0.16], mat: MAT.FROND, flex: 0 });
    }
  }
  // beach grass tufts
  for (let k = 0; k < 46; k++) {
    let x, z, y, tries = 0;
    do { const a = rnd() * Math.PI * 2, r = rr(0.6, 1.15); x = IC[0] + Math.cos(a) * r * 1.05; z = IC[1] + Math.sin(a) * r * 0.95; y = H(x, z); tries++; }
    while ((y < 0.04 || y > 0.25 || Math.hypot(x - LAYOUT.fire[0], z - LAYOUT.fire[2]) < 0.35 || Math.hypot(x - LAYOUT.xMark[0], z - LAYOUT.xMark[1]) < 0.18) && tries < 30);
    if (tries >= 30) continue;
    for (let b = 0; b < 7; b++) {
      const th = rnd() * Math.PI * 2, L = rr(0.05, 0.1), lean = rr(0.2, 0.6);
      const dir = [Math.cos(th), 0, Math.sin(th)], side = [-Math.sin(th), 0, Math.cos(th)];
      const c = rnd() < 0.5 ? [0.55, 0.66, 0.26] : [0.74, 0.7, 0.38];
      mb.surf(1, 4, (uu, vv) => {
        const w = 0.006 * (1 - vv);
        const s = uu * 2 - 1;
        return { p: [x + dir[0] * lean * vv * vv * L + side[0] * w * s, y + vv * L, z + dir[2] * lean * vv * vv * L + side[2] * w * s], uv: [uu, vv] };
      }, { col: c, mat: MAT.GRASS, flexFn: (uu, vv) => vv });
    }
  }
  // shoreline rocks
  for (let k = 0; k < 22; k++) {
    let x, z, y, tries = 0;
    do { const a = rnd() * Math.PI * 2, r = rr(0.95, 1.3); x = IC[0] + Math.cos(a) * r * 1.08; z = IC[1] + Math.sin(a) * r * 0.93; y = H(x, z); tries++; }
    while ((y > 0.06 || y < -0.3 || (Math.hypot(x - COVE[0], z - COVE[1]) < 0.55)) && tries < 40);
    if (tries >= 40) continue;
    const s = rr(0.03, 0.075);
    rock(mb, [x, y + s * 0.25, z], s, rnd() < 0.5 ? [0.52, 0.47, 0.42] : [0.44, 0.4, 0.38], rr(0.55, 0.85));
  }
  for (const [x, z, s] of [[-1.62, -0.25, 0.08], [-2.1, -0.75, 0.07], [-1.72, -0.82, 0.06], [-2.15, -0.3, 0.05]]) {
    rock(mb, [x, H(x, z) + s * 0.2, z], s, [0.5, 0.45, 0.4], 0.7);
  }
}

function buildSeaFloor(mb) {
  rngState = 777;
  // the old wreck: bow half lying on its side, ribs showing
  const W = LAYOUT.wreck;
  const wy = H(W[0], W[1]);
  const WM = m4.chain(m4.T(W[0], wy + 0.04, W[1]), m4.RY(-0.7), m4.RZ(1.25));
  const z0 = 0.02, z1 = SHIP.ze;
  for (const side of [1, -1]) {
    mb.surf(10, 18, (uu, vv) => {
      const z = lerp(z0, z1, vv);
      const d = SHIP.keel(z), s = SHIP.sheer(z);
      const y = lerp(-d, s, uu);
      return { p: [side * SHIP.halfAt(z, y) * 1.15, y * 1.1, z * 1.15] };
    }, {
      M: WM, col: [0.32, 0.25, 0.17], mat: MAT.WOOD, flip: side < 0,
      skip: (i, j) => j < 8 && hash2(i * 3 + (side > 0 ? 0 : 50), j * 7) < (side > 0 ? 0.55 : 0.25),
    });
  }
  for (let k = 0; k < 7; k++) {
    const z = lerp(z0 + 0.01, z1 - 0.12, k / 6);
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const y = lerp(-SHIP.keel(z), SHIP.sheer(z), i / 8);
      pts.push([SHIP.halfAt(z, y) * 1.15 - 0.006, y * 1.1, z * 1.15]);
    }
    for (const side of [1, -1]) for (let i = 0; i < 8; i++) {
      const a = [side * pts[i][0], pts[i][1], pts[i][2]], b = [side * pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]];
      mb.tube(m4.pt(WM, a), m4.pt(WM, b), 0.007, 4, [0.26, 0.2, 0.13], MAT.WOOD);
    }
  }
  // broken mast beside it
  const ma = [W[0] + 0.35, 0, W[1] + 0.3];
  ma[1] = H(ma[0], ma[2]) + 0.02;
  const mbn = [W[0] - 0.15, 0, W[1] + 0.62];
  mbn[1] = H(mbn[0], mbn[2]) + 0.025;
  mb.tube(ma, mbn, 0.017, 9, [0.3, 0.23, 0.15], MAT.WOOD, 0, { r1: 0.8, capCol: [0.62, 0.48, 0.3] });
  mb.tube(v3.lerp(ma, mbn, 0.65), v3.add(v3.lerp(ma, mbn, 0.65), [0.2, 0.06, -0.12]), 0.008, 6, [0.3, 0.23, 0.15], MAT.WOOD);
  // swaying kelp
  const clumps = [[1.75, -0.7], [-1.9, 1.55], [1.95, 1.75], [0.35, 1.95], [-0.35, 0.95], [2.0, 0.3]];
  for (const [cx, cz] of clumps) {
    for (let k = 0; k < 4; k++) {
      const x = cx + rr(-0.12, 0.12), z = cz + rr(-0.12, 0.12), y = H(x, z);
      const h = Math.min(-y - 0.08, rr(0.45, 0.8));
      const tw = rnd() * 6;
      const c = rnd() < 0.5 ? [0.32, 0.46, 0.12] : [0.5, 0.42, 0.11];
      mb.surf(2, 14, (uu, vv) => {
        const s = lerp(-1, 1, uu);
        const a = tw + vv * 5;
        const w = 0.022 * (0.6 + 0.6 * Math.sin(vv * Math.PI)) * (0.85 + 0.15 * Math.sin(vv * 40));
        return { p: [x + Math.cos(a) * w * s + 0.03 * Math.sin(vv * 4 + tw), y + vv * h, z + Math.sin(a) * w * s], uv: [uu, vv] };
      }, { col: c, mat: MAT.KELP, flexFn: (uu, vv) => vv });
    }
  }
  // doubloons on the sea floor
  for (const [x, z] of [[-0.75, 1.2], [-1.15, 1.62], [-0.7, 1.7], [0.6, 1.5], [1.6, 0.2], [-0.2, 2.0], [1.3, 1.9]]) {
    coinGeom(mb, m4.chain(m4.T(x, H(x, z) + 0.004, z), m4.RY(rr(0, 3)), m4.RX(rr(-0.15, 0.15))), 0);
  }
  // seabed rocks and shells
  for (let k = 0; k < 14; k++) {
    const x = rr(-2.4, 2.4), z = rr(0.2, 2.4);
    if (Math.hypot(x - LAYOUT.ship[0], z - LAYOUT.ship[2]) < 0.4) continue;
    rock(mb, [x, H(x, z), z], rr(0.03, 0.07), [0.6, 0.55, 0.48], 0.6);
  }
  for (let k = 0; k < 10; k++) {
    const x = rr(-2.4, 2.4), z = rr(-0.2, 2.4), y = H(x, z);
    if (y > -0.4) continue;
    mb.sphere(m4.chain(m4.T(x, y + 0.004, z), m4.RY(rr(0, 6))), 0.022, 0.009, 0.018, 8, 5, [1.0, 0.75, 0.68], MAT.GUMMY);
  }
  // the anchor
  const A = LAYOUT.anchor;
  const AM = m4.chain(m4.T(A[0], A[1] + 0.012, A[2]), m4.RY(0.9), m4.RZ(1.2));
  mb.cyl(m4.mul(AM, m4.T(0, -0.06, 0)), 0.008, 0.008, 0.16, 8, COL.iron, MAT.METAL);
  mb.surf(12, 6, (uu, vv) => {
    const a = lerp(-1.25, 1.25, uu), b = vv * Math.PI * 2, R = 0.06, r = 0.008;
    const c = [Math.sin(a) * R, -0.06 + R - Math.cos(a) * R, 0];
    const n = [Math.sin(a) * Math.cos(b), -Math.cos(a) * Math.cos(b), Math.sin(b)];
    return { p: [c[0] + n[0] * r, c[1] + n[1] * r, n[2] * r], n };
  }, { M: AM, col: COL.iron, mat: MAT.METAL });
  for (const s of [1, -1]) mb.sphere(m4.mul(AM, m4.T(s * 0.057, -0.03, 0)), 0.018, 0.012, 0.006, 6, 4, COL.iron, MAT.METAL);
  mb.box(m4.mul(AM, m4.T(0, 0.085, 0)), 0.07, 0.008, 0.008, COL.iron, MAT.METAL);
  LAYOUT.anchorRing = m4.pt(AM, [0, 0.105, 0]);
}

function buildTerrain(mb) {
  const N = 168;
  mb.surf(N, N, (uu, vv) => {
    const x = lerp(-HALF, HALF, uu), z = lerp(-HALF, HALF, vv);
    return { p: [x, H(x, z), z], n: Hn(x, z) };
  }, { mat: MAT.TERRAIN, col: [1, 1, 1] });
  // cut faces of the block: candy strata from the floor to the sea bed
  const S = 128;
  const sides = [
    (t) => [HALF, lerp(-HALF, HALF, t), [1, 0, 0]], (t) => [-HALF, lerp(HALF, -HALF, t), [-1, 0, 0]],
  ];
  for (const sx of [1, -1]) {
    mb.surf(S, 1, (uu, vv) => {
      const z = lerp(-HALF, HALF, uu), x = sx * HALF;
      return { p: [x, lerp(YB, H(x, z), vv), z], n: [sx, 0, 0] };
    }, { mat: MAT.STRATA });
  }
  for (const sz of [1, -1]) {
    mb.surf(S, 1, (uu, vv) => {
      const x = lerp(-HALF, HALF, uu), z = sz * HALF;
      return { p: [x, lerp(YB, H(x, z), vv), z], n: [0, 0, sz] };
    }, { mat: MAT.STRATA });
  }
  void sides;
}

function buildPalms(mb) {
  const spots = [
    [-0.95, -1.45, 0.95, [0.05, 0.08]], [-0.45, -1.62, 0.85, [0.12, -0.02]], [-1.3, -1.05, 0.8, [-0.1, 0.06]],
    [-0.08, -1.3, 0.75, [0.16, 0.1]], [-0.78, -1.95, 0.9, [0.02, -0.06]], [-1.5, -0.72, 0.7, [-0.18, 0.12]],
    [0.2, -0.95, 0.66, [0.2, 0.14]], [-0.96, -0.64, 0.74, [0.22, 0.2]], [-1.62, -1.42, 0.78, [-0.12, -0.05]],
  ];
  LAYOUT.palms = [];
  spots.forEach(([x, z, h, lean], k) => {
    const slot = SLOT.PALM0 + k;
    const { top } = buildPalm(mb, slot, h, lean, 500 + k * 77);
    const base = [x, H(x, z) - 0.01, z];
    LAYOUT.palms.push({ slot, base, h, lean, top: v3.add(base, top) });
  });
}

function buildMain() {
  const mb = new MB();
  buildTerrain(mb);
  buildVegetation(mb);
  buildPalms(mb);
  buildCamp(mb);
  buildChest(mb);
  buildBeachProps(mb);
  buildSeaFloor(mb);
  buildShip(mb);
  return mb.build();
}

function buildInstanced() {
  const ball = new MB();
  ball.sphere(m4.id(), 0.032, 0.032, 0.032, 16, 10, [0.1, 0.1, 0.11], MAT.METAL, SLOT.BALL);
  const barrel = new MB();
  barrelGeom(barrel, m4.id(), SLOT.BARREL);
  const coin = new MB();
  coinGeom(coin, m4.id(), SLOT.COIN, 0.028);
  const link = new MB();
  link.surf(12, 6, (uu, vv) => {
    const a = uu * Math.PI * 2, b = vv * Math.PI * 2, R = 0.012, r = 0.0035;
    const c = [Math.cos(a) * R * 0.75, 0, Math.sin(a) * R * 1.35];
    const n = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)];
    return { p: [c[0] + n[0] * r, n[1] * r, c[2] + n[2] * r], n };
  }, { col: [0.16, 0.15, 0.15], mat: MAT.METAL, obj: SLOT.CHAIN });
  // floating crate: plank box with a dark frame
  const crate = new MB();
  const cw = 0.096, cf = 0.014, eh = cw / 2 - cf / 2 + 0.001;
  crate.box(m4.id(), cw, cw, cw, [0.74, 0.52, 0.27], MAT.WOOD, SLOT.CRATE);
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    crate.box(m4.T(a * eh, 0, b * eh), cf, cw + 0.002, cf, [0.42, 0.25, 0.11], MAT.WOOD, SLOT.CRATE);
    crate.box(m4.T(0, a * eh, b * eh), cw + 0.002, cf, cf, [0.42, 0.25, 0.11], MAT.WOOD, SLOT.CRATE);
    crate.box(m4.T(a * eh, b * eh, 0), cf, cf, cw + 0.002, [0.42, 0.25, 0.11], MAT.WOOD, SLOT.CRATE);
  }
  for (const s of [-1, 1]) {
    crate.box(m4.T(0, 0, s * (cw / 2 + 0.002)), cw - 2 * cf, 0.012, 0.004, [0.58, 0.38, 0.18], MAT.WOOD, SLOT.CRATE);
    crate.box(m4.T(s * (cw / 2 + 0.002), 0, 0), 0.004, 0.012, cw - 2 * cf, [0.58, 0.38, 0.18], MAT.WOOD, SLOT.CRATE);
  }
  // candy fruit: glossy blush-to-gold drop with a leaf
  const fruit = new MB();
  fruit.sphere(m4.S(1.4), 0.026, 0.023, 0.023, 14, 10, [1, 1, 1], MAT.GUMMY, SLOT.FRUIT, {
    colFn: (d) => { const t = clamp(d[0] * 0.5 + 0.5 + d[1] * 0.25, 0, 1); return [lerp(1.0, 0.98, t), lerp(0.28, 0.78, t), lerp(0.2, 0.12, t)]; },
  });
  fruit.cyl(m4.chain(m4.S(1.4), m4.T(-0.02, 0.012, 0), m4.RZ(0.9)), 0.0025, 0.002, 0.012, 5, [0.35, 0.22, 0.1], MAT.WOOD, SLOT.FRUIT);
  fruit.surf(4, 2, (uu, vv) => {
    const s = lerp(-1, 1, vv), w = 0.007 * Math.sin(Math.PI * uu);
    return { p: [-0.024 - uu * 0.012, 0.02 + uu * 0.012 - uu * uu * 0.006, s * w], n: [0.3, 1, 0] };
  }, { M: m4.S(1.4), col: [0.25, 0.62, 0.18], mat: MAT.GUMMY, obj: SLOT.FRUIT });
  return { ball: ball.build(), barrel: barrel.build(), coin: coin.build(), link: link.build(), crate: crate.build(), fruit: fruit.build() };
}

function buildFloor() {
  const mb = new MB();
  const R = 40;
  mb.surf(1, 1, (uu, vv) => ({ p: [lerp(-R, R, uu), YB, lerp(-R, R, vv)], n: [0, 1, 0] }), { mat: MAT.FLOOR });
  return mb.build();
}

function buildWaterMesh() {
  const v = [], idx = [];
  const N = GRID, add = (x, z, kind, side) => { v.push(x, z, kind, side); return v.length / 4 - 1; };
  // top surface, counter-clockwise seen from above
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) add(lerp(-HALF, HALF, i / N), lerp(-HALF, HALF, j / N), 0, 0);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // four cut walls, front faces pointing outward
  const wall = (side, pf) => {
    const base = v.length / 4;
    for (let i = 0; i <= N; i++) { const [x, z] = pf(i / N); add(x, z, 1, side); add(x, z, 2, side); }
    for (let i = 0; i < N; i++) {
      const b0 = base + i * 2, t0 = b0 + 1, b1 = b0 + 2, t1 = b0 + 3;
      idx.push(b0, b1, t1, b0, t1, t0);
    }
  };
  wall(1, (t) => [HALF, lerp(HALF, -HALF, t)]);
  wall(2, (t) => [-HALF, lerp(-HALF, HALF, t)]);
  wall(3, (t) => [lerp(-HALF, HALF, t), HALF]);
  wall(4, (t) => [lerp(HALF, -HALF, t), -HALF]);
  return { verts: new Float32Array(v), idx: new Uint32Array(idx), count: idx.length };
}

function buildSkullBox() {
  const lo = [-1.45, -2.3, -1.4], hi = [1.45, 1.45, 1.5];
  const c = [];
  for (let k = 0; k < 8; k++) c.push([k & 1 ? hi[0] : lo[0], k & 2 ? hi[1] : lo[1], k & 4 ? hi[2] : lo[2]]);
  const faces = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const v = [], idx = [];
  c.forEach((p) => v.push(...p));
  for (const f of faces) idx.push(f[0], f[1], f[2], f[0], f[2], f[3]);
  return { verts: new Float32Array(v), idx: new Uint32Array(idx), count: idx.length };
}
