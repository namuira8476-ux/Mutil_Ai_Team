import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
await build({
  entryPoints: ["electron/main.ts", "electron/preload.ts"],
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron", "node-pty", "sql.js"],
  sourcemap: true,
});
mkdirSync("resources", { recursive: true });
cpSync("node_modules/sql.js/dist/sql-wasm.wasm", "resources/sql-wasm.wasm");
