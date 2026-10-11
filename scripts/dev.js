#!/usr/bin/env node
// Dev server for Pirate Jelly: build → serve → open browser → rebuild + live reload on change.
// Zero dependencies (Node 18+).
//
//   npm run dev                 # http://localhost:5173
//   PORT=8080 npm run dev       # pick a port
//   npm run dev -- --no-open    # don't open a browser
//   npm run preview             # serve dist/ without watching

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { build, SRC, OUT } = require('../build.js');

const args = process.argv.slice(2);
const watch = !args.includes('--no-watch');
const shouldOpen = !args.includes('--no-open');
const startPort = Number(process.env.PORT) || 5173;

const clients = new Set();
const RELOAD_SNIPPET = `
<script>
(() => {
  const es = new EventSource('/__reload');
  es.onmessage = (e) => { if (e.data === 'reload') location.reload(); };
})();
</script>`;

function safeBuild() {
  const t0 = Date.now();
  try {
    const { bytes } = build();
    console.log(`  \x1b[32m✓\x1b[0m built dist/pirate-jelly.html (${(bytes / 1024).toFixed(1)} KB) in ${Date.now() - t0} ms`);
    return true;
  } catch (err) {
    console.error(`  \x1b[31m✗ build failed:\x1b[0m ${err.message}`);
    return false;
  }
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url === '/' || url === '/index.html' || url === '/pirate-jelly.html') {
    fs.readFile(OUT, 'utf8', (err, html) => {
      if (err) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Build output missing. Check the terminal for build errors.'); return; }
      if (watch) html = html.includes('</body>') ? html.replace('</body>', RELOAD_SNIPPET + '</body>') : html + RELOAD_SNIPPET;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

function listen(port, triesLeft = 10) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) listen(port + 1, triesLeft - 1);
    else { console.error(err.message); process.exit(1); }
  });
  server.listen(port, '0.0.0.0', () => {
    const local = `http://localhost:${port}`;
    const lan = lanAddress();
    console.log('\n  \x1b[1mPirate Jelly\x1b[0m ' + (watch ? 'dev server' : 'preview'));
    console.log(`  Local:   ${local}`);
    if (lan) console.log(`  Network: http://${lan}:${port}  (WebGPU needs https or localhost on other devices)`);
    if (watch) console.log('  Watching src/ for changes. Ctrl+C to stop.\n');
    if (shouldOpen) openBrowser(local);
  });
}

safeBuild();

if (watch) {
  let timer = null;
  const onChange = (file) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`  ↻ ${file || 'src'} changed`);
      if (safeBuild()) for (const c of clients) c.write('data: reload\n\n');
    }, 80);
  };
  try {
    fs.watch(SRC, { recursive: true }, (_e, file) => onChange(file));
  } catch {
    fs.watch(SRC, (_e, file) => onChange(file)); // recursive not supported on this platform
  }
  fs.watch(path.join(__dirname, '..', 'build.js'), () => onChange('build.js'));
}

listen(startPort);
