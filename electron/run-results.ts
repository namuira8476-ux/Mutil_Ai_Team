import fs from "node:fs";
import path from "node:path";
import { safePath } from "./domain";
import type { Run } from "../src/shared";

export const viewableResult = /\.(pdf|png|jpe?g|gif|webp|svg|txt|md|json|csv|xlsx?|docx?|pptx?|html?|mp4|webm|mp3|wav)$/i;
export function runResults(root: string, run: Run, runs: Run[]) {
  const related = runs.filter(r => r.projectId === run.projectId && (r.id === run.id || r.parentId === run.id));
  const files = new Map<string, { path: string; exists: boolean; canOpen: boolean }>();
  for (const r of related) for (const candidate of [...r.files, ...(r.detectedFiles || [])]) {
    try {
      const absolute = safePath(root, candidate);
      const relative = path.relative(root, absolute);
      const exists = fs.existsSync(absolute) && fs.statSync(absolute).isFile();
      files.set(process.platform === "win32" ? relative.toLowerCase() : relative,
        { path: relative, exists, canOpen: exists && viewableResult.test(relative) });
    } catch { /* Untrusted CLI paths outside the project are never exposed. */ }
  }
  return [...files.values()].sort((a,b) => Number(b.exists)-Number(a.exists) || a.path.localeCompare(b.path));
}
