import { useId, useLayoutEffect, useRef, useState } from "react";
import type { Run } from "./shared";

type Arc = {
  id: string;
  call: string;
  reply: string;
  running: boolean;
  response: boolean;
  label: string;
};
const names = { codex: "Codex", claude: "Claude", gemini: "Gemini" };

export default function CommunicationArcs({
  runs,
  onOpen,
}: {
  runs: Run[];
  onOpen: (run: Run) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const marker = useId().replace(/:/g, "");
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [height, setHeight] = useState(1);
  const byId = new Map(runs.map((r) => [r.id, r]));
  const candidates = runs.filter(
    (r) => r.parentId && r.mode !== "terminal" && byId.get(r.parentId)?.status === "running",
  );
  const active = candidates.filter(
    (r) => r.status === "running" || r.status === "queued",
  );
  const selected = active;
  const signature = selected
    .map((r) => `${r.id}:${r.status}:${!!r.answer?.trim()}`)
    .join("|");
  const current = useRef({ runs, selected });
  current.current = { runs, selected };
  useLayoutEffect(() => {
    const svg = ref.current;
    const container = svg?.parentElement;
    if (!svg || !container) return;
    const measure = () => {
      const origin = container.getBoundingClientRect();
      const next: Arc[] = [];
      for (const run of current.current.selected) {
        const parent = current.current.runs.find((p) => p.id === run.parentId)!;
        const source = container.querySelector(
          `[data-agent="${parent.provider}"] .desk-button`,
        );
        const target =
          parent.provider === run.provider || current.current.selected.filter(r => r.provider === run.provider && r.status === "running").length > 1
            ? container.querySelector(`[data-child-run="${run.id}"] .sprite`)
            : container.querySelector(
                `[data-agent="${run.provider}"] .desk-button`,
              );
        if (!source || !target) continue;
        const a = source.getBoundingClientRect(),
          b = target.getBoundingClientRect();
        const x1 = a.left - origin.left + 10,
          y1 = a.top - origin.top + a.height * 0.5;
        const x2 = b.left - origin.left + 10,
          y2 = b.top - origin.top + b.height * 0.5;
        // Both paths bow into the reserved left gutter, keeping text and monitors clear.
        const middle = (y1 + y2) / 2;
        next.push({
          id: run.id,
          call: `M ${x1} ${y1 - 5} Q ${-x1 + 12} ${middle} ${x2} ${y2 - 5}`,
          reply: `M ${x2} ${y2 + 5} Q ${-x1 + 38} ${middle} ${x1} ${y1 + 5}`,
          running: run.status === "running",
          response: !!run.answer?.trim(),
          label: `${names[parent.provider]}에서 ${names[run.provider]} 호출, 반대 방향 응답`,
        });
      }
      setHeight(container.clientHeight);
      setArcs(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    container
      .querySelectorAll(".family, .desk-button, .child-area")
      .forEach((el) => observer.observe(el));
    measure();
    return () => observer.disconnect();
  }, [signature]);
  return (
    <svg
      ref={ref}
      className="communication-arcs"
      height={height}
      aria-label="에이전트 사이 호출과 응답"
      role="group"
    >
      <defs>
        <marker
          id={`${marker}-call`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path
            d="M1 1L8 5L1 9"
            fill="none"
            stroke="#2166c1"
            strokeWidth="1.5"
          />
        </marker>
        <marker
          id={`${marker}-reply`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path
            d="M1 1L8 5L1 9"
            fill="none"
            stroke="#c33b43"
            strokeWidth="1.5"
          />
        </marker>
      </defs>
      {arcs.map((arc) => (
        <g
          key={arc.id}
          data-arc-run={arc.id}
          role="button"
          tabIndex={0}
          aria-label={`${arc.label} · 작업 상세`}
          onClick={() => {
            const run = byId.get(arc.id);
            if (run) onOpen(run);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              const run = byId.get(arc.id);
              if (run) onOpen(run);
            }
          }}
          className={arc.running ? "arc-working" : "arc-finished"}
        >
          <title>{arc.label}</title>
          <path
            className="call-arrow"
            d={arc.call}
            markerEnd={`url(#${marker}-call)`}
          />
          {arc.response && (
            <path
              className="response-arrow"
              d={arc.reply}
              markerEnd={`url(#${marker}-reply)`}
            />
          )}
          {arc.running && <path className="call-packet" d={arc.call} />}
          {arc.running && arc.response && (
            <path className="response-packet" d={arc.reply} />
          )}
        </g>
      ))}
    </svg>
  );
}
