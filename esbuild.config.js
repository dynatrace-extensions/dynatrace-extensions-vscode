const { createBuildConfig, defaultPlugins } = require("esbuild-vsce-utils");
const esbuild = require("esbuild");

const isMinify = process.argv.includes("--minify");
const isWatch = process.argv.includes("--watch");

const config = {
  ...createBuildConfig({
    entryPoint: "./src/extension.ts",
    outfile: "out/main.js",
    externals: ["vscode", "@tanstack/react-query-devtools"],
    platform: "node",
    minify: isMinify,
    sourcemap: true,
  }),
  plugins: defaultPlugins(),
  alias: {
    "@common": "./common",
  },
};

if (isWatch) {
  esbuild.context(config).then((ctx) => ctx.watch()).catch(() => process.exit(1));
} else {
  esbuild.build(config).catch(() => process.exit(1));
}
