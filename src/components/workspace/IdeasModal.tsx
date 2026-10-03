'use client';

import { useState, useEffect } from 'react';
import CardRowsEditor from './CardRowsEditor';

// ─── 타입 ──────────────────────────────────────────────────────────

export interface IdeaItem {
  id: string;       // `${subject}__${domain}__${index}`
  subject: string;
  domain: string;
  content: string;
}

type IdeasJson = Record<string, Record<string, { order: number; 핵심아이디어: string[] }>>;

// ─── 교과별 배지 색상 ──────────────────────────────────────────────

const LANGUAGE = new Set(['국어', '영어', '한문', '생활 독일어', '생활 러시아어', '생활 베트남어', '생활 스페인어', '생활 아랍어', '생활 일본어', '생활 중국어', '생활 프랑스어']);
const MATH     = new Set(['수학']);
const SCIENCE  = new Set(['과학', '정보', '기술·가정']);
const SOCIAL   = new Set(['사회', '역사', '도덕']);
const ARTS     = new Set(['체육', '음악', '미술']);

function getBadgeColor(subject: string): string {
  if (LANGUAGE.has(subject)) return '#2563EB';
  if (MATH.has(subject))     return '#7C3AED';
  if (SCIENCE.has(subject))  return '#059669';
  if (SOCIAL.has(subject))   return '#D97706';
  if (ARTS.has(subject))     return '#DB2777';
  return '#64748B';
}

// ─── 검색어 강조 ───────────────────────────────────────────────────

function highlight(text: string, terms: string[]) {
  if (terms.length === 0) return text;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  return parts.map((part, i) =>
    i % 2 === 1 ? <mark key={i} className="rounded bg-[#FFF1A8] px-0.5 text-inherit">{part}</mark> : part
  );
}

// ─── 드롭다운 ─────────────────────────────────────────────────────

function Select({
  label, value, options, placeholder, onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1" style={{ width: 180 }}>
      <label className="text-[13px] font-semibold uppercase tracking-wider text-[#9AAAC0]">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 180 }}
        className="rounded-lg border border-[#D8E2F0] bg-white px-3 py-2 text-[15px] text-[#2C3A52] outline-none focus:border-[#D1260F] focus:ring-1 focus:ring-[#D1260F]/20"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────

export default function IdeasModal({
  onClose,
  selectedIdeas,
  onSelectionChange,
  manualRows,
  readOnly = false,
}: {
  onClose: () => void;
  selectedIdeas: IdeaItem[];
  onSelectionChange: (ideas: IdeaItem[], rows?: Record<string, string>[]) => void;
  manualRows?: Record<string, string>[];
  readOnly?: boolean;
}) {
  const [ideasData, setIdeasData] = useState<IdeasJson>({});
  const [allItems, setAllItems] = useState<IdeaItem[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [domain, setDomain] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<IdeaItem[]>(() => [...selectedIdeas]);
  const [rowsDraft, setRowsDraft] = useState<Record<string, string>[]>(() => manualRows ?? []);

  // JSON 로드 → 전체 아이템 플랫 리스트 생성
  useEffect(() => {
    fetch('/standard/ideas.json')
      .then((r) => r.json())
      .then((data: IdeasJson) => {
        setIdeasData(data);
        setSubjects(Object.keys(data));
        // 모든 교과·영역의 핵심아이디어를 하나의 배열로 펼침
        const flat: IdeaItem[] = [];
        for (const [subj, domainMap] of Object.entries(data)) {
          const sorted = Object.entries(domainMap).sort(([, a], [, b]) => a.order - b.order);
          for (const [dom, val] of sorted) {
            (val['핵심아이디어'] ?? []).forEach((content, idx) => {
              flat.push({ id: `${subj}__${dom}__${idx}`, subject: subj, domain: dom, content });
            });
          }
        }
        setAllItems(flat);
      });
  }, []);

  // 교과 변경 시 영역 목록 갱신
  useEffect(() => {
    if (!subject || !ideasData[subject]) {
      setDomains([]);
      setDomain('');
      return;
    }
    const sorted = Object.entries(ideasData[subject])
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([d]) => d);
    setDomains(sorted);
    setDomain('');
  }, [subject, ideasData]);

  // 검색어는 공백으로 나눠 모두 포함하는 항목만 남긴다 (교과·영역·내용 대상)
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  // 현재 필터에 맞는 아이템
  const filteredItems = allItems.filter((item) => {
    if (subject && item.subject !== subject) return false;
    if (domain && item.domain !== domain) return false;
    if (terms.length) {
      const hay = `${item.subject} ${item.domain} ${item.content}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });

  // ESC 키
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCancel(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = () => { onSelectionChange(draft, manualRows ? rowsDraft : undefined); onClose(); };
  const handleCancel = () => { onClose(); };

  const toggle = (item: IdeaItem) => {
    const already = draft.some((s) => s.id === item.id);
    setDraft(already ? draft.filter((s) => s.id !== item.id) : [...draft, item]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
    >
      <div
        className="flex flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ width: '85vw', height: '82vh' }}
      >
        {/* ── 두 패널 행 ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── 좌측 60%: 탐색 ── */}
          <div className="flex w-[60%] flex-col bg-[#F7F9FD] border-r border-[#E4EBF5]">

            {/* 헤더 */}
            <div className="shrink-0 flex items-center justify-between border-b border-[#E4EBF5] bg-white px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D1260F] text-white">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h2 className="text-[19px] font-semibold text-[#1C2B3A]">핵심아이디어 선택</h2>
                <span className="text-[14px] text-[#9AAAC0]">2022 개정 교육과정 · 중학교</span>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9AAAC0] transition hover:bg-[#F2F5FA] hover:text-[#3A4560]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 필터 */}
            <div className="shrink-0 border-b border-[#E4EBF5] bg-white px-6 py-4">
              <div className="flex items-end gap-4">
                <Select label="교과" value={subject} options={subjects} placeholder="전체" onChange={setSubject} />
                <Select label="영역" value={domain} options={domains} placeholder="전체" onChange={setDomain} />
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-[13px] font-semibold uppercase tracking-wider text-[#9AAAC0]">검색어</label>
                  <div className="relative">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="핵심아이디어 내용, 영역 검색..."
                      autoFocus
                      className="w-full rounded-lg border border-[#D8E2F0] bg-white px-3 py-2 pr-8 text-[15px] text-[#2C3A52] placeholder-[#9AAAC0] outline-none focus:border-[#D1260F]"
                    />
                    {query && (
                      <button
                        onClick={() => setQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9AAAC0] hover:text-[#3A4560]"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {(subject || domain || query) && (
                  <button
                    onClick={() => { setSubject(''); setDomain(''); setQuery(''); }}
                    className="self-end rounded-lg border border-[#D8E2F0] bg-white px-4 py-2 text-[15px] text-[#6B7A99] transition hover:bg-[#F2F5FA]"
                  >
                    초기화
                  </button>
                )}
              </div>
            </div>

            {/* 아이템 목록 */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {allItems.length === 0 && (
                <div className="flex h-32 items-center justify-center">
                  <svg className="h-7 w-7 animate-spin text-[#D1260F]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                </div>
              )}
              {allItems.length > 0 && (
                <>
                  <p className="mb-4 text-[14px] text-[#9AAAC0]">
                    <span className="font-semibold text-[#D1260F]">{filteredItems.length}</span>개
                  </p>
                  <div className="flex flex-col gap-3">
                    {filteredItems.map((item) => {
                      const checked = draft.some((s) => s.id === item.id);
                      const badgeColor = getBadgeColor(item.subject);
                      return (
                        <div
                          key={item.id}
                          onClick={readOnly ? undefined : () => toggle(item)}
                          className={`rounded-xl border p-4 transition cursor-pointer ${
                            checked
                              ? 'border-[#D1260F] bg-[#FFF1ED]'
                              : 'border-[#E4EBF5] bg-white hover:border-[#B8C8E8]'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* 체크박스 */}
                            <div className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition ${
                              checked ? 'border-[#D1260F] bg-[#D1260F]' : 'border-[#D8E2F0] bg-white'
                            }`}>
                              {checked && (
                                <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              {/* 배지 */}
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span
                                  className="rounded-md px-2 py-0.5 text-[13px] font-bold text-white"
                                  style={{ backgroundColor: badgeColor }}
                                >
                                  {item.subject}
                                </span>
                                <span className="rounded-full bg-[#F2F5FA] px-2 py-0.5 text-[12px] text-[#6B7A99]">
                                  {item.domain}
                                </span>
                              </div>
                              {/* 내용 */}
                              <p className="text-[15px] leading-relaxed text-[#2C3A52]">{highlight(item.content, terms)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── 우측 40%: 선택된 핵심아이디어 ── */}
          <div className="flex w-[40%] flex-col bg-white">

            {manualRows && <CardRowsEditor label="핵심 아이디어" contentKey="core_idea" rows={rowsDraft} onChange={(rows) => {
              setRowsDraft(rows);
              setDraft(prev => prev.filter(item => !selectedIdeas.some(old => old.id === item.id) || rows.some(row => row.subject === item.subject && row.core_idea === item.content)));
            }} readOnly={readOnly} />}

            {/* 헤더 */}
            <div className="shrink-0 flex items-center justify-between border-b border-[#E4EBF5] px-6 py-4">
              <div className="flex items-center gap-2">
                <h3 className="text-[17px] font-semibold text-[#1C2B3A]">선택된 핵심아이디어</h3>
                {draft.length > 0 && (
                  <span className="rounded-full bg-[#D1260F] px-2 py-0.5 text-[13px] font-medium text-white">
                    {draft.length}
                  </span>
                )}
              </div>
              {draft.length > 0 && !readOnly && (
                <button
                  onClick={() => setDraft([])}
                  className="text-[13px] text-[#9AAAC0] transition hover:text-red-400"
                >
                  전체 삭제
                </button>
              )}
            </div>

            {/* 목록 */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {draft.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2F8] text-[#9AAAC0]">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <p className="text-[15px] text-[#9AAAC0]">왼쪽에서 교과·영역을 선택하고<br />핵심아이디어를 추가하세요</p>
                  <p className="text-[13px] text-[#B8C8E8]">선택한 핵심아이디어는<br />AI 채팅에 자동 반영됩니다</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {draft.map((item) => {
                    const badgeColor = getBadgeColor(item.subject);
                    return (
                      <div key={item.id} className="rounded-xl border border-[#E4EBF5] bg-[#F7F9FD] p-3.5">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                              <span
                                className="rounded-md px-2 py-0.5 text-[12px] font-bold text-white"
                                style={{ backgroundColor: badgeColor }}
                              >
                                {item.subject}
                              </span>
                              {item.domain && (
                                <span className="rounded-full bg-[#EEF2F8] px-1.5 py-0.5 text-[11px] text-[#6B7A99]">
                                  {item.domain}
                                </span>
                              )}
                            </div>
                            <p className="line-clamp-3 text-[13px] leading-relaxed text-[#2C3A52]">
                              {item.content}
                            </p>
                          </div>
                          {!readOnly && (
                            <button
                              onClick={() => setDraft(draft.filter((s) => s.id !== item.id))}
                              className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-[#9AAAC0] transition hover:bg-red-50 hover:text-red-400"
                            >
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>{/* ── 두 패널 행 끝 ── */}

        {/* ── 푸터 ── */}
        <div className="shrink-0 flex items-center justify-end gap-3 border-t border-[#E4EBF5] bg-white px-6 py-4">
          {readOnly ? (
            <button
              onClick={onClose}
              className="rounded-lg bg-[#D1260F] px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-[#4338A0]"
            >
              닫기
            </button>
          ) : (
            <>
              <button
                onClick={handleCancel}
                className="rounded-lg border border-[#D8E2F0] bg-white px-5 py-2.5 text-[15px] font-medium text-[#6B7A99] transition hover:bg-[#F2F5FA]"
              >
                취소
              </button>
              <button
                onClick={handleConfirm}
                className="rounded-lg bg-[#D1260F] px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-[#4338A0]"
              >
                완료
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
