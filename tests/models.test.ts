import { describe, it, expect } from "vitest";
import { structuredCommand } from "../electron/providers";
import { modelSchema } from "../electron/model-selection";
import { parseAgyModels, parseClaudeModels } from "../electron/models";
import { importSchema } from "../electron/import-schema";

describe("model selection contracts", () => {
  it.each(["codex", "claude", "gemini"] as const)(
    "passes %s model separately from the prompt",
    (provider) => {
      const args = structuredCommand(
        provider,
        "prompt --model fake",
        undefined,
        undefined,
        "chosen-model",
      );
      expect(args[args.indexOf("--model") + 1]).toBe("chosen-model");
      expect(args.filter((arg) => arg === "--model")).toHaveLength(1);
      if (provider === "claude")
        expect(args.at(-1)).toBe("prompt --model fake");
      if (provider === "codex") expect(args.at(-1)).toBe("-");
      expect(
        structuredCommand(provider, "hello", undefined, undefined, ""),
      ).not.toContain("--model");
    },
  );
  it("keeps model args alongside AGY workspace and Codex team restrictions", () => {
    expect(
      structuredCommand(
        "gemini",
        "hello",
        undefined,
        "C:/한글 프로젝트",
        "gemini-model",
      ),
    ).toContain("C:/한글 프로젝트");
    const args = structuredCommand(
      "codex",
      "hello",
      { url: "http://127.0.0.1/mcp" },
      undefined,
      "leader-model",
    );
    expect(args[args.indexOf("--sandbox") + 1]).toBe("read-only");
    expect(args).toContain("mcp_servers.workroom.required=true");
  });
  it("reads live AGY rows and installed Claude aliases without inventing account access", () => {
    expect(
      parseAgyModels(
        "Fetching available models...\nmodel-a\tModel A\nmodel-b\tModel B\nmodel-a\tModel A",
      ),
    ).toEqual([
      { id: "model-a", name: "Model A" },
      { id: "model-b", name: "Model B" },
    ]);
    expect(
      parseClaudeModels(
        "--model <model> an alias (e.g. 'new-alias', 'opus') or 'claude-full-id'\n  --next <x>",
      ).map((x) => x.id),
    ).toContain("new-alias");
    expect(
      parseClaudeModels("--model <model> alias 'opus' or 'claude-full-id'").map(
        (x) => x.id,
      ),
    ).not.toContain("claude-full-id");
  });
  it("accepts model IDs but rejects option or control injection", () => {
    for (const id of [
      "opus[1m]",
      "arn:aws:bedrock:region:account:inference-profile/model",
      " gpt-model ",
      "",
    ])
      expect(modelSchema.safeParse(id).success).toBe(true);
    for (const id of [
      "--help",
      "model\n--help",
      'model";bad',
      "model with spaces",
      null,
      42,
    ])
      expect(modelSchema.safeParse(id).success).toBe(false);
  });
  it("preserves old exports while validating new model defaults", () => {
    const old = {
      format: "agent-workroom",
      version: 1,
      projects: [],
      skills: [],
      versions: [],
      automations: [],
    };
    expect(importSchema.parse(old).modelDefaults).toBeUndefined();
    expect(
      importSchema.parse({
        ...old,
        modelDefaults: { codex: "chosen-model", claude: "" },
      }).modelDefaults,
    ).toEqual({ codex: "chosen-model", claude: "" });
    expect(() =>
      importSchema.parse({ ...old, modelDefaults: { codex: "--help" } }),
    ).toThrow();
  });
});
