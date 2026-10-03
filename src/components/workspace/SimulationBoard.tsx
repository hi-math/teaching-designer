'use client';

import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AutoResizeTextarea, getSubjectBadge } from './CardFields';
import { extractCodes } from '@/lib/standardCode';

/**
 * 초안 미리보기(A-5) 보드 — 차시별 수업 초안 카드.
 *
 * 차시별 카드(과목·수업 타이틀·학습목표·성취기준 코드·지도내용)를 한 줄에 3개씩 놓고,
 * 손잡이를 끌어 순서를 바꾼다. 차시 번호는 저장하지 않고 배열 순서로 매긴다
 * — 순서를 바꿀 때마다 번호를 다시 맞출 필요가 없도록.
 */

export type SimSession = {
  id: string;
  subject: string;
  title: string;
  /** 성취기준 코드만 — "[9수01-02], [9사03-01]" */
  standard: string;
  objective: string;
  /** 지도내용 — 줄마다 개조식 항목 하나 */
  content: string;
};

export function newSessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** "[9수01-02] 내용…" 처럼 본문이 붙어 있어도 대괄호 코드만 남긴다. 코드가 없으면 그대로. */
export function standardCodesOnly(text: string): string {
  const codes = extractCodes(text);
  return codes.length ? codes.join(', ') : text;
}

/** 지도내용 문자열 → 불릿 항목 배열 (앞의 "-", "•" 표식은 떼어 낸다) */
export function contentBullets(text: string): string[] {
  const lines = text.split('\n').map((l) => l.replace(/^\s*(?:[-•·*]|\d+[.)])\s*/, ''));
  return lines.length ? lines : [''];
}

function readSessions(value: Record<string, unknown>): SimSession[] {
  return Array.isArray(value.sessions) ? (value.sessions as SimSession[]) : [];
}

/** 지도내용 불릿 편집기 — Enter 로 다음 항목, 빈 항목에서 Backspace 로 삭제 */
function BulletEditor({
  value, onChange, locked,
}: {
  value: string;
  onChange: (v: string) => void;
  locked: boolean;
}) {
  const items = contentBullets(value);
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focus = (i: number) => requestAnimationFrame(() => refs.current[i]?.focus());
  const save = (next: string[]) => onChange(next.join('\n'));

  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span className="pt-[7px] text-[13px] font-bold leading-none text-[#D1260F]">•</span>
          <textarea
            ref={(el) => {
              refs.current[i] = el;
              if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
            }}
            rows={1}
            value={item}
            disabled={locked}
            placeholder={i === 0 ? '지도내용' : ''}
            onChange={(e) => save(items.map((v, j) => (j === i ? e.target.value.replace(/\n/g, ' ') : v)))}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter 는 무시
              if (e.key === 'Enter') {
                e.preventDefault();
                save([...items.slice(0, i + 1), '', ...items.slice(i + 1)]);
                focus(i + 1);
              } else if (e.key === 'Backspace' && item === '' && items.length > 1) {
                e.preventDefault();
                save(items.filter((_, j) => j !== i));
                focus(Math.max(0, i - 1));
              }
            }}
            style={{ resize: 'none', overflow: 'hidden' }}
            className="w-full bg-transparent py-0.5 text-[13.5px] leading-relaxed text-[#2d3339] placeholder-[#adb2ba] outline-none disabled:opacity-60"
          />
        </li>
      ))}
    </ul>
  );
}

type EditArea = 'head' | 'objective' | 'standard' | 'content';

function PencilButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="수정"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#adb2ba] transition hover:bg-[#FDE4DD] hover:text-[#D1260F]"
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  );
}

/** 영역 제목 줄 — 오른쪽에 연필 */
function SectionHead({ label, showPencil, onEdit }: { label: string; showPencil: boolean; onEdit: () => void }) {
  return (
    <div className="mb-0.5 flex min-h-6 items-center justify-between gap-2">
      <span className="text-[11.5px] font-semibold text-[#5a6066]">{label}</span>
      {showPencil && <PencilButton onClick={onEdit} />}
    </div>
  );
}

/** 편집 중인 영역 아래의 [취소] [수정] */
function EditActions({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="mt-2 flex justify-end gap-1.5">
      <button
        onClick={onCancel}
        className="rounded-md border border-[#dde3eb] bg-white px-2.5 py-1 text-[12px] font-medium text-[#757b82] transition hover:bg-gray-50"
      >
        취소
      </button>
      <button
        onClick={onSave}
        className="rounded-md bg-[#D1260F] px-2.5 py-1 text-[12px] font-semibold text-white transition hover:bg-[#A81A08]"
      >
        수정
      </button>
    </div>
  );
}

// ─── 초안 만들기 전 추가 요청 받기 ─────────────────────────────────

const REQUEST_MAX = 500;

function DraftRequestDialog({
  initial,
  replaceCount,
  onCancel,
  onSubmit,
}: {
  initial: string;
  /** 지금 있는 차시 카드 수 — 0 보다 크면 버튼이 "바꾸고 초안 만들기"가 된다 */
  replaceCount: number;
  onCancel: () => void;
  onSubmit: (request: string) => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();

  // 열릴 때 한 번만 입력칸에 커서를 둔다 (실시간 동기화로 다시 그려져도 커서가 튀지 않게)
  const onEscape = useEffectEvent(() => onCancel());
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onEscape(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-[520px] max-w-[calc(100vw-32px)] rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
      >
        <h3 id={titleId} className="text-[16px] font-bold text-[#2d3339]">추가 요청 입력하기</h3>
        <textarea
          ref={ref}
          value={text}
          maxLength={REQUEST_MAX}
          rows={4}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmit(text.trim()); }
          }}
          aria-labelledby={titleId}
          placeholder="예: 3차시에는 지역 문제를 조사하는 현장 활동을 넣어 주세요."
          className="mt-3 w-full resize-none rounded-xl bg-[#f1f4f9] px-4 py-3 text-[14px] leading-relaxed text-[#2d3339] placeholder-[#adb2ba] outline-none focus:ring-2 focus:ring-[#D1260F]/20"
        />

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 whitespace-nowrap rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-medium text-[#757b82] transition hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onSubmit(text.trim())}
            className="shrink-0 whitespace-nowrap rounded-lg bg-[#D1260F] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#A81A08]"
          >
            {replaceCount > 0 ? '바꾸고 초안 만들기' : '초안 만들기'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function SimulationBoard({
  value,
  onChange,
  locked,
  onSimulate,
  onApplyToDesign,
}: {
  value: Record<string, unknown>;
  onChange: (fields: Record<string, unknown>) => void;
  locked: boolean;
  /** 지금까지의 설계 내용으로 차시 초안을 새로 만든다. request 는 교사 팀의 추가 요청(우선 반영) */
  onSimulate?: (request: string) => Promise<string | null>;
  /** 차시 카드를 Ds-3 학습 활동·Ds-4 지원 도구에 옮긴다. 결과 안내 문구를 돌려준다(취소 시 null). */
  onApplyToDesign?: () => Promise<string | null>;
}) {
  const sessions = readSessions(value);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 생성 뒤 알릴 내용 — 추가 요청으로 수업 기본정보의 총 차시가 바뀐 경우 등
  const [notice, setNotice] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // 손잡이를 누른 카드만 draggable 로 만든다. 카드 전체를 draggable 로 두면
  // textarea 에서 글자를 드래그해 선택하려 할 때 카드가 끌려 간다.
  const [armedId, setArmedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // 끌고 있는 카드가 놓일 자리: 어느 카드의 앞/뒤인지
  const [over, setOver] = useState<{ idx: number; after: boolean } | null>(null);

  // 연필 버튼으로 연 편집 — 한 번에 한 영역만. 수정을 누르기 전까지는 draft 에만 반영한다.
  const [edit, setEdit] = useState<{ id: string; area: EditArea; draft: Partial<SimSession> } | null>(null);

  const save = (next: SimSession[]) => onChange({ ...value, sessions: next });

  const startEdit = (s: SimSession, area: EditArea) => {
    const draft: Partial<SimSession> =
      area === 'head' ? { subject: s.subject, title: s.title ?? '' }
      : area === 'standard' ? { standard: standardCodesOnly(s.standard) }
      : { [area]: s[area] };
    setEdit({ id: s.id, area, draft });
  };
  const setDraft = (key: keyof Omit<SimSession, 'id'>, text: string) =>
    setEdit((e) => (e ? { ...e, draft: { ...e.draft, [key]: text } } : e));
  const commitEdit = () => {
    if (!edit) return;
    save(sessions.map((s) => (s.id === edit.id ? { ...s, ...edit.draft } : s)));
    setEdit(null);
  };
  const cancelEdit = () => setEdit(null);
  const isEditing = (id: string, area: EditArea) => edit?.id === id && edit.area === area;

  const remove = (id: string) => {
    if (edit?.id === id) setEdit(null);
    save(sessions.filter((s) => s.id !== id));
  };

  // 새 차시는 바로 과목·타이틀 편집을 연다
  const add = () => {
    const blank: SimSession = { id: newSessionId(), subject: '', title: '', standard: '', objective: '', content: '' };
    save([...sessions, blank]);
    startEdit(blank, 'head');
  };

  const move = (fromId: string, toIdx: number) => {
    const from = sessions.findIndex((s) => s.id === fromId);
    if (from === -1) return;
    const next = [...sessions];
    const [item] = next.splice(from, 1);
    // 뒤로 옮길 때는 자기 자리가 빠진 만큼 목표 인덱스가 하나 당겨진다
    next.splice(from < toIdx ? toIdx - 1 : toIdx, 0, item);
    if (next.some((s, i) => s.id !== sessions[i].id)) save(next);
  };

  const resetDrag = () => { setArmedId(null); setDragId(null); setOver(null); };

  // 초안 만들기 → 추가 요청 창 → 생성. 마지막 요청은 카드에 남아 팀이 함께 보고 다음에 다시 채워진다.
  const [requestOpen, setRequestOpen] = useState(false);
  const lastRequest = typeof value.draft_request === 'string' ? value.draft_request : '';

  const runSimulate = async (request: string) => {
    setRequestOpen(false);
    if (!onSimulate || loading) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      setNotice((await onSimulate(request)) ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : '초안 미리보기 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const runApply = async () => {
    if (!onApplyToDesign || applying) return;
    setApplying(true);
    setApplyMsg(null);
    try {
      const msg = await onApplyToDesign();
      if (msg) setApplyMsg({ ok: true, text: msg });
    } catch (e) {
      setApplyMsg({ ok: false, text: e instanceof Error ? e.message : '설계 반영 중 오류가 발생했습니다.' });
    } finally {
      setApplying(false);
    }
  };

  // 차시 카드의 학습목표·성취기준·지도내용 칸 — 모두 같은 흰 박스, 편집 중이면 테두리 강조
  const sectionCls = (editing: boolean) =>
    `rounded-lg px-3 py-2 ${editing ? 'bg-white ring-2 ring-[#D1260F]/30' : 'bg-white/80'}`;
  // 편집 중 Esc 는 취소 (한 줄 입력칸에서는 Enter 로 수정)
  const editKeys = (e: React.KeyboardEvent) => {
    if (!edit || e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
    else if (e.key === 'Enter' && e.target instanceof HTMLInputElement) { e.preventDefault(); commitEdit(); }
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* 생성 버튼 */}
      {!locked && onSimulate && (
        <div className="mb-3 flex items-center justify-end gap-3">
          {lastRequest && (
            <p className="min-w-0 truncate text-[12px] text-[#757b82]" title={lastRequest}>
              <span className="font-semibold">최근 추가 요청</span> · {lastRequest.replace(/\s*\n\s*/g, ' / ')}
            </p>
          )}
          <button
            onClick={() => setRequestOpen(true)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-[#D1260F] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#A81A08] disabled:opacity-60"
          >
            {loading ? (
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {loading ? '초안 만드는 중…' : sessions.length > 0 ? '초안 다시 만들기' : '초안 만들기'}
          </button>
        </div>
      )}
      {requestOpen && (
        <DraftRequestDialog
          initial={lastRequest}
          replaceCount={sessions.length}
          onCancel={() => setRequestOpen(false)}
          onSubmit={runSimulate}
        />
      )}
      {error && <p className="mb-3 text-[13px] text-red-500">{error}</p>}
      {notice && <p className="mb-3 text-right text-[13px] text-orange-600">{notice}</p>}

      {sessions.length === 0 && (
        <div className="mb-3 rounded-xl border border-dashed border-[#dde3eb] px-4 py-8 text-center text-[14px] text-[#adb2ba]">
          아직 차시 카드가 없습니다. 초안을 만들거나 직접 추가하세요.
        </div>
      )}

      {/* 차시 카드 — 한 줄에 3개 */}
      <div
        className="grid grid-cols-3 gap-3"
        onDragOver={(e) => { if (dragId) e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId && over) move(dragId, over.after ? over.idx + 1 : over.idx);
          resetDrag();
        }}
      >
        {sessions.map((s, idx) => {
          const badge = getSubjectBadge(s.subject.split(/[·,/]/)[0]?.trim() ?? '');
          const marker =
            dragId && over?.idx === idx && dragId !== s.id
              ? over.after ? 'shadow-[4px_0_0_0_#D1260F]' : 'shadow-[-4px_0_0_0_#D1260F]'
              : '';
          return (
            <div
              key={s.id}
              draggable={!locked && armedId === s.id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', s.id);
                setDragId(s.id);
              }}
              onDragEnd={resetDrag}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const after = e.clientX > rect.left + rect.width / 2;
                if (over?.idx !== idx || over.after !== after) setOver({ idx, after });
              }}
              // 카드 배경은 과목 배지 색을 흰색과 섞어 더 연하게 쓴다 (과목이 없으면 흰색)
              style={s.subject ? {
                backgroundColor: `color-mix(in srgb, ${badge.bg} 45%, white)`,
                borderColor: dragId === s.id ? undefined : `color-mix(in srgb, ${badge.bg} 90%, white)`,
              } : undefined}
              className={`flex min-w-0 flex-col rounded-xl border bg-white p-4 transition ${marker} ${
                dragId === s.id ? 'border-[#D1260F] opacity-40' : 'border-[#e6e9f2]'
              }`}
            >
              {/* 헤더: 손잡이 · "N차시 과목 : 수업 타이틀" · 연필 · 삭제 */}
              <div className="mb-3" onKeyDown={editKeys}>
                <div className="flex items-start gap-1.5">
                  {!locked && (
                    <span
                      title="끌어서 순서 바꾸기"
                      onMouseDown={() => setArmedId(s.id)}
                      onMouseUp={() => { if (!dragId) setArmedId(null); }}
                      className="-ml-1 flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-[#adb2ba] hover:bg-[#f1f4f9] hover:text-[#D1260F] active:cursor-grabbing"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                        <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                        <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                      </svg>
                    </span>
                  )}
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="shrink-0 rounded-md bg-[#D1260F] px-2 py-0.5 text-[12px] font-bold text-white">
                      {idx + 1}차시
                    </span>
                    {edit && isEditing(s.id, 'head') ? (
                      <>
                        <input
                          autoFocus
                          value={edit.draft.subject ?? ''}
                          onChange={(e) => setDraft('subject', e.target.value)}
                          placeholder="과목"
                          size={Math.max(2, (edit.draft.subject ?? '').length + 1)}
                          className="shrink-0 rounded-md bg-white px-2 py-0.5 text-center text-[12.5px] font-semibold text-[#2d3339] placeholder-[#adb2ba] outline-none ring-1 ring-[#dde3eb] focus:ring-2 focus:ring-[#D1260F]/30"
                        />
                        <span className="shrink-0 font-bold text-[#adb2ba]">:</span>
                        <input
                          value={edit.draft.title ?? ''}
                          onChange={(e) => setDraft('title', e.target.value)}
                          placeholder="수업 타이틀"
                          className="min-w-[120px] flex-1 rounded-md bg-white px-2 py-0.5 text-[15px] font-bold text-[#2d3339] placeholder-[#adb2ba] outline-none ring-1 ring-[#dde3eb] focus:ring-2 focus:ring-[#D1260F]/30"
                        />
                      </>
                    ) : (
                      <>
                        <span
                          style={s.subject ? { backgroundColor: badge.bg, color: badge.text } : undefined}
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[12.5px] font-semibold ${s.subject ? '' : 'bg-[#f1f4f9] text-[#adb2ba]'}`}
                        >
                          {s.subject || '과목'}
                        </span>
                        <span className="shrink-0 font-bold text-[#adb2ba]">:</span>
                        {/* 남은 폭이 좁으면 타이틀을 다음 줄로 내린다 — basis 없이 flex-1 이면 한 글자씩 세로로 쌓인다 */}
                        <span className={`min-w-0 flex-[1_1_8rem] break-keep text-[15px] font-bold leading-snug [overflow-wrap:anywhere] ${s.title ? 'text-[#2d3339]' : 'text-[#adb2ba]'}`}>
                          {s.title || '수업 타이틀'}
                        </span>
                      </>
                    )}
                  </div>
                  {!locked && !isEditing(s.id, 'head') && <PencilButton onClick={() => startEdit(s, 'head')} />}
                  {!locked && (
                    <button
                      onClick={() => remove(s.id)}
                      title="차시 삭제"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#adb2ba] hover:bg-red-50 hover:text-red-400"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {isEditing(s.id, 'head') && <EditActions onSave={commitEdit} onCancel={cancelEdit} />}
              </div>

              {/* 세 항목 모두 같은 틀: 흰 박스 안에 제목 + 내용, 오른쪽 연필로 편집 */}
              <div className="space-y-2">
                {/* 학습목표 */}
                <div className={sectionCls(isEditing(s.id, 'objective'))} onKeyDown={editKeys}>
                  <SectionHead label="학습목표" showPencil={!locked && !isEditing(s.id, 'objective')} onEdit={() => startEdit(s, 'objective')} />
                  {edit && isEditing(s.id, 'objective') ? (
                    <>
                      <AutoResizeTextarea
                        value={edit.draft.objective ?? ''}
                        onChange={(v) => setDraft('objective', v)}
                        placeholder="~할 수 있다."
                        className="w-full bg-transparent text-[14px] font-semibold leading-relaxed text-[#2d3339] placeholder-[#adb2ba] outline-none"
                      />
                      <EditActions onSave={commitEdit} onCancel={cancelEdit} />
                    </>
                  ) : (
                    <p className={`whitespace-pre-line text-[14px] font-semibold leading-relaxed ${s.objective ? 'text-[#2d3339]' : 'text-[#adb2ba]'}`}>
                      {s.objective || '~할 수 있다.'}
                    </p>
                  )}
                </div>

                {/* 성취기준 — 코드만 */}
                <div className={sectionCls(isEditing(s.id, 'standard'))} onKeyDown={editKeys}>
                  <SectionHead label="성취기준" showPencil={!locked && !isEditing(s.id, 'standard')} onEdit={() => startEdit(s, 'standard')} />
                  {edit && isEditing(s.id, 'standard') ? (
                    <>
                      <input
                        autoFocus
                        value={edit.draft.standard ?? ''}
                        onChange={(e) => setDraft('standard', e.target.value)}
                        placeholder="[9수01-02], [9사03-01]"
                        className="w-full bg-transparent font-mono text-[13px] text-[#2d3339] placeholder-[#adb2ba] outline-none"
                      />
                      <EditActions onSave={commitEdit} onCancel={cancelEdit} />
                    </>
                  ) : standardCodesOnly(s.standard).trim() ? (
                    <div className="flex flex-wrap gap-1">
                      {standardCodesOnly(s.standard).split(/\s*,\s*/).filter(Boolean).map((code, i) => (
                        <span key={i} className="rounded bg-[#f1f4f9] px-1.5 py-0.5 font-mono text-[12.5px] text-[#2d3339]">{code}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="font-mono text-[13px] text-[#adb2ba]">[9수01-02]</p>
                  )}
                </div>

                {/* 지도내용 — 개조식 불릿 */}
                <div className={sectionCls(isEditing(s.id, 'content'))} onKeyDown={editKeys}>
                  <SectionHead label="지도내용" showPencil={!locked && !isEditing(s.id, 'content')} onEdit={() => startEdit(s, 'content')} />
                  {edit && isEditing(s.id, 'content') ? (
                    <>
                      <BulletEditor
                        value={edit.draft.content ?? ''}
                        onChange={(v) => setDraft('content', v)}
                        locked={false}
                      />
                      <EditActions onSave={commitEdit} onCancel={cancelEdit} />
                    </>
                  ) : contentBullets(s.content).some((l) => l.trim()) ? (
                    <ul className="space-y-1">
                      {contentBullets(s.content).filter((l) => l.trim()).map((l, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[13.5px] leading-relaxed text-[#2d3339]">
                          <span className="font-bold text-[#D1260F]">•</span>
                          <span className="min-w-0">{l}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13.5px] text-[#adb2ba]">지도내용</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* 차시 추가 — 격자 마지막 칸 */}
        {!locked && (
          <button
            onClick={add}
            className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#c9cfe0] text-[13px] font-medium text-[#D1260F] transition-colors hover:bg-[#FDE4DD]"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            차시 추가
          </button>
        )}
      </div>

      {/* 설계에 반영하기 — Ds-3 학습 활동 · Ds-4 지원 도구 */}
      {!locked && onApplyToDesign && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {applyMsg && (
            <span className={`text-[13px] ${applyMsg.ok ? 'text-orange-600' : 'text-red-500'}`}>{applyMsg.text}</span>
          )}
          <button
            onClick={runApply}
            disabled={applying || sessions.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-[#D1260F] bg-white px-4 py-2 text-[13px] font-semibold text-[#D1260F] transition-colors hover:bg-[#FFF1ED] disabled:opacity-50"
          >
            {applying ? (
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            )}
            {applying ? '반영 중…' : '설계에 반영하기'}
          </button>
        </div>
      )}
    </div>
  );
}
