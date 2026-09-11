import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  safePath,
  latestDue,
  nextDue,
  fromUsage,
  exclusiveUsage,
} from "../electron/domain";
import { parseLine, structuredCommand } from "../electron/providers";
import { EMPTY_USAGE, type Automation, type Run } from "../src/shared";
const a = {
  projectId: "project",
  name: "Daily",
  enabled: true,
  input: "raw",
  output: "wiki",
  steps: [],
  createdAt: 0,
  id: "daily",
  trigger: "schedule",
  time: "09:00",
  timezone: "Asia/Seoul",
  weekdays: [],
} as Automation;
describe("project boundary and local time", () => {
  it("accepts Korean paths, rejects traversal and outside junctions", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "workroom-"));
    const inner = path.join(root, "한글 프로젝트");
    fs.mkdirSync(inner);
    expect(safePath(inner, "wiki/새 문서.md")).toBe(
      path.join(inner, "wiki/새 문서.md"),
    );
    expect(() => safePath(inner, "../secret.txt")).toThrow();
    fs.symlinkSync(root, path.join(inner, "outside"), "junction");
    expect(() => safePath(inner, "outside/secret.txt")).toThrow();
  });
  it("returns one latest missed occurrence rather than every missed day", () => {
    const now = Date.parse("2026-09-09T04:00:00Z");
    expect(latestDue(a, now)?.at).toBe(Date.parse("2026-09-09T00:00:00Z"));
    expect(nextDue(a, now)).toBe(Date.parse("2026-09-10T00:00:00Z"));
    expect(latestDue({ ...a, weekdays: [0] }, now)).toBeUndefined();
  });
  it("deduplicates repeated wall-clock minutes on daylight saving fallback", () => {
    const fall = { ...a, timezone: "America/New_York", time: "01:30" };
    expect(latestDue(fall, Date.parse("2026-11-01T05:31:00Z"))?.key).toBe(
      latestDue(fall, Date.parse("2026-11-01T06:31:00Z"))?.key,
    );
  });
});
describe("provider usage and events", () => {
  it("keeps unknown distinct from zero", () => {
    expect(fromUsage("gemini", {}).total).toBeNull();
    expect(
      fromUsage("codex", { input_tokens: 0, output_tokens: 0 }).total,
    ).toBe(0);
  });
  it("normalizes cache inclusion without adding Codex cache twice", () => {
    expect(
      fromUsage("codex", {
        input_tokens: 100,
        cached_input_tokens: 70,
        output_tokens: 20,
      }).total,
    ).toBe(120);
    expect(
      fromUsage("claude", {
        input_tokens: 10,
        cache_read_input_tokens: 70,
        cache_creation_input_tokens: 15,
        output_tokens: 20,
      }).total,
    ).toBe(115);
  });
  it("does not double count child-inclusive parent totals", () => {
    const r = (
      id: string,
      parentId?: string,
      scope: Run["usage"]["scope"] = "direct",
      total: number | null = 50,
    ) => ({ id, parentId, usage: { ...EMPTY_USAGE, scope, total } }) as Run;
    expect(
      exclusiveUsage([
        r("parent", undefined, "inclusive", 80),
        r("child", "parent", "direct", 50),
        r("unknown", undefined, "unknown", null),
      ]),
    ).toMatchObject({ total: 50, known: 1, unknown: 1 });
  });
  it("parses real protocol shapes, errors and unknown events", () => {
    expect(
      parseLine(
        "codex",
        JSON.stringify({
          type: "turn.completed",
          usage: { input_tokens: 10, output_tokens: 4 },
        }),
      ).usage?.total,
    ).toBe(14);
    expect(
      parseLine(
        "claude",
        JSON.stringify({
          type: "result",
          is_error: true,
          result: "Permission denied",
        }),
      ).error,
    ).toBe("Permission denied");
    expect(
      parseLine(
        "gemini",
        JSON.stringify({ type: "message", role: "assistant", content: "한글" }),
      ).text,
    ).toBe("한글");
    expect(parseLine("codex", '{"type":"future.event"}')).toEqual({});
  });
  it("keeps prompts as arguments or stdin, without composing shell commands", () => {
    const prompt = '한글 "quoted" & whoami $(x)';
    expect(structuredCommand("claude", prompt).at(-1)).toBe(prompt);
    expect(structuredCommand("gemini", prompt)[1]).toBe(prompt);
    expect(structuredCommand("codex", prompt).at(-1)).toBe("-");
  });
});
