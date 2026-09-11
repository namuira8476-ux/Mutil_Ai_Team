import { _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(".runtime-test/preview");
const project = path.join(root, "LLM Wiki Studio");
fs.mkdirSync(path.join(project, "wiki"), { recursive: true });
fs.mkdirSync(path.join(project, "raw"), { recursive: true });
fs.writeFileSync(
  path.join(project, "wiki", "시작하기.md"),
  "# 나의 LLM Wiki\n\n프로젝트에 연결한 자료가 이곳에 모입니다.\n",
);
const env = {
  ...process.env,
  WORKROOM_DATA_DIR: path.join(root, "data"),
  WORKROOM_TEST_PROJECT: project,
};
delete env.ELECTRON_RUN_AS_NODE;
const scale = process.env.WORKROOM_SCALE || "1";
const app = await electron.launch({
  executablePath: process.env.WORKROOM_PACKAGED_EXE,
  args: [".", `--force-device-scale-factor=${scale}`],
  env,
});
app.process().stderr.on("data", (b) => process.stderr.write(b));
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => console.error("RENDERER:", e));
  await page
    .getByText("오늘은 어떤 일을 함께 할까요?")
    .waitFor({ timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync("outputs/verification", { recursive: true });
  await page.screenshot({
    path: `outputs/verification/workspace-scale-${scale}.png`,
  });
  if (scale === "1")
    await page.screenshot({ path: "outputs/verification/workspace.png" });
  console.log(
    JSON.stringify(
      await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        devicePixelRatio,
      })),
      (k, v) =>
        ["instructions", "output", "prompt"].includes(k) ? undefined : v,
      2,
    ),
  );
} finally {
  await app.close();
}
