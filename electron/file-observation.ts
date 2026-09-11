import fs from "node:fs";
import path from "node:path";
import { safePath } from "./domain";
export function snapshotFiles(root: string, folders: string[]) {
  const result: Record<string, string> = {};
  let count = 0;
  const visit = (folder: string) => {
    if (count >= 5000 || !fs.existsSync(folder)) return;
    const info = fs.statSync(folder);
    if (info.isFile()) {
      result[path.relative(root, folder)] = `${info.size}:${info.mtimeMs}`;
      count++;
      return;
    }
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (count >= 5000) break;
      if (
        entry.isSymbolicLink() ||
        ["node_modules", ".git", ".workroom", ".runtime-test"].includes(
          entry.name,
        )
      )
        continue;
      const file = path.join(folder, entry.name);
      try {
        safePath(root, path.relative(root, file));
        if (entry.isDirectory()) visit(file);
        else if (entry.isFile()) {
          const stat = fs.statSync(file);
          result[path.relative(root, file)] = `${stat.size}:${stat.mtimeMs}`;
          count++;
        }
      } catch {}
    }
  };
  for (const folder of new Set(folders)) {
    try {
      visit(safePath(root, folder));
    } catch {}
  }
  return result;
}
export function changedFiles(
  before: Record<string, string>,
  after: Record<string, string>,
) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (file) => before[file] !== after[file],
  );
}
