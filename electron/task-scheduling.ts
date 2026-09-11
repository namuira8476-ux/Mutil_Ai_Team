import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { safePath } from "./domain";
import type { TaskResources, Run } from "../src/shared";
export const resourcesSchema = z
  .object({
    reads: z.array(z.string().min(1).max(2048)).max(64),
    writes: z.array(z.string().min(1).max(2048)).max(64),
  })
  .strict();
function canonical(root: string, p: string) {
  const target = safePath(root, p);
  let ancestor = target;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const resolved = path.join(
    fs.realpathSync(ancestor),
    path.relative(ancestor, target),
  );
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
export function taskResources(
  root: string,
  value: unknown,
): TaskResources | undefined {
  if (value === undefined) return;
  const v = resourcesSchema.parse(value);
  return {
    reads: [...new Set(v.reads.map((p) => canonical(root, p)))],
    writes: [...new Set(v.writes.map((p) => canonical(root, p)))],
  };
}
function overlaps(a: string, b: string) {
  const rel = path.relative(a, b);
  return (
    rel === "" ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
}
export function resourcesConflict(a?: TaskResources, b?: TaskResources) {
  if (!a || !b) return true;
  const same = (x: string, y: string) => overlaps(x, y) || overlaps(y, x);
  return (
    a.writes.some((x) => [...b.reads, ...b.writes].some((y) => same(x, y))) ||
    b.writes.some((x) => a.reads.some((y) => same(x, y)))
  );
}
export function queueWait(run: Run, runs: Run[]) {
  const pending = (run.dependsOn || []).map(id => runs.find(r => r.id === id))
    .filter((r): r is Run => !!r && r.status !== "completed");
  if (pending.length) return { queueReason: "선행 작업 완료 대기", blockerIds: pending.map(r => r.id) };
  const active = runs.filter(r => r.status === "running" && r.id !== run.id);
  const terminal = active.find(r => r.projectId === run.projectId && r.mode === "terminal");
  if (terminal) return { queueReason: `${terminal.provider === "gemini" ? "Gemini(agy)" : terminal.provider} 직접 조작 CLI가 프로젝트를 사용 중입니다. CLI 확인을 마친 뒤 종료하면 자동 실행됩니다.`, blockerIds: [terminal.id] };
  const slots = active.filter(r => run.mode === "team" ? r.mode === "team" : r.mode !== "team" && r.mode !== "terminal");
  if (slots.length >= 3) return { queueReason: "동시 실행 자리 대기 · 최대 3개", blockerIds: slots.map(r => r.id) };
  const conflicts = active.filter(r => r.projectId === run.projectId &&
    (run.mode === "team" ? r.mode === "team" : r.mode !== "team" && resourcesConflict(run.resources, r.resources)));
  return conflicts.length ? { queueReason: "같은 프로젝트의 작업 범위가 겹쳐 대기 중입니다.", blockerIds: conflicts.map(r => r.id) } : {};
}
