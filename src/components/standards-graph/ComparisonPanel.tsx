"use client";

// 두 성취기준 비교 (사양 §4.4)
// 브라우저에서 새 edge 나 점수를 만들지 않는다. 직접 edge 가 없으면 그 사실만 알린다.

import { RELATION_LABELS } from "@/lib/standards-graph/relations";
import { directEdge } from "@/lib/standards-graph/selectors";
import { RELATION_TYPES, type StandardNode } from "@/lib/standards-graph/types";
import { useExplorer } from "./context";
import { catalogLabel, useDetails } from "./hooks";
import { INFERENCE_NOTE } from "./text";
import { OriginalText, SectionTitle, Spinner, SubjectTag } from "./ui";

function shared(a: StandardNode | null, b: StandardNode | null, key: "topics" | "competencies"): string[] {
  if (!a || !b) return [];
  const bs = new Set(Object.keys(b.derived_annotations?.[key] ?? {}));
  return Object.keys(a.derived_annotations?.[key] ?? {}).filter((id) => bs.has(id));
}

export default function ComparisonPanel() {
  const { index, state, client, dispatch } = useExplorer();
  const [aId, bId] = state.comparisonNodeIds;
  const a = useDetails(aId ?? null, client.nodeDetails);
  const b = useDetails(bId ?? null, client.nodeDetails);
  const edge = aId && bId ? directEdge(index, aId, bId) : null;
  const e = useDetails(edge?.id ?? null, client.edgeDetails);

  const topics = shared(a.data, b.data, "topics").map((id) => catalogLabel(index.summary.topicCatalog, id, "topic"));
  const competencies = shared(a.data, b.data, "competencies").map((id) =>
    catalogLabel(index.summary.competencyCatalog, id, "competency"),
  );

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-gray-900">두 성취기준 비교</h2>
        {state.comparisonNodeIds.length > 0 && (
          <button
            type="button"
            onClick={() => dispatch({ type: "CLEAR_COMPARE" })}
            className="min-h-9 rounded-lg px-2 text-[12px] font-medium text-gray-500 hover:bg-gray-100"
          >
            비우기
          </button>
        )}
      </header>

      {state.comparisonNodeIds.length < 2 && (
        <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] leading-[1.6] text-gray-600">
          성취기준 상세의 “비교에 추가”로 두 기준을 고르세요. ({state.comparisonNodeIds.length}/2)
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {[aId, bId].map((id, i) => {
          if (!id) return <div key={i} className="rounded-lg border border-dashed border-gray-200 p-3 text-[12px] text-gray-400">비교 {i + 1} 비어 있음</div>;
          const n = index.nodeById.get(id)!;
          const full = i === 0 ? a.data : b.data;
          return (
            <div key={id} className="min-w-0 rounded-lg border-2 border-gray-900/80 p-3">
              <div className="flex items-start justify-between gap-1">
                <button type="button" onClick={() => dispatch({ type: "SELECT_NODE", id })} className="text-left">
                  <span className="mr-1 text-[12px] font-bold text-gray-500">{i === 0 ? "①" : "②"}</span>
                  <span className="text-[14px] font-semibold text-gray-900 hover:underline">{n.code}</span>
                </button>
                <button
                  type="button"
                  aria-label={`${n.code} 비교에서 빼기`}
                  onClick={() => dispatch({ type: "TOGGLE_COMPARE", id })}
                  className="text-[12px] text-gray-400 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              <SubjectTag subject={n.subject} domain={n.domain} />
              {full ? <OriginalText text={full.content} className="mt-1.5 text-[13px]" /> : <Spinner className="mt-2 h-4 w-4" />}
            </div>
          );
        })}
      </div>

      {aId && bId && (
        <>
          <section className="grid grid-cols-2 gap-3">
            <div>
              <SectionTitle>공유 주제</SectionTitle>
              <p className="text-[13px] text-gray-700">{topics.length ? topics.join(", ") : "—"}</p>
            </div>
            <div>
              <SectionTitle>공유 역량</SectionTitle>
              <p className="text-[13px] text-gray-700">{competencies.length ? competencies.join(", ") : "—"}</p>
            </div>
            <p className="col-span-2 text-[11px] text-gray-400">두 기준의 분석된 주제·역량 중 겹치는 항목입니다 (원문 아님).</p>
          </section>

          <section>
            <SectionTitle>직접 연결</SectionTitle>
            {!edge ? (
              <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] text-gray-600">데이터에 직접 연결이 기록되어 있지 않습니다.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] text-gray-500">{INFERENCE_NOTE}</p>
                <table className="w-full text-[13px]">
                  <tbody>
                    {RELATION_TYPES.map((t) => (
                      <tr key={t} className="border-b border-gray-100">
                        <th scope="row" className="py-1.5 text-left font-normal text-gray-600">{RELATION_LABELS[t]}</th>
                        <td className="py-1.5 text-right tabular-nums">{edge.dw[t] || "—"}</td>
                      </tr>
                    ))}
                    <tr>
                      <th scope="row" className="py-1.5 text-left font-normal text-gray-600">원래의 종합 weight</th>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{edge.weight}</td>
                    </tr>
                  </tbody>
                </table>
                {edge.lh && (
                  <p className="text-[13px] font-medium text-amber-800">
                    학습 방향: {edge.lh.foundation} → {edge.lh.application}
                  </p>
                )}
                <SectionTitle>근거</SectionTitle>
                {e.data ? <OriginalText text={e.data.edge.reason} className="text-[13px]" /> : <Spinner className="h-4 w-4" />}
                <button
                  type="button"
                  onClick={() => dispatch({ type: "SELECT_EDGE", id: edge.id })}
                  className="min-h-10 text-[13px] font-medium text-red-600 hover:underline"
                >
                  연결 상세 보기
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
