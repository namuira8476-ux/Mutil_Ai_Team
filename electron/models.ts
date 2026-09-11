import { spawn } from "node:child_process";
import type { ModelOption, Provider } from "../src/shared";
import { command, invokeCapture } from "./providers";
import { modelSchema } from "./model-selection";
import { ENTERPRISE_MODELS } from "../src/enterprise-models";

const clean = (items: ModelOption[]) => [
  ...new Map(
    items
      .filter((item) => item.id && modelSchema.safeParse(item.id).success)
      .map((item) => [item.id, item]),
  ).values(),
];

export function parseAgyModels(output: string): ModelOption[] {
  return clean(
    output.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([A-Za-z0-9][\w.:/@+[\]-]*)\t+(.+)$/);
      return match ? [{ id: match[1], name: match[2].trim() }] : [];
    }),
  );
}

export function parseClaudeModels(help: string): ModelOption[] {
  const section =
    help.match(/--model\s+<model>([\s\S]*?)(?=\n\s+-|$)/)?.[1] || "";
  const aliases = [...section.matchAll(/['"]([a-z][a-z0-9-]*)['"]/g)]
    .map((match) => match[1])
    .filter((id) => !id.startsWith("claude-"));
  return clean(
    [...aliases, "opus", "sonnet", "haiku", "opusplan"].map((id) => ({
      id,
      name: `${id} · CLI 별칭`,
    })),
  );
}

export function codexModels(exe: string): Promise<ModelOption[]> {
  return new Promise((resolve, reject) => {
    const c = command(exe, ["app-server", "--listen", "stdio://"]);
    const child = spawn(c.exe, c.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let buffer = "",
      done = false,
      requestId = 2;
    const models: ModelOption[] = [];
    const cursors = new Set<string>();
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(clean(models));
    };
    const timer = setTimeout(
      () => finish(Error("모델 목록 조회 시간이 초과됐습니다.")),
      18000,
    );
    const send = (request: unknown) => {
      if (!done) child.stdin.write(JSON.stringify(request) + "\n");
    };
    child.on("error", (error) => finish(error));
    child.on("exit", () => {
      if (!done) finish(Error("모델 목록을 받기 전에 CLI가 종료됐습니다."));
    });
    child.stdin.on("error", (error) => finish(error));
    child.stderr.resume();
    child.stdout.on("data", (bytes) => {
      buffer += bytes.toString();
      if (buffer.length > 2 * 1024 * 1024)
        return finish(Error("모델 목록 응답이 너무 큽니다."));
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.id !== 1 && event.id !== requestId) continue;
        if (event.error)
          return finish(Error(event.error.message || "모델 목록 조회 실패"));
        if (event.id === 1) {
          send({ method: "initialized", params: {} });
          send({
            id: requestId,
            method: "model/list",
            params: { limit: 100, includeHidden: false },
          });
          continue;
        }
        if (!Array.isArray(event.result?.data))
          return finish(Error("모델 목록 형식을 확인할 수 없습니다."));
        for (const item of event.result.data) {
          if (item.hidden || typeof item.model !== "string") continue;
          models.push({
            id: item.model,
            name:
              typeof item.displayName === "string"
                ? item.displayName
                : item.model,
          });
        }
        const cursor = event.result.nextCursor;
        if (cursor) {
          if (
            typeof cursor !== "string" ||
            cursors.has(cursor) ||
            cursors.size >= 20
          )
            return finish(Error("모델 목록 페이지를 확인할 수 없습니다."));
          cursors.add(cursor);
          requestId++;
          send({
            id: requestId,
            method: "model/list",
            params: { limit: 100, includeHidden: false, cursor },
          });
        } else finish();
      }
    });
    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "agent_workroom", version: "0.1.7" },
        capabilities: { experimentalApi: true },
      },
    });
  });
}

export async function loadModels(
  provider: Provider,
): Promise<{ models: ModelOption[]; modelsSource: string }> {
  if (!provider.available) throw Error("CLI 연결을 먼저 확인해주세요.");
  if (provider.id === "codex")
    return {
      models: await codexModels(provider.path),
      modelsSource: "Codex model/list",
    };
  if (provider.id === "claude")
    return {
      models: parseClaudeModels(await invokeCapture(provider.path, ["--help"])),
      modelsSource: "설치된 Claude CLI 별칭 · 계정별 지원은 실행 시 확인",
    };
  if (provider.backend === "agy") {
    const models = parseAgyModels(
      await invokeCapture(provider.path, ["models"]),
    );
    if (!models.length)
      throw Error(
        "agy 모델 목록을 읽지 못했습니다. 직접 입력하거나 다시 조회해주세요.",
      );
    return { models, modelsSource: "agy models" };
  }
  return {
    models: ENTERPRISE_MODELS,
    modelsSource: "기업용 허용 모델 2종 · 계정 권한은 실행 시 확인",
  };
}
