#!/usr/bin/env node
// Concatenates src/ into one self-contained page: dist/pirate-jelly.html
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'dist', 'pirate-jelly.html');
const ORDER = ['core.js', 'shaders.js', 'scene.js', 'sim.js', 'render.js', 'app.js', 'main.js'];

function build() {
  const js = ORDER.map((f) => `// ==== ${f} ====\n` + fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
  const shell = fs.readFileSync(path.join(SRC, 'page.html'), 'utf8');
  if (!shell.includes('/*__SCRIPT__*/')) throw new Error('src/page.html is missing the /*__SCRIPT__*/ placeholder');
  const body = shell.replace('/*__SCRIPT__*/', () => '"use strict";\n(() => {\n' + js + '\n})();');
  // src/page.html is a fragment; wrap it in a full standards-mode document so it runs standalone
  const page = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<style>html,body{margin:0;padding:0}[hidden]{display:none!important}</style>',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, page);
  return { bytes: page.length, out: OUT };
}

module.exports = { build, SRC, OUT };

if (require.main === module) {
  const { bytes } = build();
  console.log('built dist/pirate-jelly.html', (bytes / 1024).toFixed(1) + 'KB');
}
