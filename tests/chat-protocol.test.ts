import { describe, it, expect } from "vitest";
import { parseLine } from "../electron/providers";
describe("visible assistant answers", () => {
  it("keeps command output, warnings and stderr-like text out of assistant answers", () => {
    expect(
      parseLine(
        "codex",
        JSON.stringify({
          type: "item.completed",
          item: {
            type: "command_execution",
            command: "echo log",
            aggregated_output: "LOG_ONLY",
          },
        }),
      ).answer,
    ).toBeUndefined();
    expect(
      parseLine(
        "gemini",
        JSON.stringify({ type: "tool_use", tool_name: "shell", tool_id: "1" }),
      ).answer,
    ).toBeUndefined();
    expect(parseLine("claude", "startup diagnostics").answer).toBeUndefined();
  });
  it("uses final messages without repeated Codex updates or Claude result duplication", () => {
    const item = { type: "agent_message", text: "안녕하세요" };
    expect(
      parseLine("codex", JSON.stringify({ type: "item.updated", item })).answer,
    ).toBeUndefined();
    expect(
      parseLine("codex", JSON.stringify({ type: "item.completed", item }))
        .answer,
    ).toContain("안녕하세요");
    const final = parseLine(
      "claude",
      JSON.stringify({ type: "result", result: "최종 답변", is_error: false }),
    );
    expect(final).toMatchObject({ answer: "최종 답변", answerMode: "replace" });
    expect(
      parseLine(
        "claude",
        JSON.stringify({
          type: "result",
          result: "로그인 필요",
          is_error: true,
        }),
      ).answer,
    ).toBeUndefined();
    expect(
      parseLine(
        "gemini",
        JSON.stringify({
          type: "message",
          role: "assistant",
          content: "답변 조각",
        }),
      ).answer,
    ).toBe("답변 조각");
  });
});
