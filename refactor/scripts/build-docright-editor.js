const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const entry = path.join(__dirname, '..', 'webview', 'docright-editor.js');
const outfile = path.join(__dirname, '..', 'media', 'docright-editor.js');

fs.mkdirSync(path.dirname(outfile), { recursive: true });

esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: false,
  minify: false
}).catch(() => process.exit(1));
