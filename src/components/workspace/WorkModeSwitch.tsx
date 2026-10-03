"use client";

/** 워크스페이스 헤더의 작업 전환 버튼 — 수업 설계와 아이디어 도출(성취기준 연결 탐색기)을 오간다 */
export type WorkMode = "design" | "ideation";

const MODES: { mode: WorkMode; label: string }[] = [
  { mode: "design", label: "수업 설계" },
  { mode: "ideation", label: "아이디어 도출" },
];

export default function WorkModeSwitch({ mode, onChange }: { mode: WorkMode; onChange: (mode: WorkMode) => void }) {
  return (
    <div role="tablist" aria-label="작업 전환" className="flex shrink-0 items-center gap-1 rounded-lg bg-black/15 p-1">
      {MODES.map((m) => {
        const active = m.mode === mode;
        return (
          <button
            key={m.mode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m.mode)}
            className={`whitespace-nowrap rounded-md px-4 py-1.5 text-[15px] transition-colors ${
              active
                ? "bg-white font-semibold text-[#D1260F] shadow-sm"
                : "font-medium text-white/85 hover:bg-white/15 hover:text-white"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
