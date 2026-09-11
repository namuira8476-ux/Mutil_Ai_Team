import { _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(".runtime-test/live-files"),
  project = path.join(root, "위키 파일 검사");
fs.mkdirSync(path.join(project, "raw"), { recursive: true });
fs.writeFileSync(
  path.join(project, "raw", "source.md"),
  "# 연결 검사 원문\n에이전트 작업실은 로컬 PC에서 CLI와 Wiki를 연결한다. 스킬은 여러 CLI가 함께 쓴다.",
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
try {
  const page = await app.firstWindow();
  await page.getByText("오늘은 어떤 일을 함께 할까요?").waitFor();
  const s = await page.evaluate(() => window.workroom.invoke("state"));
  const run = await page.evaluate(
    (projectId) =>
      window.workroom.invoke("run.start", {
        projectId,
        provider: "codex",
        skillId: "wiki-organize",
        skillVersion: 1,
        prompt:
          "raw/source.md 하나만 읽고 두 문장으로 요약해 outputs/wiki-check.md에 저장하세요. 문서 끝에 원문 상대 경로를 출처로 적으세요. 새 결과 파일 외에는 수정하지 마세요.",
      }),
    s.projects[0].id,
  );
  console.log("Live Wiki run started", run.id);
  const deadline = Date.now() + 180000;
  let finished;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.workroom.invoke("state"));
    finished = state.runs.find((r) => r.id === run.id);
    if (!["running", "queued"].includes(finished.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const file = path.join(project, "outputs", "wiki-check.md");
  const result = {
    status: finished.status,
    error: finished.error,
    exists: fs.existsSync(file),
    content: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null,
    usage: finished.usage,
    files: finished.files,
    log: finished.output,
  };
  fs.writeFileSync(
    "outputs/verification/live-files-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify({ ...result, log: result.log.slice(-1800) }));
  if (finished.status === "running")
    await page.evaluate(
      (runId) => window.workroom.invoke("run.cancel", { runId }),
      run.id,
    );
} finally {
  await app.close();
}
