// ─────────────────────────────────────────────────────────────────────────────
//  WGSL — one module, many entry points. Layout constants are injected from JS.
// ─────────────────────────────────────────────────────────────────────────────
function makeWGSL(L) {
  const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
  return /* wgsl */ `
struct U {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  lightViewProj: mat4x4f,
  blockMat: mat4x4f,
  invBlockMat: mat4x4f,
  camPos: vec4f,   // w: time
  sunDir: vec4f,   // xyz: toward key light (world), w: intensity
  sunCol: vec4f,   // w: night 0..1
  ambTop: vec4f,   // w: fire intensity
  ambBot: vec4f,   // w: exposure
  firePos: vec4f,  // block-local, w: flicker
  bgTop: vec4f,    // w: stars
  bgBot: vec4f,    // w: sun/moon disc mix (0 sun, 1 moon)
  wobble: vec4f,   // shearX, shearZ, squash, yBottom
  absorb: vec4f,
  scatter: vec4f,
  surfCol: vec4f,  // w: chest open 0..1
  res: vec4f,      // w, h, 1/w, 1/h
  misc: vec4f,     // gridN, half, dx, reducedMotion
  wind: vec4f,     // dir.x, dir.z, strength, unused
  proj: vec4f,     // p00, p11, near, far
  beamPos: vec4f,  // lighthouse lamp (world), w: intensity
  beamDir: vec4f,  // beam direction (world)
};
struct Obj { m: mat4x4f, bend: vec4f };

@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> objs: array<Obj>;
@group(0) @binding(2) var shadowMap: texture_depth_2d;
@group(0) @binding(3) var shadowSamp: sampler_comparison;
@group(0) @binding(4) var etaTex: texture_2d<f32>;
@group(0) @binding(5) var terrTex: texture_2d<f32>;
@group(0) @binding(6) var linSamp: sampler;

@group(1) @binding(0) var sceneTex: texture_2d<f32>;
@group(1) @binding(1) var sceneDepth: texture_depth_2d;

const PI = 3.14159265;
const M_DEFAULT: u32 = 0u;
const M_FLOOR: u32 = 1u;
const M_TERRAIN: u32 = 2u;
const M_STRATA: u32 = 3u;
const M_GUMMY: u32 = 4u;
const M_FROND: u32 = 5u;
const M_TRUNK: u32 = 6u;
const M_SAIL: u32 = 7u;
const M_FLAG: u32 = 8u;
const M_WINDOW: u32 = 9u;
const M_LANTERN: u32 = 10u;
const M_EMBER: u32 = 11u;
const M_METAL: u32 = 12u;
const M_GOLD: u32 = 13u;
const M_GEM: u32 = 14u;
const M_WOOD: u32 = 15u;
const M_ROCK: u32 = 16u;
const M_KELP: u32 = 18u;
const M_GLASS: u32 = 19u;
const M_HULL: u32 = 20u;
const M_GRASS: u32 = 21u;
const M_ROPE: u32 = 22u;
const M_COAL: u32 = 23u;
const M_FALL: u32 = 24u;
const M_FISH: u32 = 25u;

const X_POS = vec2f(${f(L.xMark[0])}, ${f(L.xMark[1])});
const SKULL_C = vec3f(${f(L.skull.c[0])}, ${f(L.skull.c[1])}, ${f(L.skull.c[2])});
const SKULL_S = ${f(L.skull.s)};
const SKULL_YAW = ${f(L.skull.yaw)};
const FIRE_COL = vec3f(1.0, 0.52, 0.2);

// ── noise ────────────────────────────────────────────────────────────────────
fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}
fn hash31(p: vec3f) -> f32 {
  var q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.x + q.y) * q.z);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(i); let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0)); let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
fn vnoise3(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let n000 = hash31(i);
  let n100 = hash31(i + vec3f(1.0, 0.0, 0.0));
  let n010 = hash31(i + vec3f(0.0, 1.0, 0.0));
  let n110 = hash31(i + vec3f(1.0, 1.0, 0.0));
  let n001 = hash31(i + vec3f(0.0, 0.0, 1.0));
  let n101 = hash31(i + vec3f(1.0, 0.0, 1.0));
  let n011 = hash31(i + vec3f(0.0, 1.0, 1.0));
  let n111 = hash31(i + vec3f(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, w.x), mix(n010, n110, w.x), w.y),
             mix(mix(n001, n101, w.x), mix(n011, n111, w.x), w.y), w.z);
}
fn fbm2(p: vec2f) -> f32 {
  var s = 0.0; var a = 0.5; var q = p;
  for (var i = 0; i < 4; i++) { s += a * vnoise(q); q = q * 2.03 + vec2f(1.7, 9.2); a *= 0.5; }
  return s;
}

// ── grids (water elevation + terrain), manual bilinear ──────────────────────
fn gridSample(which: i32, xz: vec2f) -> f32 {
  let N = u.misc.x; let half = u.misc.y;
  let g = (xz + vec2f(half)) / (2.0 * half) * N - 0.5;
  let gc = clamp(g, vec2f(0.0), vec2f(N - 1.001));
  let i = vec2i(floor(gc)); let fr = gc - floor(gc);
  var a: f32; var b: f32; var c: f32; var d: f32;
  if (which == 0) {
    a = textureLoad(etaTex, i, 0).r; b = textureLoad(etaTex, i + vec2i(1, 0), 0).r;
    c = textureLoad(etaTex, i + vec2i(0, 1), 0).r; d = textureLoad(etaTex, i + vec2i(1, 1), 0).r;
  } else {
    a = textureLoad(terrTex, i, 0).r; b = textureLoad(terrTex, i + vec2i(1, 0), 0).r;
    c = textureLoad(terrTex, i + vec2i(0, 1), 0).r; d = textureLoad(terrTex, i + vec2i(1, 1), 0).r;
  }
  return mix(mix(a, b, fr.x), mix(c, d, fr.x), fr.y);
}
fn etaAt(xz: vec2f) -> f32 { return gridSample(0, xz); }
fn terrAt(xz: vec2f) -> f32 { return gridSample(1, xz); }
fn inBlock(p: vec3f) -> bool { return abs(p.x) < u.misc.y && abs(p.z) < u.misc.y; }

// ── block transform: jelly wobble (shear + squash) then tip ─────────────────
fn wobblePos(p: vec3f) -> vec3f {
  let h = p.y - u.wobble.w;
  var q = p;
  q.x = q.x * (1.0 - u.wobble.z * 0.5) + u.wobble.x * h;
  q.z = q.z * (1.0 - u.wobble.z * 0.5) + u.wobble.y * h;
  q.y = u.wobble.w + h * (1.0 + u.wobble.z);
  return q;
}
fn toWorld(p: vec3f) -> vec3f { return (u.blockMat * vec4f(p, 1.0)).xyz; }
fn toWorldN(n: vec3f) -> vec3f { return normalize((u.blockMat * vec4f(n, 0.0)).xyz); }
fn toLocal(p: vec3f) -> vec3f { return (u.invBlockMat * vec4f(p, 1.0)).xyz; }
fn toLocalN(n: vec3f) -> vec3f { return normalize((u.invBlockMat * vec4f(n, 0.0)).xyz); }

// ── caustics (iterated warp) ─────────────────────────────────────────────────
fn caustic(p: vec2f, t: f32) -> f32 {
  let TAU = 6.2831853;
  let q = (p * TAU * 0.55) % vec2f(TAU) - vec2f(250.0);
  var ip = q; var c = 1.0; let inten = 0.006;
  for (var n = 0; n < 4; n++) {
    let tt = t * 0.55 * (1.0 - (3.5 / f32(n + 1)));
    ip = q + vec2f(cos(tt - ip.x) + sin(tt + ip.y), sin(tt - ip.y) + cos(tt + ip.x));
    c += 1.0 / length(vec2f(q.x / (sin(ip.x + tt) / inten), q.y / (cos(ip.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 7.0), 0.0, 3.0);
}

// ── backdrop (paper studio sweep + sky lights) ──────────────────────────────
fn backdropColor(dir: vec3f) -> vec3f {
  let y = dir.y;
  var c = mix(u.bgBot.rgb, u.bgTop.rgb, smoothstep(-0.05, 0.75, y));
  let L = normalize(u.sunDir.xyz);
  let d = max(dot(dir, L), 0.0);
  let night = u.sunCol.w;
  // sun glow / moon halo
  c += u.sunCol.rgb * (pow(d, 18.0) * 0.28 * (1.0 - night) + pow(d, 60.0) * 0.12 * night);
  let disc = smoothstep(0.9993, 0.99965, d);
  c = mix(c, mix(vec3f(1.25, 1.12, 0.95) * 1.4, vec3f(0.92, 0.94, 1.05), u.bgBot.w), disc * select(0.0, 1.0, L.y > -0.02));
  // stars
  if (u.bgTop.w > 0.01 && y > 0.02) {
    let sp = vec2f(atan2(dir.z, dir.x) * 70.0, asin(clamp(y, -1.0, 1.0)) * 70.0);
    let cell = floor(sp); let fp = fract(sp) - 0.5;
    let h = hash21(cell);
    if (h > 0.93) {
      let o = vec2f(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
      let s = smoothstep(0.12, 0.0, length(fp - o * 0.6));
      let tw = 0.65 + 0.35 * sin(u.camPos.w * (2.0 + h * 5.0) + h * 40.0);
      c += vec3f(0.9, 0.93, 1.0) * s * tw * u.bgTop.w * smoothstep(0.02, 0.25, y) * (h - 0.93) * 18.0;
    }
  }
  return c;
}

// studio sweep seen behind the diorama: screen-space gradient + light pool + stars
fn studio(uv: vec2f) -> vec3f {
  var c = mix(u.bgTop.rgb, u.bgBot.rgb, smoothstep(0.0, 0.85, uv.y));
  let asp = u.res.x * u.res.w;
  let L = normalize(u.sunDir.xyz);
  let lc = u.viewProj * vec4f(u.camPos.xyz + L * 60.0, 1.0);
  let night = u.sunCol.w;
  if (lc.w > 0.0) {
    let suv = vec2f(lc.x / lc.w * 0.5 + 0.5, 0.5 - lc.y / lc.w * 0.5);
    let d = length((uv - suv) * vec2f(asp, 1.0));
    c += u.sunCol.rgb * (exp(-d * 3.2) * 0.22 * (1.0 - night) + exp(-d * 9.0) * 0.1 * night);
    let disc = smoothstep(0.03, 0.026, d) * smoothstep(-0.05, 0.08, L.y);
    let moonCol = vec3f(0.95, 0.96, 1.05) * (0.9 + 0.1 * vnoise((uv - suv) * 90.0));
    c = mix(c, mix(vec3f(1.3, 1.15, 0.95), moonCol, u.bgBot.w), disc * mix(0.35, 1.0, night));
  }
  // light pool
  let v = length((uv - vec2f(0.46, 0.48)) * vec2f(asp * 0.7, 1.0));
  c *= 1.05 - 0.14 * smoothstep(0.15, 0.95, v);
  if (u.bgTop.w > 0.01) {
    let sp = uv * vec2f(asp, 1.0) * 95.0;
    let cell = floor(sp); let fp = fract(sp) - 0.5;
    let h = hash21(cell);
    if (h > 0.955) {
      let o = vec2f(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
      let st = smoothstep(0.16, 0.0, length(fp - o * 0.6));
      let tw = 0.6 + 0.4 * sin(u.camPos.w * (1.5 + h * 4.0) + h * 40.0);
      c += vec3f(0.9, 0.93, 1.0) * st * tw * u.bgTop.w * (1.0 - smoothstep(0.25, 0.7, uv.y)) * (h - 0.955) * 30.0;
    }
  }
  return c;
}

// ── shadows ─────────────────────────────────────────────────────────────────
fn shadowAt(w: vec3f, n: vec3f) -> f32 {
  let wp = w + n * 0.02;
  let c = u.lightViewProj * vec4f(wp, 1.0);
  let nd = c.xyz / c.w;
  let uv = vec2f(nd.x * 0.5 + 0.5, 0.5 - nd.y * 0.5);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || nd.z > 1.0) { return 1.0; }
  let tx = 1.0 / 3072.0;
  var s = 0.0;
  for (var i = -1; i <= 1; i++) {
    for (var j = -1; j <= 1; j++) {
      s += textureSampleCompareLevel(shadowMap, shadowSamp, uv + vec2f(f32(i), f32(j)) * tx * 1.25, nd.z - 0.0012);
    }
  }
  return s / 9.0;
}

fn fireWorld() -> vec3f { return toWorld(u.firePos.xyz + vec3f(0.0, 0.09, 0.0)); }
fn fireStrength() -> f32 { return u.ambTop.w * u.firePos.w; }

// main lighting model shared by meshes and the skull
fn shade(w: vec3f, lp: vec3f, n: vec3f, alb: vec3f, rough: f32, spec: f32, trans: f32, emis: vec3f, aoIn: f32) -> vec3f {
  let V = normalize(u.camPos.xyz - w);
  let L = normalize(u.sunDir.xyz);
  let ndl = dot(n, L);
  let sh = shadowAt(w, n);
  let key = u.sunCol.rgb * u.sunDir.w;
  var col = alb * key * max(ndl, 0.0) * sh;
  col += alb * key * trans * max(-ndl, 0.0) * (0.35 + 0.65 * sh) * 0.85;
  let hemi = mix(u.ambBot.rgb, u.ambTop.rgb, n.y * 0.5 + 0.5);
  col += alb * hemi * aoIn;
  let H = normalize(L + V);
  let shin = mix(6.0, 180.0, 1.0 - rough);
  col += key * pow(max(dot(n, H), 0.0), shin) * spec * sh * (shin + 8.0) / 60.0;
  // rim for glossy candy
  let fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  col += hemi * fres * spec * 0.22 * aoIn;
  // campfire point light
  let fd = fireWorld() - w;
  let d2 = dot(fd, fd);
  let Lf = fd * inverseSqrt(max(d2, 1e-5));
  let fi = fireStrength() / (1.0 + d2 * 7.0);
  col += alb * FIRE_COL * fi * (max(dot(n, Lf), 0.0) + trans * max(-dot(n, Lf), 0.0) * 0.8 + 0.08);
  col += FIRE_COL * fi * pow(max(dot(n, normalize(Lf + V)), 0.0), shin * 0.5) * spec * 0.8;
  // lighthouse beam (spot light, night only)
  if (u.beamPos.w > 0.001) {
    let bd = w - u.beamPos.xyz; let bl = max(length(bd), 1e-4); let bn = bd / bl;
    let cone = smoothstep(0.972, 0.994, dot(bn, u.beamDir.xyz));
    if (cone > 0.0) {
      let att = u.beamPos.w * cone / (1.0 + bl * bl * 0.35);
      col += alb * vec3f(1.0, 0.9, 0.7) * att * (max(dot(n, -bn), 0.0) + trans * 0.5 + 0.15);
    }
  }
  // caustics underwater
  if (inBlock(lp)) {
    let eta = etaAt(lp.xz);
    let dep = eta - lp.y;
    if (dep > 0.0) {
      let Ll = toLocalN(L);
      let off = Ll.xz / max(Ll.y, 0.25) * dep;
      let c = caustic(lp.xz * 0.9 + off * 0.9, u.camPos.w) + 0.5 * caustic(lp.xz * 1.7 - off, u.camPos.w * 1.3 + 3.0);
      col += alb * key * c * 0.55 * exp(-dep * 1.2) * max(n.y, 0.15) * (0.4 + 0.6 * sh) * smoothstep(0.0, 0.04, dep);
    }
  }
  return col + emis;
}

// ── mesh vertex path ────────────────────────────────────────────────────────
struct VIn {
  @location(0) pos: vec3f,
  @location(1) nrm: vec3f,
  @location(2) col: vec3f,
  @location(3) uv: vec2f,
  @location(4) ex: vec3f, // material, object slot, flex
};
struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) wpos: vec3f,
  @location(1) lpos: vec3f,
  @location(2) nrm: vec3f,
  @location(3) col: vec3f,
  @location(4) uv: vec2f,
  @location(5) @interpolate(flat) mat: u32,
  @location(6) misc: vec2f,
};
struct DV { p: vec3f, n: vec3f, mat: u32, tint: vec3f };

fn deformVertex(inp: VIn, inst: u32) -> DV {
  let oi = u32(inp.ex.y + 0.5) + inst;
  let o = objs[oi];
  let fl = inp.ex.z;
  let mat = u32(inp.ex.x + 0.5);
  let t = u.camPos.w;
  let rm = 1.0 - u.misc.w * 0.7;
  var lp0 = inp.pos;
  var tint = vec3f(1.0);
  var b = vec2f(o.bend.x, o.bend.z);
  if (mat == M_FISH) {
    // tail wiggle in fish space; bend carries the school colour, w the swim speed
    lp0.x += sin(t * (10.0 + o.bend.w * 14.0) + f32(oi) * 1.7) * 0.022 * fl * fl * rm;
    tint = o.bend.xyz;
    b = vec2f(0.0);
  }
  var p = (o.m * vec4f(lp0, 1.0)).xyz;
  var n = (o.m * vec4f(inp.nrm, 0.0)).xyz;
  let nl = length(n);
  n = select(vec3f(0.0, 1.0, 0.0), n / nl, nl > 1e-6);
  // palm bend (per-object), keeps arc length roughly
  p += vec3f(b.x, 0.0, b.y) * fl * fl;
  p.y -= dot(b, b) * fl * fl * 0.55;
  let seed = o.m[3].x * 7.0 + o.m[3].z * 13.0;
  if (mat == M_FROND) {
    let a = inp.uv.x;
    let ph = t * 4.6 + seed + inp.pos.x * 9.0 + inp.pos.z * 7.0;
    p.y += sin(ph) * 0.016 * a * a * rm;
    p.x += cos(ph * 0.8) * 0.009 * a * rm + u.wind.x * u.wind.z * 0.03 * a * a;
    p.z += sin(ph * 1.1) * 0.009 * a * rm + u.wind.y * u.wind.z * 0.03 * a * a;
  } else if (mat == M_GRASS) {
    let ph = t * 2.2 + p.x * 6.0 + p.z * 5.0;
    p.x += (sin(ph) * 0.012 * rm + u.wind.x * 0.01) * fl;
    p.z += (cos(ph * 0.9) * 0.012 * rm + u.wind.y * 0.01) * fl;
  } else if (mat == M_KELP) {
    let ph = t * 1.05 + inp.pos.y * 2.6 + seed;
    p.x += sin(ph + p.z * 3.0) * 0.07 * fl * rm;
    p.z += cos(ph * 0.8 + p.x * 3.0) * 0.05 * fl * rm;
  } else if (mat == M_SAIL) {
    p += n * sin(t * 2.4 + inp.uv.x * 5.0 + inp.uv.y * 3.0) * 0.007 * rm * fl;
  } else if (mat == M_FLAG) {
    let a = inp.uv.x;
    p += n * (sin(t * 8.0 - a * 9.0) * 0.024 + sin(t * 13.0 - a * 16.0) * 0.007) * a * rm;
  }
  if (mat != M_FLOOR) { p = wobblePos(p); }
  return DV(p, n, mat, tint);
}

@vertex fn vsMesh(inp: VIn, @builtin(instance_index) inst: u32) -> VOut {
  let d = deformVertex(inp, inst);
  var w = d.p; var n = d.n;
  if (d.mat != M_FLOOR) { w = toWorld(d.p); n = toWorldN(d.n); }
  var o: VOut;
  o.clip = u.viewProj * vec4f(w, 1.0);
  o.wpos = w; o.lpos = d.p; o.nrm = n; o.col = inp.col * d.tint; o.uv = inp.uv; o.mat = d.mat;
  o.misc = vec2f(inp.ex.z, f32(u32(inp.ex.y + 0.5) + inst));
  return o;
}

@vertex fn vsShadow(inp: VIn, @builtin(instance_index) inst: u32) -> @builtin(position) vec4f {
  let d = deformVertex(inp, inst);
  return u.lightViewProj * vec4f(toWorld(d.p), 1.0);
}

// ── materials ───────────────────────────────────────────────────────────────
fn terrainColor(p: vec3f, n: vec3f) -> vec3f {
  let h = p.y;
  let nz = vnoise(p.xz * 16.0);
  let nz2 = fbm2(p.xz * 3.0);
  let seabed = vec3f(0.74, 0.67, 0.52);
  let wet = vec3f(0.66, 0.53, 0.37);
  let sand = vec3f(0.88, 0.76, 0.55);
  let moss = mix(vec3f(0.36, 0.56, 0.17), vec3f(0.2, 0.42, 0.13), nz);
  let rock = vec3f(0.5, 0.43, 0.37);
  var c = seabed * (0.9 + 0.14 * nz);
  c *= 0.94 + 0.06 * sin(p.x * 26.0 + p.z * 9.0 + nz2 * 8.0);
  c = mix(c, wet * (0.92 + 0.1 * nz), smoothstep(-0.14, -0.015, h));
  c = mix(c, sand * (0.94 + 0.08 * nz), smoothstep(0.005, 0.045, h));
  let mossMask = smoothstep(0.16, 0.26, h + (nz2 - 0.5) * 0.16) * smoothstep(0.3, 0.55, n.y);
  c = mix(c, moss * (0.85 + 0.25 * vnoise(p.xz * 40.0)), mossMask);
  let band = 0.5 + 0.5 * sin(h * 58.0 + nz2 * 5.0);
  let rockC = mix(vec3f(0.56, 0.47, 0.38), vec3f(0.42, 0.35, 0.3), band) * (0.85 + 0.3 * nz);
  c = mix(c, rockC, smoothstep(0.62, 0.38, n.y) * smoothstep(0.06, 0.18, h));
  // wet dark streak on the cliff under the waterfall
  let wetFall = exp(-pow((p.z - ${f(L.cliff[1])}) / 0.07, 2.0)) * smoothstep(${f(L.cliff[0] - 0.02)}, ${f(L.cliff[0] + 0.05)}, p.x) * smoothstep(0.5, 0.2, n.y);
  c *= 1.0 - 0.35 * wetFall;
  // the X scored in the sand
  let q = p.xz - X_POS;
  let r = vec2f(q.x * 0.7071 - q.y * 0.7071, q.x * 0.7071 + q.y * 0.7071);
  let arm = min(max(abs(r.x) - 0.012, abs(r.y) - 0.085), max(abs(r.y) - 0.012, abs(r.x) - 0.085));
  let groove = 1.0 - smoothstep(0.0, 0.008, arm);
  c = mix(c, vec3f(0.55, 0.36, 0.2), groove * 0.85);
  return c;
}

fn strataColor(p: vec3f) -> vec3f {
  let wv = 0.035 * sin((p.x + p.z) * 2.3) + 0.02 * sin((p.x - p.z) * 5.1) + (vnoise(p.xz * 6.0 + vec2f(p.y * 3.0)) - 0.5) * 0.03;
  let y = p.y + wv;
  let fine = 0.92 + 0.08 * sin(y * 140.0 + vnoise(p.xz * 20.0) * 4.0);
  var c = vec3f(0.24, 0.13, 0.08) * (0.9 + 0.2 * vnoise(p.xz * 30.0 + vec2f(p.y * 30.0)));     // chocolate bedrock
  c = mix(c, vec3f(0.74, 0.43, 0.17) * fine, smoothstep(-1.31, -1.29, y));                     // caramel clay
  let shellBand = smoothstep(-1.13, -1.115, y) * (1.0 - smoothstep(-1.055, -1.04, y));
  let fleck = step(0.72, vnoise(vec2f(p.x + p.z, p.y) * 42.0));
  let shell = mix(vec3f(0.94, 0.89, 0.8), vec3f(0.98, 0.72, 0.68), fleck);
  c = mix(c, shell * (0.9 + 0.1 * vnoise(vec2f(p.x + p.z, p.y) * 80.0)), shellBand);
  c = mix(c, vec3f(0.96, 0.86, 0.6) * (0.95 + 0.05 * fine), smoothstep(-1.045, -1.03, y));    // vanilla sand
  return c;
}

fn sdSeg(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a; let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
// Jolly Roger: skull + crossed bones drawn as 2D SDF
fn jollyRoger(uv: vec2f) -> vec3f {
  let p = (uv - vec2f(0.5, 0.5)) * vec2f(1.6, 1.0);
  var d = 1e9;
  let skull = length((p - vec2f(0.0, 0.08)) * vec2f(1.0, 1.08)) - 0.2;
  let jaw = max(abs(p.x) - 0.11, abs(p.y + 0.12) - 0.07) - 0.02;
  d = min(skull, jaw);
  let eyeL = length(p - vec2f(-0.075, 0.06)) - 0.055;
  let eyeR = length(p - vec2f(0.075, 0.06)) - 0.055;
  let nose = max(length(p - vec2f(0.0, -0.035)) - 0.03, -(p.y + 0.06));
  let teeth = max(abs(fract((p.x + 0.11) / 0.055) - 0.5) - 0.38, abs(p.y + 0.15) - 0.03);
  var face = max(d, -min(min(eyeL, eyeR), nose));
  face = max(face, -max(teeth, abs(p.x) - 0.1));
  let b1 = sdSeg(p, vec2f(-0.36, -0.3), vec2f(0.36, 0.06)) - 0.03;
  let b2 = sdSeg(p, vec2f(-0.36, 0.06), vec2f(0.36, -0.3)) - 0.03;
  var knobs = 1e9;
  knobs = min(knobs, length(p - vec2f(-0.38, -0.27)) - 0.035);
  knobs = min(knobs, length(p - vec2f(-0.35, -0.335)) - 0.035);
  knobs = min(knobs, length(p - vec2f(0.38, -0.27)) - 0.035);
  knobs = min(knobs, length(p - vec2f(0.35, -0.335)) - 0.035);
  knobs = min(knobs, length(p - vec2f(-0.38, 0.03)) - 0.035);
  knobs = min(knobs, length(p - vec2f(-0.35, 0.095)) - 0.035);
  knobs = min(knobs, length(p - vec2f(0.38, 0.03)) - 0.035);
  knobs = min(knobs, length(p - vec2f(0.35, 0.095)) - 0.035);
  let bones = max(min(min(b1, b2), knobs), -(skull - 0.02));
  let mark = min(face, bones);
  let white = 1.0 - smoothstep(0.0, 0.012, mark);
  let cloth = vec3f(0.035, 0.033, 0.04) * (0.85 + 0.15 * vnoise(uv * vec2f(40.0, 6.0)));
  return mix(cloth, vec3f(0.92, 0.9, 0.84), white);
}

fn floorShade(w: vec3f, suv: vec2f) -> vec3f {
  let fib = 0.965 + 0.035 * fbm2(w.xz * 9.0) + 0.012 * sin(w.x * 140.0 + vnoise(w.xz * 3.0) * 30.0);
  let paper = vec3f(0.93, 0.905, 0.87) * fib;
  let L = normalize(u.sunDir.xyz);
  let key = u.sunCol.rgb * u.sunDir.w;
  // analytic jelly block shadow: march toward the light through the block
  let lp = toLocal(w);
  let Ll = toLocalN(L);
  let half = u.misc.y;
  let lo = vec3f(-half, u.wobble.w, -half);
  let hi = vec3f(half, 0.04, half);
  let inv = 1.0 / Ll;
  let t0 = (lo - lp) * inv; let t1 = (hi - lp) * inv;
  let tmn = min(t0, t1); let tmx = max(t0, t1);
  let tin = max(max(tmn.x, tmn.y), max(tmn.z, 0.0));
  let tout = min(min(tmx.x, tmx.y), tmx.z);
  var light = vec3f(1.0);
  if (tout > tin && L.y > 0.0) {
    var blocked = 0.0;
    for (var i = 0; i < 6; i++) {
      let s = mix(tin, tout, (f32(i) + 0.5) / 6.0);
      let q = lp + Ll * s;
      blocked = max(blocked, smoothstep(0.0, 0.04, terrAt(q.xz) - q.y));
    }
    let seg = tout - tin;
    let tint = exp(-u.absorb.rgb * seg * 0.45);
    let ex = lp + Ll * tout;
    let c = caustic(ex.xz * 0.7, u.camPos.w) * 0.9 + 0.35;
    light = mix(tint * c, vec3f(0.0), blocked) * 0.92;
  }
  // soft contact shadow around the block foot
  let dq = max(abs(lp.xz) - vec2f(half), vec2f(0.0));
  let dEdge = length(dq);
  let ao = 1.0 - 0.38 * exp(-dEdge * 7.0);
  let hemi = mix(u.ambBot.rgb, u.ambTop.rgb, 0.85);
  var col = paper * (key * max(L.y, 0.0) * light + hemi * ao);
  // campfire spill on the paper
  let fd = fireWorld() - w;
  col += paper * FIRE_COL * fireStrength() * 0.4 / (1.0 + dot(fd, fd) * 2.0) * ao;
  // melt into the backdrop
  let dist = length(w.xz);
  return mix(col, studio(suv), smoothstep(7.0, 22.0, dist));
}

@fragment fn fsMesh(i: VOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var n = normalize(i.nrm);
  // thin two-sided things face the viewer; closed meshes keep their authored normals
  let twoSided = i.mat == M_SAIL || i.mat == M_FLAG || i.mat == M_FROND || i.mat == M_GRASS || i.mat == M_KELP || i.mat == M_FALL;
  if (twoSided && dot(n, u.camPos.xyz - i.wpos) < 0.0) { n = -n; }
  if (!twoSided && !ff && i.mat == M_WOOD) { n = -n; }
  if (i.mat == M_FLOOR) { return vec4f(floorShade(i.wpos, i.clip.xy * u.res.zw), 1.0); }
  var alb = i.col; var rough = 0.8; var spec = 0.06; var trans = 0.0; var emis = vec3f(0.0); var ao = 1.0;
  let t = u.camPos.w; let night = u.sunCol.w;
  let flick = u.firePos.w;
  switch i.mat {
    case M_TERRAIN: { alb = terrainColor(i.lpos, toLocalN(n)); spec = 0.04; }
    case M_STRATA: { alb = strataColor(i.lpos); spec = 0.25; rough = 0.35; }
    case M_GUMMY: { spec = 0.55; rough = 0.14; trans = 0.55; alb *= 0.9 + 0.14 * vnoise(i.lpos.xz * 30.0); }
    case M_FROND: {
      trans = 1.0; spec = 0.25; rough = 0.3;
      let rib = smoothstep(0.08, 0.0, abs(i.uv.y - 0.5));
      alb *= (0.78 + 0.32 * i.uv.x) * (1.0 + rib * 0.35);
    }
    case M_GRASS: { trans = 0.7; spec = 0.1; alb *= 0.7 + 0.4 * i.uv.y; }
    case M_TRUNK: { spec = 0.45; rough = 0.3; trans = 0.25; }
    case M_SAIL: {
      trans = 0.8; spec = 0.05;
      let seam = smoothstep(0.035, 0.0, abs(fract(i.uv.x * 6.0) - 0.5) - 0.465);
      alb *= (0.94 + 0.06 * vnoise(i.uv * vec2f(60.0, 8.0))) * (1.0 - seam * 0.12);
    }
    case M_FLAG: { alb = jollyRoger(i.uv); trans = 0.3; spec = 0.08; }
    case M_WINDOW: {
      let g = 0.35 + 2.6 * night;
      emis = vec3f(1.0, 0.6, 0.24) * g * (0.92 + 0.08 * sin(t * 6.0 + i.lpos.x * 30.0));
      alb = vec3f(0.15, 0.1, 0.05); spec = 0.9; rough = 0.05;
    }
    case M_LANTERN: { emis = vec3f(1.0, 0.68, 0.3) * (0.7 + 4.5 * night) * (0.9 + 0.1 * sin(t * 9.0)); alb = vec3f(0.2); }
    case M_EMBER: {
      let e = clamp(i.misc.x, 0.0, 1.0);
      let hot = vec3f(1.6, 0.5, 0.12) * (0.6 + 0.4 * flick) * (0.5 + fireStrength() * 0.9);
      emis = hot * e * (0.7 + 0.3 * vnoise(i.lpos.xz * 80.0 + vec2f(t * 3.0)));
      alb = mix(i.col, vec3f(0.08, 0.06, 0.05), e);
    }
    case M_COAL: {
      emis = vec3f(1.4, 0.38, 0.08) * (0.4 + 0.6 * vnoise(i.lpos.xz * 60.0 + vec2f(t * 2.0))) * (0.5 + fireStrength());
      alb = vec3f(0.08, 0.05, 0.04);
    }
    case M_METAL: { spec = 0.9; rough = 0.22; }
    case M_GOLD: {
      spec = 1.6; rough = 0.12;
      let sp = vnoise(i.lpos.xz * 90.0 + vec2f(i.lpos.y * 70.0, t * 2.5));
      emis = vec3f(1.0, 0.8, 0.35) * smoothstep(0.86, 0.98, sp) * (0.4 + 1.6 * u.surfCol.w) * (0.6 + night);
    }
    case M_GEM: { spec = 1.8; rough = 0.04; trans = 0.7; emis = alb * 0.08 * (1.0 + 3.0 * u.surfCol.w * night); }
    case M_WOOD: {
      spec = 0.08; rough = 0.7;
      alb *= 0.85 + 0.2 * vnoise(vec2f(dot(i.lpos, vec3f(1.0, 0.3, 0.7)) * 90.0, i.lpos.y * 8.0));
    }
    case M_ROCK: { spec = 0.12; rough = 0.5; alb *= 0.78 + 0.35 * vnoise3(i.lpos * 14.0); }
    case M_KELP: { trans = 0.7; spec = 0.3; rough = 0.3; }
    case M_GLASS: { spec = 1.6; rough = 0.05; trans = 0.8; emis = alb * fireStrength() * 0.05; }
    case M_HULL: {
      let y = i.uv.x;
      var hc = vec3f(0.045, 0.042, 0.04);
      hc = mix(hc, vec3f(0.72, 0.5, 0.16), step(0.012, y) * (1.0 - step(0.054, y)));
      hc = mix(hc, vec3f(0.56, 0.13, 0.08), 1.0 - step(-0.034, y));
      alb = hc * (0.92 + 0.12 * vnoise(vec2f(i.uv.y * 160.0, y * 30.0)));
      spec = 0.45; rough = 0.28;
    }
    case M_ROPE: { spec = 0.02; }
    case M_FISH: { spec = 0.9; rough = 0.12; trans = 0.8; emis = alb * (0.22 + 0.25 * night); }
    case M_FALL: {
      let fv = i.uv.y; let fu = i.uv.x;
      let st = vnoise(vec2f(fu * 16.0, fv * 7.0 - t * 2.6)) * 0.6 + vnoise(vec2f(fu * 38.0, fv * 18.0 - t * 4.4)) * 0.4;
      let tint = u.scatter.rgb * 1.5 + vec3f(0.18);
      alb = mix(tint, vec3f(0.96, 0.98, 1.0), smoothstep(0.42, 0.78, st));
      alb = mix(alb, vec3f(1.0), smoothstep(0.86, 1.0, fv) + smoothstep(0.82, 1.0, abs(fu * 2.0 - 1.0)) * 0.6);
      spec = 1.1; rough = 0.08; trans = 0.7;
      emis = alb * (0.1 + 0.15 * night);
    }
    default: {}
  }
  let lp = i.lpos;
  let c = shade(i.wpos, lp, n, alb, rough, spec, trans, emis, ao);
  return vec4f(c, 1.0);
}

// ── backdrop + fullscreen helpers ───────────────────────────────────────────
struct FOut { @builtin(position) clip: vec4f, @location(0) uv: vec2f };
@vertex fn vsFull(@builtin(vertex_index) vi: u32) -> FOut {
  var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: FOut;
  let p = pos[vi];
  o.clip = vec4f(p, 0.0, 1.0);
  o.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return o;
}
fn worldFromScreen(uv: vec2f, d: f32) -> vec3f {
  let ndc = vec4f(uv.x * 2.0 - 1.0, (1.0 - uv.y) * 2.0 - 1.0, d, 1.0);
  let p = u.invViewProj * ndc;
  return p.xyz / p.w;
}
@fragment fn fsBackdrop(i: FOut) -> @location(0) vec4f {
  return vec4f(studio(i.uv), 1.0);
}

// ── Skull Rock: ray-marched SDF inside a proxy box ──────────────────────────
fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
fn smax(a: f32, b: f32, k: f32) -> f32 { return -smin(-a, -b, k); }
fn sdEll(p: vec3f, r: vec3f) -> f32 {
  let k0 = length(p / r); let k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-5);
}
fn sdRBox(p: vec3f, b: vec3f, r: f32) -> f32 {
  let q = abs(p) - b + vec3f(r);
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

fn mouthSpace(p: vec3f) -> vec3f {
  var mp = p - vec3f(0.0, -0.6, 0.78);
  mp.y -= 0.42 * mp.x * mp.x;
  mp.z += 0.55 * mp.x * mp.x;
  return mp;
}

fn skullMap(p: vec3f) -> vec2f {
  let px = vec3f(abs(p.x), p.y, p.z);
  var d = sdEll(p - vec3f(0.0, 0.38, -0.06), vec3f(1.0, 0.96, 1.08));                       // cranium
  d = smin(d, sdRBox(p - vec3f(0.0, -0.28, 0.32), vec3f(0.64, 0.36, 0.52), 0.3), 0.28);     // face
  d = smin(d, sdEll(px - vec3f(0.6, -0.12, 0.48), vec3f(0.3, 0.22, 0.32)), 0.14);           // cheekbones
  d = smin(d, sdRBox(p - vec3f(0.0, -0.78, 0.36), vec3f(0.5, 0.2, 0.44), 0.18), 0.16);      // jaw
  // rock pedestal sinking into the sea floor
  let rad = 0.78 + 0.32 * clamp(-(p.y + 0.95), 0.0, 3.0);
  var ped = length(p.xz * vec2f(1.0, 1.1)) - rad;
  ped = max(ped, p.y + 0.75);
  d = smin(d, ped, 0.3);
  // rock texture + strata ledges
  d += (vnoise3(p * 3.4) - 0.5) * 0.09 + (vnoise3(p * 9.0) - 0.5) * 0.03;
  d += 0.012 * sin(p.y * 22.0 + vnoise3(p * 2.0) * 3.0);
  // eye sockets — deep caves
  let eye = sdEll(px - vec3f(0.36, 0.08, 0.86), vec3f(0.27, 0.3, 0.34));
  let deep = sdEll(px - vec3f(0.3, 0.08, 0.52), vec3f(0.21, 0.23, 0.46));
  d = smax(d, -min(eye, deep), 0.06);
  // heart-shaped nose
  let lobe = sdEll(px - vec3f(0.075, -0.25, 0.97), vec3f(0.095, 0.09, 0.3));
  let tip = sdEll(p - vec3f(0.0, -0.36, 0.97), vec3f(0.045, 0.07, 0.3));
  d = smax(d, -smin(lobe, tip, 0.06), 0.03);
  // grin
  let mp = mouthSpace(p);
  d = smax(d, -sdRBox(mp, vec3f(0.44, 0.13, 0.36), 0.06), 0.035);
  // crack across the crown
  let cl = abs(p.x - 0.07 * sin(p.z * 11.0) - 0.035 * sin(p.z * 27.0 + 1.0)) - 0.022;
  let crack = max(max(cl, abs(p.z + 0.05) - 0.62), 0.78 - p.y);
  d = smax(d, -crack, 0.012);
  // teeth: two rows of separate boxes set in the grin
  let idx = clamp(round(mp.x / 0.125), -3.0, 3.0);
  let tp = mp - vec3f(idx * 0.125, 0.0, 0.0);
  let up = sdRBox(tp - vec3f(0.0, 0.06, 0.1), vec3f(0.05, 0.065, 0.06), 0.018);
  let lo = sdRBox(tp - vec3f(0.0, -0.07, 0.08), vec3f(0.047, 0.058, 0.06), 0.018);
  let teeth = min(up, lo);
  if (teeth < d) { return vec2f(teeth, 1.0); }
  return vec2f(d, 0.0);
}
fn skullNormal(p: vec3f) -> vec3f {
  let e = vec2f(0.004, -0.004);
  return normalize(e.xyy * skullMap(p + e.xyy).x + e.yyx * skullMap(p + e.yyx).x +
                   e.yxy * skullMap(p + e.yxy).x + e.xxx * skullMap(p + e.xxx).x);
}
fn skullToLocal(p: vec3f) -> vec3f {   // block-local → skull space
  let q = (p - SKULL_C) / SKULL_S;
  let c = cos(SKULL_YAW); let s = sin(SKULL_YAW);
  return vec3f(c * q.x - s * q.z, q.y, s * q.x + c * q.z);
}
fn skullDirToLocal(v: vec3f) -> vec3f {
  let c = cos(SKULL_YAW); let s = sin(SKULL_YAW);
  return vec3f(c * v.x - s * v.z, v.y, s * v.x + c * v.z);
}
fn skullDirToBlock(v: vec3f) -> vec3f {
  let c = cos(SKULL_YAW); let s = sin(SKULL_YAW);
  return vec3f(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

struct SOut { @builtin(position) clip: vec4f, @location(0) wpos: vec3f };
@vertex fn vsSkull(@location(0) pos: vec3f) -> SOut {
  let c = cos(SKULL_YAW); let s = sin(SKULL_YAW);
  let r = vec3f(c * pos.x + s * pos.z, pos.y, -s * pos.x + c * pos.z);
  let lp = SKULL_C + r * SKULL_S;
  let w = toWorld(lp);
  var o: SOut;
  o.clip = u.viewProj * vec4f(w, 1.0);
  o.wpos = w;
  return o;
}
struct FragD { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 };
@fragment fn fsSkull(i: SOut) -> FragD {
  let roW = u.camPos.xyz;
  let rdW = normalize(i.wpos - roW);
  let roS = skullToLocal(toLocal(roW));
  let rdS = normalize(skullDirToLocal((u.invBlockMat * vec4f(rdW, 0.0)).xyz));
  // proxy box intersection in skull space
  let lo = vec3f(-1.45, -2.3, -1.4); let hi = vec3f(1.45, 1.45, 1.5);
  let inv = 1.0 / rdS;
  let t0 = (lo - roS) * inv; let t1 = (hi - roS) * inv;
  let tmn = min(t0, t1); let tmx = max(t0, t1);
  var t = max(max(tmn.x, tmn.y), max(tmn.z, 0.0));
  let tEnd = min(min(tmx.x, tmx.y), tmx.z);
  var hit = false; var m = 0.0;
  for (var k = 0; k < 90; k++) {
    let p = roS + rdS * t;
    let r = skullMap(p);
    if (r.x < 0.0015 * (1.0 + t * 0.3)) { hit = true; m = r.y; break; }
    t += r.x * 0.75;
    if (t > tEnd) { break; }
  }
  if (!hit) { discard; }
  let ps = roS + rdS * t;
  let ns = skullNormal(ps);
  let lp = SKULL_C + skullDirToBlock(ps) * SKULL_S;
  let nl = skullDirToBlock(ns);
  let w = toWorld(lp);
  let n = toWorldN(nl);
  // ambient occlusion from the field
  let ao = clamp(0.6 * (skullMap(ps + ns * 0.12).x / 0.12) + 0.4 * skullMap(ps + ns * 0.3).x / 0.3, 0.08, 1.0);
  var alb: vec3f; var spec = 0.1; var rough = 0.5;
  let night = u.sunCol.w;
  var emis = vec3f(0.0);
  if (m > 0.5) {
    alb = vec3f(0.93, 0.89, 0.78) * (0.92 + 0.08 * vnoise3(ps * 20.0));
    spec = 0.35; rough = 0.25;
  } else {
    let band = 0.5 + 0.5 * sin(ps.y * 13.0 + vnoise3(ps * 2.5) * 4.0);
    alb = mix(vec3f(0.66, 0.6, 0.52), vec3f(0.52, 0.45, 0.38), band) * (0.85 + 0.25 * vnoise3(ps * 11.0));
    let moss = smoothstep(0.5, 0.85, nl.y) * smoothstep(0.55, 0.85, ps.y + (vnoise3(ps * 5.0) - 0.5) * 0.4);
    alb = mix(alb, mix(vec3f(0.3, 0.5, 0.16), vec3f(0.42, 0.6, 0.2), vnoise3(ps * 18.0)), moss);
    let eta = etaAt(lp.xz);
    let wetB = smoothstep(eta + 0.07, eta + 0.01, lp.y);
    alb *= 1.0 - 0.38 * wetB;
    spec = mix(0.08, 0.7, wetB); rough = mix(0.6, 0.15, wetB);
    // candle-lit caves in the eye sockets
    let pxs = vec3f(abs(ps.x), ps.y, ps.z);
    let sock = length((pxs - vec3f(0.33, 0.08, 0.62)) * vec3f(1.0, 1.0, 0.6));
    let inside = smoothstep(0.42, 0.12, sock);
    let fl = 0.75 + 0.25 * sin(u.camPos.w * 11.0 + ps.x * 3.0) * sin(u.camPos.w * 7.3);
    alb *= mix(1.0, 0.22, inside);
    emis = vec3f(1.0, 0.5, 0.16) * inside * (0.05 + 2.6 * night) * fl * (0.5 + 0.5 * (1.0 - ao));
  }
  let c = shade(w, lp, n, alb, rough, spec, 0.0, emis, ao);
  let clip = u.viewProj * vec4f(w, 1.0);
  var o: FragD;
  o.color = vec4f(c, 1.0);
  o.depth = clip.z / clip.w;
  return o;
}

// ── Jelly sea: surface + cut walls (refraction, absorption, foam, meniscus) ──
struct WOut {
  @builtin(position) clip: vec4f,
  @location(0) wpos: vec3f,
  @location(1) lpos: vec3f,
  @location(2) nrm: vec3f,
  @location(3) @interpolate(flat) kind: f32,
};
@vertex fn vsWater(@location(0) a: vec4f) -> WOut {
  let xz = a.xy;
  let eta = etaAt(xz);
  var y = eta;
  if (a.z > 0.5 && a.z < 1.5) { y = min(terrAt(xz), eta - 0.002); }
  var n = vec3f(0.0, 1.0, 0.0);
  let side = i32(a.w + 0.5);
  if (side == 1) { n = vec3f(1.0, 0.0, 0.0); }
  if (side == 2) { n = vec3f(-1.0, 0.0, 0.0); }
  if (side == 3) { n = vec3f(0.0, 0.0, 1.0); }
  if (side == 4) { n = vec3f(0.0, 0.0, -1.0); }
  let lp = wobblePos(vec3f(xz.x, y, xz.y));
  let w = toWorld(lp);
  var o: WOut;
  o.clip = u.viewProj * vec4f(w, 1.0);
  o.wpos = w; o.lpos = vec3f(xz.x, y, xz.y); o.nrm = n;
  o.kind = select(1.0, 0.0, side == 0);
  return o;
}

fn screenUV(w: vec3f) -> vec2f {
  let c = u.viewProj * vec4f(w, 1.0);
  return vec2f(c.x / c.w * 0.5 + 0.5, 0.5 - c.y / c.w * 0.5);
}

@fragment fn fsWater(i: WOut) -> @location(0) vec4f {
  let t = u.camPos.w;
  let lp = i.lpos;
  let isTop = i.kind < 0.5;
  var nl = i.nrm;
  let eta = etaAt(lp.xz);
  let ter = terrAt(lp.xz);
  if (isTop) {
    let e = u.misc.z;
    let dx = (etaAt(lp.xz + vec2f(e, 0.0)) - etaAt(lp.xz - vec2f(e, 0.0))) / (2.0 * e);
    let dz = (etaAt(lp.xz + vec2f(0.0, e)) - etaAt(lp.xz - vec2f(0.0, e))) / (2.0 * e);
    // fine jelly ripples on top of the simulated waves
    let q = lp.xz * 9.0;
    let rx = vnoise(q + vec2f(t * 0.35, 0.0)) - vnoise(q + vec2f(0.6 + t * 0.35, 0.0));
    let rz = vnoise(q + vec2f(0.0, t * 0.3)) - vnoise(q + vec2f(0.0, 0.6 + t * 0.3));
    nl = normalize(vec3f(-dx * 1.4 + rx * 0.06, 1.0, -dz * 1.4 + rz * 0.06));
  }
  let n = toWorldN(nl);
  let w = i.wpos;
  let V = normalize(u.camPos.xyz - w);
  let L = normalize(u.sunDir.xyz);
  let key = u.sunCol.rgb * u.sunDir.w;
  let uv = i.clip.xy * u.res.zw;
  let coord = vec2i(i.clip.xy);
  let dS = textureLoad(sceneDepth, coord, 0);
  var behind = worldFromScreen(uv, dS);
  var thick = select(distance(behind, w), 3.0, dS >= 1.0);
  // refraction
  let rd = refract(-V, n, 0.75);
  let tgt = w + rd * clamp(thick, 0.05, 1.0) * 0.45;
  var suv = clamp(screenUV(tgt), vec2f(0.001), vec2f(0.999));
  let rc = vec2i(suv * u.res.xy);
  let dR = textureLoad(sceneDepth, rc, 0);
  if (dR < i.clip.z) { suv = uv; }
  else { behind = worldFromScreen(suv, dR); thick = select(distance(behind, w), 3.0, dR >= 1.0); }
  let sceneCol = textureSampleLevel(sceneTex, linSamp, suv, 0.0).rgb;
  let T = exp(-u.absorb.rgb * thick);
  let fd = fireWorld() - w;
  let fi = fireStrength() / (1.0 + dot(fd, fd) * 5.0);
  let lightAmt = key * 0.55 + u.ambTop.rgb * 0.9 + FIRE_COL * fi * 0.6;
  var col = sceneCol * T + u.scatter.rgb * lightAmt * (1.0 - T);
  // light shafts through the jelly
  let Ll = toLocalN(L);
  let lb = toLocal(behind);
  var shaft = 0.0;
  for (var k = 0; k < 6; k++) {
    let s = (f32(k) + 0.5) / 6.0;
    let sp = mix(lp, lb, s);
    let dep = max(etaAt(sp.xz) - sp.y, 0.0);
    let pr = sp.xz + Ll.xz / max(Ll.y, 0.3) * dep;
    shaft += caustic(pr * 0.9, t) * exp(-dep * 1.6) * smoothstep(0.0, 0.05, dep);
  }
  col += u.scatter.rgb * key * shaft / 6.0 * min(thick, 1.5) * 0.55;
  // reflection
  let R = reflect(-V, n);
  let F = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  col = mix(col, backdropColor(R) * 0.85, F * 0.6);
  let H = normalize(L + V);
  col += key * (pow(max(dot(n, H), 0.0), 420.0) * 2.4 + pow(max(dot(n, H), 0.0), 90.0) * 0.02);
  let Lf = normalize(fd);
  col += FIRE_COL * fi * pow(max(dot(n, normalize(Lf + V)), 0.0), 120.0) * 4.0;
  col += u.surfCol.rgb * 0.04;
  if (u.beamPos.w > 0.001) {
    let bd = w - u.beamPos.xyz; let bl = max(length(bd), 1e-4);
    let cone = smoothstep(0.972, 0.994, dot(bd / bl, u.beamDir.xyz));
    col += vec3f(1.0, 0.9, 0.7) * u.beamPos.w * cone / (1.0 + bl * bl * 0.35) * 0.55;
  }
  let lit = key * max(dot(n, L), 0.0) * 0.8 + u.ambTop.rgb + FIRE_COL * fi * 0.8;
  if (isTop) {
    // shoreline foam lace
    let dep = eta - ter;
    let near = smoothstep(0.035, 0.0, dep);
    let lace = smoothstep(0.42, 0.62, vnoise(lp.xz * 26.0 + vec2f(t * 0.25, -t * 0.2)) * 0.6 + vnoise(lp.xz * 60.0 - vec2f(t * 0.4)) * 0.4);
    let bands = 0.5 + 0.5 * sin(dep * 140.0 - t * 2.2);
    var foam = near * mix(lace, 1.0, smoothstep(0.03, 0.0, dep)) * (0.55 + 0.45 * bands);
    // crest foam where waves are steep
    let steep = length(nl.xz);
    foam += smoothstep(0.3, 0.6, steep) * lace * 0.5;
    col = mix(col, vec3f(1.0, 0.99, 0.96) * lit * 0.95, clamp(foam, 0.0, 1.0) * 0.85);
    // bright meniscus where the surface meets the cut faces
    let edge = u.misc.y - max(abs(lp.x), abs(lp.z));
    col += lit * smoothstep(0.045, 0.0, edge) * 0.55;
  } else {
    let below = eta - lp.y;
    col += lit * smoothstep(0.035, 0.0, below) * 0.75;
    col += lit * smoothstep(0.03, 0.0, below - 0.02) * 0.15;
    let corner = u.misc.y - min(abs(lp.x), abs(lp.z));
    col += lit * smoothstep(0.03, 0.0, corner) * 0.35;
    // soft gloss gradient down the cut face
    col += u.scatter.rgb * lit * 0.05 * smoothstep(-1.0, 0.0, lp.y);
  }
  return vec4f(col, 1.0);
}

// ── particles (premultiplied; alpha 0 = additive) ───────────────────────────
struct PIn { @location(0) a: vec4f, @location(1) c: vec4f, @location(2) k: vec4f };
struct POut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec4f,
  @location(2) @interpolate(flat) kind: f32,
  @location(3) misc: vec2f,
};
@vertex fn vsPart(@builtin(vertex_index) vi: u32, inp: PIn) -> POut {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
                                vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let cn = corners[vi];
  let kind = inp.k.x;
  let ang = inp.k.z * 6.283 + inp.k.y * 1.5 * select(1.0, 0.0, kind > 0.5 && kind < 1.5);
  let ca = cos(ang); let sa = sin(ang);
  var rc = vec2f(cn.x * ca - cn.y * sa, cn.x * sa + cn.y * ca);
  if (kind > 0.5 && kind < 1.5) { rc = cn * vec2f(0.7, 1.15); }
  let w = toWorld(inp.a.xyz);
  var clip = u.viewProj * vec4f(w, 1.0);
  clip.x += rc.x * inp.a.w * u.proj.x;
  clip.y += rc.y * inp.a.w * u.proj.y;
  var col = inp.c;
  // smoke and spray are lit: ambient + key + campfire from below
  if ((kind > 2.5 && kind < 3.5) || kind > 5.5) {
    let fd = fireWorld() - w;
    let fi = fireStrength() / (1.0 + dot(fd, fd) * 6.0);
    let lit = u.sunCol.rgb * u.sunDir.w * 0.55 + u.ambTop.rgb * 0.9 + FIRE_COL * fi * 1.2;
    col = vec4f(col.rgb * lit, col.a);
  }
  var o: POut;
  o.clip = clip; o.uv = cn; o.col = col; o.kind = kind; o.misc = vec2f(inp.k.z, inp.k.w);
  return o;
}
@fragment fn fsPart(i: POut) -> @location(0) vec4f {
  let r = length(i.uv);
  if (r > 1.0) { discard; }
  var a = 0.0;
  let k = i.kind;
  if (k < 0.5) { a = pow(1.0 - r, 2.2); }                                   // soft glow
  else if (k < 1.5) {                                                       // flame tongue
    let p = i.uv;
    let w = 1.0 - smoothstep(0.0, 1.0, length(vec2f(p.x * (1.4 + p.y * 0.6), p.y)));
    a = pow(max(w, 0.0), 1.4);
  }
  else if (k < 2.5) { a = smoothstep(1.0, 0.15, r); a = a * a; }          // spark / ember
  else if (k < 3.5) {                                                       // smoke puff
    let nz = vnoise(i.uv * 2.2 + vec2f(i.misc.x * 17.0));
    a = smoothstep(1.0, 0.2, r) * (0.55 + 0.45 * nz);
  }
  else if (k < 4.5) {                                                       // glint star
    let p = abs(i.uv);
    a = max(exp(-p.x * 18.0) * (1.0 - p.y), exp(-p.y * 18.0) * (1.0 - p.x)) + exp(-r * 6.0);
    a = clamp(a, 0.0, 1.0);
  }
  else if (k < 5.5) {                                                       // bubble
    let rim = smoothstep(0.62, 0.92, r) * smoothstep(1.0, 0.92, r);
    let hl = smoothstep(0.32, 0.0, length(i.uv - vec2f(-0.35, 0.35)));
    a = rim * 0.8 + hl;
  }
  else { a = smoothstep(1.0, 0.3, r); }                                     // spray droplet
  // soft particles
  let dS = textureLoad(sceneDepth, vec2i(i.clip.xy), 0);
  let nr = u.proj.z; let fr = u.proj.w;
  let zs = nr * fr / (fr - dS * (fr - nr));
  let zp = nr * fr / (fr - i.clip.z * (fr - nr));
  a *= clamp((zs - zp) * 6.0, 0.0, 1.0);
  return vec4f(i.col.rgb * a, i.col.a * a);
}

// ── composite: tonemap, grade, vignette, grain ──────────────────────────────
fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}
@fragment fn fsComposite(i: FOut) -> @location(0) vec4f {
  var c = textureSampleLevel(sceneTex, linSamp, i.uv, 0.0).rgb;
  c *= u.ambBot.w;
  c = aces(c * 0.92);
  let l = dot(c, vec3f(0.299, 0.587, 0.114));
  c = mix(vec3f(l), c, 1.06);
  let v = length((i.uv - 0.5) * vec2f(1.0, 0.85));
  c *= 1.0 - 0.18 * smoothstep(0.35, 0.95, v);
  c = pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.2));
  let g = hash21(i.uv * u.res.xy + vec2f(fract(u.camPos.w * 7.0) * 100.0)) - 0.5;
  c += g * 0.018;
  return vec4f(c, 1.0);
}
`;
}
