import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveNpmEntry } from "../electron/providers";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "workroom-cli-paths-"));
afterAll(() => {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()))
    throw Error("Unexpected test path");
  fs.rmSync(resolved, { recursive: true, force: true });
});

function fixture(name: string, bin?: unknown) {
  const dir = path.join(root, name);
  const pkg = path.join(dir, "node_modules", "@google", "gemini-cli");
  fs.mkdirSync(path.join(pkg, "bundle"), { recursive: true });
  fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
  fs.writeFileSync(path.join(pkg, "bundle", "gemini.js"), "");
  fs.writeFileSync(path.join(pkg, "dist", "index.js"), "");
  if (bin !== undefined)
    fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ bin }));
  return { dir, pkg };
}

describe("installed CLI entry point resolution", () => {
  it("uses the current Gemini package bin instead of its former dist path", () => {
    const { dir, pkg } = fixture("current", { gemini: "bundle/gemini.js" });
    expect(resolveNpmEntry(dir, "gemini")).toBe(
      path.join(pkg, "bundle", "gemini.js"),
    );
    const stringBin = fixture("string-bin", "bundle/gemini.js");
    expect(resolveNpmEntry(stringBin.dir, "gemini")).toBe(
      path.join(stringBin.pkg, "bundle", "gemini.js"),
    );
  });
  it("supports legacy fixtures but rejects missing, outside and shell entry points", () => {
    const legacy = fixture("legacy");
    expect(resolveNpmEntry(legacy.dir, "gemini")).toBe(
      path.join(legacy.pkg, "dist", "index.js"),
    );
    for (const [i, bin] of [
      "../outside.js",
      "bundle/missing.js",
      "bundle/start.cmd",
    ].entries()) {
      const f = fixture(`invalid-${i}`, { gemini: bin });
      expect(resolveNpmEntry(f.dir, "gemini")).toBeUndefined();
    }
    expect(resolveNpmEntry(legacy.dir, "unrecognized-cli")).toBeUndefined();
  });
});
