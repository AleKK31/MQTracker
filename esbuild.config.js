// @ts-nocheck
// @ts-ignore
const esbuild = require("esbuild");

// @ts-ignore
const production = process.argv.includes("--production");

/** @type {import('esbuild').BuildOptions} */
const baseOptions = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: "info",
};

async function build() {
  // Extension bundle — Node.js
  await esbuild.build({
    ...baseOptions,
    entryPoints: ["src/extension.ts"],
    outfile: "dist/extension.js",
    platform: "node",
    target: "node18",
    format: "cjs",
    external: ["vscode"],
  });

  // Webview bundle — browser
  await esbuild.build({
    ...baseOptions,
    entryPoints: ["webview-ui/src/main.ts"],
    outfile: "dist/webview/main.js",
    platform: "browser",
    target: "es2020",
    format: "iife",
  });
}

build().catch((err) => {
  console.error(err);
  // @ts-ignore
  process.exit(1);
});