'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── 타입 ──────────────────────────────────────────────────────────

export interface StandardItem {
  code: string;
  subject: string;
  domain: string;
  content: string;
  keywords: string[];
  explanation: string;
  grade_group: string;
}

interface Meta {
  subjects: string[];
  domains: string[];
}

// ─── PUA 문자 제거 (HWP 수식 인코딩) ────────────────────────────────

function stripPUA(text: string): string {
  return text.replace(/[\uE000-\uF8FF]/g, '');
}

// ─── 교과별 배지 색상 ──────────────────────────────────────────────

const LANGUAGE  = new Set(['국어','영어','한문','생활 독일어','생활 러시아어','생활 베트남어','생활 스페인어','생활 아랍어','생활 일본어','생활 중국어','생활 프랑스어']);
const MATH      = new Set(['수학']);
const SCIENCE   = new Set(['과학','정보','기술·가정']);
const SOCIAL    = new Set(['사회','역사','도덕']);
const ARTS      = new Set(['체육','음악','미술']);

function getBadgeColor(subject: string): string {
  if (LANGUAGE.has(subject)) return '#2563EB';  // 언어 — 파랑
  if (MATH.has(subject))     return '#7C3AED';  // 수학 — 보라
  if (SCIENCE.has(subject))  return '#059669';  // 과학/기술 — 에메랄드
  if (SOCIAL.has(subject))   return '#D97706';  // 사회/역사/도덕 — 황토
  if (ARTS.has(subject))     return '#DB2777';  // 예체능 — 핑크
  return '#64748B';                              // 기타 — 슬레이트
}

// ─── 드롭다운 ────────────────────────────────────────────────────

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
    <div className="flex flex-col gap-1" style={{ width: 160 }}>
      <label className="text-[13px] font-semibold uppercase tracking-wider text-[#9AAAC0]">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 160 }}
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

// ─── 검색 결과 카드 ─────────────────────────────────────────────

function StandardCard({
  standard, checked, onToggle,
}: {
  standard: StandardItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const badgeColor = getBadgeColor(standard.subject);

  return (
    <div
      onClick={onToggle}
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
          {/* 메타 */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className="rounded-md px-2 py-0.5 text-[13px] font-bold text-white"
              style={{ backgroundColor: badgeColor }}
            >
              {standard.code}
            </span>
            <span className="text-[13px] text-[#9AAAC0]">{standard.subject}</span>
            {standard.domain && (
              <>
                <span className="text-[13px] text-[#9AAAC0]">·</span>
                <span className="rounded-full bg-[#F2F5FA] px-2 py-0.5 text-[12px] text-[#6B7A99]">
                  {standard.domain}
                </span>
              </>
            )}
          </div>

          {/* 내용 */}
          <p className="text-[15px] leading-relaxed text-[#2C3A52]">{standard.content}</p>

          {/* 키워드 */}
          {standard.keywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {standard.keywords.map((kw) => (
                <span key={kw} className="rounded-full bg-[#EEF2F8] px-2 py-0.5 text-[12px] text-[#6B7A99]">
                  {kw}
                </span>
              ))}
            </div>
          )}

          {/* 해설 */}
          {standard.explanation && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                className="mt-2 text-[13px] text-[#D1260F] hover:underline"
              >
                {expanded ? '해설 접기 ▲' : '해설 보기 ▼'}
              </button>
              {expanded && (
                <p className="mt-2 border-t border-[#F2F5FA] pt-2 text-[13px] leading-relaxed text-[#6B7A99]">
                  {stripPUA(standard.explanation)}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────

export default function StandardsModal({
  onClose,
  selectedStandards,
  onSelectionChange,
  readOnly = false,
}: {
  onClose: () => void;
  selectedStandards: StandardItem[];
  onSelectionChange: (standards: StandardItem[]) => void;
  readOnly?: boolean;
}) {
  const [meta, setMeta] = useState<Meta>({ subjects: [], domains: [] });
  const [subject, setSubject] = useState('');
  const [domain, setDomain] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StandardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 모달 열릴 때 초기 선택 상태를 draft로 복사
  const [draft, setDraft] = useState<StandardItem[]>(() => [...selectedStandards]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // 교과 메타 초기 로드
  useEffect(() => {
    fetch('/api/standards?type=meta')
      .then((r) => r.json())
      .then((data) => setMeta(data));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // 교과 변경 시 영역 목록 갱신
  useEffect(() => {
    const params = new URLSearchParams({ type: 'meta' });
    if (subject) params.set('subject', subject);
    fetch(`/api/standards?${params}`)
      .then((r) => r.json())
      .then((data) => setMeta((prev) => ({ ...prev, domains: data.domains })));
    setDomain('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  // 실제 검색 함수
  const doSearch = useCallback(async (sub: string, dom: string, q: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (sub) params.set('subject', sub);
    if (dom) params.set('domain', dom);
    if (q.trim()) params.set('q', q.trim());
    const res = await fetch(`/api/standards?${params}`);
    const data: StandardItem[] = await res.json();
    setResults(data);
    setLoading(false);
  }, []);

  // 필터 변경 시 자동 검색 (키워드는 400ms 디바운스, 드롭다운은 즉시)
  useEffect(() => {
    const delay = query.trim() ? 400 : 0;
    const timer = setTimeout(() => doSearch(subject, domain, query), delay);
    return () => clearTimeout(timer);
  }, [subject, domain, query, doSearch]);

  const handleReset = () => { setSubject(''); setDomain(''); setQuery(''); };

  const handleConfirm = () => {
    onSelectionChange(draft);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const toggle = (std: StandardItem) => {
    const already = draft.some((s) => s.code === std.code);
    setDraft(
      already
        ? draft.filter((s) => s.code !== std.code)
        : [...draft, std]
    );
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

        {/* ── 좌측 60%: 검색 ── */}
        <div className="flex w-[60%] flex-col bg-[#F7F9FD] border-r border-[#E4EBF5]">

          {/* 헤더 */}
          <div className="shrink-0 flex items-center justify-between border-b border-[#E4EBF5] bg-white px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D1260F] text-white">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-[19px] font-semibold text-[#1C2B3A]">성취기준 검색</h2>
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
            <div className="flex items-end gap-3">
              <Select label="교과" value={subject} options={meta.subjects} placeholder="전체" onChange={setSubject} />
              <Select label="영역" value={domain} options={meta.domains} placeholder="전체" onChange={setDomain} />
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-[13px] font-semibold uppercase tracking-wider text-[#9AAAC0]">키워드</label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="성취기준 코드, 키워드, 내용 검색..."
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
                  onClick={handleReset}
                  className="self-end rounded-lg border border-[#D8E2F0] bg-white px-4 py-2 text-[15px] text-[#6B7A99] transition hover:bg-[#F2F5FA]"
                >
                  초기화
                </button>
              )}
            </div>
          </div>

          {/* 결과 */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading && (
              <div className="flex h-32 items-center justify-center">
                <svg className="h-7 w-7 animate-spin text-[#D1260F]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              </div>
            )}
            {!loading && results.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <p className="text-[17px] text-[#6B7A99]">검색 결과가 없습니다.</p>
              </div>
            )}
            {!loading && results.length > 0 && (
              <>
                <p className="mb-4 text-[14px] text-[#9AAAC0]">
                  <span className="font-semibold text-[#D1260F]">{results.length}</span>개
                  {results.length === 50 && ' (최대 50개 표시)'}
                </p>
                <div className="flex flex-col gap-3">
                  {results.map((std) => (
                    <StandardCard
                      key={std.code}
                      standard={std}
                      checked={draft.some((s) => s.code === std.code)}
                      onToggle={readOnly ? () => {} : () => toggle(std)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── 우측 40%: 선택된 성취기준 ── */}
        <div className="flex w-[40%] flex-col bg-white">

          {/* 헤더 */}
          <div className="shrink-0 flex items-center justify-between border-b border-[#E4EBF5] px-6 py-4">
            <div className="flex items-center gap-2">
              <h3 className="text-[17px] font-semibold text-[#1C2B3A]">선택된 성취기준</h3>
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
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-[15px] text-[#9AAAC0]">왼쪽 검색 결과에서<br />성취기준을 선택하세요</p>
                <p className="text-[13px] text-[#B8C8E8]">선택한 성취기준은<br />AI 채팅에 자동 반영됩니다</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {draft.map((std) => {
                  const badgeColor = getBadgeColor(std.subject);
                  return (
                    <div key={std.code} className="rounded-xl border border-[#E4EBF5] bg-[#F7F9FD] p-3.5">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                            <span
                              className="rounded-md px-2 py-0.5 text-[12px] font-bold text-white"
                              style={{ backgroundColor: badgeColor }}
                            >
                              {std.code}
                            </span>
                            <span className="text-[12px] text-[#9AAAC0]">{std.subject}</span>
                            {std.domain && (
                              <span className="rounded-full bg-[#EEF2F8] px-1.5 py-0.5 text-[11px] text-[#6B7A99]">
                                {std.domain}
                              </span>
                            )}
                          </div>
                          <p className="line-clamp-3 text-[13px] leading-relaxed text-[#2C3A52]">
                            {std.content}
                          </p>
                        </div>
                        <button
                          onClick={() => setDraft(draft.filter((s) => s.code !== std.code))}
                          className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-[#9AAAC0] transition hover:bg-red-50 hover:text-red-400"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
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
