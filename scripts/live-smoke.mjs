import { _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(".runtime-test/live");
const project = path.join(root, "한글 테스트 프로젝트");
fs.mkdirSync(path.join(project, "raw"), { recursive: true });
fs.writeFileSync(
  path.join(project, "raw", "입력.txt"),
  "이 문서는 에이전트 작업실 연결 테스트용입니다. 확인 문구: WORKROOM_READ_OK.",
);
const env = {
  ...process.env,
  WORKROOM_DATA_DIR: path.join(root, "data"),
  WORKROOM_TEST_PROJECT: project,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  args: [".", "--force-device-scale-factor=1"],
  env,
});
const results = {};
try {
  const page = await app.firstWindow();
  await page.getByText("오늘은 어떤 일을 함께 할까요?").waitFor();
  const state = await page.evaluate(() => window.workroom.invoke("state"));
  const p = state.projects[0];
  const run = await page.evaluate(
    async (projectId) =>
      window.workroom.invoke("run.start", {
        projectId,
        provider: "codex",
        prompt:
          "연결 검사입니다. 도구 호출이나 파일 수정 없이 WORKROOM_CODEX_OK 한 줄만 응답하세요.",
        team: false,
      }),
    p.id,
  );
  console.log("Live Codex run started", run.id);
  const deadline = Date.now() + 180000;
  let finished;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.workroom.invoke("state"));
    finished = state.runs.find((r) => r.id === run.id);
    if (finished.status !== "running") break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  results.run = finished;
  console.log(
    JSON.stringify({
      status: finished.status,
      usage: finished.usage,
      output: finished.output.slice(-3500),
      error: finished.error,
    }),
  );
  if (finished.status === "running")
    await page.evaluate(
      (id) => window.workroom.invoke("run.cancel", { runId: id }),
      run.id,
    );
  await page.getByRole("button", { name: "사용량", exact: true }).click();
  await page.screenshot({ path: "outputs/verification/live-usage.png" });
  results.quota = (
    await page.evaluate(() => window.workroom.invoke("providers.quota"))
  ).map((p) => ({ id: p.id, quota: p.quota }));
  fs.writeFileSync(
    "outputs/verification/live-result.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  await app.close();
}
