const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const builds = [
  {
    entry: path.join(__dirname, '..', 'webview', 'docright-editor.js'),
    outfile: path.join(__dirname, '..', 'media', 'docright-editor.js')
  },
  {
    entry: path.join(__dirname, '..', 'webview', 'llm-panel.js'),
    outfile: path.join(__dirname, '..', 'media', 'llm-panel.js')
  },
  {
    entry: path.join(__dirname, '..', 'webview', 'callouts-panel.js'),
    outfile: path.join(__dirname, '..', 'media', 'callouts-panel.js')
  },
  {
    entry: path.join(__dirname, '..', 'webview', 'timeline-panel.js'),
    outfile: path.join(__dirname, '..', 'media', 'timeline-panel.js')
  }
];

Promise.all(
  builds.map(({ entry, outfile }) => {
    fs.mkdirSync(path.dirname(outfile), { recursive: true });
    return esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: ['es2020'],
      sourcemap: false,
      minify: false
    });
  })
).catch(() => process.exit(1));
