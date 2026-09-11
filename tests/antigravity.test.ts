import { describe, it, expect } from "vitest";
import {
  parseLine,
  command,
  isAntigravityPath,
  structuredCommand,
  antigravityPermissionError,
} from "../electron/providers";

const parse = (event: unknown) => parseLine("gemini", JSON.stringify(event));
describe("Antigravity CLI compatibility", () => {
  it("passes the selected workspace explicitly to AGY without changing legacy Gemini arguments", () => {
    const workspace = "C:\\작업 폴더\\위키";
    const legacy = structuredCommand("gemini", "요청");
    expect(legacy).toEqual(["-p", "요청", "--output-format", "stream-json"]);
    expect(structuredCommand("gemini", "요청", undefined, workspace)).toEqual([
      ...legacy,
      "--add-dir",
      workspace,
    ]);
    expect(
      structuredCommand("claude", "요청", undefined, workspace),
    ).not.toContain("--add-dir");
  });
  it("recognizes real stderr denials without interpreting ordinary diagnostics as errors", () => {
    expect(
      antigravityPermissionError(
        'jetski: no output produced — a tool required the "read_file" permission that headless mode cannot prompt for, so it was auto-denied.',
      ),
    ).toContain("read_file 권한");
    expect(
      antigravityPermissionError("A tool was soft-denied in headless mode"),
    ).toContain("권한");
    expect(
      antigravityPermissionError(
        "Loading cached credentials. Permission mode: request-review",
      ),
    ).toBeUndefined();
    expect(
      parse({ event: "result", result: { status: "SUCCESS", response: "" } })
        .answer,
    ).toBeUndefined();
  });
  it("executes the native agy binary directly without resolving a Gemini npm wrapper", () => {
    const exe = "C:\\Users\\person\\AppData\\Local\\agy\\bin\\agy.exe";
    expect(isAntigravityPath(exe)).toBe(true);
    expect(isAntigravityPath("/home/user/.local/bin/agy")).toBe(true);
    expect(isAntigravityPath("C:\\agy\\gemini.cmd")).toBe(false);
    expect(command(exe, ["--version"])).toEqual({ exe, args: ["--version"] });
  });
  it("streams response deltas and replaces them with one authoritative final answer", () => {
    const init = parse({ event: "init", conversation_id: "agy-session" });
    expect(init).toMatchObject({ sessionId: "agy-session", protocol: "agy" });
    let answer = "";
    for (const text of ["안녕", "하세요", "\n"]) {
      const delta = parse({
        event: "step_update",
        step_update: {
          step_type: "agent_response",
          state: "ACTIVE",
          text_delta: text,
          usage: { total_tokens: 999 },
        },
      });
      answer += delta.answer;
      expect(delta.usage).toBeUndefined();
    }
    expect(answer).toBe("안녕하세요\n");
    const final = parse({
      event: "result",
      result: {
        status: "SUCCESS",
        response: "최종 답변\n",
        conversation_id: "agy-session",
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          thinking_tokens: 12,
          cache_read_tokens: 30,
          total_tokens: 120,
        },
      },
    });
    expect(final).toMatchObject({
      answer: "최종 답변\n",
      answerMode: "replace",
      status: "completed",
      usage: { input: 100, output: 20, cached: 30, total: 120, cost: null },
    });
    expect(
      parse({
        event: "step_update",
        step_update: {
          step_type: "checkpoint",
          usage: { total_tokens: 888 },
        },
      }).usage,
    ).toBeUndefined();
  });
  it.each([
    ["ERROR", "failed"],
    ["INVALID", "failed"],
    ["UNKNOWN", "failed"],
    ["CANCELED", "cancelled"],
    ["INTERRUPTED", "cancelled"],
    ["WAITING", "waiting"],
    ["RUNNING", "waiting"],
  ])("does not report %s as a successful answer", (status, expected) => {
    const result = parse({
      event: "result",
      result: { status, response: "diagnostic" },
    });
    expect(result.status).toBe(expected);
    expect(result.answer).toBeUndefined();
    expect(result.error).toBeTruthy();
    expect(result.usage?.total).toBeNull();
  });
  it("links only completed, successful file tools and keeps their output out of the answer", () => {
    const tool = {
      step_type: "tool",
      tool_name: "view_file",
      state: "ACTIVE",
      tool_info: {
        parameters: { AbsolutePath: "raw/source.md" },
        output: "LOG_ONLY",
      },
    };
    expect(
      parse({ event: "step_update", step_update: tool }).references,
    ).toBeUndefined();
    const read = parse({
      event: "step_update",
      step_update: { ...tool, state: "DONE" },
    });
    expect(read.references).toEqual(["raw/source.md"]);
    expect(read.answer).toBeUndefined();
    expect(
      parse({
        event: "step_update",
        step_update: {
          ...tool,
          state: "DONE",
          tool_info: { ...tool.tool_info, error: { message: "denied" } },
        },
      }).references,
    ).toBeUndefined();
    expect(
      parse({
        event: "step_update",
        step_update: {
          step_type: "tool",
          state: "DONE",
          tool_name: "write_to_file",
          tool_info: { parameters: { TargetFile: "outputs/result.md" } },
        },
      }).files,
    ).toEqual(["outputs/result.md"]);
  });
});
