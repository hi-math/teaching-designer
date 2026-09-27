'use client';

import { useState } from 'react';
import { AutoResizeTextarea, getSubjectBadge } from './CardFields';

/**
 * 수업 시뮬레이션 보드.
 *
 * 차시별 카드(과목·수업 타이틀·성취기준·학습목표·지도내용)를 가로로 늘어놓고,
 * 손잡이를 끌어 좌우로 순서를 바꾼다. 차시 번호는 저장하지 않고 배열 순서로 매긴다
 * — 순서를 바꿀 때마다 번호를 다시 맞출 필요가 없도록.
 */

export type SimSession = {
  id: string;
  subject: string;
  title: string;
  standard: string;
  objective: string;
  content: string;
};

export function newSessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readSessions(value: Record<string, unknown>): SimSession[] {
  return Array.isArray(value.sessions) ? (value.sessions as SimSession[]) : [];
}

export default function SimulationBoard({
  value,
  onChange,
  locked,
  onSimulate,
}: {
  value: Record<string, unknown>;
  onChange: (fields: Record<string, unknown>) => void;
  locked: boolean;
  /** 지금까지의 설계 내용으로 차시 초안을 새로 만든다 */
  onSimulate?: () => Promise<void>;
}) {
  const sessions = readSessions(value);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 손잡이를 누른 카드만 draggable 로 만든다. 카드 전체를 draggable 로 두면
  // textarea 에서 글자를 드래그해 선택하려 할 때 카드가 끌려 간다.
  const [armedId, setArmedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

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

  const resetDrag = () => { setArmedId(null); setDragId(null); setOverIdx(null); };

  const runSimulate = async () => {
    if (!onSimulate || loading) return;
    if (sessions.length > 0 && !confirm('현재 차시 카드를 새 시뮬레이션 결과로 바꿉니다. 계속할까요?')) return;
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

  const fieldCls =
    'w-full rounded-lg bg-[#f1f4f9] px-3 py-2 text-[14px] leading-relaxed text-[#2d3339] placeholder-[#adb2ba] outline-none focus:ring-2 focus:ring-[#5044e3]/20 disabled:opacity-60';
  const labelCls = 'mb-1 block text-[12px] font-semibold text-[#5a6066]';

  // 끼워 넣을 위치 표시선 (세로)
  const dropLine = (idx: number) =>
    dragId && overIdx === idx ? <div className="w-1 shrink-0 self-stretch rounded-full bg-[#5044e3]/60" /> : null;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* 생성 버튼 */}
      {!locked && onSimulate && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={runSimulate}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-[13px] font-medium text-teal-700 transition-colors hover:bg-teal-100 disabled:opacity-60"
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
          <span className="text-[12px] text-[#adb2ba]">
            팀 비전 · 수업 기본정보 · 핵심 아이디어 · 성취기준 · 분석 단계 내용을 바탕으로 만듭니다
          </span>
        </div>
      )}
      {error && <p className="mb-3 text-[13px] text-red-500">{error}</p>}

      {sessions.length === 0 && (
        <div className="mb-2 rounded-xl border border-dashed border-[#dde3eb] px-4 py-8 text-center text-[14px] text-[#adb2ba]">
          아직 차시 카드가 없습니다. 시뮬레이션을 생성하거나 직접 추가하세요.
        </div>
      )}

      {/* 차시 카드 — 가로 스크롤 */}
      <div
        className="flex items-stretch gap-3 overflow-x-auto pb-3"
        onDragOver={(e) => { if (dragId) e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId && overIdx !== null) move(dragId, overIdx);
          resetDrag();
        }}
      >
        {sessions.map((s, idx) => {
          const badge = getSubjectBadge(s.subject.split(/[·,/]/)[0]?.trim() ?? '');
          return (
            <div key={s.id} className="flex shrink-0 items-stretch gap-3">
              {dropLine(idx)}
              <div
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
                  setOverIdx(after ? idx + 1 : idx);
                }}
                className={`flex w-[300px] flex-col rounded-xl border bg-white p-4 transition ${
                  dragId === s.id ? 'border-[#5044e3] opacity-40' : 'border-[#e6e9f2]'
                }`}
              >
                {/* 헤더: 손잡이 · 차시 · 삭제 */}
                <div className="mb-2 flex items-center gap-2">
                  {!locked && (
                    <span
                      title="끌어서 순서 바꾸기"
                      onMouseDown={() => setArmedId(s.id)}
                      onMouseUp={() => { if (!dragId) setArmedId(null); }}
                      className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-[#adb2ba] hover:bg-[#f1f4f9] hover:text-[#5044e3] active:cursor-grabbing"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                        <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                        <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                      </svg>
                    </span>
                  )}
                  <span className="shrink-0 rounded-md bg-[#5044e3] px-2 py-0.5 text-[12px] font-bold text-white">
                    {idx + 1}차시
                  </span>
                  <div className="flex-1" />
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

                {/* 과목 + 수업 타이틀 */}
                <div className="mb-3 flex items-center gap-2">
                  <input
                    value={s.subject}
                    onChange={(e) => update(s.id, 'subject', e.target.value)}
                    disabled={locked}
                    placeholder="과목"
                    style={{ backgroundColor: s.subject ? badge.bg : undefined, color: s.subject ? badge.text : undefined }}
                    className="w-20 shrink-0 rounded-full bg-[#f1f4f9] px-3 py-1 text-center text-[13px] font-semibold text-[#2d3339] placeholder-[#adb2ba] outline-none focus:ring-2 focus:ring-[#5044e3]/20 disabled:opacity-60"
                  />
                  <input
                    value={s.title ?? ''}
                    onChange={(e) => update(s.id, 'title', e.target.value)}
                    disabled={locked}
                    placeholder="수업 타이틀"
                    className="min-w-0 flex-1 border-b border-transparent bg-transparent px-1 py-1 text-[15px] font-bold text-[#2d3339] placeholder-[#adb2ba] outline-none focus:border-[#5044e3]/40 disabled:opacity-60"
                  />
                </div>

                <div className="space-y-2">
                  <div>
                    <span className={labelCls}>성취기준</span>
                    <AutoResizeTextarea
                      value={s.standard}
                      onChange={(v) => update(s.id, 'standard', v)}
                      disabled={locked}
                      placeholder="[코드] 성취기준"
                      className={fieldCls}
                    />
                  </div>
                  <div>
                    <span className={labelCls}>학습목표</span>
                    <AutoResizeTextarea
                      value={s.objective}
                      onChange={(v) => update(s.id, 'objective', v)}
                      disabled={locked}
                      placeholder="~할 수 있다."
                      className={`${fieldCls} font-medium`}
                    />
                  </div>
                  <div>
                    <span className={labelCls}>지도내용</span>
                    <AutoResizeTextarea
                      value={s.content}
                      onChange={(v) => update(s.id, 'content', v)}
                      disabled={locked}
                      placeholder="도입 · 전개 · 정리"
                      className={fieldCls}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {dropLine(sessions.length)}

        {/* 차시 추가 — 줄 끝의 빈 카드 */}
        {!locked && (
          <button
            onClick={add}
            className="flex w-[140px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#c9cfe0] text-[13px] font-medium text-[#5044e3] transition-colors hover:bg-[#ede9fb]"
            style={{ minHeight: sessions.length ? undefined : 96 }}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            차시 추가
          </button>
        )}
      </div>
    </div>
  );
}
