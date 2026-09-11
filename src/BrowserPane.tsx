import { useEffect, useRef, useState } from "react";
import type { BrowserState } from "./shared";
export default function BrowserPane({
  projectId,
  visible,
  onError,
}: {
  projectId: string;
  visible: boolean;
  onError: (error: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<BrowserState | null>(null),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void window.workroom
      .invoke<BrowserState>("browser.open", { projectId })
      .then((s) => {
        if (alive) {
          setState(s);
          setUrl(s.url);
        }
      })
      .catch((e) => onError(String(e)));
    const off = window.workroom.onEvent((e) => {
      if (e.type === "browser" && e.projectId === projectId && e.browser) {
        setState(e.browser);
        if (e.browser.url) setUrl(e.browser.url);
      }
    });
    return () => {
      alive = false;
      off();
      void window.workroom
        .invoke("browser.bounds", {
          projectId,
          visible: false,
          rect: { x: 0, y: 0, width: 0, height: 0 },
        })
        .catch(() => {});
    };
  }, [projectId, onError]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      void window.workroom
        .invoke("browser.bounds", {
          projectId,
          visible: visible && !!state?.url,
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        })
        .catch(() => {});
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [projectId, visible, state?.projectId, state?.url]);
  const navigate = async () => {
    setBusy(true);
    try {
      await window.workroom.invoke("browser.action", {
        projectId,
        action: {
          action: "navigate",
          url: /^https?:\/\//i.test(url) ? url : "https://" + url,
        },
      });
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="in-app-browser" aria-label="내장 브라우저">
      <form
        className="browser-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void navigate();
        }}
      >
        <input
          aria-label="웹 주소"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
        />
        <button
          type="submit"
          className="outline"
          disabled={busy || !url.trim()}
        >
          이동
        </button>
        <label>
          <input
            type="checkbox"
            checked={state?.enabled ?? true}
            onChange={(e) =>
              void window.workroom
                .invoke("browser.allow", {
                  projectId,
                  enabled: e.target.checked,
                })
                .catch((err) => onError(String(err)))
            }
          />
          Codex 제어
        </label>
      </form>
      <div className="browser-status">
        {state?.error || state?.activity || "브라우저 준비"} · 로그인은 직접
        입력하세요
      </div>
      <div className="browser-host" ref={host}>
        {!state?.url && (
          <p>주소를 입력하거나 Codex에게 열 웹사이트를 알려주세요.</p>
        )}
      </div>
    </section>
  );
}
