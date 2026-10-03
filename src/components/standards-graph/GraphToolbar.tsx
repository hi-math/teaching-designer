"use client";

// 화면 전환 · weight · 화면별 조작 (사양 §5.1 toolbar, 56px, 부족하면 가로 스크롤)

import { useState } from "react";
import { FOCUS_NODE_SOFT_CAP } from "@/lib/standards-graph/neighborhood";
import { WEIGHTS, type GraphMode, type Weight } from "@/lib/standards-graph/types";
import { useExplorer } from "./context";
import { describeFilters, LAYOUT_NOTE } from "./text";

const MODES: { mode: GraphMode; label: string }[] = [
  { mode: "overview", label: "전체 보기" },
  { mode: "focus", label: "중심 탐색" },
  { mode: "hierarchy", label: "학습 흐름" },
  { mode: "table", label: "목록" },
];

export interface ToolbarProps {
  onToggleFilters?: () => void;
  filtersOpen?: boolean;
  activeFilterCount: number;
  relayoutBusy: boolean;
  onRelayout: () => void;
  onResetLayout: () => void;
  pinCount: number;
  onUnpinAll: () => void;
  focusStats: { shown: number; total: number; displayedNodes: number } | null;
  hierarchyCanExpand: boolean;
  tableTab: "standards" | "relations";
  onTableTab: (tab: "standards" | "relations") => void;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-lg bg-gray-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`min-h-9 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition disabled:opacity-40 ${
            value === o.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const btn =
  "min-h-9 shrink-0 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40";

export default function GraphToolbar(props: ToolbarProps) {
  const { state, dispatch, index, neighborStep } = useExplorer();
  const [confirmMore, setConfirmMore] = useState(false);
  const { mode } = state;
  const hierarchy = mode === "hierarchy";
  const weight = hierarchy ? state.hierarchyMinimumWeight : state.filters.minimumWeight;

  const changeMode = (next: GraphMode) => {
    if (next === "focus" && !state.focusNodeId && state.selectedNodeId) {
      dispatch({ type: "FOCUS_NODE", id: state.selectedNodeId, step: neighborStep });
    } else dispatch({ type: "SET_MODE", mode: next });
  };

  const f = props.focusStats;
  const moreWouldExceed = !!f && f.displayedNodes + neighborStep > FOCUS_NODE_SOFT_CAP;

  return (
    <div className="flex min-h-14 items-center gap-2 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2">
      {props.onToggleFilters && (
        <button type="button" onClick={props.onToggleFilters} aria-expanded={props.filtersOpen} className={btn}>
          필터{props.activeFilterCount ? ` ${props.activeFilterCount}` : ""}
        </button>
      )}

      <div role="tablist" aria-label="화면" className="flex shrink-0 gap-0.5">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            role="tab"
            aria-selected={mode === m.mode}
            onClick={() => changeMode(m.mode)}
            className={`relative min-h-10 whitespace-nowrap rounded-lg px-3 text-[14px] font-semibold transition ${
              mode === m.mode ? "bg-red-50 text-red-600" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mx-1 h-6 w-px shrink-0 bg-gray-200" />

      <label className="flex shrink-0 items-center gap-1.5 text-[13px] text-gray-600">
        {hierarchy ? "학습 위계 점수" : "관계 점수"}
        <select
          value={weight}
          onChange={(e) => {
            const w = Number(e.target.value) as Weight;
            dispatch(hierarchy ? { type: "SET_HIERARCHY_MIN_WEIGHT", weight: w } : { type: "SET_MIN_WEIGHT", weight: w });
          }}
          className="min-h-9 rounded-lg border border-gray-200 bg-white px-2 text-[13px] font-semibold text-gray-900"
        >
          {WEIGHTS.map((w) => (
            <option key={w} value={w}>
              {w} 이상
            </option>
          ))}
        </select>
      </label>

      {mode === "overview" && (
        <>
          <Segmented
            label="배치"
            value={state.layoutMode}
            onChange={(v) => dispatch({ type: "SET_LAYOUT_MODE", layoutMode: v })}
            options={[
              { value: "subject", label: "교과별 배치" },
              { value: "relations", label: "관계 중심 배치" },
            ]}
          />
          <button type="button" onClick={props.onRelayout} disabled={props.relayoutBusy} className={btn} title="현재 표시 대상으로 위치를 다시 계산합니다">
            {props.relayoutBusy ? "배치 계산 중…" : "재배치"}
          </button>
          <button type="button" onClick={props.onResetLayout} className={btn} title="저장된 기본 배치로 돌아갑니다">
            기본 배치
          </button>
          {props.pinCount > 0 && (
            <button type="button" onClick={props.onUnpinAll} className={`${btn} border-amber-300 text-amber-800`}>
              고정 해제 {props.pinCount}
            </button>
          )}
          <span className="shrink-0 cursor-help text-[12px] text-gray-400 underline decoration-dotted" title={LAYOUT_NOTE}>
            배치 안내
          </span>
        </>
      )}

      {mode === "focus" && state.focusNodeId && (
        <>
          <Segmented
            label="탐색 범위"
            value={String(state.hops) as "1" | "2"}
            onChange={(v) => dispatch({ type: "SET_HOPS", hops: v === "2" ? 2 : 1 })}
            options={[
              { value: "1", label: "1-hop" },
              { value: "2", label: "2-hop" },
            ]}
          />
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[13px] text-gray-600">
            <input
              type="checkbox"
              checked={state.showNeighborEdges}
              onChange={() => dispatch({ type: "TOGGLE_NEIGHBOR_EDGES" })}
              className="h-4 w-4 accent-[#D1260F]"
            />
            이웃 사이 관계
          </label>
          {f && f.shown < f.total && (
            confirmMore || !moreWouldExceed ? (
              <button
                type="button"
                onClick={() => {
                  setConfirmMore(false);
                  dispatch({ type: "MORE_NEIGHBORS", step: neighborStep });
                }}
                className={`${btn} ${confirmMore ? "border-amber-400 text-amber-800" : ""}`}
              >
                {confirmMore ? `${FOCUS_NODE_SOFT_CAP}개 넘게 표시` : `관계 더 보기 +${neighborStep}`}
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmMore(true)} className={btn}>
                관계 더 보기 +{neighborStep}
              </button>
            )
          )}
          {confirmMore && (
            <span className="shrink-0 text-[12px] text-amber-700">표시 node가 {FOCUS_NODE_SOFT_CAP}개를 넘습니다. 한 번 더 누르면 확장합니다.</span>
          )}
          {state.neighborLimit > neighborStep && (
            <button type="button" onClick={() => dispatch({ type: "RESET_NEIGHBORS", step: neighborStep })} className={btn}>
              처음 한도로
            </button>
          )}
          <button type="button" onClick={() => dispatch({ type: "CLEAR_FOCUS" })} className={btn}>
            중심 해제
          </button>
        </>
      )}

      {hierarchy && (
        <>
          <label
            className={`flex shrink-0 items-center gap-1.5 text-[13px] ${state.filters.subjects.length ? "cursor-pointer text-gray-600" : "text-gray-300"}`}
            title={state.filters.subjects.length ? undefined : "교과를 선택하면 사용할 수 있습니다"}
          >
            <input
              type="checkbox"
              disabled={!state.filters.subjects.length}
              checked={state.hierarchyIncludeCrossSubject}
              onChange={() => dispatch({ type: "TOGGLE_HIERARCHY_CROSS" })}
              className="h-4 w-4 accent-[#D1260F]"
            />
            타 교과 학습 연결 포함
          </label>
          {state.focusNodeId && (
            <>
              <span className="shrink-0 text-[13px] text-gray-500">
                {state.hierarchyDepth === 0 ? "전체 단계" : `앞뒤 ${state.hierarchyDepth}단계`}
              </span>
              {props.hierarchyCanExpand && (
                <>
                  <button type="button" onClick={() => dispatch({ type: "SET_HIERARCHY_DEPTH", depth: state.hierarchyDepth + 1 })} className={btn}>
                    한 단계 넓히기
                  </button>
                  <button type="button" onClick={() => dispatch({ type: "SET_HIERARCHY_DEPTH", depth: 0 })} className={btn}>
                    전체 단계
                  </button>
                </>
              )}
              <button type="button" onClick={() => dispatch({ type: "SHOW_HIERARCHY", id: null })} className={btn}>
                중심 해제
              </button>
            </>
          )}
        </>
      )}

      {mode === "table" && (
        <Segmented
          label="목록 종류"
          value={props.tableTab}
          onChange={props.onTableTab}
          options={[
            { value: "standards", label: "성취기준" },
            { value: "relations", label: "관계" },
          ]}
        />
      )}

      <p className="ml-auto min-w-[160px] max-w-[460px] shrink truncate pl-2 text-right text-[12px] text-gray-400" title={describeFilters(state.filters)}>
        {hierarchy
          ? `학습 위계 점수 ${state.hierarchyMinimumWeight} 이상 · ${state.filters.subjects.length ? state.filters.subjects.join("·") : "전체 교과"}`
          : describeFilters(state.filters)}
        <span className="sr-only"> · 전체 성취기준 {index.nodes.length}개</span>
      </p>
    </div>
  );
}
