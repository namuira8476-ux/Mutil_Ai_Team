import { useEffect, useState } from "react";
import type { Provider } from "./shared";
import {
  ENTERPRISE_MODELS,
  enterpriseModel,
  isEnterpriseGemini,
} from "./enterprise-models";

export default function ModelPicker({
  provider,
  value,
  onChange,
  label,
  inheritLabel,
  disabled = false,
}: {
  provider?: Provider;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  label: string;
  inheritLabel?: string;
  disabled?: boolean;
}) {
  const restricted = isEnterpriseGemini(provider);
  const options = restricted ? ENTERPRISE_MODELS : provider?.models || [];
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(value || "");
  }, [value]);
  const unknown = !!value && !options.some((option) => option.id === value);
  const selected =
    custom || unknown
      ? "__custom__"
      : value === undefined && inheritLabel
        ? "__inherit__"
        : value || "__cli__";
  const apply = () => {
    const model = draft.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/@+[\]-]{0,199}$/.test(model)) {
      setError("모델 ID를 확인해주세요.");
      return;
    }
    setError("");
    onChange(model);
    setCustom(false);
  };
  return (
    <div className="model-picker">
      <label>
        <span>{label}</span>
        <select
          aria-label={label}
          value={
            restricted
              ? value === undefined && inheritLabel
                ? "__inherit__"
                : enterpriseModel(provider!, value)
              : selected
          }
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value;
            setError("");
            if (next === "__custom__") {
              setCustom(true);
              setDraft(value || "");
              return;
            }
            setCustom(false);
            onChange(
              next === "__inherit__"
                ? undefined
                : next === "__cli__"
                  ? ""
                  : next,
            );
          }}
        >
          {inheritLabel && <option value="__inherit__">{inheritLabel}</option>}
          {!restricted && <option value="__cli__">CLI 기본값</option>}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
          {!restricted && <option value="__custom__">모델 ID 직접 입력</option>}
        </select>
      </label>
      {!restricted && (custom || unknown) && (
        <div className="model-custom">
          <input
            aria-label={`${label} ID`}
            value={draft}
            maxLength={200}
            disabled={disabled}
            placeholder="모델 ID"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.stopPropagation();
                apply();
              }
            }}
          />
          <button
            type="button"
            className="outline"
            disabled={disabled}
            onClick={apply}
          >
            적용
          </button>
        </div>
      )}
      {restricted && (
        <small>
          기업용은 두 모델만 사용합니다. 미설정·이전 모델은 3.5 Flash로
          적용됩니다.
        </small>
      )}
      {error && (
        <small role="alert" className="model-error">
          {error}
        </small>
      )}
    </div>
  );
}
