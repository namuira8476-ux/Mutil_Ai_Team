import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  BookOpen,
  Bot,
  Copy,
  FileText,
  MessageCircle,
  Square,
  TerminalSquare,
} from "lucide-react";
import type { Project, Run } from "./shared";
import ConversationAnswer from "./ConversationAnswer";
import RunResults from "./RunResults";

const names = { codex: "Codex", claude: "Claude", gemini: "Gemini" };
const status = {
  queued: "순서 대기",
  running: "답변 작성 중",
  waiting: "확인이 필요해요",
  completed: "완료",
  failed: "실행 오류",
  cancelled: "중지됨",
};
export function getConversation(runs: Run[], focusedId?: string | null) {
  const focused = runs.find((r) => r.id === focusedId);
  const selected = focused?.parentId || focused?.id;
  return runs
    .filter(
      (r) =>
        r.mode !== "terminal" &&
        ((!r.parentId && !r.automationId) || r.id === selected),
    )
    .sort((a, b) => a.startedAt - b.startedAt);
}

export default function ChatConversation({
  project,
  runs,
  focusedId,
  onLog,
  onInspect,
  onCancel,
  onPrompt,
  onError,
}: {
  project?: Project;
  runs: Run[];
  focusedId?: string | null;
  onLog: (r: Run) => void;
  onInspect: (r: Run) => void;
  onCancel: (r: Run) => void;
  onPrompt: (text: string) => void;
  onError: (text: string) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const priorCount = useRef(0);
  const [showLatest, setShowLatest] = useState(false);
  const [copied, setCopied] = useState<string>();
  const messages = getConversation(runs, focusedId);
  const signature = messages
    .map((r) => `${r.id}:${r.answer?.length ?? r.output.length}:${r.status}`)
    .join("|");
  useLayoutEffect(() => {
    stickToBottom.current = true;
    priorCount.current = 0;
  }, [project?.id]);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (el && (stickToBottom.current || messages.length > priorCount.current)) {
      el.scrollTop = el.scrollHeight;
      stickToBottom.current = true;
      setShowLatest(false);
    }
    priorCount.current = messages.length;
  }, [signature, project?.id]);
  useLayoutEffect(() => {
    if (!focusedId || !scroll.current) return;
    const focused = runs.find((r) => r.id === focusedId);
    const element = scroll.current.querySelector(
      `[data-chat-run="${focused?.parentId || focusedId}"]`,
    );
    element?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focusedId]);

  const copy = async (r: Run) => {
    try {
      await navigator.clipboard.writeText(r.answer ?? r.output);
      setCopied(r.id);
    } catch {
      onError("답변을 복사하지 못했습니다.");
    }
  };
  const projectId = project?.id;
  const openLink = useCallback(
    async (href: string) => {
      try {
        if (/^https?:\/\//i.test(href))
          await window.workroom.invoke("conversation.openLink", href);
        else if (projectId)
          await window.workroom.invoke("project.reveal", {
            projectId,
            path: decodeURIComponent(href),
          });
      } catch (error) {
        onError((error as Error).message);
      }
    },
    [projectId, onError],
  );

  return (
    <section className="conversation" aria-label="프로젝트 대화">
      <header className="conversation-header">
        <div>
          <MessageCircle size={20} />
          <h1>대화</h1>
          <span>{project?.name || "프로젝트를 선택하세요"}</span>
        </div>
        <span className="conversation-local">
          <span className="live-dot" />이 PC에 저장
        </span>
      </header>
      <div
        className="conversation-scroll"
        ref={scroll}
        role="log"
        aria-label="질문과 답변"
        aria-live="polite"
        aria-relevant="additions text"
        onScroll={() => {
          const el = scroll.current;
          if (el) {
            stickToBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 90;
            setShowLatest(!stickToBottom.current);
          }
        }}
      >
        {!messages.length ? (
          <div className="conversation-empty">
            <span className="welcome-book">
              <BookOpen size={44} />
            </span>
            <small>나의 프로젝트, 함께 만드는 대화</small>
            <h2>오늘은 어떤 일을 함께 할까요?</h2>
            <p>
              아래에 질문을 쓰면 답변이 여기에 나타나요.
              <br />
              오른쪽에서는 에이전트가 일하는 모습을 볼 수 있어요.
            </p>
            <div className="prompt-suggestions">
              {[
                "이 프로젝트의 구조를 설명해줘",
                "raw 자료를 읽고 Wiki 정리 계획을 세워줘",
                "현재 작업에서 다음에 할 일을 알려줘",
              ].map((text) => (
                <button key={text} onClick={() => onPrompt(text)}>
                  <MessageCircle size={15} />
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="conversation-messages">
            {messages.map((r) => {
              const children = runs.filter((child) => child.parentId === r.id);
              const answer = r.answer ?? r.output;
              const pending = r.status === "queued" || r.status === "running";
              return (
                <article
                  className={`chat-turn ${focusedId === r.id ? "chat-focused" : ""}`}
                  key={r.id}
                  data-chat-run={r.id}
                >
                  <div className="chat-question">
                    <span className="message-author">
                      나{r.automationId ? " · 자동화 요청" : ""}
                    </span>
                    <div className="question-bubble">{r.prompt}</div>
                  </div>
                  <div className={`chat-response provider-${r.provider}`}>
                    <header className="response-header">
                      <span className="answer-avatar">
                        <Bot size={18} />
                      </span>
                      <strong>
                        {names[r.provider]}
                        {r.skillName
                          ? ` · ${r.skillName}`
                          : r.mode === "team"
                            ? " · 팀"
                            : ""}
                      </strong>
                      {r.model !== undefined && (
                        <span
                          className="model-badge"
                          title={`요청 모델: ${r.model || "CLI 기본값"}${r.reportedModel ? ` · CLI 보고: ${r.reportedModel}` : ""}`}
                        >
                          {r.model || "CLI 기본값"}
                        </span>
                      )}
                      <span className={`status ${r.status}`}>
                        {status[r.status]}
                      </span>
                    </header>
                    <div className="response-content">
                      {answer ? (
                        <ConversationAnswer
                          text={answer}
                          legacy={r.answer === undefined}
                          onOpenLink={openLink}
                        />
                      ) : pending ? (
                        <div className="answer-pending">
                          <span className="thinking-dots">
                            <i />
                            <i />
                            <i />
                          </span>
                          <span>
                            {r.status === "queued"
                              ? r.queueReason || "앞선 작업이 끝나면 답변을 시작해요."
                              : r.activity || "에이전트가 요청을 확인하고 있어요…"}
                          </span>
                        </div>
                      ) : (
                        !r.error && (
                          <p className="answer-placeholder">
                            {r.status === "cancelled"
                              ? "답변 작성을 중지했어요."
                              : "별도의 답변 텍스트가 없어요. 실행 로그에서 내용을 확인하세요."}
                          </p>
                        )
                      )}
                      {pending && answer && (
                        <p className="response-progress">
                          <span className="live-dot" />
                          {r.activity}
                        </p>
                      )}
                      {r.error && (
                        <div className="answer-error">
                          <strong>
                            {r.status === "waiting"
                              ? "로그인·권한 또는 사용 한도를 확인해주세요."
                              : "작업을 완료하지 못했어요."}
                          </strong>
                          <p>{r.error}</p>
                          <button onClick={() => onLog(r)}>
                            실행 로그에서 확인
                          </button>
                        </div>
                      )}
                      {!!children.length && (
                        <div className="conversation-children">
                          {children.map((child) => (
                            <button
                              key={child.id}
                              onClick={() => onInspect(child)}
                            >
                              <Bot size={13} />
                              {names[child.provider]} ·{" "}
                              {child.skillName || "작업"}
                              <span>{status[child.status]}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {!pending && project && <RunResults run={r} children={children} project={project} onError={onError} />}
                      <footer className="response-actions">
                        {!!answer && (
                          <button onClick={() => void copy(r)}>
                            <Copy size={13} />
                            {copied === r.id ? "복사됨" : "답변 복사"}
                          </button>
                        )}
                        <button onClick={() => onLog(r)}>
                          <TerminalSquare size={13} />
                          실행 로그
                        </button>
                        <button onClick={() => onInspect(r)}>
                          <FileText size={13} />
                          작업 상세
                        </button>
                        {pending && (
                          <button
                            className="danger"
                            onClick={() => onCancel(r)}
                          >
                            <Square size={12} />
                            작업 중지
                          </button>
                        )}
                        <time>
                          {new Date(r.startedAt).toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </footer>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      {showLatest && (
        <button
          className="jump-to-latest"
          onClick={() => {
            if (scroll.current)
              scroll.current.scrollTop = scroll.current.scrollHeight;
            stickToBottom.current = true;
            setShowLatest(false);
          }}
        >
          <ArrowDown size={15} />
          최근 답변으로
        </button>
      )}
    </section>
  );
}
