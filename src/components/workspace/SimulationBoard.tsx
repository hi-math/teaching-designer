'use client';

import { useRef, useState } from 'react';
import { AutoResizeTextarea, getSubjectBadge } from './CardFields';
import { showConfirm } from '@/components/ui/dialog';
import { extractCodes } from '@/lib/standardCode';

/**
 * 수업 시뮬레이션 보드.
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
          <span className="pt-[7px] text-[13px] font-bold leading-none text-[#5044e3]">•</span>
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
            className="w-full rounded-md bg-transparent px-1 py-0.5 text-[13.5px] leading-relaxed text-[#2d3339] placeholder-[#adb2ba] outline-none focus:bg-white/80 disabled:opacity-60"
          />
        </li>
      ))}
    </ul>
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
  /** 지금까지의 설계 내용으로 차시 초안을 새로 만든다 */
  onSimulate?: () => Promise<void>;
  /** 차시 카드를 Ds-3 학습 활동·Ds-4 지원 도구에 옮긴다. 결과 안내 문구를 돌려준다(취소 시 null). */
  onApplyToDesign?: () => Promise<string | null>;
}) {
  const sessions = readSessions(value);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // 손잡이를 누른 카드만 draggable 로 만든다. 카드 전체를 draggable 로 두면
  // textarea 에서 글자를 드래그해 선택하려 할 때 카드가 끌려 간다.
  const [armedId, setArmedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // 끌고 있는 카드가 놓일 자리: 어느 카드의 앞/뒤인지
  const [over, setOver] = useState<{ idx: number; after: boolean } | null>(null);

  const save = (next: SimSession[]) => onChange({ ...value, sessions: next });

  const update = (id: string, key: keyof Omit<SimSession, 'id'>, text: string) =>
    save(sessions.map((s) => (s.id === id ? { ...s, [key]: text } : s)));

  const remove = (id: string) => save(sessions.filter((s) => s.id !== id));

  const add = () =>
    save([...sessions, { id: newSessionId(), subject: '', title: '', standard: '', objective: '', content: '' }]);

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

  const runSimulate = async () => {
    if (!onSimulate || loading) return;
    if (sessions.length > 0 && !(await showConfirm('현재 차시 카드를 새 시뮬레이션 결과로 바꿉니다.\n계속할까요?', { title: '', confirmText: '바꾸기' }))) return;
    setLoading(true);
    setError('');
    try {
      await onSimulate();
    } catch (e) {
      setError(e instanceof Error ? e.message : '시뮬레이션 중 오류가 발생했습니다.');
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

  const labelCls = 'mb-1 block text-[12px] font-semibold text-[#5a6066]';

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* 생성 버튼 */}
      {!locked && onSimulate && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={runSimulate}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-[#5044e3] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#4035c8] disabled:opacity-60"
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
            {loading ? '시뮬레이션 중…' : sessions.length > 0 ? '다시 시뮬레이션' : '시뮬레이션 생성'}
          </button>
        </div>
      )}
      {error && <p className="mb-3 text-[13px] text-red-500">{error}</p>}

      {sessions.length === 0 && (
        <div className="mb-3 rounded-xl border border-dashed border-[#dde3eb] px-4 py-8 text-center text-[14px] text-[#adb2ba]">
          아직 차시 카드가 없습니다. 시뮬레이션을 생성하거나 직접 추가하세요.
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
              ? over.after ? 'shadow-[4px_0_0_0_#5044e3]' : 'shadow-[-4px_0_0_0_#5044e3]'
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
                dragId === s.id ? 'border-[#5044e3] opacity-40' : 'border-[#e6e9f2]'
              }`}
            >
              {/* 헤더: 손잡이 · "N차시 과목 : 수업 타이틀" · 삭제 */}
              <div className="mb-3 flex items-start gap-1.5">
                {!locked && (
                  <span
                    title="끌어서 순서 바꾸기"
                    onMouseDown={() => setArmedId(s.id)}
                    onMouseUp={() => { if (!dragId) setArmedId(null); }}
                    className="-ml-1 flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-[#adb2ba] hover:bg-[#f1f4f9] hover:text-[#5044e3] active:cursor-grabbing"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                      <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                    </svg>
                  </span>
                )}
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="shrink-0 rounded-md bg-[#5044e3] px-2 py-0.5 text-[12px] font-bold text-white">
                    {idx + 1}차시
                  </span>
                  <input
                    value={s.subject}
                    onChange={(e) => update(s.id, 'subject', e.target.value)}
                    disabled={locked}
                    placeholder="과목"
                    size={Math.max(2, s.subject.length + 1)}
                    style={{ backgroundColor: s.subject ? badge.bg : undefined, color: s.subject ? badge.text : undefined }}
                    className="shrink-0 rounded-md bg-[#f1f4f9] px-2 py-0.5 text-center text-[12.5px] font-semibold text-[#2d3339] placeholder-[#adb2ba] outline-none focus:ring-2 focus:ring-[#5044e3]/20 disabled:opacity-60"
                  />
                  <span className="shrink-0 font-bold text-[#adb2ba]">:</span>
                  <AutoResizeTextarea
                    value={s.title ?? ''}
                    onChange={(v) => update(s.id, 'title', v.replace(/\n/g, ' '))}
                    disabled={locked}
                    placeholder="수업 타이틀"
                    className="min-w-[120px] flex-1 rounded-md bg-transparent px-1 py-0.5 text-[15px] font-bold leading-snug text-[#2d3339] placeholder-[#adb2ba] outline-none focus:bg-white/80 disabled:opacity-60"
                  />
                </div>
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

              <div className="space-y-3">
                {/* 학습목표 — 가장 먼저 */}
                <div className="rounded-lg bg-white/80 px-3 py-2">
                  <span className="mb-0.5 block text-[11.5px] font-semibold text-[#5044e3]">학습목표</span>
                  <AutoResizeTextarea
                    value={s.objective}
                    onChange={(v) => update(s.id, 'objective', v)}
                    disabled={locked}
                    placeholder="~할 수 있다."
                    className="w-full bg-transparent text-[14px] font-semibold leading-relaxed text-[#2d3339] placeholder-[#c4bef5] outline-none disabled:opacity-60"
                  />
                </div>

                {/* 성취기준 — 코드만 */}
                <div>
                  <span className={labelCls}>성취기준</span>
                  <input
                    value={standardCodesOnly(s.standard)}
                    onChange={(e) => update(s.id, 'standard', e.target.value)}
                    disabled={locked}
                    placeholder="[9수01-02]"
                    className="w-full rounded-lg bg-white/80 px-3 py-1.5 font-mono text-[13px] text-[#2d3339] placeholder-[#adb2ba] outline-none focus:ring-2 focus:ring-[#5044e3]/20 disabled:opacity-60"
                  />
                </div>

                {/* 지도내용 — 개조식 불릿 */}
                <div>
                  <span className={labelCls}>지도내용</span>
                  <BulletEditor
                    value={s.content}
                    onChange={(v) => update(s.id, 'content', v)}
                    locked={locked}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* 차시 추가 — 격자 마지막 칸 */}
        {!locked && (
          <button
            onClick={add}
            className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#c9cfe0] text-[13px] font-medium text-[#5044e3] transition-colors hover:bg-[#ede9fb]"
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
            <span className={`text-[13px] ${applyMsg.ok ? 'text-teal-600' : 'text-red-500'}`}>{applyMsg.text}</span>
          )}
          <button
            onClick={runApply}
            disabled={applying || sessions.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-[#5044e3] bg-white px-4 py-2 text-[13px] font-semibold text-[#5044e3] transition-colors hover:bg-[#f4f2ff] disabled:opacity-50"
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
