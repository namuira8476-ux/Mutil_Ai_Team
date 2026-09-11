import { _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(".runtime-test/live-team"),
  project = path.join(root, "연결 검증");
fs.mkdirSync(project, { recursive: true });
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
  const parent = await page.evaluate(
    (projectId) =>
      window.workroom.invoke("run.start", {
        projectId,
        provider: "codex",
        team: true,
        prompt:
          '앱의 위임 연결 검사입니다. 반드시 workroom MCP run_skill을 한 번 사용하여 provider codex, skillId result-review, task "연결 검사이므로 파일 읽기·수정·도구 호출 없이 WORKROOM_CHILD_OK 한 줄만 응답하세요. 이번 요청이 스킬 기본 작업보다 우선합니다."로 실행하세요. get_run으로 완료를 확인한 다음 WORKROOM_TEAM_OK 한 줄로 마치세요. 다른 도구나 파일 작업은 하지 마세요.',
      }),
    s.projects[0].id,
  );
  console.log("Live delegation started", parent.id);
  let captured = false;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.workroom.invoke("state"));
    const p = state.runs.find((r) => r.id === parent.id);
    const children = state.runs.filter((r) => r.parentId === parent.id);
    if (!captured && children.some((r) => r.status === "running")) {
      await page.screenshot({
        path: "outputs/verification/live-child-working.png",
      });
      captured = true;
      console.log("Actual child process observed", children[0].id);
    }
    if (!["running", "queued"].includes(p.status)) {
      fs.writeFileSync(
        "outputs/verification/live-team-result.json",
        JSON.stringify({ parent: p, children }, null, 2),
      );
      console.log(
        JSON.stringify({
          status: p.status,
          error: p.error,
          output: p.output.slice(-2500),
          children: children.map((c) => ({
            id: c.id,
            status: c.status,
            usage: c.usage,
            output: c.output.slice(-1200),
          })),
        }),
      );
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const all = await page.evaluate(() => window.workroom.invoke("state"));
  for (const r of all.runs.filter((r) =>
    ["running", "queued"].includes(r.status),
  ))
    await page.evaluate(
      (runId) => window.workroom.invoke("run.cancel", { runId }),
      r.id,
    );
  await page.getByRole("button", { name: "실행 기록", exact: false }).click();
  await page.screenshot({ path: "outputs/verification/live-team-history.png" });
} finally {
  await app.close();
}
