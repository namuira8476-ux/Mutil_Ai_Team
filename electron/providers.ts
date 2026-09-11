import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import type { ProviderId, Provider, Usage, RunStatus } from "../src/shared";
import { fromUsage } from "./domain";
import { modelArgs } from "./model-selection";
const exec = promisify(execFile);
export function isAntigravityPath(exe: string) {
  return /(?:^|[\\/])agy(?:\.exe)?$/i.test(exe);
}
async function findOnPath(name: string) {
  try {
    const result = await exec(
      process.platform === "win32" ? "where.exe" : "which",
      [name],
      { timeout: 6000, windowsHide: true },
    );
    const found = result.stdout.trim().split(/\r?\n/);
    return process.platform === "win32"
      ? found.find((x) => /\.exe$/i.test(x)) ||
          found.find((x) => /\.cmd$/i.test(x)) ||
          ""
      : found[0] || "";
  } catch {
    return "";
  }
}
export async function discover(
  id: ProviderId,
  custom?: string,
): Promise<Provider> {
  let exe = custom || "";
  try {
    // Preserve explicit legacy/API-key connections. New Gemini connections
    // prefer Google's consumer replacement, including a newly installed CLI
    // whose PATH has not yet reached the desktop process.
    if (!exe && id === "gemini") {
      exe = await findOnPath("agy");
      if (!exe) {
        const installed =
          process.platform === "win32"
            ? path.join(process.env.LOCALAPPDATA || "", "agy", "bin", "agy.exe")
            : path.join(os.homedir(), ".local", "bin", "agy");
        if (fs.existsSync(installed)) exe = installed;
      }
    }
    if (!exe) {
      exe = await findOnPath(id);
    }
    if (!exe && process.platform === "win32") {
      const candidates = [
        ...(["claude", "codex"].includes(id)
          ? [
              path.join(
                process.env.USERPROFILE || "",
                ".local",
                "bin",
                `${id}.exe`,
              ),
            ]
          : []),
        path.join(process.env.APPDATA || "", "npm", `${id}.cmd`),
      ];
      exe = candidates.find((candidate) => fs.existsSync(candidate)) || "";
    }
    if (!exe && id === "codex" && process.platform === "win32") {
      const dir = path.join(
        process.env.LOCALAPPDATA || "",
        "OpenAI",
        "Codex",
        "bin",
      );
      if (fs.existsSync(dir)) {
        const bins = fs
          .readdirSync(dir)
          .map((x) => path.join(dir, x, "codex.exe"))
          .filter((x) => fs.existsSync(x));
        exe =
          bins.sort(
            (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
          )[0] || "";
      }
    }
    if (!exe)
      throw Error(
        "자동으로 찾지 못했어요. CLI를 설치하거나 실행 경로를 지정해주세요.",
      );
    const version = await invokeCapture(exe, ["--version"]);
    return {
      id,
      name: id === "codex" ? "Codex" : id === "claude" ? "Claude" : "Gemini",
      path: exe,
      version: version.trim().split(/\r?\n/)[0],
      available: true,
      backend: id === "gemini" && isAntigravityPath(exe) ? "agy" : undefined,
    };
  } catch (e) {
    return {
      id,
      name: id === "codex" ? "Codex" : id === "claude" ? "Claude" : "Gemini",
      path: exe,
      version: "",
      available: false,
      backend: id === "gemini" && isAntigravityPath(exe) ? "agy" : undefined,
      error: String((e as Error).message),
    };
  }
}
export function resolveNpmEntry(dir: string, name: string): string | undefined {
  const packages: Record<string, { name: string; legacy: string }> = {
    gemini: { name: "@google/gemini-cli", legacy: "dist/index.js" },
    codex: { name: "@openai/codex", legacy: "bin/codex.js" },
    claude: { name: "@anthropic-ai/claude-code", legacy: "cli.js" },
  };
  const spec = packages[name];
  if (!spec) return undefined;
  const root = path.resolve(dir, "node_modules", spec.name);
  const manifest = path.join(root, "package.json");
  let entry = spec.legacy;
  if (fs.existsSync(manifest)) {
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[name];
    if (typeof bin !== "string" || !bin) return undefined;
    entry = bin;
  }
  const target = path.resolve(root, entry);
  const relative = path.relative(root, target);
  if (
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    !/\.(?:[cm]?js|exe)$/i.test(target) ||
    !fs.existsSync(target)
  )
    return undefined;
  return target;
}
export function command(exe: string, args: string[]) {
  if (process.platform === "win32" && /\.(cmd|ps1)$/i.test(exe)) {
    const dir = path.dirname(exe),
      base = path.basename(exe).replace(/\.(cmd|ps1)$/i, "");
    const script = resolveNpmEntry(dir, base.toLowerCase());
    if (script && /\.exe$/i.test(script)) return { exe: script, args };
    if (script)
      return {
        exe: process.platform === "win32" ? "node.exe" : "node",
        args: [script, ...args],
      };
    throw Error(
      "이 CLI 래퍼는 자동 실행을 지원하지 않습니다. 네이티브 실행파일 경로를 지정해주세요.",
    );
  }
  return { exe, args };
}
export function invokeCapture(exe: string, args: string[]) {
  const c = command(exe, args);
  return exec(c.exe, c.args, {
    timeout: 10000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  }).then((r) => r.stdout || r.stderr);
}
export interface Parsed {
  reportedModel?: string;
  protocol?: "agy";
  answer?: string;
  answerMode?: "append" | "replace";
  requests?: { id: string; file?: string; kind: "read" | "write" }[];
  results?: { id: string; ok: boolean }[];
  text?: string;
  activity?: string;
  usage?: Usage;
  sessionId?: string;
  status?: RunStatus;
  error?: string;
  files?: string[];
  references?: string[];
  requestId?: string;
}
function parseAntigravity(e: any): Parsed {
  if (e.event === "init")
    return { sessionId: e.conversation_id, activity: "작업 준비 중" };
  if (e.event === "step_update") {
    const step = e.step_update || {};
    if (step.step_type === "agent_response")
      return {
        text: typeof step.text_delta === "string" ? step.text_delta : undefined,
        answer:
          typeof step.text_delta === "string" ? step.text_delta : undefined,
        activity: "답변 작성 중",
      };
    if (step.step_type === "tool") {
      const info = step.tool_info || {};
      const name = step.tool_name || info.name || "도구";
      const params = info.parameters || {};
      const read = ["view_file", "sed_file"].includes(name);
      const write = [
        "write_to_file",
        "replace_file_content",
        "multi_replace_file_content",
      ].includes(name);
      const file = params.AbsolutePath || params.TargetFile || params.File;
      const done = step.state === "DONE";
      return {
        activity: `도구 ${name} ${done ? "완료" : "실행 중"}`,
        text: `Tool ${name} · ${step.state || "ACTIVE"}${info.error ? " · 오류" : ""}\n`,
        // Only successful terminal tool events establish a file relationship.
        // ACTIVE events may be repeated and do not prove that a file was read.
        files:
          done && !info.error && write && typeof file === "string"
            ? [file]
            : undefined,
        references:
          done && !info.error && read && typeof file === "string"
            ? [file]
            : undefined,
      };
    }
    return {};
  }
  if (e.event === "result") {
    const result = e.result || {};
    const status: RunStatus =
      result.status === "SUCCESS"
        ? "completed"
        : ["WAITING", "RUNNING"].includes(result.status)
          ? "waiting"
          : ["CANCELED", "INTERRUPTED"].includes(result.status)
            ? "cancelled"
            : "failed";
    return {
      sessionId: result.conversation_id,
      status,
      answer:
        status === "completed" &&
        typeof result.response === "string" &&
        result.response.trim()
          ? result.response
          : undefined,
      answerMode: "replace",
      text:
        status === "completed" && typeof result.response === "string"
          ? result.response + "\n"
          : undefined,
      usage: {
        ...fromUsage("agy", result.usage || {}),
        source: "Antigravity CLI 최종 보고값",
      },
      error:
        status === "completed"
          ? undefined
          : typeof result.error === "string" && result.error
            ? result.error
            : result.error?.message ||
              (status === "waiting"
                ? "Antigravity 실행이 완료되지 않았습니다. 직접 조작 CLI에서 응답 필요 상태를 확인해주세요."
                : `Antigravity 실행 종료: ${result.status || "상태 미확인"}`),
    };
  }
  return {};
}
export function parseLine(provider: ProviderId, line: string): Parsed {
  let e: any;
  try {
    e = JSON.parse(line);
  } catch {
    return { text: line + "\n" };
  }
  if (!e || typeof e !== "object") return {};
  if (provider === "gemini" && typeof e.event === "string")
    return { ...parseAntigravity(e), protocol: "agy" };
  if (provider === "codex") {
    if (e.type === "thread.started") return { sessionId: e.thread_id };
    if (e.type === "turn.completed")
      return { usage: fromUsage(provider, e.usage || {}) };
    if (e.type === "turn.failed" || e.type === "error")
      return { error: e.error?.message || e.message || "Codex 실행 오류" };
    const item = e.item;
    if (item) {
      if (item.type === "agent_message" && e.type === "item.completed")
        return { text: item.text + "\n", answer: item.text + "\n\n" };
      if (item.type === "command_execution")
        return {
          activity: item.status === "completed" ? "명령 완료" : "명령 실행 중",
          text: `$ ${item.command}\n${item.aggregated_output || ""}\n`,
        };
      if (
        item.type === "file_change" &&
        e.type === "item.completed" &&
        item.status !== "failed"
      )
        return {
          activity: "파일 수정 중",
          files: (item.changes || []).map((x: any) => x.path),
          text:
            (item.changes || []).map((x: any) => `Edit ${x.path}`).join("\n") +
            "\n",
        };
      if (item.type === "mcp_tool_call")
        return {
          activity: `도구 실행 · ${item.tool || item.name || "스킬"}`,
          text: `Tool ${item.tool || item.name || ""}\n`,
        };
    }
  }
  if (provider === "claude") {
    if (e.type === "system")
      return {
        sessionId: e.session_id,
        reportedModel: typeof e.model === "string" ? e.model : undefined,
        activity: e.subtype === "init" ? "작업 준비 중" : undefined,
      };
    if (e.type === "assistant") {
      let text = "";
      let answer = "";
      let activity;
      const requests: NonNullable<Parsed["requests"]> = [];
      for (const c of e.message?.content || []) {
        if (c.type === "text") {
          text += c.text + "\n";
          answer += c.text + "\n\n";
        }
        if (c.type === "tool_use") {
          activity = `${c.name} 실행 중`;
          text += `Tool ${c.name}\n`;
          if (c.name === "Read" && c.input?.file_path)
            requests.push({ id: c.id, file: c.input.file_path, kind: "read" });
          if (["Edit", "Write"].includes(c.name) && c.input?.file_path)
            requests.push({ id: c.id, file: c.input.file_path, kind: "write" });
        }
      }
      return {
        text,
        answer,
        activity,
        requests,
        requestId: e.message?.id,
      };
    }
    if (e.type === "user")
      return {
        results: (e.message?.content || [])
          .filter((c: any) => c.type === "tool_result")
          .map((c: any) => ({ id: c.tool_use_id, ok: !c.is_error })),
      };
    if (e.type === "result")
      return {
        text: (e.result || e.errors?.join("\n") || "") + "\n",
        answer:
          !e.is_error && typeof e.result === "string" && e.result
            ? e.result
            : undefined,
        answerMode: "replace",
        usage: {
          ...fromUsage(provider, e.usage || {}),
          cost: typeof e.total_cost_usd === "number" ? e.total_cost_usd : null,
        },
        error: e.permission_denials?.length
          ? "추가 도구 권한이 필요합니다. 직접 조작 CLI에서 확인해주세요."
          : e.is_error
            ? e.result || "Claude 실행 오류"
            : undefined,
      };
  }
  if (provider === "gemini") {
    if (e.type === "init")
      return {
        sessionId: e.session_id,
        reportedModel: typeof e.model === "string" ? e.model : undefined,
      };
    if (e.type === "message" && e.role === "assistant")
      return { text: e.content || "", answer: e.content || "" };
    if (e.type === "tool_use")
      return {
        activity: `${e.tool_name || e.name || "도구"} 실행 중`,
        text: `Tool ${e.tool_name || e.name || ""}\n`,
        requests: ["read_file", "write_file", "replace"].includes(e.tool_name)
          ? [
              {
                id: e.tool_id,
                file:
                  e.parameters?.file_path ||
                  e.parameters?.absolute_path ||
                  e.parameters?.path,
                kind: e.tool_name === "read_file" ? "read" : "write",
              },
            ]
          : undefined,
      };
    if (e.type === "tool_result")
      return { results: [{ id: e.tool_id, ok: e.status === "success" }] };
    if (e.type === "result")
      return {
        usage: fromUsage(provider, e.stats || {}),
        error:
          e.status === "error"
            ? e.error?.message || "Gemini 실행 오류"
            : undefined,
      };
    if (e.type === "error")
      return e.severity === "warning"
        ? { text: `경고: ${e.message}\n` }
        : { error: e.message || e.error?.message || "Gemini 실행 오류" };
  }
  return {};
}
export function structuredCommand(
  provider: ProviderId,
  prompt: string,
  teamConfig?: { url: string },
  antigravityWorkspace?: string,
  model?: string,
  readOnly = false,
) {
  const base =
    provider === "codex"
      ? [
          "exec",
          "--json",
          "--skip-git-repo-check",
          "--color",
          "never",
          "--sandbox",
          teamConfig || readOnly ? "read-only" : "workspace-write",
        ]
      : provider === "claude"
        ? ["-p", "--verbose", "--output-format", "stream-json"]
        : ["-p", prompt, "--output-format", "stream-json"];
  if (provider === "codex" && teamConfig) {
    base.push(
      "-c",
      `mcp_servers.workroom.url=${JSON.stringify(teamConfig.url)}`,
      "-c",
      'mcp_servers.workroom.bearer_token_env_var="WORKROOM_MCP_TOKEN"',
      "-c",
      "mcp_servers.workroom.required=true",
      "-c",
      'mcp_servers.workroom.enabled_tools=["run_skill","get_run","browser_snapshot","browser_action"]',
      "-c",
      'mcp_servers.workroom.tools.run_skill.approval_mode="approve"',
      "-c",
      'mcp_servers.workroom.tools.get_run.approval_mode="approve"',
      "-c",
      'mcp_servers.workroom.tools.browser_snapshot.approval_mode="approve"',
      "-c",
      'mcp_servers.workroom.tools.browser_action.approval_mode="approve"',
    );
  }
  base.push(...modelArgs(model));
  if (provider === "codex") base.push("-");
  if (provider === "claude") base.push(prompt);
  if (provider === "gemini" && antigravityWorkspace)
    base.push("--add-dir", antigravityWorkspace);
  return base;
}
export function antigravityPermissionError(diagnostics: string) {
  // AGY can exit 0 with SUCCESS after denying a tool. This notice is sent
  // on stderr, sometimes after the final JSON event, so inspect it on close.
  if (
    !/headless mode cannot prompt|(?:tool|permission)[^\n]*(?:auto-denied|soft-denied)|(?:auto-denied|soft-denied)[^\n]*(?:tool|permission)/i.test(
      diagnostics,
    )
  )
    return undefined;
  const permission = diagnostics.match(
    /required the ["']([^"']+)["'] permission/i,
  )?.[1];
  return `Gemini(agy)에 ${permission || "추가 도구"} 권한이 필요합니다. 오른쪽 Gemini 모니터에서 프로젝트 범위와 필요한 권한을 확인한 뒤 다시 요청해주세요.`;
}
export async function codexQuota(exe: string): Promise<Provider["quota"]> {
  return new Promise((resolve) => {
    const c = command(exe, ["app-server", "--listen", "stdio://"]);
    const p = spawn(c.exe, c.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let buffer = "";
    let done = false;
    const finish = (v: Provider["quota"]) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      p.kill();
      resolve(v);
    };
    const timer = setTimeout(() => finish(undefined), 18000);
    p.on("error", () => finish(undefined));
    p.on("exit", () => finish(undefined));
    p.stderr.resume();
    const send = (x: unknown) => p.stdin.write(JSON.stringify(x) + "\n");
    p.stdin.on("error", () => finish(undefined));
    p.stdout.on("data", (b) => {
      buffer += b.toString();
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const l = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        try {
          const e = JSON.parse(l);
          if (e.id === 1) {
            send({ method: "initialized", params: {} });
            send({ id: 2, method: "account/rateLimits/read", params: {} });
          }
          if (e.id === 2) {
            const r = e.result;
            const buckets = r?.rateLimitsByLimitId
              ? Object.entries(r.rateLimitsByLimitId)
              : [["default", r?.rateLimits]];
            const out: any[] = [];
            for (const [limitId, b] of buckets as any[]) {
              for (const w of [b?.primary, b?.secondary])
                if (w && typeof w.usedPercent === "number")
                  out.push({
                    limitId,
                    used: w.usedPercent,
                    windowMinutes:
                      typeof w.windowDurationMins === "number"
                        ? w.windowDurationMins
                        : null,
                    reset: typeof w.resetsAt === "number" ? w.resetsAt : null,
                    checkedAt: Date.now(),
                  });
            }
            finish(out.length ? out : undefined);
          }
        } catch {}
      }
    });
    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "agent_workroom", version: "0.1.0" },
        capabilities: { experimentalApi: true },
      },
    });
  });
}
