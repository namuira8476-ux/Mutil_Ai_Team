import { useCallback, useEffect, useRef, useState } from "react";
import TaskFlow from "./TaskFlow";
import CommunicationArcs from "./CommunicationArcs";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCheck,
  ChevronRight,
  Clock,
  Code2,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  History,
  Home,
  Info,
  Monitor,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Sun,
  Sparkles,
  X,
  Download,
  Upload,
  Play,
  Bot,
} from "lucide-react";
import type {
  Automation,
  FileEntry,
  Project,
  ProviderId,
  Run,
  Skill,
  State,
} from "./shared";
import { PROVIDER_IDS } from "./shared";
import TerminalPane from "./TerminalPane";
import ModelPicker from "./ModelPicker";
import BrowserPane from "./BrowserPane";
import RunProgress from "./RunProgress";
import ChatConversation, { getConversation } from "./ChatConversation";
type View =
  | "workshop"
  | "automations"
  | "skills"
  | "wiki"
  | "history"
  | "usage"
  | "settings";
const icons = { book: BookOpen, code: Code2, check: CheckCheck };
const names = { codex: "Codex", claude: "Claude", gemini: "Gemini" };
const labels = {
  queued: "순서 대기",
  running: "작업 중",
  waiting: "응답 대기",
  completed: "완료",
  failed: "확인 필요",
  cancelled: "중지됨",
};
const num = (n: number | null) =>
  n === null
    ? "미확인"
    : n >= 1000
      ? (n / 1000).toFixed(1) + "k"
      : n.toLocaleString();
const time = (n?: number) =>
  n
    ? new Date(n).toLocaleString("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
function ProviderMark({ id }: { id: ProviderId }) {
  const Icon = id === "codex" ? Bot : id === "claude" ? Sun : Sparkles;
  return <Icon size={18} className={`provider-${id}`} />;
}
function Sprite({
  provider,
  child = false,
  active = false,
}: {
  provider: ProviderId;
  child?: boolean;
  active?: boolean;
}) {
  const index = PROVIDER_IDS.indexOf(provider);
  return (
    <div
      aria-hidden="true"
      className={`sprite ${child ? "child-sprite" : "parent-sprite"} ${active ? "working" : ""}`}
      style={{ backgroundPositionX: `${index * 50}%` }}
    >
      {active && (
        <span className="typing-action">
          <span className="sprite-art" />
          <span className="typing-hands" />
          {!child && <span className="typing-caption">타닥 타닥</span>}
        </span>
      )}
    </div>
  );
}
function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={on}
      className={`toggle ${on ? "on" : ""}`}
      onClick={onClick}
    >
      <span />
    </button>
  );
}
function blankAutomation(p?: Project, skills: Skill[] = []): Automation {
  return {
    id: "",
    projectId: p?.id || "",
    name: "매일 위키 정리",
    enabled: false,
    trigger: "schedule",
    time: "09:00",
    timezone: "Asia/Seoul",
    weekdays: [],
    input: p?.raw || "raw",
    output: p?.wiki || "wiki",
    steps: skills.length
      ? [
          {
            provider: "gemini",
            skillId: skills[0].id,
            skillVersion: skills[0].version,
          },
        ]
      : [],
    createdAt: Date.now(),
  };
}

export default function App() {
  const [state, setState] = useState<State | null>(null),
    [projectId, setProjectId] = useState(""),
    [view, setView] = useState<View>("workshop"),
    [selectedRun, setSelectedRun] = useState<string | null>(null),
    [selectedAuto, setSelectedAuto] = useState<string | null>(null),
    [editorSkill, setEditorSkill] = useState<Skill | null | undefined>(
      undefined,
    ),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [prompt, setPrompt] = useState(""),
    [target, setTarget] = useState<ProviderId>("codex"),
    [team, setTeam] = useState(true),
    [fileDir, setFileDir] = useState("wiki");
  const [browserOpen, setBrowserOpen] = useState(false);
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<
    Partial<Record<ProviderId, string>>
  >({});
  const [inspectedRunId, setInspectedRunId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputSelection = useRef<{ start: number; end: number } | null>(null);
  const rememberInputSelection = () => {
    const input = inputRef.current;
    if (input)
      inputSelection.current = {
        start: input.selectionStart,
        end: input.selectionEnd,
      };
  };
  const detached = new URLSearchParams(location.hash.slice(1)).get("terminal");
  const providerKey = state?.providers
    .map((p) => `${p.id}:${p.path}:${p.version}`)
    .join("|");
  useEffect(() => {
    if (!providerKey || detached) return;
    void window.workroom.invoke("models.refresh", {}).catch(() => {});
  }, [providerKey, detached]);
  const refresh = useCallback(async () => {
    try {
      const data = await window.workroom.invoke<State>("state");
      setState(data);
      setProjectId((old) =>
        old && data.projects.some((p) => p.id === old)
          ? old
          : data.projects[0]?.id || "",
      );
    } catch (e) {
      setToast(String(e));
    }
  }, []);
  useEffect(() => {
    if (!window.workroom) {
      setToast("데스크톱 앱에서 열어주세요. npm run dev로 실행할 수 있습니다.");
      return;
    }
    void refresh();
    const off = window.workroom.onEvent((e) => {
      if (e.type === "state") void refresh();
    });
    return off;
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(t);
  }, [toast]);
  const call = async <T,>(
    method: string,
    payload?: unknown,
  ): Promise<T | undefined> => {
    try {
      return await window.workroom.invoke<T>(method, payload);
    } catch (e) {
      setToast(
        (e as Error).message.replace(
          /^Error invoking remote method.*?: Error: /,
          "",
        ),
      );
      return undefined;
    }
  };
  useEffect(
    () =>
      window.workroom?.onEvent((e) => {
        if (e.type === "browser" && e.projectId === projectId && e.open) {
          setBrowserOpen(true);
          setView("workshop");
        }
      }),
    [projectId],
  );
  const project = state?.projects.find((p) => p.id === projectId);
  const runs = state?.runs.filter((r) => r.projectId === projectId) || [];
  const run = state?.runs.find((r) => r.id === (detached || selectedRun));
  const inspectedRun = state?.runs.find((r) => r.id === inspectedRunId);
  const composerAvailable =
    !!state &&
    !detached &&
    view === "workshop" &&
    !run &&
    !inspectedRun &&
    editorSkill === undefined;
  useEffect(() => {
    if (!composerAvailable) return;
    const input = inputRef.current;
    if (input) {
      const selection = inputSelection.current ?? {
        start: input.value.length,
        end: input.value.length,
      };
      input.focus({ preventScroll: true });
      input.setSelectionRange(selection.start, selection.end);
    }
    // Restore an unfocused window without taking focus from another control.
    const restoreInput = () => {
      if (document.activeElement === document.body)
        inputRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("focus", restoreInput);
    return () => window.removeEventListener("focus", restoreInput);
  }, [composerAvailable, projectId]);
  const conversationRuns = getConversation(runs);
  const chatPending = conversationRuns.some(
    (r) => r.status === "running" || r.status === "queued",
  );
  const previousTurn = [...conversationRuns]
    .reverse()
    .find((r) => r.status === "completed");
  const automations =
    state?.automations.filter((a) => a.projectId === projectId) || [];
  const addProject = async () => {
    const p = await call<Project>("project.pick");
    if (p) setProjectId(p.id);
  };
  const startTerminal = async (id: ProviderId) => {
    if (!project) return void addProject();
    setBusy(true);
    const r = await call<Run>("terminal.start", { projectId, provider: id });
    if (r) {
      setSelectedRun(r.id);
      setView("workshop");
    }
    setBusy(false);
  };
  const startSkill = async (s: Skill, id: ProviderId = target) => {
    if (!project) return void addProject();
    setBusy(true);
    const r = await call<Run>("run.start", {
      projectId,
      provider: id,
      skillId: s.id,
      skillVersion: s.version,
      prompt: prompt.trim() || `${s.name} 스킬을 프로젝트 자료에 적용해주세요.`,
    });
    if (r) {
      setSelectedRun(null);
      setView("workshop");
      setPrompt("");
    }
    setBusy(false);
  };
  const send = async () => {
    if (!prompt.trim() || busy || chatPending) return;
    if (!project) return void addProject();
    setBusy(true);
    const r = await call<Run>("run.start", {
      projectId,
      provider: target,
      model: selectedModels[target],
      prompt,
      team: target === "codex" && team,
      replyTo: previousTurn?.id,
    });
    if (r) {
      setSelectedRun(null);
      setFocusedRunId(null);
      setView("workshop");
      setPrompt("");
    }
    setBusy(false);
  };
  if (!state)
    return (
      <div className="loading">
        <BookOpen size={44} />
        <h1>Agent Studio</h1>
        <p>{toast || "책상을 준비하고 있어요…"}</p>
      </div>
    );
  if (detached)
    return (
      <div className="detached">
        {run ? (
          <TerminalPane run={run} onError={setToast} />
        ) : (
          <p>세션을 찾을 수 없습니다.</p>
        )}
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  const known = runs.filter((r) => r.usage.scope !== "inclusive");
  const total = known.reduce((sum, r) => sum + (r.usage.total ?? 0), 0);
  const active = runs.filter((r) => r.status === "running");
  const openRun = (r: Run) => {
    setSelectedRun(r.mode === "terminal" ? r.id : null);
    setFocusedRunId(r.id);
    setView("workshop");
  };
  const showLog = (r: Run) => {
    setSelectedRun(r.id);
    setInspectedRunId(null);
    setView("workshop");
  };
  return (
    <div
      className={`app conversation-app ${state.settings.reduceMotion ? "reduce-motion" : ""}`}
    >
      <header className="app-header">
        <div className="brand">
          <Home size={23} />
          <strong>Agent Studio</strong>
        </div>
        <button className="project-chip" onClick={addProject}>
          <Folder size={15} />
          {project?.name || "프로젝트 열기"}
        </button>
        <nav>
          {(["workshop", "automations", "skills", "wiki"] as View[]).map(
            (v, i) => (
              <button
                key={v}
                className={view === v ? "selected" : ""}
                onClick={() => {
                  setView(v);
                  setSelectedRun(null);
                }}
              >
                {["작업실", "자동화", "공용 스킬", "Wiki"][i]}
              </button>
            ),
          )}
        </nav>
        <span className="local-badge">
          <span />
          로컬 작업실
        </span>
        <button
          className="icon-button"
          aria-label="설정"
          onClick={() => setView("settings")}
        >
          <Settings size={20} />
        </button>
      </header>
      <aside className="sidebar">
        <div className="sidebar-heading">
          프로젝트
          <button
            className="icon-button"
            aria-label="프로젝트 추가"
            onClick={addProject}
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="project-list">
          {state.projects.map((p) => (
            <button
              key={p.id}
              className={`sidebar-item ${projectId === p.id ? "selected" : ""}`}
              onClick={() => {
                setProjectId(p.id);
                setSelectedRun(null);
                setSelectedAuto(null);
              }}
            >
              <Folder size={20} />
              <span>{p.name}</span>
              {state.runs.some(
                (r) => r.projectId === p.id && r.status === "running",
              ) && <i className="live-dot" />}
            </button>
          ))}
          <button className="sidebar-item add" onClick={addProject}>
            <Plus size={18} />새 프로젝트
          </button>
        </div>
        <div className="sidebar-section">
          <h3>
            <Settings size={17} />이 프로젝트 자동화
          </h3>
          {automations.map((a) => (
            <div className="auto-shortcut" key={a.id}>
              <button
                onClick={() => {
                  setSelectedAuto(a.id);
                  setView("automations");
                }}
              >
                <i className={a.enabled ? "live-dot" : "muted-dot"} />
                {a.name}
              </button>
              <Toggle
                on={a.enabled}
                label={`${a.name} 켜기`}
                onClick={() =>
                  void call("automation.save", { ...a, enabled: !a.enabled })
                }
              />
            </div>
          ))}
          {!automations.length && (
            <p className="muted small">반복할 일을 맡겨보세요.</p>
          )}
          <button
            className="sidebar-item add"
            onClick={() => {
              setSelectedAuto(null);
              setView("automations");
            }}
          >
            <Plus size={17} />
            자동화 추가
          </button>
        </div>
        <div className="sidebar-section">
          <h3>프로젝트 자료</h3>
          {[
            project?.raw || "raw",
            project?.wiki || "wiki",
            project?.outputs || "outputs",
          ].map((folder) => (
            <button
              className="sidebar-item"
              key={folder}
              onClick={() => {
                setFileDir(folder);
                setView("wiki");
              }}
            >
              <FolderOpen size={23} />
              {folder}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setView("history")}>
            <History size={18} />
            실행 기록 <span>{runs.length}</span>
          </button>
          <button onClick={() => setView("usage")}>
            <Activity size={18} />
            사용량
          </button>
          <div className="sidebar-note">
            <BookOpen size={28} />
            <p>
              함께 일하고,
              <br />
              지식으로 남겨요.
            </p>
          </div>
        </div>
      </aside>
      <main className={`main ${view === "workshop" ? "chat-main" : ""}`}>
        {view === "workshop" && !detached && <RunProgress runs={runs} onLog={showLog} onCancel={(r) => void call("run.cancel", { runId: r.id })} />}
        {view === "workshop" && !run && (
          <div className="workspace-tabs">
            <button
              className={!browserOpen ? "selected" : ""}
              onClick={() => setBrowserOpen(false)}
            >
              대화
            </button>
            <button
              disabled={!project}
              className={browserOpen ? "selected" : ""}
              onClick={() => {
                setBrowserOpen(true);
                setTarget("codex");
                setTeam(true);
              }}
            >
              내장 브라우저
            </button>
          </div>
        )}
        {view === "workshop" &&
          (run ? (
            <div className="conversation-terminal">
              <button
                className="back-link"
                onClick={() => setSelectedRun(null)}
              >
                <ArrowLeft size={15} />
                대화로 돌아가기
              </button>
              <TerminalPane run={run} onError={setToast} />
            </div>
          ) : browserOpen && project ? (
            <BrowserPane
              key={projectId}
              projectId={projectId}
              visible={!inspectedRun && editorSkill === undefined}
              onError={setToast}
            />
          ) : (
            <ChatConversation
              key={projectId}
              project={project}
              runs={runs}
              focusedId={focusedRunId}
              onLog={showLog}
              onInspect={(r) => setInspectedRunId(r.id)}
              onCancel={(r) => void call("run.cancel", { runId: r.id })}
              onPrompt={(text) => {
                setPrompt(text);
                inputRef.current?.focus();
              }}
              onError={setToast}
            />
          ))}
        {view === "automations" && (
          <section className="automation-page">
            <AutomationEditor
              key={`${projectId}:${selectedAuto || "new"}`}
              project={project}
              skills={state.skills}
              providers={state.providers}
              modelDefaults={state.settings.models}
              automation={automations.find((a) => a.id === selectedAuto)}
              call={call}
              onSaved={(a) => {
                setState((old) =>
                  old
                    ? {
                        ...old,
                        automations: [
                          ...old.automations.filter((item) => item.id !== a.id),
                          a,
                        ],
                      }
                    : old,
                );
                setSelectedAuto(a.id);
              }}
              notify={setToast}
            />
          </section>
        )}
        {view === "skills" && (
          <section className="page-content">
            <PageTitle
              icon={<BookOpen />}
              title="공용 스킬 보관함"
              subtitle="정의는 하나, 실행은 각 에이전트의 자식으로."
            />
            <button className="primary" onClick={() => setEditorSkill(null)}>
              <Plus size={17} />
              스킬 만들기
            </button>
            <div className="skill-grid">
              {state.skills.map((s) => {
                const Icon = icons[s.icon];
                return (
                  <article className="paper-panel skill-detail-card" key={s.id}>
                    <Icon size={34} />
                    <span className="version">v{s.version}</span>
                    <h2>{s.name}</h2>
                    <p>{s.description}</p>
                    <div className="skill-providers">
                      {PROVIDER_IDS.map((id) => (
                        <button
                          key={id}
                          title={`${names[id]}로 실행`}
                          onClick={() => void startSkill(s, id)}
                        >
                          <ProviderMark id={id} />
                          {names[id]}
                        </button>
                      ))}
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setEditorSkill(s)}
                    >
                      정의 편집 <ArrowRight size={14} />
                    </button>
                  </article>
                );
              })}
            </div>
            <p className="muted">
              스킬 실행은 실제 CLI를 호출합니다. 공급자별 동작은 실행 후 확인할
              수 있으며, 정의 공유가 동일한 출력이나 모든 도구의 지원을
              보장하지는 않습니다.
            </p>
          </section>
        )}
        {view === "wiki" && (
          <FileBrowser
            project={project}
            directory={fileDir}
            setDirectory={setFileDir}
            call={call}
            runs={runs}
          />
        )}
        {(view === "history" || view === "usage") && (
          <section className="page-content">
            <PageTitle
              icon={view === "usage" ? <Activity /> : <History />}
              title={
                view === "usage" ? "사용량과 실행 기록" : "우리 팀의 실행 기록"
              }
              subtitle="프로젝트에 남은 작업과 근거를 확인해요."
            />
            {view === "usage" && (
              <UsageView
                runs={runs}
                state={state}
                refreshQuota={() => void call("providers.quota")}
              />
            )}
            <div className="history-list">
              {runs.length ? (
                runs.map((r) => (
                  <button
                    key={r.id}
                    className="history-row"
                    onClick={() => openRun(r)}
                  >
                    <ProviderMark id={r.provider} />
                    <div>
                      <strong>{r.title}</strong>
                      <small>
                        {time(r.startedAt)} ·{" "}
                        {r.skillName
                          ? `${r.skillName} v${r.skillVersion}`
                          : r.mode}
                        {r.automationId ? " · 자동화" : ""}
                        {r.model !== undefined
                          ? ` · 요청 모델: ${r.model || "CLI 기본값"}`
                          : ""}
                      </small>
                    </div>
                    <span className={`status ${r.status}`}>
                      {labels[r.status]}
                    </span>
                    <span className="usage-number">{num(r.usage.total)}</span>
                    <ChevronRight size={16} />
                  </button>
                ))
              ) : (
                <Empty text="아직 실행 기록이 없어요. 첫 작업을 맡겨보세요." />
              )}
            </div>
          </section>
        )}
        {view === "settings" && (
          <SettingsView
            state={state}
            project={project}
            call={call}
            notify={setToast}
            onSetup={showLog}
          />
        )}
        {view === "workshop" && !run && (
          <div className="bottom-workspace">
            <button className="usage-strip" onClick={() => setView("usage")}>
              <Activity size={18} />
              <strong>프로젝트 사용량</strong>
              <span>{total ? num(total) : "—"} 토큰</span>
              <span>CLI별</span>
              <span>스킬별</span>
              <span>자동화별</span>
              <small>
                관측된 값만 집계 <Info size={12} />
              </small>
            </button>
            <div
              className="composer"
              onClick={(e) => {
                if (
                  e.target instanceof Element &&
                  !e.target.closest(
                    "button, input, textarea, select, label, a, [contenteditable]",
                  )
                )
                  inputRef.current?.focus({ preventScroll: true });
              }}
            >
              <div className="composer-options">
                <select
                  aria-label="요청할 CLI"
                  value={target}
                  onChange={(e) => setTarget(e.target.value as ProviderId)}
                >
                  {PROVIDER_IDS.map((id) => (
                    <option value={id} key={id}>
                      {names[id]}
                    </option>
                  ))}
                </select>
                <ModelPicker
                  key={target}
                  provider={state.providers.find((p) => p.id === target)}
                  label="이번 요청 모델"
                  value={selectedModels[target]}
                  inheritLabel={
                    target === "codex" &&
                    team &&
                    state.settings.models?.[target] === undefined
                      ? "자동 · 난이도별 모델 선택"
                      : `기본 모델 · ${state.settings.models?.[target] || "CLI 기본값"}`
                  }
                  onChange={(model) =>
                    setSelectedModels((old) => ({ ...old, [target]: model }))
                  }
                />
                {target === "codex" && (
                  <label>
                    <input
                      type="checkbox"
                      checked={team}
                      onChange={(e) => setTeam(e.target.checked)}
                    />
                    팀에게 맡기기 · Gemini 우선
                  </label>
                )}
              </div>
              <textarea
                aria-label="메시지 입력"
                ref={inputRef}
                value={prompt}
                placeholder={
                  chatPending
                    ? "답변을 기다리는 동안 다음 질문을 적어두세요…"
                    : "메시지를 입력하세요…"
                }
                onChange={(e) => {
                  setPrompt(e.target.value);
                  rememberInputSelection();
                }}
                onSelect={rememberInputSelection}
                onBlur={rememberInputSelection}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing &&
                    e.keyCode !== 229
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                className="primary"
                onClick={() => {
                  inputRef.current?.focus({ preventScroll: true });
                  void send();
                }}
                disabled={busy || chatPending || !prompt.trim()}
              >
                <Send size={18} />
                {chatPending ? "답변 대기" : "보내기"}
              </button>
              <p className="composer-hint">
                Enter로 보내기 · Shift + Enter로 줄바꿈
                {previousTurn ? " · 이전 대화를 이어서 답변해요" : ""}
              </p>
            </div>
          </div>
        )}
      </main>
      <aside className="inspector agent-inspector" aria-label="Agent Studio">
        <header className="agent-dock-header">
          <div>
            <Sparkles size={19} />
            <h2>Agent Studio</h2>
          </div>
          <span>
            {active.length ? active.length + "개 실행 중" : "우리 팀"}
          </span>
        </header>
        <p className="agent-dock-intro">
          독립 작업 최대 3개 병렬 · Gemini 우선
        </p>
        <div className="flow-legend">
          <span>파랑 · 호출</span>
          <span>빨강 · 응답</span>
        </div>
        <div className="families agent-families">
          <CommunicationArcs
            runs={runs}
            onOpen={(r) => setInspectedRunId(r.id)}
          />
          {PROVIDER_IDS.map((id) => {
            const provider = state.providers.find((p) => p.id === id);
            const children = runs.filter(
              (r) =>
                r.provider === id &&
                r.skillId &&
                ["running", "queued"].includes(r.status),
            );
            const latest = runs.find(
              (r) => r.provider === id && r.status === "running",
            );
            const recentChild = runs.find(
              (r) => r.provider === id && r.skillId,
            );
            const work = runs.find(
              (r) =>
                r.provider === id &&
                r.mode !== "terminal" &&
                r.status === "running",
            );
            const flowRun =
              work ||
              runs.find(
                (r) =>
                  r.provider === id &&
                  r.mode !== "terminal" &&
                  r.status === "queued",
              ) ||
              runs.find((r) => r.provider === id && r.mode !== "terminal");
            return (
              <div
                key={id}
                className={`family provider-${id}`}
                data-agent={id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const skill = state.skills.find(
                    (s) => s.id === e.dataTransfer.getData("skillId"),
                  );
                  if (skill) void startSkill(skill, id);
                }}
              >
                <div className="family-status">
                  <span
                    className={`status ${latest ? "running" : provider?.available ? "ready" : "offline"}`}
                  >
                    <i />
                    {latest
                      ? latest.activity
                      : provider?.available
                        ? "함께 일할 준비 완료"
                        : "CLI 연결 필요"}
                  </span>
                </div>
                <button
                  aria-label={`${names[id]} 모니터 열기`}
                  className="desk-button"
                  onClick={() =>
                    latest ? showLog(latest) : void startTerminal(id)
                  }
                  disabled={busy}
                >
                  <Sprite provider={id} active={!!work} />
                  <span className="monitor-hint">
                    <Monitor size={14} />
                    CLI 열기
                  </span>
                </button>
                <button
                  className="nameplate"
                  onClick={() => {
                    setTarget(id);
                    if (!provider?.available) setView("settings");
                  }}
                >
                  <ProviderMark id={id} />
                  <strong>{names[id]}</strong>
                  <span>
                    {id === "codex"
                      ? "총괄"
                      : id === "claude"
                        ? "구현"
                        : provider?.backend === "agy"
                          ? "탐색 · agy"
                          : "탐색"}
                  </span>
                </button>
                <div className="family-model">
                  <ModelPicker
                    provider={provider}
                    label={`${names[id]} 기본 모델`}
                    value={state.settings.models?.[id] || ""}
                    onChange={(model) =>
                      void call("settings.save", {
                        models: { [id]: model || "" },
                      })
                    }
                  />
                  {latest?.model !== undefined && (
                    <small title={latest.model}>
                      작업 중 · {latest.model || "CLI 기본값"}
                    </small>
                  )}
                </div>
                <TaskFlow
                  run={flowRun}
                  runs={runs}
                  onOpen={(r) => setInspectedRunId(r.id)}
                />
                {
                  <div className="child-area">
                    <div className="family-line" />
                    {children.length ? (
                      children.slice(0, 3).map((child) => (
                        <button
                          className="child-desk"
                          key={child.id}
                          data-child-run={child.id}
                          onClick={() => openRun(child)}
                        >
                          <Sprite
                            provider={id}
                            child
                            active={child.status === "running"}
                          />
                          <span className="child-label">
                            {child.skillName}
                            <small>{child.activity}</small>
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="child-rest">
                        <Sprite provider={id} child />
                        <button
                          onClick={() =>
                            recentChild
                              ? openRun(recentChild)
                              : setView("skills")
                          }
                        >
                          {recentChild ? (
                            <>
                              {recentChild.skillName}
                              <small>{labels[recentChild.status]}</small>
                            </>
                          ) : (
                            <>
                              스킬 친구 대기 중
                              <small>공용 스킬을 맡겨보세요</small>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                    {children.length > 3 && (
                      <button onClick={() => setView("history")}>
                        +{children.length - 3} 실행 중
                      </button>
                    )}
                  </div>
                }
              </div>
            );
          })}
        </div>

        <details className="dock-skills">
          <summary>
            <BookOpen size={16} /> 공용 스킬 · {state.skills.length}개{" "}
            <span>펼치기</span>
          </summary>
          <div className="dock-skills-popover">
            <header>
              <h3>
                <BookOpen size={16} />
                공용 스킬
              </h3>
              <button
                aria-label="스킬 만들기"
                onClick={() => setEditorSkill(null)}
              >
                <Plus size={17} />
              </button>
            </header>
            <p>스킬을 에이전트 책상에 끌어 놓으세요.</p>
            <div>
              {state.skills.map((skill) => (
                <button
                  key={skill.id}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("skillId", skill.id)
                  }
                  onClick={() => setEditorSkill(skill)}
                >
                  {skill.name}
                </button>
              ))}
            </div>
          </div>
        </details>
      </aside>
      {inspectedRun && (
        <div className="modal-backdrop" onClick={() => setInspectedRunId(null)}>
          <section
            className="paper-panel modal run-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="작업 상세"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>작업 상세</h2>
              <button
                aria-label="작업 상세 닫기"
                onClick={() => setInspectedRunId(null)}
              >
                <X size={20} />
              </button>
            </header>
            <RunInspector run={inspectedRun} state={state} call={call} />
            <button className="outline" onClick={() => showLog(inspectedRun)}>
              <Monitor size={16} />
              실행 로그 열기
            </button>
          </section>
        </div>
      )}
      {editorSkill !== undefined && (
        <SkillEditor
          skill={editorSkill}
          onClose={() => setEditorSkill(undefined)}
          onSave={async (data) => {
            const saved = await call<Skill>("skill.save", data);
            if (saved) {
              setEditorSkill(undefined);
              setToast(
                `${saved.name} v${saved.version}을 공용 보관함에 저장했어요.`,
              );
            }
          }}
          onRun={(s) => {
            setEditorSkill(undefined);
            void startSkill(s);
          }}
        />
      )}
      {toast && (
        <div role="status" className="toast">
          <Info size={17} />
          {toast}
          <button aria-label="알림 닫기" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function PageTitle({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="page-title">
      {icon}
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <BookOpen size={34} />
      <p>{text}</p>
    </div>
  );
}
type Call = <T = unknown>(
  method: string,
  payload?: unknown,
) => Promise<T | undefined>;
function AutomationEditor({
  project,
  skills,
  providers,
  modelDefaults,
  automation,
  call,
  onSaved,
  notify,
}: {
  project?: Project;
  skills: Skill[];
  providers: State["providers"];
  modelDefaults: State["settings"]["models"];
  automation?: Automation;
  call: Call;
  onSaved: (a: Automation) => void;
  notify: (s: string) => void;
}) {
  const [form, setForm] = useState(
      automation || blankAutomation(project, skills),
    ),
    [preview, setPreview] = useState<any>(null),
    [working, setWorking] = useState(false);
  const update = (data: Partial<Automation>) =>
    setForm((f) => ({ ...f, ...data }));
  const save = async () => {
    if (!project) return notify("먼저 프로젝트를 열어주세요.");
    setWorking(true);
    const a = await call<Automation>("automation.save", form);
    if (a) {
      setForm(a);
      onSaved(a);
      notify("프로젝트 자동화를 저장했어요.");
    }
    setWorking(false);
    return a;
  };
  return (
    <div className="automation-editor">
      <h2>
        <Settings size={22} />
        자동화 설정
      </h2>
      <label>
        이름
        <input
          aria-label="자동화 이름"
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </label>
      <label>
        프로젝트
        <div className="readonly-field">
          <Folder size={16} />
          {project?.name || "프로젝트 선택 필요"}
        </div>
      </label>
      <div className="form-two">
        <label>
          실행 시점
          <select
            aria-label="자동화 트리거"
            value={form.trigger}
            onChange={(e) =>
              update({ trigger: e.target.value as Automation["trigger"] })
            }
          >
            <option value="schedule">정해진 시간</option>
            <option value="file">파일 변경</option>
            <option value="success">작업 완료</option>
          </select>
        </label>
        {form.trigger === "schedule" && (
          <label>
            시간
            <input
              type="time"
              value={form.time}
              onChange={(e) => update({ time: e.target.value })}
            />
          </label>
        )}
      </div>
      {form.trigger === "schedule" && (
        <>
          <label>
            시간대
            <select
              value={form.timezone}
              onChange={(e) => update({ timezone: e.target.value })}
            >
              <option value="Asia/Seoul">서울 · Asia/Seoul</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">뉴욕</option>
            </select>
          </label>
          <div className="weekdays">
            {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
              <button
                title="선택하지 않으면 매일"
                className={form.weekdays.includes(i) ? "selected" : ""}
                key={d}
                onClick={() =>
                  update({
                    weekdays: form.weekdays.includes(i)
                      ? form.weekdays.filter((x) => x !== i)
                      : [...form.weekdays, i],
                  })
                }
              >
                {d}
              </button>
            ))}
            <small>{form.weekdays.length ? "선택한 요일" : "매일"}</small>
          </div>
        </>
      )}
      <h3 className="form-section-title">
        실행할 스킬 <small>최대 3단계</small>
      </h3>
      {form.steps.map((step, i) => (
        <div className="step-fields" key={i}>
          <span className="step-number">{i + 1}</span>
          <label>
            담당 CLI
            <select
              aria-label={`${i + 1}단계 담당 CLI`}
              value={step.provider}
              onChange={(e) =>
                update({
                  steps: form.steps.map((s, n) =>
                    n === i
                      ? {
                          ...s,
                          provider: e.target.value as ProviderId,
                          model: undefined,
                        }
                      : s,
                  ),
                })
              }
            >
              {PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>
                  {names[id]}
                </option>
              ))}
            </select>
          </label>
          <label>
            공용 스킬
            <select
              value={step.skillId}
              onChange={(e) => {
                const skill = skills.find((s) => s.id === e.target.value)!;
                update({
                  steps: form.steps.map((s, n) =>
                    n === i
                      ? { ...s, skillId: skill.id, skillVersion: skill.version }
                      : s,
                  ),
                });
              }}
            >
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} v
                  {step.skillId === s.id ? step.skillVersion : s.version}
                </option>
              ))}
            </select>
          </label>
          <div className="step-model">
            <ModelPicker
              key={step.provider}
              provider={providers.find((p) => p.id === step.provider)}
              label={`${i + 1}단계 모델`}
              value={step.model}
              inheritLabel={`기본 모델 · ${modelDefaults?.[step.provider] || "CLI 기본값"}`}
              onChange={(model) =>
                update({
                  steps: form.steps.map((s, n) =>
                    n === i ? { ...s, model } : s,
                  ),
                })
              }
            />
          </div>
          {i > 0 && (
            <button
              className="icon-button"
              aria-label="단계 삭제"
              onClick={() =>
                update({ steps: form.steps.filter((_, n) => n !== i) })
              }
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      {form.steps.length < 3 && (
        <button
          className="text-button"
          onClick={() => {
            const s = skills.find((s) => s.icon === "check") || skills[0];
            if (s)
              update({
                steps: [
                  ...form.steps,
                  { provider: "codex", skillId: s.id, skillVersion: s.version },
                ],
              });
          }}
        >
          <Plus size={14} />
          다음 단계 추가
        </button>
      )}
      <div className="form-two">
        <label>
          입력 폴더
          <input
            value={form.input}
            onChange={(e) => update({ input: e.target.value })}
          />
        </label>
        <label>
          결과 폴더
          <input
            value={form.output}
            onChange={(e) => update({ output: e.target.value })}
          />
        </label>
      </div>
      <div className="enable-row">
        <span>자동화 켜기</span>
        <Toggle
          on={form.enabled}
          label="자동화 활성화"
          onClick={() => update({ enabled: !form.enabled })}
        />
      </div>
      <div className="next-run">
        <Clock size={16} />
        <span>다음 실행</span>
        <strong>
          {form.enabled
            ? form.trigger === "schedule"
              ? `${form.time} · 설정 시간대`
              : "조건 충족 시"
            : "꺼짐"}
        </strong>
      </div>
      {automation?.lastResult && (
        <p className="small muted">
          최근: {automation.lastResult} · {time(automation.lastRunAt)}
        </p>
      )}
      <button
        className="text-button"
        onClick={async () => {
          const data = await call("automation.preview", form);
          if (data) setPreview(data);
        }}
      >
        <Search size={14} />
        예상 동작 보기
      </button>
      {preview && (
        <div className="preview-note">
          <strong>모델 호출 없음</strong>
          <p>
            {preview.input}
            <br />→ {preview.output}
          </p>
          <small>
            {preview.steps
              .map(
                (s: any) =>
                  `${s.provider} · ${s.model || "CLI 기본값"} · ${s.skill}`,
              )
              .join(" → ")}
          </small>
        </div>
      )}
      <div className="editor-actions">
        <button
          className="outline"
          disabled={working || !project}
          onClick={async () => {
            const a = await save();
            if (a) {
              await call("automation.run", { id: a.id, test: true });
              notify(
                "실제 CLI로 시험 실행합니다. 결과는 outputs/automation-preview에 저장됩니다.",
              );
            }
          }}
        >
          <Play size={15} />
          시험 실행
        </button>
        <button
          className="primary"
          disabled={working || !project}
          onClick={() => void save()}
        >
          <Save size={16} />
          저장
        </button>
      </div>
      <div className="local-note">
        <Monitor size={21} />
        <span>
          PC와 실행 관리자가
          <br />
          켜져 있을 때 실행합니다.
        </span>
      </div>
      <p className="tiny muted">시험 실행은 실제 CLI 사용량이 발생합니다.</p>
    </div>
  );
}
function SkillEditor({
  skill,
  onClose,
  onSave,
  onRun,
}: {
  skill: Skill | null;
  onClose: () => void;
  onSave: (s: any) => void;
  onRun: (s: Skill) => void;
}) {
  const [form, setForm] = useState({
    id: skill?.id || "",
    name: skill?.name || "",
    description: skill?.description || "",
    icon: skill?.icon || "book",
    instructions: skill?.instructions || "",
  });
  return (
    <div className="modal-backdrop">
      <section className="modal paper-panel">
        <header>
          <h2>
            <BookOpen /> {skill ? "공용 스킬 편집" : "새로운 스킬 친구"}
          </h2>
          <button
            className="icon-button"
            aria-label="스킬 편집 닫기"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <p className="muted">
          같은 정의를 Codex, Claude, Gemini가 함께 사용해요.
        </p>
        <div className="form-two">
          <label>
            이름
            <input
              aria-label="스킬 이름"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            캐릭터 소품
            <select
              value={form.icon}
              onChange={(e) =>
                setForm({ ...form, icon: e.target.value as Skill["icon"] })
              }
            >
              <option value="book">책 · 정리</option>
              <option value="code">키보드 · 구현</option>
              <option value="check">체크보드 · 검토</option>
            </select>
          </label>
        </div>
        <label>
          언제 사용하는 스킬인가요?
          <input
            aria-label="스킬 설명"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label>
          작업 지침
          <textarea
            aria-label="스킬 지침"
            rows={9}
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            placeholder="입력 자료, 수행할 작업, 결과와 완료 조건을 적어주세요."
          />
        </label>
        <footer>
          <small>
            저장하면 새 버전이 발행됩니다.{skill && ` 현재 v${skill.version}`}
          </small>
          <div>
            {skill && (
              <button className="outline" onClick={() => onRun(skill)}>
                <Play size={14} />
                저장된 스킬 실행
              </button>
            )}
            <button
              className="primary"
              disabled={
                !form.name || !form.description || form.instructions.length < 10
              }
              onClick={() => onSave(form)}
            >
              <Save size={15} />
              공용 스킬 저장
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
function RunInspector({
  run,
  state,
  call,
}: {
  run: Run;
  state: State;
  call: Call;
}) {
  return (
    <div className="run-inspector">
      <h2>
        <ProviderMark id={run.provider} />
        {run.skillName || names[run.provider]}
      </h2>
      <span className={`status ${run.status}`}>{labels[run.status]}</span>
      <h3>{run.title}</h3>
      <p>{run.activity}</p>
      {run.error && <div className="error-note">{run.error}</div>}
      <dl>
        <dt>실행 방식</dt>
        <dd>{run.mode === "terminal" ? "직접 조작 CLI" : "자동 실행 로그"}</dd>
        {run.routingReason && (
          <>
            <dt>선택 이유</dt>
            <dd>{run.routingReason}</dd>
          </>
        )}
        <dt>실행 방식</dt>
        <dd>
          {run.resources ? "범위 분리 · 병렬 가능" : "순차 실행"}
          {run.dependsOn?.length ? ` · 선행 ${run.dependsOn.length}개` : ""}
        </dd>
        <dt>요청 모델</dt>
        <dd>
          {run.model === undefined
            ? "이전 실행 · 모델 미기록"
            : run.model || "CLI 기본값"}
        </dd>
        <dt>CLI 보고 모델</dt>
        <dd>{run.reportedModel || "미보고"}</dd>
        {run.skillVersion && (
          <>
            <dt>스킬 버전</dt>
            <dd>v{run.skillVersion}</dd>
          </>
        )}
        <dt>시작</dt>
        <dd>{time(run.startedAt)}</dd>
        <dt>작업 토큰</dt>
        <dd>{num(run.usage.total)}</dd>
        <dt>입력 / 출력</dt>
        <dd>
          {num(run.usage.input)} / {num(run.usage.output)}
        </dd>
        <dt>사용량 출처</dt>
        <dd>{run.usage.source}</dd>
        <dt>CLI 추정 비용</dt>
        <dd>
          {run.usage.cost === null ? "미확인" : `$${run.usage.cost.toFixed(4)}`}
        </dd>
        <dt>현재 컨텍스트</dt>
        <dd>미확인</dd>
      </dl>
      {["failed", "waiting", "cancelled"].includes(run.status) &&
        run.mode !== "terminal" && (
          <button
            className="outline"
            onClick={() =>
              void call("run.start", {
                projectId: run.projectId,
                provider: run.provider,
                model: run.model,
                prompt: run.prompt,
                skillId: run.skillId,
                skillVersion: run.skillVersion,
                team: run.mode === "team",
              })
            }
          >
            <RefreshCw size={14} />
            같은 요청으로 다시 실행
          </button>
        )}
      {run.parentId && (
        <div className="local-note">
          요청자:{" "}
          {
            names[
              state.runs.find((r) => r.id === run.parentId)?.provider || "codex"
            ]
          }
        </div>
      )}
      <h3>
        <BookOpen size={18} />
        실제로 읽은 자료
      </h3>
      {run.references.length ? (
        run.references.map((f) => (
          <p className="file-tag" key={f}>
            <FileText size={16} />
            {f}
          </p>
        ))
      ) : (
        <p className="muted small">
          확인된 파일 읽기 이벤트가 없어요.
          <br />
          프로젝트 경로 제공과 실제 읽음을 구분합니다.
        </p>
      )}
      <h3>변경 파일</h3>
      {!!run.detectedFiles?.length && (
        <p className="muted small">
          Wiki·결과 폴더에서 실행 중 감지한 변경을 포함합니다. 별도의 외부
          편집도 포함될 수 있어요.
        </p>
      )}
      {run.files.length ? (
        run.files.map((f) => (
          <button
            className="file-tag"
            key={f}
            onClick={() =>
              void call("project.reveal", { projectId: run.projectId, path: f })
            }
          >
            <Code2 size={16} />
            {f}
          </button>
        ))
      ) : (
        <p className="muted small">보고된 변경 파일이 없어요.</p>
      )}
      <h3>지식의 흐름</h3>
      <div className="knowledge-flow">
        <span>원문</span>
        <ArrowRight size={15} />
        <span>Wiki</span>
        <ArrowRight size={15} />
        <span>결과</span>
      </div>
    </div>
  );
}
function FileBrowser({
  project,
  directory,
  setDirectory,
  call,
  runs,
}: {
  project?: Project;
  directory: string;
  setDirectory: (s: string) => void;
  call: Call;
  runs: Run[];
}) {
  const [files, setFiles] = useState<FileEntry[]>([]),
    [selected, setSelected] = useState(""),
    [content, setContent] = useState("");
  useEffect(() => {
    if (project)
      void call<FileEntry[]>("project.files", {
        projectId: project.id,
        path: directory,
      }).then((f) => setFiles(f || []));
  }, [project?.id, directory]);
  const choose = async (f: FileEntry) => {
    if (f.directory) {
      setDirectory(f.path);
      setSelected("");
      return;
    }
    const text = await call<string>("project.read", {
      projectId: project?.id,
      path: f.path,
    });
    if (text !== undefined) {
      setSelected(f.path);
      setContent(text);
    }
  };
  return (
    <section className="page-content wiki-page">
      <PageTitle
        icon={<BookOpen />}
        title="프로젝트 Wiki"
        subtitle="자료와 작업이 연결되는 지식 보관함"
      />
      <div className="wiki-toolbar">
        <button
          className="outline"
          onClick={() =>
            setDirectory(directory.split(/[\\/]/).slice(0, -1).join("/"))
          }
        >
          <ArrowLeft size={14} />
          위로
        </button>
        <code>{directory || "프로젝트 폴더"}</code>
        <button
          className="icon-button"
          aria-label="파일 새로고침"
          onClick={() =>
            void call<FileEntry[]>("project.files", {
              projectId: project?.id,
              path: directory,
            }).then((f) => setFiles(f || []))
          }
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="file-browser">
        <div className="file-list">
          {files.length ? (
            files.map((f) => (
              <button
                key={f.path}
                className={selected === f.path ? "selected" : ""}
                onClick={() => void choose(f)}
              >
                {f.directory ? <Folder size={18} /> : <FileText size={17} />}
                <span>{f.name}</span>
              </button>
            ))
          ) : (
            <Empty text="이 폴더에 자료가 없어요." />
          )}
        </div>
        <article className="file-content paper-panel">
          {selected ? (
            <>
              <header>
                <strong>{selected}</strong>
                <button
                  className="icon-button"
                  aria-label="파일 위치 열기"
                  onClick={() =>
                    void call("project.reveal", {
                      projectId: project?.id,
                      path: selected,
                    })
                  }
                >
                  <ExternalLink size={16} />
                </button>
              </header>
              <pre>{content}</pre>
              <footer>
                참조 실행{" "}
                {runs.filter((r) => r.references.includes(selected)).length} ·
                변경 실행{" "}
                {runs.filter((r) => r.files.includes(selected)).length}
              </footer>
            </>
          ) : (
            <Empty text="문서를 선택하면 원문을 볼 수 있어요." />
          )}
        </article>
      </div>
    </section>
  );
}
function UsageView({
  runs,
  state,
  refreshQuota,
}: {
  runs: Run[];
  state: State;
  refreshQuota: () => void;
}) {
  const [group, setGroup] = useState<"cli" | "skill" | "automation">("cli");
  const rows = new Map<
    string,
    { total: number; known: number; unknown: number }
  >();
  for (const r of runs) {
    if (r.usage.scope === "inclusive") continue;
    const key =
      group === "cli"
        ? names[r.provider]
        : group === "skill"
          ? r.skillName || "스킬 외 작업"
          : state.automations.find((a) => a.id === r.automationId)?.name ||
            "수동 작업";
    const value = rows.get(key) || { total: 0, known: 0, unknown: 0 };
    value.total += r.usage.total || 0;
    r.usage.total === null ? value.unknown++ : value.known++;
    rows.set(key, value);
  }
  return (
    <>
      <div className="segmented">
        {(["cli", "skill", "automation"] as const).map((v, i) => (
          <button
            key={v}
            className={group === v ? "selected" : ""}
            onClick={() => setGroup(v)}
          >
            {["CLI별", "스킬별", "자동화별"][i]}
          </button>
        ))}
      </div>
      <div className="usage-cards">
        {[...rows].map(([key, r]) => (
          <div key={key} className="paper-panel">
            <strong>{key}</strong>
            <h2>
              {r.known ? num(r.total) : "미확인"} <small>토큰</small>
            </h2>
            <p>
              관측 {r.known}회 · 미확인 {r.unknown}회
            </p>
          </div>
        ))}
        {!rows.size && <Empty text="작업 후 실제 관측값이 여기에 쌓여요." />}
      </div>
      <p className="muted small">
        각 탭은 같은 실행 원장을 다르게 묶어 보여줍니다. 탭별 합계를 다시 더하지
        않습니다.
      </p>
      <div className="quota-title">
        <h3>
          계정 한도 <small>프로젝트 사용량과 별도</small>
        </h3>
        <button className="outline" onClick={refreshQuota}>
          <RefreshCw size={14} />
          공식값 확인
        </button>
      </div>
      <div className="quota-cards">
        {state.providers.map((p) => (
          <div className="paper-panel" key={p.id}>
            <strong>
              <ProviderMark id={p.id} />
              {p.name}
            </strong>
            {p.quota?.map((q, i) => (
              <div key={i}>
                <p>
                  {q.limitId || "기본"} ·{" "}
                  {q.windowMinutes !== null
                    ? `${Math.round(q.windowMinutes / 60)}시간 구간`
                    : "기간 미확인"}{" "}
                  · 사용 {q.used}%
                </p>
                <progress max="100" value={q.used} />
                <small>
                  초기화 {q.reset !== null ? time(q.reset * 1000) : "미확인"}
                  <br />
                  확인 {time(q.checkedAt)}
                </small>
              </div>
            )) || <p className="muted">미확인</p>}
          </div>
        ))}
      </div>
    </>
  );
}
function SettingsView({
  onSetup,
  state,
  project,
  call,
  notify,
}: {
  state: State;
  project?: Project;
  call: Call;
  notify: (s: string) => void;
  onSetup: (run: Run) => void;
}) {
  const [paths, setPaths] = useState(
      Object.fromEntries(
        state.providers.map((p) => [
          p.id,
          state.settings.paths[p.id] || p.path,
        ]),
      ),
    ),
    [models, setModels] = useState({ ...state.settings.models }),
    [checking, setChecking] = useState(false),
    [checkingModels, setCheckingModels] = useState(false),
    [binding, setBinding] = useState(
      project
        ? {
            name: project.name,
            raw: project.raw,
            wiki: project.wiki,
            outputs: project.outputs,
          }
        : null,
    );
  return (
    <section className="page-content settings-page">
      <PageTitle
        icon={<Settings />}
        title="연결과 로컬 설정"
        subtitle="각자 본인 계정으로 로그인하세요. 개발자의 계정이나 구독은 제공되지 않습니다."
      />
      <div className="provider-settings">
        {state.providers.map((p) => (
          <div key={p.id} className="paper-panel">
            <header>
              <ProviderMark id={p.id} />
              <h3>{p.name}</h3>
              <span className={`status ${p.available ? "ready" : "offline"}`}>
                {p.available ? "설치 확인" : "설정 필요"}
              </span>
            </header>
            <p>{p.version || p.error}</p>
            <p className="tiny muted">
              설치 확인은 로그인 완료를 뜻하지 않습니다. 이 Windows 사용자에게
              저장된 CLI 인증을 사용합니다. 처음 사용하면 아래 터미널에서 CLI를
              실행하고 본인 계정으로 로그인하세요. 이미 로그인했다면 재사용합니다.
            </p>
            <ModelPicker
              provider={p}
              label={`${p.name} 저장할 기본 모델`}
              value={models[p.id] || ""}
              onChange={(model) =>
                setModels((old) => ({ ...old, [p.id]: model || "" }))
              }
            />
            <p className="tiny muted">
              {p.modelsError || p.modelsSource || "모델 목록 조회 중…"}
            </p>
            {p.id === "gemini" && (
              <p>
                {p.backend === "agy"
                  ? "Antigravity CLI · agy로 연결되었습니다."
                  : "Gemini CLI · 기업용 계정은 agy 설치 없이 사용할 수 있습니다."}
                {" "}Gemini Code Assist Standard/Enterprise 사용자는 기존 gemini
                실행 경로를 지정하세요. 개인용 계정은 agy를 사용합니다.
              </p>
            )}
            <div className="path-input">
              <input
                aria-label={`${p.name} 실행 경로`}
                value={paths[p.id] ?? p.path}
                onChange={(e) => setPaths({ ...paths, [p.id]: e.target.value })}
                placeholder="자동 탐색 또는 실행파일 경로"
              />
              <button
                className="outline"
                onClick={async () => {
                  const file = await call<string>("settings.pickCli");
                  if (file) setPaths({ ...paths, [p.id]: file });
                }}
              >
                <Folder size={16} />
              </button>
            </div>
            <div className="cli-setup-actions">
              <button
                className="outline"
                disabled={checking}
                onClick={async () => {
                  setChecking(true);
                  try {
                    const found = await call<State["providers"]>(
                      "cli.autoConnect",
                      { provider: p.id },
                    );
                    const match = found?.find((x) => x.available);
                    if (match) {
                      setPaths((old) => ({ ...old, [p.id]: match.path }));
                      notify(p.name + " 경로를 찾아 저장했습니다.");
                    } else
                      notify(
                        "자동으로 찾지 못했습니다. 설치 터미널을 실행해주세요.",
                      );
                  } finally {
                    setChecking(false);
                  }
                }}
              >
                경로 자동 연결
              </button>
              <button
                className="outline"
                disabled={checking}
                onClick={async () => {
                  setChecking(true);
                  try {
                    const run = await call<Run>("cli.setup", {
                      provider: p.id,
                      projectId: project?.id,
                      install: false,
                    });
                    if (run) onSetup(run);
                  } finally {
                    setChecking(false);
                  }
                }}
              >
                설치 터미널 열기
              </button>
              {!p.available && (
                <button
                  className="primary"
                  disabled={checking}
                  onClick={async () => {
                    setChecking(true);
                    try {
                      const run = await call<Run>("cli.setup", {
                        provider: p.id,
                        projectId: project?.id,
                        install: true,
                      });
                      if (run) onSetup(run);
                    } finally {
                      setChecking(false);
                    }
                  }}
                >
                  {p.id === "gemini" ? "개인용 agy 설치" : "공식 설치 실행"}
                </button>
              )}
            </div>
            {!p.available && (
              <p className="tiny install-command">
                설치 명령: irm{" "}
                {p.id === "codex"
                  ? "https://chatgpt.com/codex/install.ps1"
                  : p.id === "claude"
                    ? "https://claude.ai/install.ps1"
                    : "https://antigravity.google/cli/install.ps1"}{" "}
                | iex
              </p>
            )}
            <button
              className="text-button"
              onClick={() =>
                void call(
                  "external.open",
                  p.id === "codex"
                    ? "https://learn.chatgpt.com/docs/codex/cli"
                    : p.id === "claude"
                      ? "https://code.claude.com/docs/en/setup"
                      : p.backend === "agy"
                        ? "https://antigravity.google/docs/cli/install/"
                        : "https://geminicli.com/docs/get-started/installation/",
                )
              }
            >
              공식 설치·로그인 안내 <ExternalLink size={13} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="primary"
        disabled={checking}
        onClick={async () => {
          setChecking(true);
          await call("settings.save", { paths, models });
          await call("providers.refresh");
          setChecking(false);
        }}
      >
        <RefreshCw size={16} />
        {checking ? "연결 확인 중…" : "경로 저장하고 연결 확인"}
      </button>
      <button
        className="outline model-refresh"
        disabled={checkingModels}
        onClick={async () => {
          setCheckingModels(true);
          await call("models.refresh", {});
          setCheckingModels(false);
        }}
      >
        <RefreshCw size={15} />
        {checkingModels ? "모델 조회 중…" : "모델 목록 새로고침"}
      </button>
      <p className="small muted">
        기본 모델은 경로와 함께 저장됩니다. 대화·공용 스킬·새 CLI 세션에
        적용하며, 실행 중인 작업은 바꾸지 않습니다. 계정에서 지원하는 모델인지
        여부는 CLI 실행 결과로 확인합니다.
      </p>
      <div className="settings-section">
        <h2>이 PC에서 실행</h2>
        <div className="setting-row">
          <span>
            창을 닫아도 백그라운드 유지
            <small>PC가 켜져 있고 절전이 아닐 때 자동화가 실행됩니다.</small>
          </span>
          <Toggle
            on={state.settings.background}
            label="백그라운드 유지"
            onClick={() =>
              void call("settings.save", {
                background: !state.settings.background,
              })
            }
          />
        </div>
        <div className="setting-row">
          <span>캐릭터 움직임 줄이기</span>
          <Toggle
            on={state.settings.reduceMotion}
            label="움직임 줄이기"
            onClick={() =>
              void call("settings.save", {
                reduceMotion: !state.settings.reduceMotion,
              })
            }
          />
        </div>
      </div>
      {project && binding && (
        <div className="settings-section">
          <h2>프로젝트 자료 연결</h2>
          {(["name", "raw", "wiki", "outputs"] as const).map((key) => (
            <label key={key}>
              {key === "name" ? "프로젝트 이름" : key}
              <input
                value={binding[key]}
                onChange={(e) =>
                  setBinding({ ...binding, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <button
            className="outline"
            onClick={async () => {
              await call("project.update", { id: project.id, ...binding });
              notify("프로젝트 연결을 저장했어요.");
            }}
          >
            <Save size={15} />
            연결 저장
          </button>
        </div>
      )}
      <div className="settings-section">
        <h2>다른 PC로 옮기기</h2>
        <p>
          공용 스킬·자동화·프로젝트 연결만 내보냅니다. 원본 파일과 로그인 정보는
          포함하지 않아요. 가져온 자동화는 꺼짐으로 시작합니다.
        </p>
        <div className="button-row">
          <button
            className="outline"
            onClick={async () => {
              const file = await call<string>("settings.export");
              if (file) notify(`설정을 저장했어요: ${file}`);
            }}
          >
            <Download size={16} />
            설정 내보내기
          </button>
          <button
            className="outline"
            onClick={async () => {
              const result = await call("settings.import");
              if (result)
                notify(
                  "설정을 가져왔어요. 경로와 CLI 연결을 확인한 뒤 자동화를 켜주세요.",
                );
            }}
          >
            <Upload size={16} />
            가져오기
          </button>
          <button
            className="text-button"
            onClick={() => void call("settings.data")}
          >
            데이터 폴더 열기
          </button>
        </div>
      </div>
    </section>
  );
}

