import { it, expect } from "vitest";
import { efficientModel } from "../electron/team-routing";
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
