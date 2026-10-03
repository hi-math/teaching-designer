"use client";

// 연결 상세 (사양 §7.2)
// 관계와 weight 는 추론 결과임을 밝히고, reason 은 자르거나 재구성하지 않고 그대로 보여 준다.

import type { RefObject } from "react";
import { getEffectiveWeight, RELATION_LABELS } from "@/lib/standards-graph/relations";
import { RELATION_TYPES, type RelationType } from "@/lib/standards-graph/types";
import { useExplorer } from "./context";
import { useDetails } from "./hooks";
import { INFERENCE_NOTE } from "./text";
import { OriginalText, SectionTitle, Spinner, SubjectTag, TypeBadge, WeightPill } from "./ui";

function Chips({ items, empty = "—" }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-[13px] text-gray-400">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((t) => (
        <span key={t} className="rounded-md bg-gray-100 px-2 py-0.5 text-[12px] text-gray-700">
          {t}
        </span>
      ))}
    </div>
  );
}

export default function EdgeDetails({
  id,
  headingRef,
  onBack,
}: {
  id: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack?: () => void;
}) {
  const { index, state, client, dispatch } = useExplorer();
  const light = index.edgeById.get(id)!;
  const { data, error } = useDetails(id, client.edgeDetails);
  const hierarchy = state.mode === "hierarchy";
  const types: RelationType[] = hierarchy ? ["learning_hierarchy"] : state.filters.relationTypes;
  const eff = getEffectiveWeight(light, types);
  const rubric = index.summary.weightRubric;
  const method = index.summary.method;

  const ends = [light.source, light.target].map((nid, i) => {
    const n = index.nodeById.get(nid)!;
    const full = data ? (i === 0 ? data.source : data.target) : null;
    return { n, full };
  });

  return (
    <div className="space-y-5">
      <header>
        {onBack && (
          <button type="button" onClick={onBack} className="mb-1 text-[12px] font-medium text-gray-500 hover:text-gray-800">
            ← 성취기준 상세로
          </button>
        )}
        <h2 ref={headingRef} tabIndex={-1} className="text-[17px] font-bold text-gray-900 outline-none">
          연결 상세
        </h2>
        <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-[12px] leading-[1.6] text-gray-600">{INFERENCE_NOTE}</p>
      </header>

      <section className="space-y-2">
        {ends.map(({ n, full }) => (
          <button
            key={n.id}
            type="button"
            onClick={() => dispatch({ type: "SELECT_NODE", id: n.id })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-left hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-gray-900">{n.code}</span>
              <SubjectTag subject={n.subject} domain={n.domain} />
            </div>
            {full ? <OriginalText text={full.content} className="mt-1 text-[13px]" /> : <p className="mt-1 text-[13px] text-gray-600">{n.preview}</p>}
          </button>
        ))}
      </section>

      <section>
        <SectionTitle>현재 선택 유형</SectionTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          {types.filter((t) => light.dw[t] > 0).map((t) => (
            <TypeBadge key={t} type={t} weight={light.dw[t]} />
          ))}
          {types.every((t) => light.dw[t] === 0) && <span className="text-[13px] text-gray-400">선택한 유형의 관계 없음</span>}
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-gray-200 px-3 py-2">
            <dt className="text-[11px] text-gray-500">현재 선택 유형의 weight</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-[13px] text-gray-800">
              {eff ? <WeightPill weight={eff} /> : "—"} {eff ? rubric[String(eff)]?.split(":")[0] : ""}
            </dd>
          </div>
          <div className="rounded-lg border border-gray-200 px-3 py-2">
            <dt className="text-[11px] text-gray-500">원래의 종합 weight</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-[13px] text-gray-800">
              <WeightPill weight={light.weight} /> {rubric[String(light.weight)]?.split(":")[0]}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <SectionTitle>관계별 점수</SectionTitle>
        <table className="w-full text-[13px]">
          <tbody>
            {RELATION_TYPES.map((t) => (
              <tr key={t} className="border-b border-gray-100 last:border-0">
                <th scope="row" className="py-1.5 text-left font-normal text-gray-600">
                  {RELATION_LABELS[t]}
                  {!types.includes(t) && <span className="ml-1 text-[11px] text-gray-400">미선택</span>}
                </th>
                <td className="py-1.5 text-right tabular-nums text-gray-900">{light.dw[t] || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] leading-[1.6] text-gray-400">
          weight는 관계의 상대적 강도(1–5)이며 학생 성취도나 확률이 아닙니다. 해당 없는 유형은 —로 표시합니다.
        </p>
      </section>

      {light.lh && (
        <section>
          <SectionTitle>학습 방향</SectionTitle>
          <p className="text-[14px] font-semibold text-amber-800">
            {light.lh.foundation} → {light.lh.application}
            <span className="ml-1.5 text-[12px] font-normal text-gray-500">학습 위계 {light.lh.weight}</span>
          </p>
          {data?.edge.learning_hierarchy?.reason && <OriginalText text={data.edge.learning_hierarchy.reason} className="mt-1 text-[13px]" />}
          <p className="mt-1 text-[11px] leading-[1.6] text-gray-400">권장 학습 연결이며 필수 선수조건이나 공식 학년 배치를 뜻하지 않습니다.</p>
        </section>
      )}

      {!data ? (
        error ? (
          <p className="text-[13px] text-red-600">근거를 불러오지 못했습니다: {error}</p>
        ) : (
          <div className="flex items-center gap-2 text-[13px] text-gray-400">
            <Spinner className="h-4 w-4" /> 근거 불러오는 중…
          </div>
        )
      ) : (
        <>
          <section>
            <SectionTitle>전체 관계 근거</SectionTitle>
            <OriginalText text={data.edge.reason} className="text-[13px]" />
            {data.edge.evidence.reviewed_judgments.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {data.edge.evidence.reviewed_judgments.map((j, i) => (
                  <li key={i} className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] leading-[1.6] text-gray-700">
                    <span className="font-semibold">
                      {RELATION_LABELS[j.dimension]} {j.weight}
                    </span>{" "}
                    — {j.reason}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <SectionTitle>공유 주제</SectionTitle>
              <Chips items={data.edge.evidence.shared_topics.map((t) => t.label)} />
            </div>
            <div>
              <SectionTitle>공유 역량</SectionTitle>
              <Chips items={data.edge.evidence.shared_competencies.map((t) => t.label)} />
            </div>
            <div>
              <SectionTitle>공유 keywords</SectionTitle>
              <Chips items={data.edge.evidence.shared_keywords} />
            </div>
            <p className="text-[12px] text-gray-500">
              분석 상태: <span className="font-medium text-gray-700">{data.edge.assessment_status === "inferred" ? "추론 (inferred)" : data.edge.assessment_status}</span>
            </p>
          </section>

          <details className="group rounded-lg border border-gray-200">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-[13px] font-semibold text-gray-700">
              분석 정보
              <svg className="h-4 w-4 text-gray-400 transition group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <dl className="space-y-2 border-t border-gray-100 px-3 py-3 text-[12px] leading-[1.6] text-gray-600">
              <div>
                <dt className="font-semibold text-gray-700">semantic cosine similarity</dt>
                <dd className="tabular-nums">{data.edge.evidence.semantic_cosine_similarity}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-700">Model</dt>
                <dd className="break-all">{method.model}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-700">비교한 필드</dt>
                <dd>{data.edge.evidence.source_fields.join(", ")}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-700">산정 방법</dt>
                <dd>{method.description}</dd>
                <dd className="mt-1">{method.edgeWeight}</dd>
              </div>
              <div>
                <dt className="font-semibold text-gray-700">점수 기준</dt>
                {Object.entries(rubric).map(([w, text]) => (
                  <dd key={w}>
                    {w}: {text}
                  </dd>
                ))}
              </div>
            </dl>
          </details>
        </>
      )}
    </div>
  );
}
