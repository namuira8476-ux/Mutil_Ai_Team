import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
test("centered streaming conversation, right agents, follow-up, project isolation and restart", async () => {
  fs.mkdirSync(".runtime-test", { recursive: true });
  const root = fs.mkdtempSync(path.resolve(".runtime-test/chat-e2e-"));
  const project = path.join(root, "대화 테스트 프로젝트");
  fs.mkdirSync(project);
  const paths: Record<string, string> = {};
  for (const [id, entry] of Object.entries({
    codex: "@openai/codex/bin/codex.js",
    claude: "@anthropic-ai/claude-code/cli.js",
    gemini: "@google/gemini-cli/bundle/gemini.js",
  })) {
    const file = path.join(root, "bin", "node_modules", entry);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync("tests/fixture-cli.cjs", file);
    paths[id] = path.join(root, "bin", id + ".cmd");
    fs.writeFileSync(paths[id], "rem TEST FIXTURE");
  }
  fs.writeFileSync(
    path.join(root, "bin/node_modules/@google/gemini-cli/package.json"),
    JSON.stringify({ bin: { gemini: "bundle/gemini.js" } }),
  );
  const env: Record<string, string> = {
    ...process.env,
    WORKROOM_DATA_DIR: path.join(root, "data"),
    WORKROOM_TEST_PROJECT: project,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app = await electron.launch({
    executablePath: process.env.WORKROOM_PACKAGED_EXE,
    args: [".", "--force-device-scale-factor=1"],
    env,
  });
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.getByRole("heading", { name: "대화", exact: true }).waitFor();
    const input = page.getByLabel("메시지 입력");
    // Use keyboard events rather than fill(): focus is part of the behavior.
    await expect(input).toBeFocused();
    await page.keyboard.type("Hello ");
    await page.keyboard.insertText("한글 입력");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.insertText("두 번째 줄");
    await expect(input).toHaveValue("Hello 한글 입력\n두 번째 줄");
    await expect(page.locator(".chat-turn")).toHaveCount(0);
    await page.getByRole("button", { name: "설정", exact: true }).click();
    const pathInput = page.getByLabel("Codex 실행 경로");
    await pathInput.click();
    await page.evaluate(() => window.workroom.invoke("settings.save", {}));
    await expect(pathInput).toBeFocused();
    await page.getByRole("button", { name: "작업실", exact: true }).click();
    await expect(input).toBeFocused();
    await page.keyboard.type("!");
    await expect(input).toHaveValue("Hello 한글 입력\n두 번째 줄!");
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await app.evaluate(({ app, BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].minimize();
      app.emit("second-instance", {}, [], "");
    });
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows()[0];
          return (
            !win.isMinimized() && win.isFocused() && win.webContents.isFocused()
          );
        }),
      )
      .toBe(true);
    await expect(input).toBeFocused();
    await page.evaluate(async (paths) => {
      await window.workroom.invoke("settings.save", { paths });
      await window.workroom.invoke("providers.refresh");
    }, paths);
    await page.getByLabel("요청할 CLI").selectOption("gemini");
    await page.getByLabel("요청할 CLI").focus();
    await page.locator(".composer").click({ position: { x: 8, y: 8 } });
    await expect(input).toBeFocused();
    await page.keyboard.insertText(
      "질문을 중앙에서 확인하고 싶어요 [chat-fixture]",
    );
    await input.dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      isComposing: true,
    });
    expect(await page.locator(".chat-turn").count()).toBe(0);
    await input.press("Enter");
    await expect(page.locator(".question-bubble")).toContainText(
      "질문을 중앙에서",
    );
    await expect(page.locator(".answer-markdown")).toContainText("중앙에서");
    await expect(page.locator(".response-header .status")).toHaveText(
      "답변 작성 중",
    );
    await expect(page.locator(".answer-markdown strong")).toHaveText(
      "질문과 답변",
    );
    await page.keyboard.insertText("답변 중에도 입력할 수 있어요");
    await expect(page.locator(".response-header .status")).toHaveText("완료");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("답변 중에도 입력할 수 있어요");
    await expect(page.locator(".answer-markdown pre")).toContainText(
      "console.log",
    );
    await expect(page.locator(".answer-markdown")).not.toContainText(
      "INTERNAL_LOG_ONLY",
    );
    await expect(page.locator(".answer-markdown")).not.toContainText(
      "TEST_STDERR_ONLY",
    );
    expect(await page.locator(".terminal-pane").count()).toBe(0);
    const chat = await page.locator(".conversation").boundingBox();
    const agents = await page
      .getByLabel("에이전트 작업실", { exact: true })
      .boundingBox();
    expect(agents!.x).toBeGreaterThanOrEqual(chat!.x + chat!.width);
    await expect(
      page.getByRole("button", { name: "Claude 모니터 열기" }),
    ).toBeVisible();
    fs.mkdirSync("outputs/verification", { recursive: true });
    await page.screenshot({
      path: "outputs/verification/fixture-conversation.png",
    });
    await input.fill("이어서 한 줄로 설명해줘");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(input).toBeFocused();
    await expect(page.locator(".chat-turn")).toHaveCount(2);
    await expect(page.locator(".response-header .status").last()).toHaveText(
      "완료",
    );
    const state = await page.evaluate(() =>
      window.workroom.invoke<any>("state"),
    );
    const first = state.runs.find((r: any) =>
      r.prompt.startsWith("질문을 중앙"),
    );
    const followup = state.runs.find(
      (r: any) => r.prompt === "이어서 한 줄로 설명해줘",
    );
    expect(followup.replyTo).toBe(first.id);
    await page
      .locator(".response-actions")
      .first()
      .getByRole("button", { name: "실행 로그", exact: true })
      .click();
    await expect(page.locator(".terminal-pane")).toBeVisible();
    await page.getByRole("button", { name: "대화로 돌아가기" }).click();
    await expect(page.locator(".chat-turn")).toHaveCount(2);
    await expect(input).toBeFocused();
    await page.keyboard.insertText("돌아와서 입력");
    await expect(input).toHaveValue("돌아와서 입력");
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 740),
    );
    const overflow = await page.evaluate(() => ({
      body: document.documentElement.scrollWidth > innerWidth,
      main:
        document.querySelector(".chat-main")!.scrollWidth >
        document.querySelector(".chat-main")!.clientWidth,
    }));
    expect(overflow).toEqual({ body: false, main: false });
    await expect(page.getByLabel("메시지 입력")).toBeVisible();
    await page.screenshot({
      path: "outputs/verification/fixture-conversation-1100.png",
    });
    const otherFolder = path.join(root, "별도 프로젝트");
    fs.mkdirSync(otherFolder);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [folder],
      })) as typeof dialog.showOpenDialog;
    }, otherFolder);
    await page.getByLabel("프로젝트 추가", { exact: true }).click();
    await expect(page.locator(".chat-turn")).toHaveCount(0);
    await expect(input).toBeFocused();
    await expect(
      page.getByText("오늘은 어떤 일을 함께 할까요?", { exact: true }),
    ).toBeVisible();
    await page
      .locator(".project-list")
      .getByRole("button", { name: "대화 테스트 프로젝트", exact: true })
      .click();
    await expect(page.locator(".chat-turn")).toHaveCount(2);
    expect(errors).toEqual([]);
    await app.close();
    app = await electron.launch({
      executablePath: process.env.WORKROOM_PACKAGED_EXE,
      args: [".", "--force-device-scale-factor=1"],
      env,
    });
    page = await app.firstWindow();
    await expect(page.getByLabel("메시지 입력")).toBeFocused();
    await page
      .locator(".project-list")
      .getByRole("button", { name: "대화 테스트 프로젝트", exact: true })
      .click();
    await expect(page.locator(".chat-turn")).toHaveCount(2);
    await expect(page.locator(".answer-markdown").first()).toContainText(
      "질문과 답변",
    );
    await expect(
      page.getByRole("button", { name: "Gemini 모니터 열기" }),
    ).toBeVisible();
    await page.getByLabel("요청할 CLI").selectOption("gemini");
    await page
      .getByLabel("메시지 입력")
      .fill("[agy-fixture:SUCCESS] Antigravity 응답 확인");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.locator(".chat-turn")).toHaveCount(3);
    await expect(page.locator(".response-header .status").last()).toHaveText(
      "완료",
    );
    await expect(page.locator(".answer-markdown").last()).toHaveText(
      "Antigravity 최종 답변 · TEST FIXTURE",
    );
    const agyRun = await page.evaluate(async () => {
      const state = await window.workroom.invoke<any>("state");
      return state.runs.find((run: any) =>
        run.prompt.startsWith("[agy-fixture:SUCCESS]"),
      );
    });
    expect(agyRun.usage).toMatchObject({
      input: 100,
      output: 20,
      cached: 30,
      total: 120,
    });
    expect(agyRun.answer).not.toContain("AGY_DIAGNOSTIC_ONLY");
    await page
      .getByLabel("메시지 입력")
      .fill("[agy-fixture:SOFT_DENIED] 권한 거부 표시 확인");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.locator(".chat-turn")).toHaveCount(4);
    await expect(
      page.locator(".response-header .status").last(),
    ).not.toHaveText("완료");
    await expect(page.locator(".chat-turn").last()).toContainText(
      "read_file 권한이 필요합니다",
    );
    await expect(page.locator(".answer-markdown").last()).toHaveText(
      "답변 작성 중",
    );
  } finally {
    await app.close();
  }
});
