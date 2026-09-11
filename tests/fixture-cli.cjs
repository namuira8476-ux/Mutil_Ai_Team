// Test subprocess only. Never shipped or selected by the production app.
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const provider = __filename.includes("@google")
  ? "gemini"
  : __filename.includes("@anthropic")
    ? "claude"
    : "codex";
const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log(`TEST FIXTURE ${provider} 1.0`);
  process.exit(0);
}
if (args.includes("--help")) {
  console.log(
    "TEST FIXTURE\n  --model <model> Model alias (e.g. 'sonnet' or 'opus')\n  --next <value>",
  );
  process.exit(0);
}
const emit = (data) => process.stdout.write(JSON.stringify(data) + "\n");
if (args.includes("app-server")) {
  readline.createInterface({ input: process.stdin }).on("line", (line) => {
    const request = JSON.parse(line);
    if (request.id === undefined) return;
    if (request.method === "model/list")
      emit({
        id: request.id,
        result: {
          data: [
            { model: "test-codex-a", displayName: "Test Codex A" },
            { model: "test-codex-b", displayName: "Test Codex B" },
          ],
          nextCursor: null,
        },
      });
    else emit({ id: request.id, result: {} });
  });
} else if (!args.includes("--output-format") && !args.includes("--json")) {
  console.log(
    `TEST FIXTURE ${provider} terminal ready · MODEL=${args.includes("--model") ? args[args.indexOf("--model") + 1] : "fixture-cli-default"}`,
  );
  readline.createInterface({ input: process.stdin }).on("line", (line) => {
    console.log(`입력됨: ${line}`);
    if (line === "exit") process.exit(0);
  });
} else {
  let prompt =
    provider === "claude"
      ? args.at(-1) || ""
      : args[args.indexOf("-p") + 1] || "";
  const execute = () => {
    const selectedModel = args.includes("--model")
      ? args[args.indexOf("--model") + 1]
      : "fixture-cli-default";
    if (provider === "codex" && prompt.includes("[delegate-models]")) {
      void (async () => {
        const url = JSON.parse(
          args
            .find((arg) => arg.startsWith("mcp_servers.workroom.url="))
            .split("=")
            .slice(1)
            .join("="),
        );
        const rpc = async (name, parameters) => {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.WORKROOM_MCP_TOKEN}`,
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: Date.now(),
              method: "tools/call",
              params: { name, arguments: parameters },
            }),
          });
          const envelope = await response.json();
          if (envelope.error) throw Error(envelope.error.message);
          return JSON.parse(envelope.result.content[0].text);
        };
        if (prompt.includes("[browser-fixture]")) {
          const url = prompt.match(/BROWSER_URL=(http:\/\/[^\s]+)/)[1];
          await rpc("browser_action", { action: "navigate", url });
          let snap = await rpc("browser_snapshot", {});
          const field = snap.elements.find((e) => e.label === "이름");
          await rpc("browser_action", {
            action: "fill",
            element: field.element,
            snapshotId: snap.snapshotId,
            text: "가나다",
          });
          snap = await rpc("browser_snapshot", {});
          await rpc("browser_action", {
            action: "click",
            element: snap.elements.find((e) => e.label === "확인").element,
            snapshotId: snap.snapshotId,
          });
          snap = await rpc("browser_snapshot", {});
          emit({
            type: "item.completed",
            item: { type: "agent_message", text: JSON.stringify(snap) },
          });
          emit({
            type: "turn.completed",
            usage: { input_tokens: 10, output_tokens: 10 },
          });
          process.exitCode = 0;
          return;
        }
        emit({ type: "thread.started", thread_id: "fixture-team" });
        const children = [];
        const parallel = prompt.includes("[parallel-fixture]");
        const enterprise = prompt.includes("[enterprise-fixture]");
        const pending = [];
        for (const model of parallel
          ? [undefined, undefined, undefined]
          : [
              undefined,
              enterprise ? "gemini-3.1-pro-preview" : "explicit-child-model",
            ]) {
          const child = await rpc("run_skill", {
            provider: parallel || enterprise ? "gemini" : "claude",
            ...(parallel ? { resources: { reads: [], writes: [] } } : {}),
            reason: "사용자가 지정한 독립 검수 테스트",
            skillId: "code-implement",
            task: parallel ? "[slow] [model-check]" : "[model-check]",
            ...(model === undefined ? {} : { model }),
          });
          if (parallel) {
            pending.push(child);
            continue;
          }
          let result;
          do {
            result = await rpc("get_run", { runId: child.runId, wait: true });
          } while (["running", "queued"].includes(result.status));
          children.push(result);
        }
        for (const child of pending) {
          let result;
          do {
            result = await rpc("get_run", { runId: child.runId, wait: true });
          } while (["running", "queued"].includes(result.status));
          children.push(result);
        }
        emit({
          type: "item.completed",
          item: {
            type: "agent_message",
            text: JSON.stringify({
              model: selectedModel,
              children,
              startedStatuses: pending.map((c) => c.status),
            }),
          },
        });
        emit({
          type: "turn.completed",
          usage: { input_tokens: 10, output_tokens: 10 },
        });
        process.exit(0);
      })().catch((error) => {
        console.error(error);
        process.exit(1);
      });
      return;
    }
    if (provider === "gemini" && prompt.includes("[agy-fixture")) {
      emit({ event: "init", conversation_id: "agy-fixture-session" });
      if (!prompt.includes("[agy-fixture:EMPTY]"))
        emit({
          event: "step_update",
          step_update: {
            step_type: "agent_response",
            state: "ACTIVE",
            text_delta: "답변 작성 중",
            usage: { total_tokens: 999 },
          },
        });
      process.stderr.write("AGY_DIAGNOSTIC_ONLY\n");
      if (prompt.includes("[agy-fixture:AUTH]")) {
        process.stderr.write("authentication required: run agy to log in\n");
        process.exit(1);
      }
      setTimeout(() => {
        if (!prompt.includes("[agy-fixture:MISSING]")) {
          const scenario =
            prompt.match(/\[agy-fixture:(\w+)\]/)?.[1] || "SUCCESS";
          const status = [
            "EMPTY",
            "EMPTY_FINAL",
            "SOFT_DENIED",
            "DENIED_WITH_ANSWER",
          ].includes(scenario)
            ? "SUCCESS"
            : scenario;
          emit({
            event: "result",
            result: {
              status,
              conversation_id: "agy-fixture-session",
              response: ["EMPTY", "EMPTY_FINAL", "SOFT_DENIED"].includes(
                scenario,
              )
                ? ""
                : "Antigravity 최종 답변 · TEST FIXTURE",
              usage: {
                input_tokens: 100,
                output_tokens: 20,
                thinking_tokens: 12,
                cache_read_tokens: 30,
                total_tokens: 120,
              },
            },
          });
          if (["SOFT_DENIED", "DENIED_WITH_ANSWER"].includes(scenario)) {
            process.stderr.write(
              'jetski: no output produced — a tool required the "read_file" permission that headless ',
            );
            process.stderr.write(
              "mode cannot prompt for, so it was auto-denied.\n",
            );
          }
        }
        process.exit(0);
      }, 250);
      return;
    }
    const delay = prompt.includes("[slow]") ? 2000 : 250;
    const start =
      provider === "codex"
        ? { type: "thread.started", thread_id: "fixture-session" }
        : provider === "claude"
          ? {
              type: "system",
              subtype: "init",
              session_id: "fixture-session",
              model: selectedModel,
            }
          : {
              type: "init",
              session_id: "fixture-session",
              model: selectedModel,
            };
    emit(start);
    if (provider === "gemini" && prompt.includes("[chat-fixture]")) {
      setTimeout(() => {
        emit({
          type: "message",
          role: "assistant",
          content: "## 테스트 답변\n\n중앙에서 ",
        });
        emit({
          type: "tool_use",
          tool_name: "INTERNAL_LOG_ONLY",
          tool_id: "test-tool",
        });
        process.stderr.write("TEST_STDERR_ONLY\n");
      }, 100);
      setTimeout(() => {
        emit({
          type: "message",
          role: "assistant",
          content:
            "**질문과 답변**을 확인할 수 있습니다.\n\n- 첫 번째 항목\n- 두 번째 항목\n\n```js\nconsole.log('hello');\n```\n\nTEST FIXTURE · 실제 모델 답변이 아닙니다.",
        });
        emit({
          type: "result",
          status: "success",
          stats: { input_tokens: 100, output_tokens: 30, total_tokens: 130 },
        });
        process.exit(0);
      }, 2200);
      return;
    }
    setTimeout(() => {
      if (prompt.includes("[write-output]")) {
        fs.mkdirSync(path.join(process.cwd(), "outputs"), { recursive: true });
        fs.writeFileSync(
          path.join(process.cwd(), "outputs", "fixture.md"),
          "테스트 프로세스가 실제로 작성한 결과",
        );
      }
      const text = prompt.includes("[model-check]")
        ? JSON.stringify({ provider, model: selectedModel, argv: args })
        : prompt.includes("[context-check]")
          ? `TEST FIXTURE 이전 대화 전달: ${prompt.includes("이전 대화 (참고용 기록") && prompt.includes("bookshelf")}`
          : "TEST FIXTURE 완료 · 한글 출력";
      if (provider === "codex") {
        emit({ type: "item.completed", item: { type: "agent_message", text } });
        emit({
          type: "turn.completed",
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cached_input_tokens: 30,
          },
        });
      }
      if (provider === "claude") {
        emit({
          type: "assistant",
          message: { content: [{ type: "text", text }] },
        });
        emit({
          type: "result",
          result: text,
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 30,
          },
          total_cost_usd: 0.001,
          is_error: false,
        });
      }
      if (provider === "gemini") {
        emit({ type: "message", role: "assistant", content: text });
        emit({
          type: "result",
          status: "success",
          stats: {
            input_tokens: 100,
            output_tokens: 20,
            cached: 30,
            total_tokens: 120,
          },
        });
      }
      process.exit(0);
    }, delay);
  };
  if (provider === "codex") {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (prompt += d));
    process.stdin.on("end", execute);
  } else execute();
}
