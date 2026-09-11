import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../../electron/store";
import { EMPTY_USAGE, type Run } from "../../src/shared";

test("typing stays responsive with large saved logs and answers", async () => {
  fs.mkdirSync(".runtime-test", { recursive: true });
  const root = fs.mkdtempSync(path.resolve(".runtime-test/large-history-"));
  const project = path.join(root, "큰 기록 프로젝트");
  fs.mkdirSync(project);
  const store = await new Store(path.join(root, "data")).init(
    path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"),
  );
  const projectId = "large-history-project";
  store.put("projects", {
    id: projectId,
    name: "큰 기록 프로젝트",
    path: project,
    raw: "raw",
    wiki: "wiki",
    outputs: "outputs",
    createdAt: Date.now(),
  });
  const log =
    "[TEST TOOL OUTPUT] **detail** [source](https://example.com/source)\n".repeat(
      4000,
    );
  const runs: Run[] = Array.from({ length: 3 }, (_, i) => ({
    id: `large-legacy-${i}`,
    projectId,
    provider: "codex",
    title: "이전 실행",
    prompt: `큰 실행 로그 ${i}`,
    status: "completed",
    mode: "task",
    startedAt: Date.now() + i,
    activity: "완료",
    output: log + `\nLEGACY END ${i}`,
    usage: { ...EMPTY_USAGE },
    files: [],
    references: [],
  }));
  runs.push({
    ...runs[0],
    id: "formatted-answer",
    startedAt: Date.now() + 4,
    prompt: "새 답변",
    output: "",
    answer:
      "## 서식 있는 답변\n\n**읽을 수 있는 답변**\n\n" +
      "- 저장된 답변입니다.\n".repeat(1000),
  });
  runs.push({
    ...runs[0],
    id: "long-answer",
    startedAt: Date.now() + 5,
    prompt: "아주 긴 답변",
    output: "",
    answer: "긴 답변을 빠르게 읽습니다.\n".repeat(4000),
  });
  runs.forEach((r) => store.put("runs", r));
  const env: Record<string, string> = {
    ...process.env,
    WORKROOM_DATA_DIR: path.join(root, "data"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.WORKROOM_PACKAGED_EXE,
    args: [".", "--force-device-scale-factor=1"],
    env,
  });
  try {
    const page = await app.firstWindow();
    const input = page.getByLabel("메시지 입력");
    await expect(input).toBeFocused();
    await expect(page.locator(".chat-turn")).toHaveCount(5);
    await expect(page.locator(".legacy-log-preview")).toHaveCount(3);
    expect(await page.locator(".legacy-log-preview").allTextContents()).toEqual(
      runs.slice(0, 3).map((r) => r.output.slice(-4000)),
    );
    await expect(page.locator(".answer-markdown strong")).toHaveText(
      "읽을 수 있는 답변",
    );
    await expect(page.locator(".plain-answer")).toHaveText(runs[4].answer!);
    // Existing response DOM must remain intact while composing a new question.
    await page.evaluate(() => {
      const marker = document.createElement("span");
      marker.id = "answer-selection-anchor";
      document.querySelector(".answer-markdown strong")!.append(marker);
    });
    const start = Date.now();
    await page.keyboard.type("Keyboard stays responsive");
    await page.keyboard.insertText(" 한글도 입력됩니다");
    await expect(input).toHaveValue(
      "Keyboard stays responsive 한글도 입력됩니다",
    );
    const inputLatency = Date.now() - start;
    expect(inputLatency).toBeLessThan(2000);
    await expect(page.locator("#answer-selection-anchor")).toHaveCount(1);
    // Scrolling, project menus and unrelated state refreshes must also remain usable.
    await page.evaluate(() => window.workroom.invoke("settings.save", {}));
    await expect(input).toBeFocused();
    await expect(page.locator("#answer-selection-anchor")).toHaveCount(1);
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page.getByRole("button", { name: "작업실", exact: true }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(
      "Keyboard stays responsive 한글도 입력됩니다",
    );
    const saved = await page.evaluate(() =>
      window.workroom.invoke<{ runs: Run[] }>("state"),
    );
    for (const run of runs) {
      const restored = saved.runs.find((r) => r.id === run.id)!;
      expect(restored.output).toBe(run.output);
      expect(restored.answer).toBe(run.answer);
    }
    console.log(
      `Large history keyboard latency: ${inputLatency} ms; saved log characters: ${log.length * 3}`,
    );
  } finally {
    await app.close();
  }
});
