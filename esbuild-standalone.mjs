import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Copy theme CSS files to output directory
function copyThemes() {
  const srcDir = 'standalone/themes';
  const outDir = 'out-standalone/themes';
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    fs.copyFileSync(path.join(srcDir, file), path.join(outDir, file));
  }
}

copyThemes();

const ctx = await esbuild.context({
  entryPoints: ['standalone/cli.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'node',
  target: 'node18',
  outfile: 'out-standalone/claudine.js',
  external: [
    // Native modules that shouldn't be bundled
    'fsevents',
  ],
  banner: {
    js: '#!/usr/bin/env node',
  },
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
  console.log('[esbuild-standalone] watching...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
