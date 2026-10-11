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
  const page = shell.replace('/*__SCRIPT__*/', () => '"use strict";\n(() => {\n' + js + '\n})();');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, page);
  return { bytes: page.length, out: OUT };
}

module.exports = { build, SRC, OUT };

if (require.main === module) {
  const { bytes } = build();
  console.log('built dist/pirate-jelly.html', (bytes / 1024).toFixed(1) + 'KB');
}
