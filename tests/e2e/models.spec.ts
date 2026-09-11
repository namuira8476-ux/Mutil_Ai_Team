import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Store } from "../../electron/store";
import type { State, Run } from "../../src/shared";

test("model selection survives restart, reaches tasks and PTYs, and preserves keyboard focus", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workroom-models-e2e-"));
  const project = path.join(root, "모델 선택 테스트");
  fs.mkdirSync(project);
  const paths: Record<string, string> = {};
  for (const [id, entry] of Object.entries({
    codex: "@openai/codex/bin/codex.js",
    claude: "@anthropic-ai/claude-code/cli.js",
    gemini: "@google/gemini-cli/dist/index.js",
  })) {
    const file = path.join(root, "bin/node_modules", entry);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync("tests/fixture-cli.cjs", file);
    paths[id] = path.join(root, "bin", id + ".cmd");
    fs.writeFileSync(paths[id], "rem TEST FIXTURE");
  }
  const store = await new Store(path.join(root, "data")).init(
    path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"),
  );
  store.put("settings", {
    id: "app",
    paths,
    background: false,
    reduceMotion: true,
  });
  store.db.close();
  const env: Record<string, string> = {
    ...process.env,
    WORKROOM_DATA_DIR: path.join(root, "data"),
    WORKROOM_TEST_PROJECT: project,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({
      executablePath: process.env.WORKROOM_PACKAGED_EXE,
      args: [".", "--force-device-scale-factor=1"],
      env,
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const state = () =>
      page.evaluate(() => window.workroom.invoke<State>("state"));
    const invoke = <T>(method: string, args?: unknown) =>
      page.evaluate(
        ({ method, args }) => window.workroom.invoke<T>(method, args),
        { method, args },
      );
    await page.getByLabel("이번 요청 모델").waitFor();
    await expect
      .poll(
        async () =>
          (await state()).providers.find((p) => p.id === "codex")?.models
            ?.length,
      )
      .toBe(2);
    await page
      .getByLabel("Codex 기본 모델", { exact: true })
      .selectOption("test-codex-a");
    await page
      .getByLabel("Claude 기본 모델", { exact: true })
      .selectOption("sonnet");
    await expect
      .poll(async () => (await state()).settings.models?.codex)
      .toBe("test-codex-a");
    await page.getByLabel("요청할 CLI").selectOption("codex");
    await page.getByLabel("팀에게 맡기기").uncheck();
    await page
      .getByLabel("이번 요청 모델", { exact: true })
      .selectOption("test-codex-b");
    const input = page.getByLabel("메시지 입력");
    await input.click();
    await page.keyboard.type("[model-check] Hello ");
    await page.keyboard.insertText("한글 모델 선택");
    await expect(input).toHaveValue("[model-check] Hello 한글 모델 선택");
    await input.press("Enter");
    await expect(page.locator(".response-header .status").last()).toHaveText(
      "완료",
    );
    await expect(page.locator(".model-badge").last()).toHaveText(
      "test-codex-b",
    );
    expect(JSON.parse((await state()).runs[0].answer!).model).toBe(
      "test-codex-b",
    );
    await expect(input).toBeFocused();
    await page.keyboard.insertText("계속 입력할 수 있어요");
    await expect(input).toHaveValue("계속 입력할 수 있어요");
    await page
      .getByLabel("이번 요청 모델", { exact: true })
      .selectOption("__cli__");
    await input.fill("[model-check] CLI 기본값");
    await input.press("Enter");
    await expect(page.locator(".response-header .status").last()).toHaveText(
      "완료",
    );
    expect(JSON.parse((await state()).runs[0].answer!).model).toBe(
      "fixture-cli-default",
    );
    expect((await state()).settings.models?.codex).toBe("test-codex-a");

    await page.getByRole("button", { name: "자동화", exact: true }).click();
    await page.getByLabel("자동화 이름").fill("모델별 카드뉴스 제작");
    await page
      .getByLabel("1단계 담당 CLI", { exact: true })
      .first()
      .selectOption("codex");
    await page
      .getByLabel("1단계 모델", { exact: true })
      .selectOption("test-codex-b");
    await page
      .getByLabel("1단계 담당 CLI", { exact: true })
      .first()
      .selectOption("claude");
    await expect(page.getByLabel("1단계 모델", { exact: true })).toHaveValue(
      "__inherit__",
    );
    await page.getByLabel("1단계 모델", { exact: true }).selectOption("haiku");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect
      .poll(async () => (await state()).automations[0]?.steps[0].model)
      .toBe("haiku");
    fs.mkdirSync("outputs/verification", { recursive: true });
    await page.screenshot({
      path: "outputs/verification/fixture-model-automation.png",
    });

    await page.getByRole("button", { name: "작업실", exact: true }).click();
    await page.getByLabel("요청할 CLI").selectOption("gemini");
    await page
      .getByLabel("이번 요청 모델", { exact: true })
      .selectOption("__custom__");
    await page
      .getByLabel("이번 요청 모델 ID", { exact: true })
      .fill("custom-gemini-model");
    await page.locator(".composer .model-custom button").click();
    await input.fill("[model-check] 직접 모델 선택");
    await input.press("Enter");
    await expect(page.locator(".response-header .status").last()).toHaveText(
      "완료",
    );
    expect(JSON.parse((await state()).runs[0].answer!).model).toBe(
      "custom-gemini-model",
    );
    const projectId = (await state()).projects[0].id;
    const terminal = await invoke<Run>("terminal.start", {
      projectId,
      provider: "codex",
    });
    await expect
      .poll(
        async () =>
          (await state()).runs.find((r) => r.id === terminal.id)?.output,
      )
      .toContain("MODEL=test-codex-a");
    await expect(
      invoke("terminal.start", {
        projectId,
        provider: "codex",
        model: "different-model",
      }),
    ).rejects.toThrow("다른 모델");
    await invoke("run.cancel", { runId: terminal.id });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    expect(
      await page.evaluate(() => ({
        body: document.documentElement.scrollWidth > innerWidth,
        main:
          document.querySelector(".chat-main")!.scrollWidth >
          document.querySelector(".chat-main")!.clientWidth,
      })),
    ).toEqual({ body: false, main: false });
    await expect(input).toBeVisible();
    await page.screenshot({
      path: "outputs/verification/fixture-model-selection.png",
    });
    expect(errors).toEqual([]);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByLabel("이번 요청 모델").waitFor();
    expect((await state()).settings.models).toMatchObject({
      codex: "test-codex-a",
      claude: "sonnet",
    });
    expect((await state()).automations[0].steps[0].model).toBe("haiku");
    expect(
      (await state()).runs.find((r) => r.prompt.includes("직접 모델 선택"))
        ?.model,
    ).toBe("custom-gemini-model");
    await expect(
      page.getByLabel("이번 요청 모델", { exact: true }),
    ).toHaveValue("__inherit__");
  } finally {
    await app.close();
  }
});
