"use client";

import type { ReactNode } from "react";
import { getSubjectBadge } from "@/components/workspace/CardFields";
import type { ElementSuggestion, IdeaSuggestion, StandardSuggestion, SuggestDirection } from "@/app/api/ideation/route";

// 아이디어 도출 화면의 작은 부품 — 영역 틀, 출처 배지, 연결 칩, with AI 추천 패널

export const btn = "inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#dde3eb] bg-white px-2.5 py-1 text-[12.5px] font-medium text-[#5a6066] transition hover:border-[#D1260F] hover:text-[#D1260F] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#dde3eb] disabled:hover:text-[#5a6066]";
export const primaryBtn = "inline-flex min-h-8 items-center gap-1 rounded-lg bg-[#D1260F] px-3 py-1 text-[13px] font-semibold text-white transition hover:bg-[#A81A08] disabled:cursor-not-allowed disabled:opacity-40";
export const aiBtn = "inline-flex min-h-8 items-center gap-1 rounded-lg bg-gradient-to-br from-[#D1260F] to-[#F0603C] px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
export const field = "w-full rounded-lg bg-[#f1f4f9] px-3 py-2 text-[14px] text-[#2d3339] placeholder-[#adb2ba] outline-none focus:ring-2 focus:ring-[#D1260F]/20 disabled:opacity-60";

export function Pane({ title, tools, children }: { title: string; tools?: ReactNode; children: ReactNode }) {
  return (
    // 넓은 화면: 세 영역이 나란히, 영역마다 안에서 스크롤 / 좁은 화면: 세로로 쌓고 내용만큼 늘어나 페이지가 스크롤
    <section className="flex min-h-[200px] min-w-0 flex-col rounded-2xl border border-[#e2e4ea] bg-white lg:min-h-0">
      <div className="shrink-0 border-b border-[#eef0f4] px-4 py-3">
        <h2 className="text-[15px] font-bold text-[#2d3339]">{title}</h2>
        {tools && <div className="mt-2 flex flex-wrap gap-1.5">{tools}</div>}
      </div>
      <div className="space-y-2 p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{children}</div>
    </section>
  );
}

export function SubjectBadge({ subject }: { subject: string }) {
  if (!subject) return null;
  const b = getSubjectBadge(subject);
  return <span className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium" style={{ backgroundColor: b.bg, color: b.text }}>{subject}</span>;
}

export function CodeChip({ code }: { code: string }) {
  return <span className="shrink-0 whitespace-nowrap rounded bg-[#f1f4f9] px-1.5 py-0.5 font-mono text-[12px] text-[#2d3339]">{code}</span>;
}

const SOURCE = {
  official: { label: "공식 데이터", cls: "bg-[#f1f4f9] text-[#5a6066]" },
  teacher: { label: "교사 작성/수정", cls: "bg-[#FFF1ED] text-[#A81A08]" },
  ai: { label: "AI 추천", cls: "bg-[#FDE8E3] text-[#D1260F]" },
} as const;
export function SourceBadge({ kind }: { kind: keyof typeof SOURCE }) {
  return <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${SOURCE[kind].cls}`}>{SOURCE[kind].label}</span>;
}

/** 연결 대상을 짧게 보여 주는 칩 — 누르면 그 항목으로 이동, ×는 연결만 제거, 다시 검토할 연결은 ✓ 로 유지 */
export function LinkChip({ label, title, review, onOpen, onRemove, onConfirm }: {
  label: ReactNode; title?: string; review: boolean;
  onOpen: () => void; onRemove?: () => void; onConfirm?: () => void;
}) {
  return (
    <span className={`inline-flex max-w-full items-center rounded-full border text-[11.5px] ${review ? "border-amber-300 bg-amber-50 text-amber-900" : "border-[#e2e4ea] bg-white text-[#5a6066]"}`}>
      <button type="button" title={title} onClick={(e) => { e.stopPropagation(); onOpen(); }} className="min-w-0 truncate py-0.5 pl-2 pr-1 hover:underline">{label}</button>
      {review && onConfirm && (
        <button type="button" aria-label="연결 유지" onClick={(e) => { e.stopPropagation(); onConfirm(); }} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-amber-100">
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
        </button>
      )}
      {onRemove && (
        <button type="button" aria-label="연결 제거" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="mr-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[#adb2ba] hover:bg-red-50 hover:text-red-500">
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}
    </span>
  );
}

export function IconBtn({ label, onClick, danger, children, disabled }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#adb2ba] transition disabled:opacity-40 ${danger ? "hover:bg-red-50 hover:text-red-500" : "hover:bg-[#f1f4f9] hover:text-[#2d3339]"}`}>
      {children}
    </button>
  );
}
export const PencilIcon = () => <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.536 8 18l1-4.464z" /></svg>;
export const XIcon = () => <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;

// ─── with AI 추천 ─────────────────────────────────────────────────

export type Suggestion =
  | ({ type: "idea" } & IdeaSuggestion)
  | ({ type: "standard" } & StandardSuggestion)
  | ({ type: "element" } & ElementSuggestion);

export interface SuggestState {
  direction: SuggestDirection;
  targetId: string;
  targetLabel: string;
  status: "loading" | "done" | "error";
  error?: string;
  items: { key: string; s: Suggestion; ignored: boolean }[];
}

export const DIRECTION_LABEL: Record<SuggestDirection, string> = {
  "element-ideas": "하위요소 → 핵심아이디어",
  "idea-elements": "핵심아이디어 → 하위요소",
  "idea-standards": "핵심아이디어 → 성취기준",
  "standard-ideas": "성취기준 → 핵심아이디어",
};

/** 각 제안의 현재 상태 — 이미 채택했는지, 어떤 동작을 할 수 있는지는 화면의 초안을 보고 정한다 */
export type SuggestView = { action: "추가" | "연결" | "문장에 반영" | null; adopted: boolean; before?: string };

export function SuggestPanel({ state, view, readonly, onAdopt, onIgnore, onCancel, onRetry, onClose }: {
  state: SuggestState;
  view: (s: Suggestion) => SuggestView;
  readonly: boolean;
  onAdopt: (key: string) => void;
  onIgnore: (key: string) => void;
  onCancel: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const visible = state.items.filter((i) => !i.ignored);
  return (
    <div className="rounded-xl border border-[#F5B8A8] bg-[#FFF8F6] p-3">
      <div className="mb-2 flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[12.5px] font-semibold text-[#A81A08]">
          {DIRECTION_LABEL[state.direction]} <span className="font-normal text-[#757b82]">· {state.targetLabel}</span>
        </p>
        <IconBtn label="닫기" onClick={onClose}><XIcon /></IconBtn>
      </div>
      {state.status === "loading" && (
        <div className="flex items-center gap-2 text-[13px] text-[#5a6066]">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#F5B8A8] border-t-[#D1260F]" />추천 중…
          <button type="button" className={`${btn} ml-auto`} onClick={onCancel}>취소</button>
        </div>
      )}
      {state.status === "error" && (
        <div className="flex items-center gap-2 text-[13px] text-red-700">
          <span className="min-w-0 flex-1">{state.error}</span>
          <button type="button" className={btn} onClick={onRetry}>다시 시도</button>
        </div>
      )}
      {state.status === "done" && !visible.length && <p className="text-[13px] text-[#757b82]">추천 결과가 없습니다.</p>}
      {state.status === "done" && visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map(({ key, s }) => {
            const v = view(s);
            return (
              <li key={key} className={`rounded-lg border bg-white p-2.5 ${v.adopted ? "border-[#e2e4ea] opacity-60" : "border-[#FBE3DC]"}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {s.type === "idea" && <><SubjectBadge subject={s.subject} /><span className="text-[11.5px] text-[#757b82]">{s.domain}</span></>}
                  {s.type === "standard" && <><SubjectBadge subject={s.subject} /><CodeChip code={s.code} /></>}
                  {v.adopted && <svg className="ml-auto h-4 w-4 text-[#D1260F]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                </div>
                {v.before !== undefined && <p className="mt-1.5 text-[12.5px] text-[#adb2ba] line-through">{v.before}</p>}
                <p className="mt-1 text-[13px] leading-relaxed text-[#2d3339]">{s.type === "element" ? s.text : s.content}</p>
                {s.reason && <p className="mt-1.5 text-[12px] leading-relaxed text-[#757b82]"><span className="mr-1 rounded bg-[#f1f4f9] px-1 py-0.5 text-[10.5px] font-semibold text-[#5a6066]">AI 해석</span>{s.reason}</p>}
                {!v.adopted && !readonly && (
                  <div className="mt-2 flex gap-1.5">
                    {v.action && <button type="button" className={btn} onClick={() => onAdopt(key)}>{v.action}</button>}
                    <button type="button" className={btn} onClick={() => onIgnore(key)}>무시</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 문장을 짧게 — 연결 칩·선택 표시용 */
export function short(text: string, max = 18): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
