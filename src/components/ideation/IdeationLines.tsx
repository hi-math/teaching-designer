"use client";

import { useLayoutEffect, useState, type MouseEvent, type RefObject } from "react";
import { ideaText, type IdeationDraft, type IdeationLink } from "@/lib/ideation/model";
import { StrengthBars } from "./ideationParts";

// 세 영역 사이의 연결선 — 하위요소 ↔ 핵심아이디어, 핵심아이디어 ↔ 성취기준을 곡선으로 잇는다.
// 선은 카드 바깥 여백(영역 사이 간격)으로만 지나가 원문과 편집 버튼을 가리지 않는다.
// 굵기는 연결 강도(1~3), 선에 마우스를 올리면 양끝 항목과 어떻게 연결되는지 설명을 보여 준다.
// 영역이 세로로 쌓이는 좁은 화면에서는 그리지 않는다.

type LinkKind = "elementIdea" | "ideaStandard";
type Drawn = { kind: LinkKind; link: IdeationLink; d: string; faded: boolean };
const WIDTH: Record<1 | 2 | 3, number> = { 1: 1.25, 2: 2.5, 3: 4 };
const WIDE = "(min-width: 1024px)";

function short(text: string, max = 40): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export default function IdeationLines({ container, draft, active }: {
  container: RefObject<HTMLDivElement | null>;
  draft: IdeationDraft;
  /** 선택한 항목과 그 연결 경로의 항목 ID — 양끝이 모두 들어 있는 선을 강조한다. 선택이 없으면 null */
  active: Set<string> | null;
}) {
  const [lines, setLines] = useState<Drawn[]>([]);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const wide = window.matchMedia(WIDE);
    let frame = 0;
    const compute = () => {
      frame = 0;
      if (!wide.matches) { setLines([]); return; }
      const base = root.getBoundingClientRect();
      // 앱 전체에 zoom 이 걸려 있어 측정값(화면 px)과 SVG 좌표(CSS px)가 다르다 — 컨테이너의 실제 배율로 되돌린다
      const scale = base.width / (root.offsetWidth || base.width) || 1;
      const bodies = [...root.querySelectorAll<HTMLElement>("[data-pane-body]")].map((b) => b.getBoundingClientRect());
      // 카드 첫 줄 높이쯤에서 나가고 들어온다. 영역 밖으로 스크롤된 카드는 영역 가장자리에 붙이고 흐리게
      const anchor = (id: string, side: "left" | "right", pane: number) => {
        const el = document.getElementById(`ideation-${id}`);
        const body = bodies[pane];
        if (!el || !body) return null;
        const r = el.getBoundingClientRect();
        const raw = r.top + Math.min(r.height / 2, 20);
        const y = Math.min(Math.max(raw, body.top), body.bottom);
        return { x: ((side === "right" ? r.right : r.left) - base.left) / scale, y: (y - base.top) / scale, hidden: raw < body.top || raw > body.bottom };
      };
      const out: Drawn[] = [];
      const add = (kind: LinkKind, link: IdeationLink, a: ReturnType<typeof anchor>, b: ReturnType<typeof anchor>) => {
        if (!a || !b) return;
        const dx = Math.max(24, (b.x - a.x) / 2);
        out.push({ kind, link, d: `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`, faded: a.hidden || b.hidden });
      };
      for (const l of draft.elementIdeaLinks) add("elementIdea", l, anchor(l.from, "right", 0), anchor(l.to, "left", 1));
      for (const l of draft.ideaStandardLinks) add("ideaStandard", l, anchor(l.from, "right", 1), anchor(l.to, "left", 2));
      setLines(out);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(compute); };
    schedule();
    const bodies = [...root.querySelectorAll<HTMLElement>("[data-pane-body]")];
    bodies.forEach((b) => b.addEventListener("scroll", schedule, { passive: true }));
    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    root.querySelectorAll('[id^="ideation-"]').forEach((el) => ro.observe(el));
    wide.addEventListener("change", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      bodies.forEach((b) => b.removeEventListener("scroll", schedule));
      ro.disconnect();
      wide.removeEventListener("change", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [container, draft]);

  const point = (e: MouseEvent) => {
    const root = container.current;
    if (!root) return { x: 0, y: 0 };
    const base = root.getBoundingClientRect();
    const scale = base.width / (root.offsetWidth || base.width) || 1;
    return { x: (e.clientX - base.left) / scale, y: (e.clientY - base.top) / scale };
  };
  const hovered = hover ? lines.find((l) => l.link.id === hover.id) : undefined;
  const width = container.current?.clientWidth ?? 0;
  const ideaName = (id: string) => { const i = draft.ideas.find((x) => x.id === id); return short(i ? ideaText(i) : ""); };
  const names = !hovered ? null : hovered.kind === "elementIdea"
    ? { from: short(draft.elements.find((e) => e.id === hovered.link.from)?.text ?? ""), to: ideaName(hovered.link.to) }
    : { from: ideaName(hovered.link.from), to: draft.standards.find((x) => x.id === hovered.link.to)?.code ?? "" };

  return (
    <>
      <svg className="pointer-events-none absolute inset-0 z-10 hidden h-full w-full overflow-visible lg:block" aria-hidden>
        {lines.map((ln) => {
          const on = !!active && active.has(ln.link.from) && active.has(ln.link.to);
          const isHover = hover?.id === ln.link.id;
          const color = isHover ? "#D1260F" : ln.link.review ? "#f59e0b" : on ? "#F0603C" : "#c9d0da";
          const opacity = ln.faded ? 0.25 : active && !on && !isHover ? 0.3 : 1;
          return (
            <g key={ln.link.id}>
              <path d={ln.d} fill="none" stroke={color} strokeWidth={WIDTH[ln.link.strength] + (isHover ? 1 : 0)} strokeLinecap="round"
                strokeDasharray={ln.link.review ? "5 4" : undefined} opacity={opacity} />
              <path d={ln.d} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: "stroke", cursor: "help" }}
                onMouseEnter={(e) => setHover({ id: ln.link.id, ...point(e) })}
                onMouseMove={(e) => setHover({ id: ln.link.id, ...point(e) })}
                onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {hovered && hover && names && (
        <div role="tooltip" className="pointer-events-none absolute z-20 w-72 rounded-xl border border-[#e2e4ea] bg-white p-3 text-[12px] shadow-lg"
          style={{ left: Math.max(8, Math.min(hover.x + 12, width - 296)), top: hover.y + 14 }}>
          <p className="font-semibold leading-snug text-[#2d3339]">{names.from || "—"} <span className="text-[#adb2ba]">↔</span> {names.to || "—"}</p>
          <div className="mt-1.5"><StrengthBars value={hovered.link.strength} /></div>
          {hovered.link.review && <p className="mt-1.5 font-semibold text-amber-700">다시 검토할 연결</p>}
          {hovered.link.reason && (
            <p className="mt-1.5 leading-relaxed text-[#5a6066]">
              <span className="mr-1 rounded bg-[#f1f4f9] px-1 py-0.5 text-[10.5px] font-semibold text-[#5a6066]">AI 해석</span>{hovered.link.reason}
            </p>
          )}
        </div>
      )}
    </>
  );
}
