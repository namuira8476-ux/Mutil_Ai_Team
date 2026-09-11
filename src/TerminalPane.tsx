import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ExternalLink, Square, Keyboard, TerminalSquare } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import type { Run } from "./shared";
export default function TerminalPane({
  run,
  onError,
}: {
  run: Run;
  onError: (s: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [owns, setOwns] = useState(false);
  const ownsInput = useRef(false);
  useEffect(() => {
    if (!host.current) return;
    const term = new Terminal({
      fontSize: 13,
      fontFamily: "Cascadia Code, Consolas, monospace",
      lineHeight: 1.3,
      cursorBlink: true,
      convertEol: run.mode !== "terminal",
      scrollback: 10000,
      theme: {
        background: "#f9f7f0",
        foreground: "#28344a",
        cursor: "#244674",
        selectionBackground: "#c8d7e5",
        black: "#28344a",
        green: "#438773",
        blue: "#477fad",
        yellow: "#ba783d",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    term.write(run.output);
    const resize = () => {
      try {
        fit.fit();
        window.workroom
          .invoke("terminal.resize", {
            runId: run.id,
            cols: term.cols,
            rows: term.rows,
          })
          .catch(() => {});
      } catch {}
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    resize();
    const refreshOwner = () => {
      void window.workroom
        .invoke<boolean>("terminal.owner", { runId: run.id })
        .then((value) => {
          ownsInput.current = value;
          setOwns(value);
        });
    };
    refreshOwner();
    const off = window.workroom.onEvent((e) => {
      if (e.type === "ownership" && e.runId === run.id) refreshOwner();
      if (e.type === "terminal" && e.runId === run.id && e.data)
        term.write(e.data);
    });
    const input = term.onData((data) => {
      if (run.mode === "terminal" && ownsInput.current)
        window.workroom
          .invoke("terminal.input", { runId: run.id, data })
          .catch((e) => onError(String(e.message)));
    });
    return () => {
      off();
      observer.disconnect();
      input.dispose();
      term.dispose();
    };
  }, [run.id]);
  const claim = async () => {
    try {
      await window.workroom.invoke("terminal.claim", { runId: run.id });
      setOwns(true);
      ownsInput.current = true;
    } catch (e) {
      onError(String(e));
    }
  };
  return (
    <section className="terminal-pane paper-panel">
      <div className="terminal-toolbar">
        <span>
          <TerminalSquare size={17} />
          {run.provider} {run.mode === "terminal" ? "CLI" : "실행 로그"}
          {run.model !== undefined && (
            <small title="세션 시작 시 요청한 모델">
              {" "}
              · {run.model || "CLI 기본값"}
            </small>
          )}
        </span>
        <div>
          {run.mode === "terminal" && run.status === "running" && (
            <button className={owns ? "chip active" : "chip"} onClick={claim}>
              <Keyboard size={14} />
              {owns ? "이 창에서 입력" : "입력 권한 가져오기"}
            </button>
          )}
          <button
            className="chip"
            onClick={() =>
              window.workroom
                .invoke("terminal.popout", { runId: run.id })
                .catch((e) => onError(String(e)))
            }
          >
            <ExternalLink size={13} />새 창으로
          </button>
          {["running", "queued"].includes(run.status) && (
            <button
              className="chip danger"
              onClick={() =>
                window.workroom
                  .invoke("run.cancel", { runId: run.id })
                  .catch((e) => onError(String(e)))
              }
            >
              <Square size={12} />
              중지
            </button>
          )}
        </div>
      </div>
      <div className="terminal-caption">
        {run.title} <span>{run.activity}</span>
      </div>
      <div className="terminal-host" ref={host} />
      <footer>
        {run.mode === "terminal"
          ? "같은 세션 · 입력은 권한을 가진 창에서만 가능"
          : "공식 CLI 실행 로그 · 자동 작업"}
        <code>{run.id.slice(0, 8)}</code>
      </footer>
    </section>
  );
}
