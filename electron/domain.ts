import path from "node:path";
import { existsSync, realpathSync } from "node:fs";
import type { Automation, Run, Usage } from "../src/shared";
export function safePath(root: string, relative: string) {
  const base = path.resolve(root),
    target = path.resolve(base, relative);
  const delta = path.relative(base, target);
  if (
    delta === ".." ||
    delta.startsWith(".." + path.sep) ||
    path.isAbsolute(delta)
  )
    throw Error("프로젝트 폴더 밖의 경로입니다.");
  let ancestor = target;
  while (!existsSync(ancestor) && path.dirname(ancestor) !== ancestor)
    ancestor = path.dirname(ancestor);
  if (existsSync(base) && existsSync(ancestor)) {
    const actualBase = realpathSync(base),
      actual = realpathSync(ancestor);
    const rel = path.relative(actualBase, actual);
    if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel))
      throw Error("프로젝트 밖으로 연결되는 경로입니다.");
  }
  return target;
}
export function assertNoWatchCycle(root: string, rules: Automation[]) {
  const watches = rules.filter((a) => a.enabled && a.trigger === "file");
  const within = (a: string, b: string) => {
    const rel = path.relative(a, b);
    return (
      rel === "" ||
      (!rel.startsWith(".." + path.sep) &&
        rel !== ".." &&
        !path.isAbsolute(rel))
    );
  };
  const edges = new Map(
    watches.map((a) => [
      a.id,
      watches
        .filter((b) => {
          const output = safePath(root, a.output),
            input = safePath(root, b.input);
          return within(output, input) || within(input, output);
        })
        .map((b) => b.id),
    ]),
  );
  const done = new Set<string>(),
    stack = new Set<string>();
  const visit = (id: string) => {
    if (stack.has(id))
      throw Error(
        "파일 자동화의 결과가 서로의 입력으로 돌아오는 순환이 있습니다. 결과 폴더를 분리해주세요.",
      );
    if (done.has(id)) return;
    stack.add(id);
    for (const target of edges.get(id) || []) visit(target);
    stack.delete(id);
    done.add(id);
  };
  for (const a of watches) visit(a.id);
}
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
export function clockParts(ms: number, timezone: string) {
  if (!dateFormatters.has(timezone))
    dateFormatters.set(
      timezone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        weekday: "short",
      }),
    );
  const p = dateFormatters.get(timezone)!.formatToParts(ms);
  const get = (name: string) => p.find((v) => v.type === name)?.value || "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      get("weekday"),
    ),
  };
}
export function nextDue(a: Automation, after: number) {
  if (a.trigger !== "schedule") return undefined;
  let t = Math.floor(after / 60000) * 60000 + 60000;
  for (let i = 0; i < 8 * 24 * 60; i++, t += 60000) {
    const p = clockParts(t, a.timezone);
    if (p.time === a.time && (!a.weekdays.length || a.weekdays.includes(p.day)))
      return t;
  }
  return undefined;
}
export function latestDue(a: Automation, now: number) {
  const floor = Math.floor(now / 60000) * 60000;
  for (let i = 0; i < 24 * 60; i++) {
    const t = floor - i * 60000,
      p = clockParts(t, a.timezone);
    if (p.time === a.time && (!a.weekdays.length || a.weekdays.includes(p.day)))
      return { at: t, key: `${a.id}:${p.date}:${p.time}` };
  }
  return undefined;
}
export function exclusiveUsage(runs: Run[]) {
  const ids = new Set(runs.map((r) => r.id));
  const rows = runs.filter(
    (r) =>
      r.usage.scope !== "inclusive" ||
      !runs.some((c) => c.parentId === r.id && ids.has(c.id)),
  );
  return {
    total: rows.reduce((s, r) => s + (r.usage.total ?? 0), 0),
    known: rows.filter((r) => r.usage.total !== null).length,
    unknown: rows.filter((r) => r.usage.total === null).length,
    cost: rows.reduce((s, r) => s + (r.usage.cost ?? 0), 0),
  };
}
export function fromUsage(provider: string, u: Record<string, any>): Usage {
  const n = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const input = n(u.input_tokens ?? u.inputTokens ?? u.input),
    output = n(u.output_tokens ?? u.outputTokens ?? u.output);
  const cached = n(
    u.cached_input_tokens ??
      u.cache_read_input_tokens ??
      u.cache_read_tokens ??
      u.cached ??
      u.cachedContentTokenCount,
  );
  const write = n(u.cache_creation_input_tokens) ?? 0;
  const total =
    n(u.total_tokens ?? u.totalTokens ?? u.total) ??
    (input !== null && output !== null
      ? input + output + (provider === "claude" ? (cached ?? 0) + write : 0)
      : null);
  return {
    input,
    output,
    cached,
    total,
    cost: n(u.total_cost_usd),
    scope: "direct",
    source: "공급자 보고값",
  };
}
