const fs = require('fs');
const order = ['core.js', 'shaders.js', 'scene.js', 'sim.js', 'render.js', 'app.js', 'main.js'];
const js = order.map((f) => `// ==== ${f} ====\n` + fs.readFileSync('src/' + f, 'utf8')).join('\n');
const page = fs.readFileSync('src/page.html', 'utf8').replace('/*__SCRIPT__*/', () => '"use strict";\n(() => {\n' + js + '\n})();');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/pirate-jelly.html', page);
console.log('built', (page.length / 1024).toFixed(1) + 'KB');
