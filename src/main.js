// ─────────────────────────────────────────────────────────────────────────────
//  Boot, input, UI
// ─────────────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function setStatus(state, text) {
  const pill = $('status');
  if (!pill) return;
  pill.dataset.state = state;
  $('statusText').textContent = text;
}
function showFallback(msg) {
  setStatus('off', 'WebGPU · Unavailable');
  const fb = $('fallback');
  if (fb) { fb.hidden = false; if (msg) $('fallbackDetail').textContent = msg; }
  document.documentElement.classList.add('no-gpu');
}

window.addEventListener('error', (e) => { const el = document.getElementById('statusText'); if (el) el.textContent = 'Error · ' + String(e.message).slice(0, 90); });
window.addEventListener('unhandledrejection', (e) => { const el = document.getElementById('statusText'); if (el) el.textContent = 'Error · ' + String(e.reason && e.reason.message || e.reason).slice(0, 90); });

async function boot() {
  const canvas = $('gl');
  if (!navigator.gpu) { showFallback('This browser does not expose WebGPU.'); return; }
  let adapter = null;
  try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch (e) { adapter = null; }
  if (!adapter) { showFallback('WebGPU is present but no graphics adapter is available.'); return; }
  let device;
  try { device = await adapter.requestDevice(); } catch (e) { showFallback('The graphics adapter refused to create a device.'); return; }
  device.lost.then((info) => { if (info.reason !== 'destroyed') showFallback('The graphics device was lost (' + (info.message || info.reason) + '). Reload to try again.'); });
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const meshes = {
    main: buildMain(), floor: buildFloor(), water: buildWaterMesh(), skull: buildSkullBox(), ...buildInstanced(),
  };
  const renderer = new Renderer(device, context, format);
  device.pushErrorScope('validation');
  renderer.init(meshes);
  const err = await device.popErrorScope();
  if (err) { console.error(err.message); showFallback('Shader setup failed: ' + err.message.slice(0, 160)); return; }

  const app = new App(renderer);
  window.__pj = app;
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const applyMotion = () => { app.reduced = !!(mq && mq.matches); app.parts.scale = app.reduced ? 0.45 : 1; };
  applyMotion();
  if (mq && mq.addEventListener) mq.addEventListener('change', applyMotion);

  // ── sizing ────────────────────────────────────────────────────────────────
  let quality = 1;
  const resize = () => {
    const cw = Math.max(1, window.innerWidth), ch = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    let s = (dpr < 1.5 ? 1.5 : dpr) * quality;
    const maxPix = 3.4e6;
    if (cw * ch * s * s > maxPix) s = Math.sqrt(maxPix / (cw * ch));
    renderer.resize(Math.max(1, Math.round(cw * s)), Math.max(1, Math.round(ch * s)));
    app.css = [cw, ch];
    const narrow = cw <= 760;
    const panel = $('panel');
    if (narrow) {
      app.fitW = cw;
      app.panelShift = [0, 0.02];
    } else {
      const pw = panel ? (panel.getBoundingClientRect().width || 292) + 20 : 312;
      app.fitW = cw - pw;
      app.panelShift = [(pw / cw) * 0.95, -0.14];
    }
    const nd = app.baseDist();
    if (!app._distInit || Math.abs(app.cam.tDist - app._lastBase) < 0.01) { app.cam.dist = app._distInit ? app.cam.dist : nd; app.cam.tDist = nd; app._distInit = true; }
    app._lastBase = nd;
  };
  resize();
  window.addEventListener('resize', resize);

  // ── UI ────────────────────────────────────────────────────────────────────
  const ui = {
    lively: $('lively'), fruit: $('tFruit'), shots: $('tShots'), afloat: $('tAfloat'), sunk: $('tSunk'), todName: $('todName'),
  };
  $('btnFire').addEventListener('click', () => app.fireGun());
  $('btnCoins').addEventListener('click', () => app.dropCoins());
  $('btnBarrel').addEventListener('click', () => app.dropBarrel());
  $('btnReset').addEventListener('click', () => app.reset());
  $('btnView').addEventListener('click', () => app.resetView());
  const pauseBtn = $('btnPause');
  const setPaused = (p) => {
    app.paused = p;
    pauseBtn.textContent = p ? 'Resume' : 'Pause';
    pauseBtn.setAttribute('aria-pressed', p ? 'true' : 'false');
    setStatus(p ? 'paused' : 'live', p ? 'WebGPU · Paused' : 'WebGPU · Live');
  };
  pauseBtn.addEventListener('click', () => setPaused(!app.paused));
  const bindRange = (id, key, fmt) => {
    const el = $(id), out = $(id + 'Val');
    const upd = () => { app.params[key] = parseFloat(el.value) / 100; if (out) out.textContent = fmt(app.params[key]); };
    el.addEventListener('input', upd); upd();
  };
  bindRange('firm', 'firm', (v) => (v < 0.33 ? 'Wobbly' : v < 0.7 ? 'Set' : 'Firm'));
  bindRange('damp', 'damp', (v) => (v < 0.33 ? 'Lively' : v < 0.7 ? 'Calm' : 'Still'));
  bindRange('tod', 'tod', () => todSample(app.params.tod).name);
  document.querySelectorAll('[data-flavour]').forEach((b) => {
    b.addEventListener('click', () => {
      app.params.flavour = b.dataset.flavour;
      document.querySelectorAll('[data-flavour]').forEach((x) => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
      document.documentElement.dataset.flavour = b.dataset.flavour;
    });
  });
  const handle = $('sheetHandle');
  if (handle) handle.addEventListener('click', () => {
    const open = $('panel').classList.toggle('open');
    handle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); app.fireGun(); }
  });

  // ── pointer interaction ───────────────────────────────────────────────────
  const pointers = new Map();
  let drag = null;
  const rel = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const cursorFor = (k) => ({ ship: 'pointer', chest: 'pointer', fire: 'pointer', x: 'pointer', body: 'grab', palm: 'grab', water: 'crosshair', side: 'ns-resize' }[k] || 'default');
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = rel(e);
    pointers.set(e.pointerId, [x, y]);
    if (pointers.size === 2) {
      endDrag(false);
      const [a, b] = [...pointers.values()];
      drag = { mode: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), dist0: app.cam.tDist };
      return;
    }
    if (pointers.size > 2) return;
    const hit = e.button === 2 ? { kind: 'none' } : app.pick(x, y);
    drag = { mode: 'orbit', hit, x0: x, y0: y, x, y, t0: performance.now(), moved: false, hist: [] };
    switch (hit.kind) {
      case 'ship': {
        drag.mode = 'ship';
        const p = app.planeHit(x, y, 0);
        drag.off = p ? v3.sub(app.ship.p, p) : [0, 0, 0];
        break;
      }
      case 'body': drag.mode = 'body'; hit.body.held = true; drag.body = hit.body; canvas.style.cursor = 'grabbing'; break;
      case 'palm': drag.mode = 'palm'; break;
      case 'water': drag.mode = 'water'; break;
      case 'side': drag.mode = 'tip'; drag.normal = hit.normal; app.block.held = true; break;
      case 'chest': case 'fire': case 'x': drag.mode = 'tap'; break;
      default: drag.mode = 'orbit';
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = rel(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [x, y]);
    if (!drag) {
      if (e.pointerType === 'mouse') canvas.style.cursor = cursorFor(app.pick(x, y).kind);
      return;
    }
    if (drag.mode === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      app.cam.tDist = clamp(drag.dist0 * (drag.d0 / Math.max(d, 1)), 4.5, 55);
      return;
    }
    const dx = x - drag.x, dy = y - drag.y;
    drag.x = x; drag.y = y;
    if (Math.hypot(x - drag.x0, y - drag.y0) > 6) drag.moved = true;
    if (drag.mode === 'tap' && drag.moved) drag.mode = 'orbit';
    switch (drag.mode) {
      case 'orbit':
        app.cam.tYaw -= dx * 0.0065;
        app.cam.tPitch = clamp(app.cam.tPitch + dy * 0.0045, 0.12, 1.25);
        break;
      case 'ship': {
        if (!drag.moved) break;
        const p = app.planeHit(x, y, 0);
        if (p) app.ship.tow = [clamp(p[0] + drag.off[0], -HALF + 0.5, HALF - 0.5), 0, clamp(p[2] + drag.off[2], -HALF + 0.5, HALF - 0.5)];
        break;
      }
      case 'body': {
        const b = drag.body;
        const p = app.camPlaneHit(x, y, b.p);
        if (!p) break;
        p[0] = clamp(p[0], -HALF + 0.06, HALF - 0.06); p[2] = clamp(p[2], -HALF + 0.06, HALF - 0.06);
        p[1] = clamp(p[1], H(p[0], p[2]) + b.r, 2.2);
        const now = performance.now();
        drag.hist.push([now, p.slice()]);
        while (drag.hist.length > 6) drag.hist.shift();
        b.p = p; b.v = [0, 0, 0];
        break;
      }
      case 'palm': {
        const P = LAYOUT.palms[drag.hit.palm];
        const p = app.planeHit(x, y, P.top[1]);
        if (p) {
          let bx = p[0] - P.top[0], bz = p[2] - P.top[2];
          const l = Math.hypot(bx, bz), m = 0.42;
          if (l > m) { bx *= m / l; bz *= m / l; }
          app.palmBend[drag.hit.palm].target = [bx, bz];
        }
        break;
      }
      case 'water': {
        const p = app.planeHit(x, y, 0);
        if (p && Math.abs(p[0]) < HALF && Math.abs(p[2]) < HALF && app.water.isWet(p[0], p[2])) {
          const sp = Math.min(Math.hypot(dx, dy), 40) / 40;
          app.water.bump(p[0], p[2], -0.01 - 0.02 * sp, 0.06);
          const prev = app.planeHit(x - dx, y - dy, 0);
          if (prev) app.water.push(p[0], p[2], (p[0] - prev[0]) * 6, (p[2] - prev[2]) * 6, 0.08);
        }
        break;
      }
      case 'tip': {
        const n = drag.normal, k = 0.0028;
        const tot = (y - drag.y0) * k;
        const side = (x - drag.x0) * k * 0.6;
        app.block.targetX = clamp(n[2] * tot - n[0] * side * 0.5, -0.22, 0.22);
        app.block.targetZ = clamp(-n[0] * tot - n[2] * side * 0.5, -0.22, 0.22);
        break;
      }
    }
  });
  function endDrag(allowTap) {
    if (!drag) return;
    const d = drag;
    drag = null;
    const quick = performance.now() - (d.t0 || 0) < 450;
    if (allowTap && !d.moved && quick) {
      switch (d.hit && d.hit.kind) {
        case 'ship': app.fireGun(); break;
        case 'chest': app.toggleChest(); break;
        case 'fire': app.roarFire(); break;
        case 'x': app.digX(); break;
        case 'water': if (d.hit.point) { app.water.bump(d.hit.point[0], d.hit.point[2], -0.05, 0.07); app.splash([d.hit.point[0], 0, d.hit.point[2]], 0.5, false); } break;
        case 'body':
          if (!d.body) break;
          if (d.body.type === BT.CRATE) app.breakCrate(d.body);
          else if (d.body.type === BT.FRUIT) app.collectFruit(d.body);
          else d.body.v = v3.add(d.body.v, [rr(-0.3, 0.3), 1.6, rr(-0.3, 0.3)]);
          break;
      }
    }
    if (d.mode === 'body' && d.body) {
      const b = d.body;
      b.held = false;
      if (d.hist && d.hist.length >= 2) {
        const [t0, p0] = d.hist[0], [t1, p1] = d.hist[d.hist.length - 1];
        const dt = Math.max((t1 - t0) / 1000, 1 / 120);
        b.v = v3.mul(v3.sub(p1, p0), 1 / dt);
        const sp = v3.len(b.v);
        if (sp > 6) b.v = v3.mul(b.v, 6 / sp);
      }
    }
    if (d.mode === 'ship') app.ship.tow = null;
    if (d.mode === 'palm' && d.hit) app.palmBend[d.hit.palm].target = null;
    if (d.mode === 'tip') { app.block.held = false; app.block.targetX = 0; app.block.targetZ = 0; }
    canvas.style.cursor = 'default';
  }
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (drag && drag.mode === 'pinch') { if (pointers.size < 2) drag = null; return; }
    endDrag(true);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); endDrag(false); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    app.cam.tDist = clamp(app.cam.tDist * Math.exp(e.deltaY * 0.0012), 4.5, 55);
  }, { passive: false });

  // ── loop ──────────────────────────────────────────────────────────────────
  setPaused(false);
  let last = performance.now();
  let uiTick = 0;
  let wasNight = null;
  let perfT = 0, perfN = 0;
  const loop = (now) => {
    const dt = Math.max(0, (now - last) / 1000);
    last = now;
    if (dt > 0 && dt < 0.25 && !document.hidden) {
      perfT += dt; perfN++;
      if (perfT > 2) {
        const avg = perfT / perfN;
        const q0 = quality;
        if (avg > 0.024 && quality > 0.55) quality = Math.max(0.55, quality - 0.15);
        else if (avg < 0.0145 && quality < 1) quality = Math.min(1, quality + 0.1);
        if (q0 !== quality) resize();
        perfT = 0; perfN = 0;
      }
    }
    app.update(dt);
    app.render();
    uiTick += dt;
    if (uiTick > 0.12) {
      uiTick = 0;
      ui.lively.style.transform = `scaleX(${app.lively.toFixed(3)})`;
      let afloat = 0, sunk = 0;
      for (const b of app.bodies) {
        if (!b.active) continue;
        if (b.sub > 0.05 && b.sub < 0.97 && !b.grounded) afloat++;
        else if (b.sub >= 0.97 && b.grounded && v3.len(b.v) < 0.3) sunk++;
      }
      ui.shots.textContent = app.shots; ui.afloat.textContent = afloat; ui.sunk.textContent = sunk; ui.fruit.textContent = app.fruitCount;
      const night = app.tod.night > 0.5;
      if (night !== wasNight) { document.documentElement.classList.toggle('night', night); wasNight = night; }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => { console.error(e); showFallback('Something went wrong while starting: ' + (e && e.message ? e.message : e)); });
