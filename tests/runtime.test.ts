import { beforeEach, afterEach, describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Runtime } from "../electron/runtime";
import { Store } from "../electron/store";
import { assertNoWatchCycle } from "../electron/domain";
import { EMPTY_USAGE, type Automation, type Run } from "../src/shared";
let runtime: Runtime, root: string;
beforeEach(async () => {
  // Databases under OneDrive can be locked by its sync process during rename.
  root = fs.mkdtempSync(path.join(os.tmpdir(), "workroom-unit-"));
  const paths: Record<string, string> = {};
  for (const [id, script] of Object.entries({
    codex: "@openai/codex/bin/codex.js",
    claude: "@anthropic-ai/claude-code/cli.js",
    gemini: "@google/gemini-cli/dist/index.js",
  })) {
    const target = path.join(root, "bin", "node_modules", script);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync("tests/fixture-cli.cjs", target);
    paths[id] = path.join(root, "bin", id + ".cmd");
    fs.writeFileSync(paths[id], "rem Test fixture");
  }
  const store = await new Store(path.join(root, "data")).init(
    path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"),
  );
  store.put("settings", {
    id: "app",
    paths,
    background: false,
    reduceMotion: false,
  });
  runtime = await new Runtime(store).init();
});
afterEach(async () => {
  await runtime?.dispose();
});
const project = () => {
  const folder = path.join(root, "한글 폴더");
  fs.mkdirSync(folder, { recursive: true });
  return runtime.addProject(folder);
};
const rule = (projectId: string): Automation => ({
  id: "",
  projectId,
  name: "동시 실행 검사",
  enabled: false,
  trigger: "schedule",
  time: "09:00",
  timezone: "Asia/Seoul",
  weekdays: [],
  input: "raw",
  output: "wiki",
  steps: [{ provider: "gemini", skillId: "wiki-organize", skillVersion: 1 }],
  createdAt: Date.now(),
});
describe("managed runtime", () => {
  it("records the time of CLI output separately from queue time", async () => {
    const p = project();
    const run = await runtime.startTask({
      projectId: p.id,
      provider: "gemini",
      prompt: "[slow]",
    });
    const result = await runtime.waitRun(run.id);
    expect(result.executionStartedAt).toBeGreaterThanOrEqual(result.startedAt);
    expect(result.lastOutputAt).toBeGreaterThanOrEqual(
      result.executionStartedAt!,
    );
    expect(result.status).toBe("completed");
  });
  it("runs three independent workers concurrently and keeps the fourth queued", async () => {
    const p = project(),
      tasks = [];
    for (let i = 0; i < 4; i++)
      tasks.push(
        await runtime.startTask({
          projectId: p.id,
          provider: "gemini",
          prompt: "[slow]",
          resources: { reads: [], writes: [] },
        }),
      );
    expect(tasks.map((r) => r.status)).toEqual([
      "running",
      "running",
      "running",
      "queued",
    ]);
    await Promise.all(tasks.map((r) => runtime.waitRun(r.id)));
    expect(tasks.every((r) => r.status === "completed")).toBe(true);
  }, 15000);
  it("serializes overlapping reads/writes, waits for prerequisites and cancels dependents on failure", async () => {
    const p = project();
    const writer = await runtime.startTask({
      projectId: p.id,
      provider: "gemini",
      prompt: "[slow]",
      resources: { reads: [], writes: ["outputs/a"] },
    });
    const reader = await runtime.startTask({
      projectId: p.id,
      provider: "claude",
      prompt: "[slow]",
      resources: { reads: ["outputs/a/report.md"], writes: [] },
    });
    const independent = await runtime.startTask({
      projectId: p.id,
      provider: "codex",
      prompt: "[slow]",
      resources: { reads: [], writes: ["outputs/b"] },
    });
    const dependent = await runtime.startTask({
      projectId: p.id,
      provider: "gemini",
      prompt: "[slow]",
      resources: { reads: [], writes: [] },
      dependsOn: [writer.id],
    });
    expect(reader.status).toBe("queued");
    expect(independent.status).toBe("running");
    expect(dependent.status).toBe("queued");
    await runtime.cancel(writer.id);
    await runtime.waitRun(dependent.id);
    expect(dependent.status).toBe("cancelled");
    await Promise.all([
      runtime.waitRun(reader.id),
      runtime.waitRun(independent.id),
    ]);
    await expect(
      runtime.startTask({
        projectId: p.id,
        provider: "gemini",
        prompt: "x",
        resources: { reads: [], writes: ["../outside"] },
      }),
    ).rejects.toThrow("프로젝트 폴더 밖");
  }, 15000);
  it("starts parallel Gemini children through the real MCP server", async () => {
    const p = project();
    const parent = await runtime.startTask({
      projectId: p.id,
      provider: "codex",
      team: true,
      prompt: "[delegate-models] [parallel-fixture]",
    });
    await runtime.waitRun(parent.id);
    expect(parent.status).toBe("completed");
    const answer = JSON.parse(parent.answer!);
    expect(answer.startedStatuses).toEqual(["running", "running", "running"]);
    expect(answer.children).toHaveLength(3);
    expect(
      runtime
        .state()
        .runs.filter((r) => r.parentId === parent.id)
        .every((r) => r.provider === "gemini" && r.status === "completed"),
    ).toBe(true);
  }, 15000);

  it("automatically selects catalog models per child task and rejects invented IDs", async () => {
    const p = project();
    runtime.providers.find((p) => p.id === "gemini")!.backend = "agy";
    delete runtime.settings.models?.gemini;
    runtime.providers.forEach((provider) => {
      provider.modelsCheckedAt = Date.now();
      provider.models =
        provider.id === "gemini"
          ? ["gemini-pro-high", "gemini-flash-high", "gemini-flash-low"].map(
              (id) => ({ id, name: id }),
            )
          : [];
    });
    const parent = await runtime.startTask({
      projectId: p.id,
      provider: "codex",
      team: true,
      prompt: "[model-check]",
    });
    await runtime.waitRun(parent.id);
    for (const [task, model] of [
      ["초안", "gemini-flash-low"],
      ["복잡한 설계", "gemini-pro-high"],
    ]) {
      const child = await runtime.startTask({
        projectId: p.id,
        provider: "gemini",
        parentId: parent.id,
        prompt: "[model-check] " + task,
      });
      await runtime.waitRun(child.id);
      expect(child.model).toBe(model);
      expect(JSON.parse(child.answer!).model).toBe(model);
      expect(child.routingReason).toBeTruthy();
    }
    await expect(
      runtime.startTask({
        projectId: p.id,
        provider: "gemini",
        parentId: parent.id,
        prompt: "x",
        model: "invented-model",
      }),
    ).rejects.toThrow("모델 목록");
  }, 15000);

  it("uses saved, overridden and CLI-default models as real subprocess arguments", async () => {
    const p = project();
    runtime.saveSettings({
      models: {
        codex: "saved-codex",
        claude: "saved-claude",
        gemini: "saved-gemini",
      },
    });
    for (const provider of ["codex", "claude", "gemini"] as const) {
      for (const model of [undefined, "override-model", ""]) {
        const run = await runtime.startTask({
          projectId: p.id,
          provider,
          prompt: "[model-check]",
          model,
        });
        await runtime.waitRun(run.id);
        expect(run.status).toBe("completed");
        const requested =
          provider === "gemini"
            ? "gemini-3.5-flash"
            : (model ?? `saved-${provider}`);
        expect(run.model).toBe(requested);
        expect(JSON.parse(run.answer!)).toMatchObject({
          provider,
          model: requested || "fixture-cli-default",
        });
        if (provider !== "codex")
          expect(run.reportedModel).toBe(requested || "fixture-cli-default");
        else expect(run.reportedModel).toBeUndefined();
      }
    }
  }, 15000);
  it("freezes queued models and protects user-pinned models from MCP overrides", async () => {
    const p = project();
    runtime.saveSettings({
      models: { codex: "coordinator-a", claude: "child-a" },
    });
    const blocker = await runtime.startTask({
      projectId: p.id,
      provider: "gemini",
      prompt: "[slow]",
    });
    const queued = await runtime.startTask({
      projectId: p.id,
      provider: "codex",
      prompt: "[model-check]",
    });
    expect(queued.status).toBe("queued");
    const parent = await runtime.startTask({
      projectId: p.id,
      provider: "codex",
      prompt: "[delegate-models]",
      team: true,
    });
    runtime.saveSettings({
      models: { codex: "coordinator-b", claude: "child-b" },
    });
    await runtime.waitRun(blocker.id);
    await runtime.waitRun(queued.id);
    expect(JSON.parse(queued.answer!).model).toBe("coordinator-a");
    await runtime.waitRun(parent.id);
    expect(parent.status).toBe("completed");
    expect(parent.model).toBe("coordinator-a");
    const children = runtime
      .state()
      .runs.filter((r) => r.parentId === parent.id)
      .sort((a, b) => a.startedAt - b.startedAt);
    expect(children.map((r) => r.model)).toEqual(["child-a", "child-a"]);
    expect(children.every((r) => r.status === "completed")).toBe(true);
    expect(children.map((r) => JSON.parse(r.answer!).model)).toEqual([
      "child-a",
      "child-a",
    ]);
  }, 15000);
  it("freezes automation model defaults for the batch and preserves pinned and empty choices", async () => {
    const p = project();
    runtime.saveSettings({
      models: {
        codex: "default-codex",
        claude: "default-claude",
        gemini: "default-gemini",
      },
    });
    const automation = await runtime.saveAutomation({
      ...rule(p.id),
      name: "[slow] [model-check]",
      steps: [
        {
          provider: "codex",
          skillId: "wiki-organize",
          skillVersion: 1,
          model: "pinned-model",
        },
        { provider: "claude", skillId: "wiki-organize", skillVersion: 1 },
        {
          provider: "gemini",
          skillId: "wiki-organize",
          skillVersion: 1,
          model: "",
        },
      ],
    });
    expect(
      runtime.automationPreview(automation).steps.map((s) => s.model),
    ).toEqual(["pinned-model", "default-claude", ""]);
    await runtime.executeAutomation(automation.id);
    runtime.saveSettings({ models: { claude: "changed-later" } });
    await expect
      .poll(() => runtime.store.all("auto-locks").length, { timeout: 12000 })
      .toBe(0);
    const runs = runtime
      .state()
      .runs.filter((r) => r.automationId === automation.id)
      .sort((a, b) => a.startedAt - b.startedAt);
    expect(runs.map((r) => r.status)).toEqual([
      "completed",
      "completed",
      "completed",
    ]);
    expect(runs.map((r) => r.model)).toEqual([
      "pinned-model",
      "default-claude",
      "gemini-3.5-flash",
    ]);
    expect(runs.map((r) => JSON.parse(r.answer!).model)).toEqual([
      "pinned-model",
      "default-claude",
      "gemini-3.5-flash",
    ]);
  }, 15000);
  it("persists model defaults, imports portable choices and reads a CLI model catalog", async () => {
    const p = project();
    runtime.saveSettings({ models: { codex: "saved-model", claude: "" } });
    const automation = await runtime.saveAutomation({
      ...rule(p.id),
      steps: [{ ...rule(p.id).steps[0], model: "step-model" }],
    });
    const exported = runtime.exportData();
    runtime.saveSettings({ models: { codex: "different" } });
    runtime.importData(exported, { [p.id]: p.path });
    expect(runtime.state().settings.models).toEqual({
      codex: "saved-model",
      claude: "",
      gemini: "gemini-3.5-flash",
    });
    expect(
      runtime.state().automations.find((a) => a.id !== automation.id)!.steps[0]
        .model,
    ).toBe("step-model");
    runtime.importData({ ...exported, modelDefaults: undefined }, {});
    expect(runtime.state().settings.models?.codex).toBe("saved-model");
    const store = runtime.store;
    await runtime.dispose();
    runtime = await new Runtime(store).init();
    expect(runtime.state().settings.models?.codex).toBe("saved-model");
    await runtime.refreshModels("codex");
    const provider = runtime.state().providers.find((p) => p.id === "codex")!;
    expect(provider.models?.map((m) => m.id)).toEqual([
      "test-codex-a",
      "test-codex-b",
    ]);
    expect(provider.modelsError).toBeUndefined();
    expect(() =>
      runtime.saveSettings({ models: { codex: "--danger" } }),
    ).toThrow();
    expect(runtime.state().settings.models?.codex).toBe("saved-model");
  });
  it("repairs saved AGY false successes while preserving their content and never rerunning them", async () => {
    const p = project();
    const store = runtime.store;
    await runtime.dispose();
    const denied: Run = {
      id: "saved-denial",
      projectId: p.id,
      provider: "gemini",
      title: "권한 검사",
      prompt: "원래 질문",
      status: "completed",
      mode: "task",
      startedAt: 10,
      finishedAt: 20,
      activity: "완료",
      output:
        'jetski: no output produced — a tool required the "read_file" permission that headless mode cannot prompt for, so it was auto-denied.\n',
      answer: "",
      usage: {
        ...EMPTY_USAGE,
        total: 123,
        source: "Antigravity CLI 최종 보고값",
      },
      files: [],
      references: [],
    };
    const valid: Run = {
      ...denied,
      id: "saved-success",
      output: "정상 답변",
      answer: "정상 답변",
    };
    store.put("runs", denied);
    store.put("runs", valid);
    runtime = await new Runtime(store).init();
    const repaired = runtime.state().runs.find((r) => r.id === denied.id)!;
    expect(repaired).toEqual({
      ...denied,
      status: "waiting",
      activity: "확인이 필요해요",
      error: expect.stringContaining("read_file 권한"),
    });
    expect(runtime.state().runs.find((r) => r.id === valid.id)).toEqual(valid);
    expect(runtime.state().runs).toHaveLength(2);
    expect(store.all("jobs")).toHaveLength(0);
  });
  it.each([
    ["SUCCESS", "completed"],
    ["ERROR", "failed"],
    ["WAITING", "waiting"],
    ["RUNNING", "waiting"],
    ["CANCELED", "cancelled"],
    ["MISSING", "failed"],
    ["AUTH", "waiting"],
    ["SOFT_DENIED", "waiting"],
    ["DENIED_WITH_ANSWER", "waiting"],
    ["EMPTY", "failed"],
    ["EMPTY_FINAL", "completed"],
  ])(
    "honors Antigravity %s even when the process exits zero",
    async (status, expected) => {
      const p = project();
      const run = await runtime.startTask({
        projectId: p.id,
        provider: "gemini",
        prompt: `[agy-fixture:${status}]`,
      });
      await runtime.waitRun(run.id);
      expect(run.status).toBe(expected);
      expect(run.sessionId).toBe("agy-fixture-session");
      expect(run.answer).not.toContain("AGY_DIAGNOSTIC_ONLY");
      if (status === "SUCCESS") {
        expect(run.answer).toBe("Antigravity 최종 답변 · TEST FIXTURE");
        expect(run.usage).toMatchObject({
          input: 100,
          output: 20,
          cached: 30,
          total: 120,
        });
      }
      if (status === "MISSING") {
        expect(run.error).toContain("최종 결과");
        expect(run.usage.total).toBeNull();
      }
      if (["SOFT_DENIED", "DENIED_WITH_ANSWER"].includes(status)) {
        expect(run.error).toContain("read_file 권한");
        expect(run.usage.total).toBe(120);
        expect(run.answer).toBe(
          status === "SOFT_DENIED"
            ? "답변 작성 중"
            : "Antigravity 최종 답변 · TEST FIXTURE",
        );
      }
      if (status === "EMPTY") expect(run.error).toContain("답변 없이 종료");
      if (status === "EMPTY_FINAL") expect(run.answer).toBe("답변 작성 중");
    },
  );
  it("stores one clean Claude answer and carries completed same-project conversation context", async () => {
    const p = project();
    const first = await runtime.startTask({
      projectId: p.id,
      provider: "claude",
      prompt: "bookshelf 첫 질문",
    });
    await runtime.waitRun(first.id);
    expect(first.answer).toBe("TEST FIXTURE 완료 · 한글 출력");
    const next = await runtime.startTask({
      projectId: p.id,
      provider: "codex",
      prompt: "[context-check] 이어서 알려줘",
      replyTo: first.id,
    });
    await runtime.waitRun(next.id);
    expect(next.answer).toContain("이전 대화 전달: true");
    expect(next.replyTo).toBe(first.id);
    const otherFolder = path.join(root, "다른 프로젝트");
    fs.mkdirSync(otherFolder);
    const other = runtime.addProject(otherFolder);
    await expect(
      runtime.startTask({
        projectId: other.id,
        provider: "codex",
        prompt: "잘못된 대화 연결",
        replyTo: first.id,
      }),
    ).rejects.toThrow("같은 프로젝트");
  });
  it("observes a real output file even when the CLI only reports shell output", async () => {
    const p = project();
    const run = await runtime.startTask({
      projectId: p.id,
      provider: "codex",
      prompt: "[write-output] 결과 작성",
    });
    await runtime.waitRun(run.id);
    expect(run.files).toContain(path.join("outputs", "fixture.md"));
    expect(run.detectedFiles).toContain(path.join("outputs", "fixture.md"));
  });
  it("cancels queued work without starting a second subprocess", async () => {
    const p = project();
    const a = await runtime.startTask({
      projectId: p.id,
      provider: "codex",
      prompt: "[slow] 작업",
    });
    const b = await runtime.startTask({
      projectId: p.id,
      provider: "claude",
      prompt: "대기 작업",
    });
    expect(b.status).toBe("queued");
    await runtime.cancel(b.id);
    expect(b.status).toBe("cancelled");
    expect(b.output).toBe("");
    await runtime.waitRun(a.id);
    expect(a.status).toBe("completed");
  });
  it("deduplicates the same schedule key even while an automation is busy", async () => {
    const p = project();
    const a = await runtime.saveAutomation(rule(p.id));
    await runtime.executeAutomation(a.id, false, "same-key");
    expect(await runtime.executeAutomation(a.id, false, "same-key")).toEqual({
      duplicate: true,
    });
    const run = runtime.state().runs[0];
    await runtime.waitRun(run.id);
    await new Promise((r) => setTimeout(r, 350));
    expect(
      runtime.state().runs.filter((r) => r.automationId === a.id),
    ).toHaveLength(1);
    expect(runtime.store.all("auto-locks")).toHaveLength(0);
  });
  it("imports pinned skill versions with collision remapping and disabled automation", async () => {
    const p = project();
    const s = runtime.state().skills.find((s) => s.id === "wiki-organize")!;
    runtime.saveSkill({ ...s, instructions: s.instructions + " 새 지침" });
    const a = await runtime.saveAutomation(rule(p.id));
    const exported = runtime.exportData();
    const next = path.join(root, "옮긴 프로젝트");
    fs.mkdirSync(next);
    runtime.importData(exported, { [p.id]: next });
    const imported = runtime.state().automations.find((v) => v.id !== a.id)!;
    expect(imported.enabled).toBe(false);
    expect(imported.steps[0].skillId).not.toBe("wiki-organize");
    expect(runtime.skill(imported.steps[0].skillId, 1).instructions).toBe(
      s.instructions,
    );
    expect(runtime.project(imported.projectId).path).toBe(next);
    const count = runtime.state().projects.length;
    expect(() =>
      runtime.importData({ ...exported, skills: [{ id: "../../bad" }] }, {}),
    ).toThrow();
    expect(runtime.state().projects).toHaveLength(count);
  });
  it("rejects output watcher cycles between otherwise valid rules", () => {
    const p = project(),
      a = {
        ...rule(p.id),
        id: "a",
        trigger: "file" as const,
        enabled: true,
        input: "raw",
        output: "wiki",
      },
      b = { ...a, id: "b", input: "wiki", output: "raw" };
    expect(() => assertNoWatchCycle(p.path, [a, b])).toThrow("순환");
    expect(() =>
      assertNoWatchCycle(p.path, [a, { ...b, output: "outputs" }]),
    ).not.toThrow();
  });
});
