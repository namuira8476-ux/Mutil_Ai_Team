import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ModelPicker from "../src/ModelPicker";
import { ENTERPRISE_MODELS, enterpriseModel } from "../src/enterprise-models";
it("limits enterprise Gemini to Flash 3.5 and Pro 3.1 and replaces legacy defaults", () => {
  const p = { id: "gemini" as const };
  expect(ENTERPRISE_MODELS.map((m) => m.id)).toEqual([
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
  ]);
  for (const value of [undefined, "", "auto", "gemini-3.7-flash-low"])
    expect(enterpriseModel(p, value)).toBe("gemini-3.5-flash");
  expect(enterpriseModel(p, "gemini-3.1-pro-preview")).toBe(
    "gemini-3.1-pro-preview",
  );
  expect(
    enterpriseModel({ ...p, backend: "agy" }, "gemini-3.7-flash-low"),
  ).toBe("gemini-3.7-flash-low");
  expect(enterpriseModel({ id: "codex" }, "custom-model")).toBe("custom-model");
});
it("shows only the two enterprise models without custom input or CLI defaults", () => {
  const html = renderToStaticMarkup(
    createElement(ModelPicker, {
      provider: {
        id: "gemini",
        name: "Gemini",
        available: true,
        path: "gemini.cmd",
        version: "fixture",
      },
      value: "legacy-model",
      onChange: () => {},
      label: "Gemini model",
    }),
  );
  expect(html.match(/<option /g)).toHaveLength(2);
  expect(html).toContain("Gemini 3.5 Flash");
  expect(html).toContain("Gemini 3.1 Pro");
  expect(html).not.toContain("__custom__");
  expect(html).not.toContain("__cli__");
  expect(html).not.toContain("<input");
});
