"use client";

import type { ReactNode } from "react";
import { getSubjectBadge } from "@/components/workspace/CardFields";
import type { ElementRec, IdeaRec, StandardRec } from "@/app/api/ideation/route";

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
      <div data-pane-body className="space-y-2 p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{children}</div>
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

// ─── with AI 추천 — 우선순위 큐 ───────────────────────────────────

export type RecItem =
  | { kind: "element"; key: string; rec: ElementRec }
  | { kind: "idea"; key: string; rec: IdeaRec }
  | { kind: "standard"; key: string; rec: StandardRec };

const QUEUE_VISIBLE = 3;

/** 연결 강도 1~3 을 막대로 */
export function StrengthBars({ value }: { value: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5" aria-label={`${value}/3`}>
      {[1, 2, 3].map((n) => <span key={n} className={`h-1.5 w-3 rounded-full ${n <= value ? "bg-[#D1260F]" : "bg-[#eef0f4]"}`} />)}
    </span>
  );
}

/** 추천을 우선순위 순으로 — 위에서부터 보이고, 추가·무시하면 다음 항목이 올라온다 */
export function RecQueue({ items, linkTo, readonly, onAdd, onIgnore, onClose }: {
  items: RecItem[];
  /** 추가하면 이어질 기존 항목의 이름 */
  linkTo: (item: RecItem) => string[];
  readonly: boolean;
  onAdd: (item: RecItem) => void;
  onIgnore: (item: RecItem) => void;
  onClose: () => void;
}) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-[#F5B8A8] bg-[#FFF8F6] p-2.5">
      <div className="mb-1.5 flex items-center">
        <SourceBadge kind="ai" />
        <span className="ml-auto"><IconBtn label="닫기" onClick={onClose}><XIcon /></IconBtn></span>
      </div>
      <ol className="space-y-1.5">
        {items.slice(0, QUEUE_VISIBLE).map((item, rank) => {
          const targets = linkTo(item);
          return (
            <li key={item.key} className="flex gap-2 rounded-lg border border-[#FBE3DC] bg-white p-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#D1260F] text-[11px] font-bold text-white">{rank + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.kind === "idea" && <><SubjectBadge subject={item.rec.subject} /><span className="text-[11.5px] text-[#757b82]">{item.rec.domain}</span></>}
                  {item.kind === "standard" && <><SubjectBadge subject={item.rec.subject} /><CodeChip code={item.rec.code} /></>}
                  {targets.length > 0 && <StrengthBars value={item.rec.strength} />}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-[#2d3339]">{item.kind === "element" ? item.rec.text : item.rec.content}</p>
                {targets.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {targets.map((t) => (
                      <span key={t} className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#e2e4ea] px-2 py-0.5 text-[11px] text-[#5a6066]">
                        <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        <span className="truncate">{t}</span>
                      </span>
                    ))}
                  </div>
                )}
                {item.rec.reason && <p className="mt-1.5 text-[12px] leading-relaxed text-[#757b82]"><span className="mr-1 rounded bg-[#f1f4f9] px-1 py-0.5 text-[10.5px] font-semibold text-[#5a6066]">AI 해석</span>{item.rec.reason}</p>}
                {!readonly && (
                  <div className="mt-2 flex gap-1.5">
                    <button type="button" className={btn} onClick={() => onAdd(item)}>추가</button>
                    <button type="button" className={btn} onClick={() => onIgnore(item)}>무시</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** with AI 를 누른 영역의 진행 상태 */
export function RecStatus({ status, error, onCancel, onRetry }: { status: "loading" | "error"; error?: string; onCancel: () => void; onRetry: () => void }) {
  return status === "loading" ? (
    <div className="flex items-center gap-2 rounded-xl border border-[#F5B8A8] bg-[#FFF8F6] px-3 py-2 text-[13px] text-[#5a6066]">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#F5B8A8] border-t-[#D1260F]" />추천 중…
      <button type="button" className={`${btn} ml-auto`} onClick={onCancel}>취소</button>
    </div>
  ) : (
    <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
      <span className="min-w-0 flex-1">{error}</span>
      <button type="button" className={btn} onClick={onRetry}>다시 시도</button>
    </div>
  );
}

/** 문장을 짧게 — 연결 칩·선택 표시용 */
export function short(text: string, max = 18): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
