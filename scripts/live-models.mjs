// Opt-in smoke test: uses the installed CLI accounts for three short real requests.
// The temporary profile never modifies the user's workroom projects or model defaults.
import { _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "workroom-live-models-"));
const project = path.join(root, "모델 연결 확인");
fs.mkdirSync(project);
const env = {
  ...process.env,
  WORKROOM_DATA_DIR: path.join(root, "data"),
  WORKROOM_TEST_PROJECT: project,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: process.env.WORKROOM_PACKAGED_EXE,
  args: [".", "--force-device-scale-factor=1"],
  env,
});
const report = {
  checkedAt: new Date().toISOString(),
  version: "",
  catalogs: [],
  runs: [],
};
const destination = path.resolve(
  "outputs/verification/model-selection-live.json",
);
try {
  report.version = await app.evaluate(({ app }) => app.getVersion());
  const page = await app.firstWindow();
  await page.getByLabel("이번 요청 모델", { exact: true }).waitFor();
  const providers = await page.evaluate(() =>
    window.workroom.invoke("models.refresh", {}),
  );
  report.catalogs = providers.map((p) => ({
    provider: p.id,
    cliVersion: p.version,
    source: p.modelsSource,
    models: p.models,
    error: p.modelsError,
  }));
  console.log(JSON.stringify({ catalogs: report.catalogs }));
  const state = await page.evaluate(() => window.workroom.invoke("state"));
  const projectId = state.projects[0].id;
  for (const id of ["codex", "claude", "gemini"]) {
    const provider = providers.find((p) => p.id === id);
    const chosen =
      id === "claude"
        ? provider.models.find((m) => m.id === "sonnet")
        : id === "gemini"
          ? provider.models.find((m) => /flash-low$/.test(m.id)) ||
            provider.models[0]
          : provider.models.find((m) => m.id === "gpt-6-astra") ||
            provider.models[0];
    if (!chosen) throw Error(`${id}: model catalog empty`);
    await page.getByLabel("요청할 CLI").selectOption(id);
    if (id === "codex") await page.getByLabel("팀에게 맡기기").uncheck();
    await page
      .getByLabel("이번 요청 모델", { exact: true })
      .selectOption(chosen.id);
    const input = page.getByLabel("메시지 입력");
    await input.click();
    await page.keyboard.insertText(
      `모델 선택 연결 검사입니다. 도구 사용이나 파일 수정 없이 MODEL_SELECTION_${id.toUpperCase()}_OK 한 줄만 답하세요.`,
    );
    await input.press("Enter");
    let run;
    const deadline = Date.now() + 180000;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      run = (
        await page.evaluate(() => window.workroom.invoke("state"))
      ).runs.find((r) => r.provider === id && r.projectId === projectId);
      if (run && !["running", "queued"].includes(run.status)) break;
    } while (Date.now() < deadline);
    if (run && ["running", "queued"].includes(run.status)) {
      await page.evaluate(
        (runId) => window.workroom.invoke("run.cancel", { runId }),
        run.id,
      );
      throw Error(`${id}: timed out`);
    }
    const result = {
      provider: id,
      requestedModel: run?.model,
      reportedModel: run?.reportedModel,
      status: run?.status,
      answer: run?.answer,
      error: run?.error,
      usage: run?.usage,
    };
    report.runs.push(result);
    console.log(JSON.stringify(result));
    if (
      run?.status !== "completed" ||
      !run.answer?.includes(`MODEL_SELECTION_${id.toUpperCase()}_OK`) ||
      run.model !== chosen.id
    )
      throw Error(`${id}: live model check failed`);
    await page
      .getByLabel(
        `${id === "gemini" ? "Gemini" : id === "claude" ? "Claude" : "Codex"} 기본 모델`,
        { exact: true },
      )
      .selectOption(chosen.id);
  }
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
  );
  await page.getByLabel("요청할 CLI").selectOption("codex");
  await page
    .getByLabel("이번 요청 모델", { exact: true })
    .selectOption("__inherit__");
  await page.screenshot({
    path: "outputs/verification/model-selection-live.png",
  });
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.screenshot({
    path: "outputs/verification/model-settings-live.png",
  });
} finally {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(report, null, 2));
  await app.close();
}
