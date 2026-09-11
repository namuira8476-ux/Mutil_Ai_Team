import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Print filenames and rule names only: never echo suspected credentials.
const violations = [];
const forbidden = /(?:^|\/)(?:projects|outputs|\.runtime-test|\.codex|\.claude|\.gemini|\.agy|\.ssh|browser-data)(?:\/|$)|(?:^|\/)(?:\.env(?:\..*)?|auth\.json|credentials(?:\.json)?|workroom\.sqlite.*|Cookies|Login Data|Local State)$|\.(?:pem|key|sqlite|sqlite3|db)$/i;
const secrets = [
  ["personal Windows path", /[A-Z]:[\\/]+Users[\\/]+(?!Public\b|Default\b)[a-z0-9_.-]+[\\/]/i],
  ["GitHub token", /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ["API key", /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}|AIza[A-Za-z0-9_-]{30,})/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];
function inspect(name, bytes) {
  if (forbidden.test(name) && name !== ".env.example") violations.push(`${name}: private file`);
  if (!bytes.includes(0)) {
    const content = bytes.toString("utf8");
    for (const [label, pattern] of secrets) if (pattern.test(content)) violations.push(`${name}: ${label}`);
  }
}
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
for (const file of files) inspect(file, fs.readFileSync(file));
// Inspect the actual package, including dependencies, before uploading it.
if (process.argv.includes("--package")) {
  const { listPackage, extractFile } = await import("@electron/asar");
  const archive = "release/win-unpacked/resources/app.asar";
  for (const entry of listPackage(archive)) {
    const name = entry.replace(/^[\\/]/, "").replaceAll("\\", "/");
    let bytes;
    try { bytes = extractFile(archive, name); } catch { continue; } // directory
    inspect(name, bytes);
  }
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (!file.endsWith("app.asar")) inspect(file.replaceAll("\\", "/"), fs.readFileSync(file));
    }
  }
  walk("release/win-unpacked/resources");
}
if (violations.length) {
  console.error([...new Set(violations)].join("\n"));
  process.exit(1);
}
console.log(`Privacy check passed (${files.length} tracked files${process.argv.includes("--package") ? " and packaged resources" : ""}). Pattern checks supplement manual review; they cannot detect every secret.`);
