import { z } from "zod";

// Empty means the CLI's own default. Undefined means inherit the app default.
// Arguments are passed as argv entries, never interpolated into a shell.
export const modelSchema = z
  .string()
  .trim()
  .max(200)
  .refine(
    (value) =>
      value === "" || /^[A-Za-z0-9][A-Za-z0-9._:/@+[\]-]*$/.test(value),
    "모델 ID에는 영문·숫자와 . _ : / @ + [ ] - 기호를 사용할 수 있습니다.",
  );
export const modelDefaultsSchema = z.object({
  codex: modelSchema.optional(),
  claude: modelSchema.optional(),
  gemini: modelSchema.optional(),
});
export const normalizeModel = (value?: string) =>
  modelSchema.parse(value === undefined ? "" : value);
export const modelArgs = (value?: string) => {
  const model = normalizeModel(value);
  return model ? ["--model", model] : [];
};
