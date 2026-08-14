// Bundles src/index.js into a single portable IIFE (dist/inspect.js) that runs
// on any page — as a <script> tag, a bookmarklet, or an extension content script.

import { build, context } from 'esbuild';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const serve = process.argv.includes('--serve');

mkdirSync('dist', { recursive: true });

const options = {
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  target: ['es2019'],
  outfile: 'dist/inspect.js',
  legalComments: 'none',
  logLevel: 'info',
};

async function run() {
  if (watch || serve) {
    const ctx = await context({ ...options, minify: false });
    await ctx.watch();
    if (serve) {
      const { host, port } = await ctx.serve({ servedir: '.', port: 5173 });
      console.log(`\n  Demo:  http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/demo/\n`);
    }
    // also keep a copy the extension loads
    syncExtension();
    console.log('watching…');
  } else {
    await build({ ...options, minify: false });
    await build({ ...options, minify: true, outfile: 'dist/inspect.min.js' });
    syncExtension();
    console.log('built dist/inspect.js and dist/inspect.min.js');
  }
}

function syncExtension() {
  if (existsSync('dist/inspect.js')) {
    copyFileSync('dist/inspect.js', 'extension/inspect.js');
  }
}

run();
