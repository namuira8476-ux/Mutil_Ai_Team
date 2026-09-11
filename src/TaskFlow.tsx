import type { Run } from "./shared";

const names = { codex: "Codex", claude: "Claude", gemini: "Gemini" };

export default function TaskFlow({
  run,
  runs,
  onOpen,
}: {
  run?: Run;
  runs: Run[];
  onOpen: (run: Run) => void;
}) {
  if (!run) return null;
  const parent = runs.find((r) => r.id === run.parentId);
  const previous = run.automationRunId
    ? runs
        .filter(
          (r) =>
            r.automationRunId === run.automationRunId &&
            r.startedAt < run.startedAt &&
            r.status === "completed",
        )
        .sort((a, b) => b.startedAt - a.startedAt)[0]
    : undefined;
  const source = parent
    ? names[parent.provider]
    : previous
      ? names[previous.provider]
      : run.automationId
        ? "자동화"
        : "나";
  const target = `${names[run.provider]}${run.skillName ? ` · ${run.skillName}` : ""}`;
  const running = run.status === "running";
  const response = !!run.answer?.trim();
  const state =
    run.status === "queued"
      ? "호출 대기"
      : run.status === "completed"
        ? response
          ? "응답 완료"
          : "완료 · 응답 미기록"
        : run.status === "failed"
          ? "실행 오류"
          : run.status === "cancelled"
            ? "중지됨"
            : run.status === "waiting"
              ? "확인 필요"
              : response
                ? "응답 받는 중"
                : "작업 전달 중";
  return (
    <button
      type="button"
      className={`task-flow ${running ? "flow-running" : ""} ${response ? "flow-response" : ""}`}
      data-run-id={run.id}
      data-status={run.status}
      onClick={() => onOpen(run)}
      aria-label={`${source}에서 ${target} 호출 · ${state} · 작업 상세`}
      title={`${source} → ${target}: ${run.title}`}
    >
      <span className="flow-endpoints">
        <span>{source}</span>
        <small>{state}</small>
        <span>{target}</span>
      </span>
    </button>
  );
}
