"use client";

// 목록 보기 — 성취기준·관계 표 (사양 §4.4)
// Graph 와 같은 검색·filter 결과를 50개 단위로 보여 주고, 선택 상태를 Graph 와 공유한다.

import { useMemo, useState } from "react";
import { activeTypes } from "@/lib/standards-graph/relations";
import { codeCompare, effectiveWeightOf } from "@/lib/standards-graph/selectors";
import { compareSubjects } from "@/lib/standards-graph/subjectPalette";
import { useExplorer } from "./context";
import { fmt } from "./text";
import { SubjectTag, TypeBadge, WeightPill } from "./ui";

const PAGE_SIZE = 50;

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return <p className="px-4 py-2 text-[12px] text-gray-400">{fmt(total)}개</p>;
  return (
    <nav aria-label="페이지" className="flex items-center justify-between gap-2 px-4 py-2">
      <p className="text-[12px] text-gray-500">
        {fmt(total)}개 중 {fmt(page * PAGE_SIZE + 1)}–{fmt(Math.min(total, (page + 1) * PAGE_SIZE))}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          className="min-h-10 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-600 disabled:opacity-40"
        >
          이전
        </button>
        <span className="px-2 text-[13px] tabular-nums text-gray-600">
          {page + 1} / {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
          className="min-h-10 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-600 disabled:opacity-40"
        >
          다음
        </button>
      </div>
    </nav>
  );
}

/** 선택 항목이 있는 페이지에서 시작하고, 데이터가 바뀌면 첫 페이지로 돌아간다 */
function usePage(ids: string[], selected: string | null, dataKey: unknown) {
  const [state, setState] = useState<{ key: unknown; page: number; selected: string | null }>(() => ({
    key: dataKey,
    page: selected && ids.includes(selected) ? Math.floor(ids.indexOf(selected) / PAGE_SIZE) : 0,
    selected,
  }));
  let page = state.page;
  if (state.key !== dataKey) page = 0;
  if (selected !== state.selected && selected && ids.includes(selected)) page = Math.floor(ids.indexOf(selected) / PAGE_SIZE);
  if (page !== state.page || state.key !== dataKey || selected !== state.selected) {
    setState({ key: dataKey, page, selected });
  }
  return [page, (p: number) => setState({ key: dataKey, page: p, selected })] as const;
}

export function StandardsTable() {
  const { index, overview, state, dispatch } = useExplorer();
  const ids = useMemo(
    () =>
      [...overview.nodeIds].sort((a, b) => {
        const na = index.nodeById.get(a)!, nb = index.nodeById.get(b)!;
        return compareSubjects(na.subject, nb.subject) || codeCompare(na.code, nb.code);
      }),
    [overview, index],
  );
  const [page, setPage] = usePage(ids, state.selectedNodeId, overview);
  const pages = Math.ceil(ids.length / PAGE_SIZE);
  const rows = ids.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
          <caption className="sr-only">현재 조건의 성취기준 목록</caption>
          <thead className="sticky top-0 z-10 bg-gray-50 text-[12px] text-gray-500">
            <tr>
              <th scope="col" className="w-32 px-4 py-2 font-semibold">코드</th>
              <th scope="col" className="w-48 px-2 py-2 font-semibold">교과 · 영역</th>
              <th scope="col" className="px-2 py-2 font-semibold">본문</th>
              <th scope="col" className="w-20 px-4 py-2 text-right font-semibold">관계 수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((id) => {
              const n = index.nodeById.get(id)!;
              const selected = state.selectedNodeId === id;
              return (
                <tr key={id} className={`border-b border-gray-100 ${selected ? "bg-red-50" : "hover:bg-gray-50"}`}>
                  <td className="px-4 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "SELECT_NODE", id })}
                      aria-pressed={selected}
                      className="min-h-8 font-semibold text-gray-900 hover:text-red-600 hover:underline"
                    >
                      {n.code}
                    </button>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <SubjectTag subject={n.subject} domain={n.domain} />
                  </td>
                  <td className="px-2 py-2 align-top leading-[1.6] text-gray-700">{n.preview}</td>
                  <td className="px-4 py-2 text-right align-top tabular-nums text-gray-700">
                    {overview.degree.get(id) ?? <span className="text-gray-300">0</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-gray-200 bg-white">
        <Pager page={page} pages={pages} total={ids.length} onPage={setPage} />
      </div>
    </div>
  );
}

export function RelationsTable() {
  const { index, overview, state, dispatch } = useExplorer();
  const { filters } = state;
  const rows = useMemo(() => {
    return overview.edgeIds
      .map((id) => {
        const e = index.edgeById.get(id)!;
        return { e, eff: effectiveWeightOf(e, filters) };
      })
      .sort((a, b) => b.eff - a.eff || Number(b.e.cross) - Number(a.e.cross) || codeCompare(a.e.id, b.e.id));
  }, [overview, index, filters]);
  const ids = useMemo(() => rows.map((r) => r.e.id), [rows]);
  const [page, setPage] = usePage(ids, state.selectedEdgeId, overview);
  const pages = Math.ceil(rows.length / PAGE_SIZE);
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (overview.noTypes) {
    return <p className="p-6 text-[14px] text-gray-500">관계 유형을 선택하세요. 성취기준 목록과 검색은 계속 사용할 수 있습니다.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-[13px]">
          <caption className="sr-only">현재 조건의 관계 목록</caption>
          <thead className="sticky top-0 z-10 bg-gray-50 text-[12px] text-gray-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">성취기준 A</th>
              <th scope="col" className="px-2 py-2 font-semibold">성취기준 B</th>
              <th scope="col" className="w-44 px-2 py-2 font-semibold">선택 유형</th>
              <th scope="col" className="w-20 px-2 py-2 text-center font-semibold">점수</th>
              <th scope="col" className="w-20 px-4 py-2 text-center font-semibold">교과 간</th>
            </tr>
          </thead>
          <tbody>
            {slice.map(({ e, eff }) => {
              const selected = state.selectedEdgeId === e.id;
              return (
                <tr key={e.id} className={`border-b border-gray-100 ${selected ? "bg-red-50" : "hover:bg-gray-50"}`}>
                  {[e.source, e.target].map((nid, i) => {
                    const n = index.nodeById.get(nid)!;
                    return (
                      <td key={nid} className={`${i === 0 ? "px-4" : "px-2"} py-2 align-top`}>
                        <span className="flex flex-wrap items-center gap-x-2">
                          {i === 0 ? (
                            <button
                              type="button"
                              onClick={() => dispatch({ type: "SELECT_EDGE", id: e.id })}
                              aria-pressed={selected}
                              aria-label={`${e.source}와 ${e.target}의 연결 상세`}
                              className="min-h-8 text-left font-semibold text-gray-900 hover:text-red-600 hover:underline"
                            >
                              {n.code}
                            </button>
                          ) : (
                            <span className="font-semibold text-gray-900">{n.code}</span>
                          )}
                          <SubjectTag subject={n.subject} />
                        </span>
                        <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.5] text-gray-600">{n.short}</p>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      {activeTypes(e)
                        .filter((t) => filters.relationTypes.includes(t))
                        .map((t) => (
                          <TypeBadge key={t} type={t} weight={e.dw[t]} />
                        ))}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center align-top">
                    <WeightPill weight={eff} />
                  </td>
                  <td className="px-4 py-2 text-center align-top text-gray-600">{e.cross ? "예" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-gray-200 bg-white">
        <Pager page={page} pages={pages} total={rows.length} onPage={setPage} />
      </div>
    </div>
  );
}
