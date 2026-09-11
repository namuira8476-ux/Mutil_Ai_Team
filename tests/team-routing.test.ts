import { it, expect } from "vitest";
import { delegatedModel, efficientModel } from "../electron/team-routing";
it("uses CLI defaults for unlisted enterprise workers instead of guessed agy models", () => {
  expect(delegatedModel([], "gemini-3.7-flash-low")).toBe("");
  expect(delegatedModel([], undefined)).toBe("");
});
it("preserves explicit user models and explicit CLI defaults", () => {
  expect(delegatedModel([], "guessed", "enterprise-model")).toBe(
    "enterprise-model",
  );
  expect(delegatedModel([], "guessed", "")).toBe("");
});
it("still validates coordinator choices against a supplied catalog", () => {
  const catalog = [{ id: "gemini-flash", name: "Flash" }];
  expect(() => delegatedModel(catalog, "unknown")).toThrow("확인된 모델 목록");
  expect(delegatedModel(catalog, "gemini-flash")).toBe("gemini-flash");
  expect(delegatedModel(catalog)).toBeUndefined();
});
const models = [
  "claude-flash",
  "gemini-pro",
  "gemini-flash",
  "gemini-flash-lite",
].map((id) => ({ id, name: id }));
it("selects Gemini models by task without crossing provider families", () => {
  expect(efficientModel("gemini", models, "카드뉴스 초안").model).toBe(
    "gemini-flash",
  );
  expect(efficientModel("gemini", models, "복잡한 아키텍처 설계").model).toBe(
    "gemini-pro",
  );
  expect(efficientModel("gemini", [models[0]], "초안").model).toBe("");
  expect(efficientModel("gemini", [], "초안").model).toBe("");
});
