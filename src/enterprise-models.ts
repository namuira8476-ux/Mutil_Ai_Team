import type { Provider } from "./shared";
export const ENTERPRISE_MODELS = [
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
];
export const isEnterpriseGemini = (p?: Pick<Provider, "id" | "backend">) =>
  p?.id === "gemini" && p.backend !== "agy";
export function enterpriseModel(
  p: Pick<Provider, "id" | "backend">,
  value?: string,
) {
  if (!isEnterpriseGemini(p)) return value || "";
  return ENTERPRISE_MODELS.some((m) => m.id === value)
    ? value!
    : ENTERPRISE_MODELS[0].id;
}
