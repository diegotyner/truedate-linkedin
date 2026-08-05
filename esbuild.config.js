import * as esbuild from "esbuild";

const ctx = await esbuild.context({
  entryPoints: ["src/inject.ts", "src/content.ts", "src/background.ts"],
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: "chrome110",
  sourcemap: true,
  logLevel: "info",
});

if (process.argv.includes("--watch")) {
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
