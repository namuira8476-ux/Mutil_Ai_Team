import { spawn } from "node:child_process";
import electron from "electron";
await import("./build.mjs");
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
  stdio: "inherit",
});
let ready = false;
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch("http://127.0.0.1:5173")).ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
if (!ready) {
  vite.kill();
  throw Error("Vite did not start");
}
const env = { ...process.env, WORKROOM_DEV_URL: "http://127.0.0.1:5173" };
delete env.ELECTRON_RUN_AS_NODE;
const app = spawn(electron, ["."], { stdio: "inherit", env });
app.on("exit", () => {
  vite.kill();
  process.exit();
});
process.on("SIGINT", () => {
  app.kill();
  vite.kill();
});
