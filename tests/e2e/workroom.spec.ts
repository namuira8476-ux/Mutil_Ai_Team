import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type { State, Run, Automation, Skill } from "../../src/shared";
let app: ElectronApplication, page: Page, root: string, project: string;
const getState = () =>
  page.evaluate(() => window.workroom.invoke<State>("state"));
const invoke = <T = any>(method: string, payload?: unknown) =>
  page.evaluate(
    ({ method, payload }) => window.workroom.invoke(method, payload),
    { method, payload },
  ) as Promise<T>;
test.beforeAll(async () => {
  fs.mkdirSync(".runtime-test", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".runtime-test/e2e-"));
  project = path.join(root, "한글 프로젝트");
  fs.mkdirSync(path.join(project, "wiki"), { recursive: true });
  fs.mkdirSync(path.join(project, "raw"), { recursive: true });
  fs.writeFileSync(
    path.join(project, "wiki", "노트.md"),
    "# 연결된 Wiki\n\n한글 자료와 [원문](../raw/source.md)",
  );
  const env: Record<string, string> = {
    ...process.env,
    WORKROOM_DATA_DIR: path.join(root, "data"),
    WORKROOM_TEST_PROJECT: project,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.env.WORKROOM_PACKAGED_EXE,
    args: [".", "--force-device-scale-factor=1"],
    env,
  });
  app
    .process()
    .stderr!.on("data", (b) =>
      fs.appendFileSync(path.join(root, "electron-errors.log"), b),
    );
  page = await app.firstWindow();
  await expect(
    page.getByRole("heading", { name: "대화", exact: true }),
  ).toBeVisible();
  const paths: Record<string, string> = {};
  for (const [id, script] of Object.entries({
    codex: "@openai/codex/bin/codex.js",
    claude: "@anthropic-ai/claude-code/cli.js",
    gemini: "@google/gemini-cli/dist/index.js",
  })) {
    const target = path.join(root, "fixture-bin", "node_modules", script);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync("tests/fixture-cli.cjs", target);
    paths[id] = path.join(root, "fixture-bin", id + ".cmd");
    fs.writeFileSync(paths[id], "@echo off\r\nrem TEST FIXTURE\r\n");
  }
  await invoke("settings.save", { paths });
  await invoke("providers.refresh");
  fs.mkdirSync("outputs/verification", { recursive: true });
});
test.afterAll(async () => {
  if (app) {
    const timer = setTimeout(() => {
      console.error("TEST CLEANUP: forced termination after 10 seconds");
      app.process().kill();
    }, 10000);
    try {
      await app.close();
    } finally {
      clearTimeout(timer);
    }
  }
});
test("shared skills, serialized children, Wiki, automation, terminal ownership and persistence", async () => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const initial = await getState();
  expect(initial.providers.every((p) => p.available)).toBe(true);
  const projectId = initial.projects[0].id;
  await page.getByRole("button", { name: "스킬 만들기", exact: false }).click();
  await page.getByLabel("스킬 이름").fill("테스트 정리");
  await page
    .getByLabel("스킬 설명")
    .fill("테스트 자료를 확인할 때 사용합니다.");
  await page
    .getByLabel("스킬 지침")
    .fill("지정된 원문을 확인하고 요약을 반환하세요. [slow]");
  await page.getByRole("button", { name: "공용 스킬 저장" }).click();
  await expect(page.getByRole("status")).toContainText("공용 보관함에 저장");
  const skill = (await getState()).skills.find(
    (s) => s.name === "테스트 정리",
  )!;
  const first = await invoke<Run>("run.start", {
    projectId,
    provider: "claude",
    skillId: skill.id,
    skillVersion: 1,
    prompt: "[slow] 첫 실행",
  });
  const second = await invoke<Run>("run.start", {
    projectId,
    provider: "gemini",
    skillId: skill.id,
    skillVersion: 1,
    prompt: "두 번째 실행",
  });
  expect(second.status).toBe("queued");
  await expect(page.locator(".family.provider-claude .child-desk")).toHaveCount(
    1,
  );
  await page.screenshot({
    path: "outputs/verification/fixture-child-working.png",
  });
  await expect
    .poll(
      async () =>
        (await getState()).runs.find((r) => r.id === second.id)?.status,
    )
    .toBe("completed");
  const finished = (await getState()).runs;
  expect(finished.find((r) => r.id === first.id)?.usage.total).toBe(150);
  expect(finished.find((r) => r.id === second.id)?.usage.total).toBe(120);
  const edited = await invoke<Skill>("skill.save", {
    ...skill,
    instructions: skill.instructions + " 새 버전",
  });
  expect(edited.version).toBe(2);
  expect(
    (await getState()).runs.find((r) => r.id === first.id)?.skillVersion,
  ).toBe(1);
  await page.getByRole("button", { name: "Wiki", exact: true }).click();
  await page.getByRole("button", { name: "노트.md" }).click();
  await expect(page.locator(".file-content")).toContainText("연결된 Wiki");
  await page.screenshot({ path: "outputs/verification/wiki.png" });
  await page.getByRole("button", { name: "자동화", exact: true }).click();
  await page.getByLabel("자동화 이름").fill("시험 자동화");
  await page.getByRole("button", { name: "예상 동작 보기" }).click();
  await expect(page.getByText("모델 호출 없음")).toBeVisible();
  expect((await getState()).runs.length).toBe(2);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect.poll(async () => (await getState()).automations.length).toBe(1);
  let auto = (await getState()).automations[0];
  expect(auto.enabled).toBe(false);
  await page.getByRole("button", { name: "시험 실행", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await getState()).runs.filter(
          (r) => r.automationId === auto.id && r.status === "completed",
        ).length,
    )
    .toBe(1);
  await page.screenshot({
    path: "outputs/verification/fixture-automation.png",
  });
  const before = (await getState()).runs.length;
  await invoke("automation.run", { id: auto.id, test: false });
  await invoke("automation.run", { id: auto.id, test: false });
  await expect
    .poll(
      async () =>
        (await getState()).runs.filter(
          (r) => r.automationId === auto.id && r.status === "completed",
        ).length,
    )
    .toBe(2);
  // A second invocation while busy coalesces only when enabled; this disabled rule does not run again.
  expect((await getState()).runs.length).toBe(before + 1);
  auto = await invoke<Automation>("automation.save", {
    ...auto,
    trigger: "file",
    input: "raw",
    output: "wiki",
    enabled: true,
  });
  await new Promise((r) => setTimeout(r, 400));
  fs.writeFileSync(
    path.join(project, "raw", "source.md"),
    "# 변경 이벤트\n원문",
  );
  await expect
    .poll(
      async () =>
        (await getState()).runs.filter((r) => r.automationId === auto.id)
          .length,
      { timeout: 12000 },
    )
    .toBe(3);
  await expect
    .poll(
      async () =>
        (await getState()).runs.filter(
          (r) => r.status === "running" || r.status === "queued",
        ).length,
    )
    .toBe(0);
  await invoke("automation.save", { ...auto, enabled: false });
  await expect(
    invoke("automation.save", { ...auto, output: "raw/generated" }),
  ).rejects.toThrow("결과 폴더");
  await expect(
    invoke("project.read", { projectId, path: "../outside.md" }),
  ).rejects.toThrow("폴더 밖");
  const term = await invoke<Run>("terminal.start", {
    projectId,
    provider: "gemini",
  });
  const again = await invoke<Run>("terminal.start", {
    projectId,
    provider: "gemini",
  });
  expect(term.id).toBe(again.id);
  await page.getByRole("button", { name: "작업실", exact: true }).click();
  await page.getByRole("button", { name: "Gemini 모니터 열기" }).click();
  await page.getByRole("button", { name: "입력 권한 가져오기" }).click();
  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.insertText("한글 입력 확인");
  await page.keyboard.press("Enter");
  await expect
    .poll(
      async () => (await getState()).runs.find((r) => r.id === term.id)?.output,
    )
    .toContain("입력됨: 한글 입력 확인");
  const windowPromise = app.waitForEvent("window");
  await page.getByRole("button", { name: "새 창으로" }).click();
  const popout = await windowPromise;
  await popout.getByRole("button", { name: "이 창에서 입력" }).waitFor();
  await expect(
    invoke("terminal.input", { runId: term.id, data: "bad" }),
  ).rejects.toThrow("입력 권한");
  await popout.evaluate(
    (id) =>
      window.workroom.invoke("terminal.resize", {
        runId: id,
        cols: 80,
        rows: 20,
      }),
    term.id,
  );
  await popout.screenshot({
    path: "outputs/verification/fixture-terminal.png",
  });
  await popout.close();
  await page.getByRole("button", { name: "입력 권한 가져오기" }).click();
  await page.getByRole("button", { name: "중지", exact: true }).click();
  await expect
    .poll(
      async () => (await getState()).runs.find((r) => r.id === term.id)?.status,
    )
    .toBe("cancelled");
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "작업실", exact: true }).click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 800),
  );
  await page.screenshot({ path: "outputs/verification/workspace-1280.png" });
  await app.close();
  const env: Record<string, string> = {
    ...process.env,
    WORKROOM_DATA_DIR: path.join(root, "data"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.env.WORKROOM_PACKAGED_EXE,
    args: [".", "--force-device-scale-factor=1"],
    env,
  });
  app
    .process()
    .stderr!.on("data", (b) =>
      fs.appendFileSync(path.join(root, "electron-errors.log"), b),
    );
  page = await app.firstWindow();
  await expect(
    page.getByRole("heading", { name: "대화", exact: true }),
  ).toBeVisible();
  const restored = await getState();
  expect(restored.skills.find((s) => s.id === skill.id)?.version).toBe(2);
  expect(restored.automations.find((a) => a.id === auto.id)?.enabled).toBe(
    false,
  );
  expect(restored.runs.find((r) => r.id === term.id)?.status).toBe("cancelled");
});
