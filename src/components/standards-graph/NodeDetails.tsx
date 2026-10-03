"use client";

// 성취기준 상세 (사양 §7.1)

import { useMemo, useState, type RefObject } from "react";
import { activeTypes } from "@/lib/standards-graph/relations";
import { codeCompare, nodeRelations } from "@/lib/standards-graph/selectors";
import type { StandardNode } from "@/lib/standards-graph/types";
import { useExplorer } from "./context";
import { catalogLabel, useDetails } from "./hooks";
import { fmt, HIERARCHY_NOTE } from "./text";
import { OriginalText, SectionTitle, Spinner, SubjectTag, TypeBadge, WeightPill } from "./ui";

const LIST_PAGE = 20;

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-gray-200">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-[13px] font-semibold text-gray-700">
        {title}
        <svg className="h-4 w-4 text-gray-400 transition group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="border-t border-gray-100 px-3 py-3">{children}</div>
    </details>
  );
}

function Annotations({ node }: { node: StandardNode }) {
  const { index } = useExplorer();
  const topics = Object.entries(node.derived_annotations?.topics ?? {});
  const competencies = Object.entries(node.derived_annotations?.competencies ?? {});
  const evidence = (v: unknown) => {
    const r = v as { excerpt?: string; matched_terms?: string[] } | null;
    if (r?.excerpt) return r.excerpt;
    if (r?.matched_terms?.length) return r.matched_terms.join(", ");
    return "";
  };
  return (
    <section>
      <SectionTitle aside={<span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">분석 결과 · 원문 아님</span>}>
        분석된 주제와 역량
      </SectionTitle>
      {topics.length === 0 && competencies.length === 0 ? (
        <p className="text-[13px] text-gray-400">분석된 주제·역량 없음</p>
      ) : (
        <ul className="space-y-1.5">
          {topics.map(([id, v]) => (
            <li key={`t-${id}`} className="text-[13px] text-gray-700">
              <span className="mr-1.5 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">주제</span>
              {catalogLabel(index.summary.topicCatalog, id, "topic")}
              {evidence(v) && <span className="text-gray-400"> — {evidence(v)}</span>}
            </li>
          ))}
          {competencies.map(([id, v]) => (
            <li key={`c-${id}`} className="text-[13px] text-gray-700">
              <span className="mr-1.5 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">역량</span>
              {catalogLabel(index.summary.competencyCatalog, id, "competency")}
              {evidence(v) && <span className="text-gray-400"> — {evidence(v)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function NodeDetails({ id, headingRef }: { id: string; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const { index, state, dispatch, client, pinned, unpin, neighborStep } = useExplorer();
  const light = index.nodeById.get(id)!;
  const { data: node, error } = useDetails(id, client.nodeDetails);
  const [showAll, setShowAll] = useState<string | null>(null);
  const hierarchy = state.mode === "hierarchy";

  const relations = useMemo(() => nodeRelations(index, state.filters, id), [index, state.filters, id]);
  const flow = useMemo(() => {
    const before: string[] = [];
    const after: string[] = [];
    for (const e of index.incident.get(id) ?? []) {
      if (!e.lh || e.dw.learning_hierarchy < state.hierarchyMinimumWeight) continue;
      if (e.lh.application === id) before.push(e.lh.foundation);
      else after.push(e.lh.application);
    }
    return { before: before.sort(codeCompare), after: after.sort(codeCompare) };
  }, [index, id, state.hierarchyMinimumWeight]);

  const comparing = state.comparisonNodeIds.includes(id);
  const visible = showAll === id ? relations : relations.slice(0, LIST_PAGE);
  const selectedTypes = state.filters.relationTypes;

  const actionClass =
    "flex min-h-11 items-center justify-center rounded-lg border px-3 text-[13px] font-medium transition";

  return (
    <div className="space-y-5">
      <header>
        <h2 ref={headingRef} tabIndex={-1} className="text-[18px] font-bold text-gray-900 outline-none">
          {light.code}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <SubjectTag subject={light.subject} domain={light.domain} />
          {node && <span className="text-[12px] text-gray-400">{node.grade_group} · {node.school_level}</span>}
        </div>
      </header>

      <section>
        {node ? (
          <OriginalText text={node.content} />
        ) : error ? (
          <p className="text-[13px] text-red-600">원문을 불러오지 못했습니다: {error}</p>
        ) : (
          <div className="flex items-center gap-2 text-[13px] text-gray-400">
            <Spinner className="h-4 w-4" /> 원문 불러오는 중…
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => dispatch({ type: "FOCUS_NODE", id, step: neighborStep })}
          className={`${actionClass} col-span-2 border-red-600 bg-red-600 text-white hover:bg-red-700`}
        >
          이 기준 중심으로 보기
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "SHOW_HIERARCHY", id })}
          className={`${actionClass} border-gray-200 text-gray-700 hover:bg-gray-50`}
        >
          학습 흐름 보기
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "TOGGLE_COMPARE", id })}
          aria-pressed={comparing}
          className={`${actionClass} ${comparing ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
        >
          {comparing ? "비교에서 빼기" : "비교에 추가"}
        </button>
        {pinned.has(id) && (
          <button
            type="button"
            onClick={() => unpin(id)}
            className={`${actionClass} col-span-2 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}
          >
            위치 고정 해제
          </button>
        )}
      </div>

      {hierarchy && (
        <section className="space-y-3">
          <p className="text-[12px] leading-[1.6] text-amber-800">{HIERARCHY_NOTE}</p>
          {(["before", "after"] as const).map((dir) => (
            <div key={dir}>
              <SectionTitle>{dir === "before" ? `앞선 학습 (foundation) ${flow.before.length}` : `이어지는 학습 (application) ${flow.after.length}`}</SectionTitle>
              {flow[dir].length === 0 ? (
                <p className="text-[13px] text-gray-400">기록된 학습 연결 없음</p>
              ) : (
                <ul className="space-y-1">
                  {flow[dir].map((other) => {
                    const o = index.nodeById.get(other)!;
                    return (
                      <li key={other}>
                        <button
                          type="button"
                          onClick={() => dispatch({ type: "SHOW_HIERARCHY", id: other })}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left hover:border-amber-300 hover:bg-amber-50"
                        >
                          <span className="flex flex-wrap items-center gap-x-2">
                            <span className="text-[13px] font-semibold text-gray-900">
                              {dir === "before" ? `${o.code} → ${light.code}` : `${light.code} → ${o.code}`}
                            </span>
                            <SubjectTag subject={o.subject} domain={o.domain} />
                          </span>
                          <p className="mt-0.5 line-clamp-2 text-[12px] text-gray-600">{o.preview}</p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      <section>
        <SectionTitle aside={<span className="text-[12px] tabular-nums text-gray-400">{fmt(relations.length)}개</span>}>
          현재 조건의 연결
        </SectionTitle>
        {state.filters.relationTypes.length === 0 ? (
          <p className="text-[13px] text-gray-500">관계 유형을 선택하세요.</p>
        ) : relations.length === 0 ? (
          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            <p className="text-[13px] text-gray-600">현재 조건에 맞는 관계 없음</p>
            {state.filters.minimumWeight > 1 && (
              <button
                type="button"
                onClick={() => dispatch({ type: "SET_MIN_WEIGHT", weight: (state.filters.minimumWeight - 1) as 1 | 2 | 3 | 4 })}
                className="mt-1 text-[12px] font-medium text-red-600 hover:underline"
              >
                관계 점수 기준을 {state.filters.minimumWeight - 1} 이상으로 낮추기
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-1">
            {visible.map((r) => (
              <li key={r.edge.id}>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "SELECT_EDGE", id: r.edge.id })}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition hover:border-gray-300 hover:bg-gray-50 ${
                    state.selectedEdgeId === r.edge.id ? "border-gray-900" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <WeightPill weight={r.effectiveWeight} label="현재 선택 유형의 점수" />
                    <span className="text-[13px] font-semibold text-gray-900">{r.other.code}</span>
                    <SubjectTag subject={r.other.subject} />
                    {r.edge.cross && <span className="ml-auto shrink-0 text-[11px] text-gray-400">교과 간</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-[1.5] text-gray-600">{r.other.preview}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {activeTypes(r.edge)
                      .filter((t) => selectedTypes.includes(t))
                      .map((t) => (
                        <TypeBadge key={t} type={t} weight={r.edge.dw[t]} />
                      ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {relations.length > LIST_PAGE && showAll !== id && (
          <button
            type="button"
            onClick={() => setShowAll(id)}
            className="mt-1.5 min-h-10 w-full rounded-lg text-[13px] font-medium text-gray-600 hover:bg-gray-50"
          >
            {fmt(relations.length - LIST_PAGE)}개 더 보기
          </button>
        )}
      </section>

      {node && (
        <section className="space-y-2">
          <SectionTitle>원문 해설·적용 사항</SectionTitle>
          <Collapsible title="해설">
            {node.explanation.trim() ? <OriginalText text={node.explanation} className="text-[13px]" /> : <p className="text-[13px] text-gray-400">등록된 해설 없음</p>}
          </Collapsible>
          <Collapsible title="적용 사항">
            {node.application_notes.trim() ? (
              <OriginalText text={node.application_notes} className="text-[13px]" />
            ) : (
              <p className="text-[13px] text-gray-400">등록된 적용 사항 없음</p>
            )}
          </Collapsible>
        </section>
      )}

      {node && <Annotations node={node} />}
    </div>
  );
}
