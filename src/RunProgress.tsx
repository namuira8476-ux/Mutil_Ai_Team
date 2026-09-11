import { useEffect, useState } from "react";
import type { Run } from "./shared";

const names = { codex: "Codex", claude: "Claude", gemini: "Gemini(agy)" };
function duration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}
export default function RunProgress({ runs, onLog, onCancel }: {
  runs: Run[]; onLog: (run: Run) => void; onCancel: (run: Run) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const active = runs.filter(r => r.status === "queued" || r.status === "running");
  useEffect(() => {
    if (!active.length) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active.length]);
  if (!active.length) return null;
  return <section className="run-progress-panel" aria-label="실시간 작업 상태">
    <header><strong>현재 진행 상황</strong><span>{active.filter(r => r.status === "running" && r.mode !== "terminal").length}개 실행 · {active.filter(r => r.status === "queued").length}개 대기</span></header>
    <div className="run-progress-list">{active.map(run => {
      const silence = now - (run.lastOutputAt || run.executionStartedAt || run.startedAt);
      const blockers = (run.blockerIds || []).map(id => runs.find(r => r.id === id)).filter((r): r is Run => !!r);
      const terminal = run.mode === "terminal";
      const queued = run.status === "queued";
      return <article key={run.id} className={queued || terminal || silence > 45000 ? "needs-attention" : ""}>
        <div className="run-progress-title"><b>{names[run.provider]}{run.parentId ? " · 자식 작업" : ""}</b><span>{duration(now - (run.executionStartedAt || run.startedAt))} {queued ? "대기" : "경과"}</span></div>
        <p title={run.title}>{run.title || "직접 조작 CLI"}</p>
        <p className="run-progress-detail">{queued ? run.queueReason || "실행 순서 확인 중" : terminal ? "직접 조작 창이 열려 있습니다. 로그인·권한 질문이나 입력 대기는 CLI 창에서 확인하세요." : run.activity}</p>
        {!queued && <small>{run.lastOutputAt ? `마지막 CLI 출력 ${duration(silence)} 전` : "첫 CLI 응답 대기"}{!terminal && silence > 45000 ? " · 새 출력이 없습니다. 중단 여부는 아직 확인되지 않았습니다." : ""}</small>}
        <div className="run-progress-actions">
          {blockers.map(blocker => <button key={blocker.id} onClick={() => onLog(blocker)}>{names[blocker.provider]} {blocker.mode === "terminal" ? "대기 중인 CLI 열기" : "선행 작업 보기"}</button>)}
          {blockers.filter(b => b.mode === "terminal").map(blocker => <button key={`close-${blocker.id}`} onClick={() => onCancel(blocker)}>직접 조작 CLI 종료하고 대기 작업 진행</button>)}
          {!queued && <button onClick={() => onLog(run)}>{terminal ? "CLI 확인" : "실행 로그"}</button>}
          <button onClick={() => onCancel(run)}>{queued ? "대기 취소" : terminal ? "CLI 종료" : "작업 중지"}</button>
        </div>
      </article>;
    })}</div>
  </section>;
}
