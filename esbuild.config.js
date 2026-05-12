// @ts-check
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const extensionOptions = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['vscode', 'better-sqlite3'],
};

/** @type {import('esbuild').BuildOptions} */
const webviewOptions = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
  entryPoints: ['webview-ui/src/main.ts'],
  outfile: 'dist/webview/main.js',
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
};

async function main() {
  if (watch) {
    const [extCtx, webCtx] = await Promise.all([
      esbuild.context(extensionOptions),
      esbuild.context(webviewOptions),
    ]);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log('Watching for changes…');
  } else {
    await Promise.all([
      esbuild.build(extensionOptions),
      esbuild.build(webviewOptions),
    ]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
