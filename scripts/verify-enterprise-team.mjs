import { _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

fs.mkdirSync(".runtime-test", { recursive: true });
const root = fs.mkdtempSync(path.resolve(".runtime-test/enterprise-team-"));
const project = path.join(root, "project");
fs.mkdirSync(project);
const env = {
  ...process.env,
  WORKROOM_DATA_DIR: path.join(root, "data"),
  WORKROOM_TEST_PROJECT: project,
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.WORKROOM_DEV_URL;
const app = await electron.launch({ args: ["."], env });
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.workroom));
  const call = (method, payload) =>
    page.evaluate(
      ({ method, payload }) => window.workroom.invoke(method, payload),
      { method, payload },
    );
  const paths = {};
  for (const [id, script] of Object.entries({
    codex: "@openai/codex/bin/codex.js",
    gemini: "@google/gemini-cli/dist/index.js",
  })) {
    const target = path.join(root, "bin/node_modules", script);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync("tests/fixture-cli.cjs", target);
    paths[id] = path.join(root, "bin", `${id}.cmd`);
    fs.writeFileSync(paths[id], "@echo off\r\nrem TEST FIXTURE\r\n");
  }
  await call("settings.save", { paths });
  await call("providers.refresh");
  const initial = await call("state");
  const projectId = initial.projects[0].id;
  async function run(args) {
    const started = await call("run.start", { projectId, ...args });
    const until = Date.now() + 60000;
    while (Date.now() < until) {
      const state = await call("state");
      const parent = state.runs.find((r) => r.id === started.id);
      if (!["queued", "running"].includes(parent.status)) {
        assert.equal(parent.status, "completed", parent.error || parent.output);
        return {
          parent,
          children: state.runs.filter((r) => r.parentId === parent.id),
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw Error("Team fixture timed out");
  }
  const direct = await run({ provider: "gemini", prompt: "[model-check]" });
  assert.equal(direct.parent.model, "gemini-3.5-flash");
  const defaults = await run({
    provider: "codex",
    team: true,
    prompt: "[delegate-models] [enterprise-fixture]",
  });
  assert.equal(defaults.children.length, 2);
  for (const child of defaults.children) {
    assert.equal(child.provider, "gemini");
    assert.equal(child.status, "completed");
    assert.equal(child.model, "gemini-3.5-flash");
    assert.match(child.output, /gemini-3.5-flash/);
  }
  await call("settings.save", { models: { gemini: "gemini-3.1-pro-preview" } });
  const pinned = await run({
    provider: "codex",
    team: true,
    prompt: "[delegate-models] [enterprise-fixture]",
  });
  assert.equal(pinned.children.length, 2);
  for (const child of pinned.children) {
    assert.equal(child.status, "completed");
    assert.equal(child.model, "gemini-3.1-pro-preview");
    assert.match(child.output, /gemini-3.1-pro-preview/);
  }
  console.log(
    "PASS: Gemini standalone and Codex MCP team delegation with Flash 3.5 default and Pro 3.1 user-pinned model. Fixture CLIs only; enterprise account not tested.",
  );
} finally {
  await app.close();
}
