import type { ModelOption, ProviderId } from "../src/shared";

export function efficientModel(
  provider: ProviderId,
  models: ModelOption[],
  task: string,
): { model: string; reason: string } {
  const complex =
    /설계|아키텍처|복잡|보안|심층|architecture|security|complex|deep review/i.test(
      task,
    );
  const available =
    provider === "gemini" ? models.filter((m) => /gemini/i.test(m.id)) : models;
  const preferences =
    provider === "gemini"
      ? complex
        ? [/pro/i, /flash/i]
        : [
            /flash.*low/i,
            /flash.*medium/i,
            /flash(?!.*lite)/i,
            /flash/i,
            /pro/i,
          ]
      : provider === "claude"
        ? complex
          ? [/sonnet/i, /opus/i]
          : [/haiku/i, /sonnet/i]
        : complex
          ? [/astra|gpt-6/i, /sol|terra/i]
          : [/mini|nano|luna|spark/i, /sol|terra/i];
  const model =
    preferences
      .map((pattern) => available.find((m) => pattern.test(m.id)))
      .find(Boolean)?.id || "";
  return {
    model,
    reason: model
      ? complex
        ? "복잡한 요청: 역량 우선 후보 선택"
        : "일반 요청: 경량 후보 우선 선택"
      : "확인된 적합 모델 없음: CLI 기본값 사용",
  };
}

export const TEAM_POLICY = `토큰 효율화 정책: Codex는 짧게 판단하고 Gemini를 기본 작업자로 가장 먼저 사용하세요. 조사·요약·콘텐츠 전략·초안·Wiki 정리·일반 구현·1차 검수는 Gemini에 맡기세요. 독립 검수, 고난도 문제, Gemini 실패 또는 사용자의 명시적 요청일 때만 Codex/Claude로 전환하고 reason에 구체적인 이유를 남기세요. 불필요한 3중 호출이나 같은 자료의 반복 분석은 하지 마세요. 자식에게 관련 파일 경로·완료 조건·필요한 맥락만 전달하고 결과는 요약과 파일 경로로 받으세요. 간단한 인사나 작업이 필요 없는 질문은 직접 짧게 답하세요. 모델은 아래 확인된 목록 안에서 작업 난이도에 맞춰 선택할 수 있습니다. 일반 작업은 Gemini Flash Low 계열, 어려운 작업은 Gemini Pro 계열을 우선 고려하세요. 이는 가격/토큰 절감을 보장하는 정책이 아닙니다. model 생략 시 작업 내용에 맞춰 앱이 후보를 선택합니다. 사용자 고정 모델은 변경하지 마세요. 독립 작업은 Gemini 작업자를 여러 개 사용해도 됩니다. resources와 dependsOn을 선언하고 기다리기 전에 독립 작업들을 먼저 시작하세요. get_run은 wait:true로 기다리고 불필요한 반복 조회를 줄이세요.`;
