"use client";

// 교과·영역·관계 유형·교과 관계 filter (사양 §5.3)

import { useMemo } from "react";
import { RELATION_LABELS } from "@/lib/standards-graph/relations";
import { RELATION_TYPES, type SubjectRelation } from "@/lib/standards-graph/types";
import { useExplorer } from "./context";
import { fmt } from "./text";
import { LineSample, SectionTitle, SubjectDot } from "./ui";

const RELATION_OPTIONS: { value: SubjectRelation; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "same", label: "같은 교과" },
  { value: "cross", label: "다른 교과" },
];

export default function FilterPanel({ onClose }: { onClose?: () => void }) {
  const { index, state, dispatch } = useExplorer();
  const { filters } = state;
  const hierarchy = state.mode === "hierarchy";

  const typeCounts = useMemo(() => {
    const counts = Object.fromEntries(RELATION_TYPES.map((t) => [t, 0])) as Record<string, number>;
    for (const e of index.edges) for (const t of RELATION_TYPES) if (e.dw[t] > 0) counts[t]++;
    return counts;
  }, [index]);

  const selectedDomains = new Set(filters.domains.map(([s, d]) => `${s}\u0000${d}`));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-gray-900">필터</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => dispatch({ type: "RESET_FILTERS" })}
            className="min-h-9 rounded-lg px-2.5 text-[13px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            초기화
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="필터 닫기"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* 관계 유형 */}
        <fieldset>
          <legend className="sr-only">관계 유형</legend>
          <SectionTitle>관계 유형</SectionTitle>
          {hierarchy ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-[1.6] text-amber-800">
              학습 흐름은 학습 위계 점수만 사용합니다. 일반 화면의 유형 설정은 그대로 보존됩니다.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {RELATION_TYPES.map((t) => (
                <li key={t}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={filters.relationTypes.includes(t)}
                      onChange={() => dispatch({ type: "TOGGLE_TYPE", relationType: t })}
                      className="h-4 w-4 accent-[#D1260F]"
                    />
                    <LineSample type={t} />
                    <span className="flex-1 text-[14px] text-gray-800">{RELATION_LABELS[t]}</span>
                    <span className="text-[12px] tabular-nums text-gray-400">{fmt(typeCounts[t])}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {!hierarchy && filters.relationTypes.length === 0 && (
            <p className="mt-1 text-[12px] text-red-600">관계 유형을 선택하세요.</p>
          )}
        </fieldset>

        {/* 교과 관계 */}
        {!hierarchy && (
          <fieldset>
            <legend className="sr-only">교과 관계</legend>
            <SectionTitle>교과 관계</SectionTitle>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
              {RELATION_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className={`flex min-h-10 cursor-pointer items-center justify-center rounded-md text-[13px] font-medium transition ${
                    filters.subjectRelation === o.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="subject-relation"
                    value={o.value}
                    checked={filters.subjectRelation === o.value}
                    onChange={() => dispatch({ type: "SET_SUBJECT_RELATION", relation: o.value })}
                    className="sr-only"
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {filters.subjectRelation === "cross" && filters.subjects.length === 1 && (
              <p className="mt-1.5 text-[12px] leading-[1.6] text-gray-500">
                선택 교과와 직접 연결된 타 교과 성취기준을 함께 표시합니다. 영역 filter는 선택 교과 쪽에만 적용합니다.
              </p>
            )}
          </fieldset>
        )}

        {/* 교과 · 영역 */}
        <fieldset>
          <legend className="sr-only">교과와 영역</legend>
          <SectionTitle
            aside={
              filters.subjects.length ? (
                <button
                  type="button"
                  onClick={() => dispatch({ type: "SET_SUBJECTS", subjects: [] })}
                  className="text-[12px] text-gray-400 hover:text-gray-700"
                >
                  전체 교과로
                </button>
              ) : (
                <span className="text-[12px] text-gray-400">미선택 = 전체</span>
              )
            }
          >
            교과 · 영역
          </SectionTitle>
          <ul className="space-y-0.5">
            {index.subjects.map((s) => {
              const on = filters.subjects.includes(s.subject);
              return (
                <li key={s.subject}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => dispatch({ type: "TOGGLE_SUBJECT", subject: s.subject })}
                      className="h-4 w-4 accent-[#D1260F]"
                    />
                    <SubjectDot subject={s.subject} />
                    <span className="flex-1 text-[14px] text-gray-800">{s.subject}</span>
                    <span className="text-[12px] tabular-nums text-gray-400">{s.count}</span>
                  </label>
                  {on && (
                    <ul className="mb-1 ml-8 border-l border-gray-200 pl-2">
                      {s.domains.map((d) => (
                        <li key={d.domain}>
                          <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-1.5 hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={selectedDomains.has(`${s.subject}\u0000${d.domain}`)}
                              onChange={() => dispatch({ type: "TOGGLE_DOMAIN", subject: s.subject, domain: d.domain })}
                              className="h-3.5 w-3.5 accent-[#D1260F]"
                            />
                            <span className="flex-1 text-[13px] text-gray-700">{d.domain}</span>
                            <span className="text-[11px] tabular-nums text-gray-400">{d.count}</span>
                          </label>
                        </li>
                      ))}
                      <li className="px-1.5 py-1 text-[11px] text-gray-400">영역 미선택 = 이 교과의 모든 영역</li>
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      </div>
    </div>
  );
}
