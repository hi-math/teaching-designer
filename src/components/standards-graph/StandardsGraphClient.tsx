"use client";

// 성취기준 연결 탐색기 — Worker 초기화, reducer, 로딩·오류 상태 조정 (사양 §8.2)

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { MANIFEST_URL, storageKey } from "@/lib/standards-graph/config";
import { EngineError, type EngineErrorInfo, type LoadStage } from "@/lib/standards-graph/data-engine";
import { buildJsonExport, composePng, downloadBlob, exportFileName, type PngLegendItem } from "@/lib/standards-graph/export";
import { selectHierarchy, toDirected } from "@/lib/standards-graph/hierarchy";
import { LAYOUT_MIN_WEIGHT } from "@/lib/standards-graph/layout-force";
import { disposeLayered, layoutLayered, warmUpLayered, type LayeredLayout } from "@/lib/standards-graph/layout-layered";
import { layoutFocus, selectFocus } from "@/lib/standards-graph/neighborhood";
import { graphReducer, NEIGHBOR_STEP } from "@/lib/standards-graph/reducer";
import { RELATION_COLORS, RELATION_LABELS, RELATION_LINE_STYLES } from "@/lib/standards-graph/relations";
import {
  buildFocusElements,
  buildHierarchyElements,
  buildOverviewElements,
  type Positions,
} from "@/lib/standards-graph/renderer-adapter";
import { buildGraphIndex, codeCompare, effectiveWeightOf, selectOverview } from "@/lib/standards-graph/selectors";
import { SUBJECT_ORDER } from "@/lib/standards-graph/subjectPalette";
import type { GraphSummary, LayoutMode, Weight } from "@/lib/standards-graph/types";
import { readViewState, writeViewState } from "@/lib/standards-graph/url-state";
import { createDataClient, createLayoutClient, type DataClient, type LayoutClient } from "@/lib/standards-graph/worker-client";
import ComparisonPanel from "./ComparisonPanel";
import { ExplorerContext, useExplorer, type ExplorerContextValue, type PanelSize } from "./context";
import EdgeDetails from "./EdgeDetails";
import ExportMenu, { ShareButton } from "./ExportMenu";
import FilterPanel from "./FilterPanel";
import GraphStatus from "./GraphStatus";
import GraphToolbar from "./GraphToolbar";
import type { GraphViewportHandle } from "./GraphViewport";
import NodeDetails from "./NodeDetails";
import SearchBox from "./SearchBox";
import { RelationsTable, StandardsTable } from "./Tables";
import { describeFilters, fmt, HIERARCHY_NOTE, INFERENCE_NOTE, LAYOUT_NOTE } from "./text";
import { IconButton, Spinner } from "./ui";

const GraphViewport = dynamic(() => import("./GraphViewport"), {
  ssr: false,
  loading: () => <CenterMessage spinner>화면 표시 준비 중…</CenterMessage>,
});

const TITLE = "성취기준 연결 탐색기";

// ── 공통 조각 ─────────────────────────────────────────────────

function CenterMessage({ children, spinner }: { children: ReactNode; spinner?: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-[14px] text-gray-500">
      {spinner && <Spinner />}
      {children}
    </div>
  );
}

class GraphErrorBoundary extends Component<{ children: ReactNode; onShowTable: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <CenterMessage>
        <p className="font-semibold text-gray-800">Graph를 표시하지 못했습니다.</p>
        <p className="text-[13px]">목록 보기에서 같은 검색·조건·상세를 계속 사용할 수 있습니다.</p>
        <div className="flex gap-2">
          <button type="button" onClick={this.props.onShowTable} className="min-h-11 rounded-lg bg-red-600 px-4 text-[14px] font-semibold text-white">
            목록 보기
          </button>
          <button type="button" onClick={() => this.setState({ error: null })} className="min-h-11 rounded-lg border border-gray-200 px-4 text-[14px] text-gray-700">
            다시 시도
          </button>
        </div>
      </CenterMessage>
    );
  }
}

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

// ── 로딩 ──────────────────────────────────────────────────────

type Phase = { stage: LoadStage | "render" } | { stage: "error"; error: EngineErrorInfo };

const STEPS: { stage: LoadStage | "render"; label: string }[] = [
  { stage: "read", label: "데이터 읽기" },
  { stage: "prepare", label: "관계 준비" },
  { stage: "render", label: "화면 표시" },
];

const ASSET_LABEL: Record<string, string> = {
  manifest: "버전 정보(manifest)",
  nodes: "성취기준 파일",
  edges: "관계 파일",
  layout: "배치 파일",
};

function LoadingShell({ phase, onRetry }: { phase: Phase; onRetry: () => void }) {
  const current = STEPS.findIndex((s) => s.stage === phase.stage);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
        <h1 className="shrink-0 text-[17px] font-bold text-gray-900">{TITLE}</h1>
        <div className="flex h-11 w-full max-w-[520px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-[14px] text-gray-400">
          코드·본문 검색 (데이터 준비 중)
        </div>
      </div>
      <div className="relative flex-1">
        {phase.stage === "error" ? (
          <CenterMessage>
            <p className="text-[15px] font-semibold text-gray-800">
              {phase.error.code === "NETWORK"
                ? "데이터를 받지 못했습니다."
                : phase.error.code === "VERSION_MISMATCH"
                  ? "두 데이터의 버전이 맞지 않아 Graph를 만들지 않았습니다."
                  : "데이터를 확인하는 중 문제가 발견되었습니다."}
            </p>
            <p className="text-[13px]">
              {phase.error.message}
              {phase.error.asset ? ` (실패한 자산: ${ASSET_LABEL[phase.error.asset] ?? phase.error.asset})` : ""}
            </p>
            {phase.error.versions && (
              <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 rounded-lg bg-white px-4 py-2 text-left text-[12px]">
                {Object.entries(phase.error.versions).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-gray-500">{k}</dt>
                    <dd className="font-mono text-gray-800">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {phase.error.issues && phase.error.issues.length > 0 && (
              <ul className="max-h-60 w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-3 text-left text-[12px]">
                {phase.error.issues.map((i, n) => (
                  <li key={n} className="border-b border-gray-100 py-1 last:border-0">
                    <span className="font-mono font-semibold text-red-700">{i.code}</span>
                    {i.itemId && <span className="ml-2 font-mono text-gray-700">{i.itemId}</span>}
                    {i.field && <span className="ml-2 text-gray-500">field: {i.field}</span>}
                    <p className="text-gray-600">{i.message}</p>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={onRetry} className="min-h-11 rounded-lg bg-red-600 px-5 text-[14px] font-semibold text-white hover:bg-red-700">
              다시 시도
            </button>
          </CenterMessage>
        ) : (
          <CenterMessage spinner>
            <ol className="flex items-center gap-2 text-[13px]" aria-live="polite">
              {STEPS.map((s, i) => (
                <li key={s.stage} className={`flex items-center gap-2 ${i === current ? "font-semibold text-gray-900" : i < current ? "text-gray-500" : "text-gray-300"}`}>
                  {i > 0 && <span aria-hidden>→</span>}
                  {s.label}
                </li>
              ))}
            </ol>
          </CenterMessage>
        )}
      </div>
    </div>
  );
}

// ── 진입점 ────────────────────────────────────────────────────

interface Loaded {
  summary: GraphSummary;
  data: DataClient;
  layout: LayoutClient;
}

export default function StandardsGraphClient({ renderWorkspace }: { renderWorkspace?: (graph: ReactNode) => ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useWidth(rootRef);
  const size: PanelSize = width === 0 || width >= 1100 ? "wide" : width >= 700 ? "medium" : "narrow";
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>({ stage: "read" });
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const data = createDataClient(MANIFEST_URL);
    const layout = createLayoutClient();
    let alive = true;
    data.load((stage) => alive && setPhase({ stage })).then(
      (summary) => {
        if (!alive) return;
        setLoaded({ summary, data, layout });
        setPhase({ stage: "render" });
      },
      (err: unknown) => {
        if (!alive) return;
        setPhase({
          stage: "error",
          error: err instanceof EngineError ? err.info : { code: "NETWORK", message: err instanceof Error ? err.message : String(err) },
        });
      },
    );
    return () => {
      alive = false;
      data.dispose();
      layout.dispose();
    };
  }, [attempt]);

  const retry = () => {
    setLoaded(null);
    setPhase({ stage: "read" });
    setAttempt((a) => a + 1);
  };

  return (
    <div ref={rootRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-gray-50">
      {loaded ? <Explorer key={attempt} {...loaded} size={size} renderWorkspace={renderWorkspace} /> : <LoadingShell phase={phase} onRetry={retry} />}
    </div>
  );
}

// ── localStorage (datasetVersion 별, 실패해도 화면은 정상 동작) ──

interface Persisted {
  overrides: Record<LayoutMode, Positions>;
  pins: Record<LayoutMode, string[]>;
  rightCollapsed: boolean;
}

const emptyPersisted = (): Persisted => ({
  overrides: { subject: {}, relations: {} },
  pins: { subject: [], relations: [] },
  rightCollapsed: false,
});

function readPersisted(key: string): Persisted {
  const empty = emptyPersisted();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return empty;
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      overrides: { ...empty.overrides, ...p.overrides },
      pins: { ...empty.pins, ...p.pins },
      rightCollapsed: !!p.rightCollapsed,
    };
  } catch {
    return empty;
  }
}

// ── 탐색기 본체 ───────────────────────────────────────────────

type ViewModel = {
  elements: ReturnType<typeof buildOverviewElements>;
  positions: Positions;
  layoutKey: string;
  nodeIds: string[];
  edgeIds: string[];
};

function Explorer({ summary, data: client, layout: layoutClient, size, renderWorkspace }: Loaded & { size: PanelSize; renderWorkspace?: (graph: ReactNode) => ReactNode }) {
  const index = useMemo(() => buildGraphIndex(summary), [summary]);
  const compact = size === "narrow";
  const neighborStep = compact ? NEIGHBOR_STEP.compact : NEIGHBOR_STEP.desktop;
  const labelLimit = compact ? 30 : 100;
  const dv = summary.datasetVersion;

  const [restored] = useState(() =>
    readViewState(new URLSearchParams(window.location.search), index, dv, compact),
  );
  const [state, dispatch] = useReducer(graphReducer, restored.state);
  const [notices, setNotices] = useState<string[]>(() => {
    const out: string[] = [];
    if (restored.versionChanged) {
      out.push(`공유 링크의 데이터 버전(${restored.versionChanged})을 제공할 수 없어 현재 버전(${dv})으로 전환했습니다.`);
    }
    if (restored.missing.length) {
      out.push(`찾을 수 없는 항목을 빼고 화면을 복원했습니다: ${restored.missing.join(", ")}`);
    }
    return out;
  });
  const addNotice = useCallback((n: string) => setNotices((list) => (list.includes(n) ? list : [...list, n])), []);

  // 학습 흐름 layout 엔진은 화면이 한가할 때 Worker 에 미리 불러 둔다
  useEffect(() => {
    const timer = setTimeout(warmUpLayered, 1500);
    return () => {
      clearTimeout(timer);
      disposeLayered();
    };
  }, []);

  // URL 동기화 — 탐색기와 무관한 파라미터는 그대로 둔다
  const syncUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    writeViewState(params, state, dv);
    const url = `${window.location.pathname}?${params.toString()}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [state, dv]);
  useEffect(() => {
    const t = setTimeout(syncUrl, 250);
    return () => clearTimeout(t);
  }, [syncUrl]);

  // 위치·pin·panel 상태
  const key = storageKey(dv);
  const [persist, setPersist] = useState<Persisted>(() => readPersisted(key));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(persist));
    } catch {
      // 저장소를 쓸 수 없는 환경 — 화면 동작에는 영향 없음
    }
  }, [key, persist]);

  const pinned = useMemo(() => new Set(persist.pins[state.layoutMode]), [persist.pins, state.layoutMode]);

  // 기본 배치: 빌드 시 계산한 overview-layout.json, 없으면 브라우저에서 한 번 계산
  const [fallbackLayout, setFallbackLayout] = useState<Partial<Record<LayoutMode, Positions>>>({});
  const filePositions = summary.layout?.layouts[state.layoutMode];
  const basePositions = useMemo<Positions | null>(() => {
    if (filePositions) return Object.fromEntries(Object.entries(filePositions).map(([id, [x, y]]) => [id, { x, y }]));
    return fallbackLayout[state.layoutMode] ?? null;
  }, [filePositions, fallbackLayout, state.layoutMode]);

  useEffect(() => {
    if (filePositions || fallbackLayout[state.layoutMode]) return;
    let alive = true;
    const mode = state.layoutMode;
    const byId = (a: { id: string }, b: { id: string }) => codeCompare(a.id, b.id);
    const nodes = [...index.nodes].sort(byId).map((n) => ({ id: n.id, subject: n.subject }));
    const edges = index.edges
      .filter((e) => e.weight >= LAYOUT_MIN_WEIGHT)
      .sort(byId)
      .map((e) => ({ source: e.source, target: e.target, weight: e.weight }));
    layoutClient.force(nodes, edges, { mode, subjectOrder: SUBJECT_ORDER }).then(
      (pos) => alive && pos && setFallbackLayout((f) => ({ ...f, [mode]: pos })),
      () => alive && addNotice("배치를 계산하지 못했습니다. 목록 보기는 계속 사용할 수 있습니다."),
    );
    if (!summary.layout) addNotice("저장된 배치 파일을 쓰지 못해 배치를 새로 계산했습니다.");
    return () => {
      alive = false;
    };
  }, [filePositions, fallbackLayout, state.layoutMode, index, layoutClient, summary.layout, addNotice]);

  const overviewPositions = useMemo<Positions | null>(
    () => (basePositions ? { ...basePositions, ...persist.overrides[state.layoutMode] } : null),
    [basePositions, persist.overrides, state.layoutMode],
  );

  // ── 화면별 표시 후보 ──
  const overview = useMemo(() => selectOverview(index, state.filters), [index, state.filters]);

  const focus = useMemo(
    () =>
      state.mode === "focus" && state.focusNodeId
        ? selectFocus(index, state.filters, state.focusNodeId, {
            hops: state.hops,
            limit: state.neighborLimit,
            showNeighborEdges: state.showNeighborEdges,
          })
        : null,
    [index, state.mode, state.focusNodeId, state.filters, state.hops, state.neighborLimit, state.showNeighborEdges],
  );

  const hier = useMemo(
    () =>
      state.mode === "hierarchy"
        ? selectHierarchy(index, state.filters, {
            minimumWeight: state.hierarchyMinimumWeight,
            includeCrossSubject: state.hierarchyIncludeCrossSubject,
            centerId: state.focusNodeId,
            depth: state.hierarchyDepth,
          })
        : null,
    [index, state.mode, state.filters, state.hierarchyMinimumWeight, state.hierarchyIncludeCrossSubject, state.focusNodeId, state.hierarchyDepth],
  );
  const hierarchyTotal = useMemo(() => toDirected(index, state.hierarchyMinimumWeight).length, [index, state.hierarchyMinimumWeight]);

  const [hierLayout, setHierLayout] = useState<{ for: typeof hier; seq: number; layout?: LayeredLayout; error?: string } | null>(null);
  const [hierRetry, setHierRetry] = useState(0);
  useEffect(() => {
    if (!hier || hier.cycle) return;
    let alive = true;
    layoutLayered(hier.nodeIds, hier.edges).then(
      (layout) => alive && setHierLayout((prev) => ({ for: hier, seq: (prev?.seq ?? 0) + 1, layout })),
      (err: unknown) =>
        alive && setHierLayout((prev) => ({ for: hier, seq: prev?.seq ?? 0, error: err instanceof Error ? err.message : String(err) })),
    );
    return () => {
      alive = false;
    };
  }, [hier, hierRetry]);
  const hierReady = hierLayout && hierLayout.for === hier ? hierLayout : null;

  const [relayoutSeq, setRelayoutSeq] = useState(0);
  const view = useMemo<ViewModel | null>(() => {
    if (state.mode === "overview" && overviewPositions) {
      return {
        elements: buildOverviewElements(index, overview, state.filters, overviewPositions),
        positions: overviewPositions,
        layoutKey: `overview:${state.layoutMode}:${relayoutSeq}`,
        nodeIds: overview.nodeIds,
        edgeIds: overview.edgeIds,
      };
    }
    if (state.mode === "focus" && focus) {
      const positions = layoutFocus(focus);
      return {
        elements: buildFocusElements(index, focus, state.filters, positions),
        positions,
        layoutKey: `focus:${focus.nodeIds.join("|")}`,
        nodeIds: focus.nodeIds,
        edgeIds: focus.edgeIds,
      };
    }
    if (state.mode === "hierarchy" && hier && hierReady?.layout) {
      return {
        elements: buildHierarchyElements(index, hier, hierReady.layout, (m) => console.warn(`[standards-graph] ${m}`)),
        positions: hierReady.layout.positions,
        layoutKey: `hierarchy:${hierReady.seq}`,
        nodeIds: hier.nodeIds,
        edgeIds: hier.edges.map((e) => e.id),
      };
    }
    return null;
  }, [state.mode, state.filters, state.layoutMode, overviewPositions, overview, focus, hier, hierReady, index, relayoutSeq]);

  const displayed = useMemo(
    () => new Set(state.mode === "table" ? overview.nodeIds : (view?.nodeIds ?? [])),
    [state.mode, overview, view],
  );

  // ── 선택·panel ──
  const [panelTab, setPanelTab] = useState<"details" | "compare">("details");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tableTab, setTableTab] = useState<"standards" | "relations">("standards");
  const [centerRequest, setCenterRequest] = useState<{ id: string; seq: number } | null>(null);
  const [focusDetailsSeq, setFocusDetailsSeq] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const viewportRef = useRef<GraphViewportHandle | null>(null);

  const selectionKey = `${state.selectedNodeId}|${state.selectedEdgeId}`;
  const [seenSelection, setSeenSelection] = useState(selectionKey);
  if (seenSelection !== selectionKey) {
    // 새로 고른 대상은 상세 탭에서 보여 주고, 접힌 panel 을 다시 연다
    setSeenSelection(selectionKey);
    setPanelTab("details");
    if (persist.rightCollapsed && (state.selectedNodeId || state.selectedEdgeId)) setPersist((p) => ({ ...p, rightCollapsed: false }));
  }
  const compareCount = state.comparisonNodeIds.length;
  const [seenCompare, setSeenCompare] = useState(compareCount);
  if (seenCompare !== compareCount) {
    setSeenCompare(compareCount);
    if (compareCount === 2) setPanelTab("compare");
    if (compareCount === 0) setPanelTab("details");
  }

  useEffect(() => {
    if (!focusDetailsSeq) return;
    const id = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [focusDetailsSeq]);

  const revealNode = useCallback((id: string, opts?: { focusDetails?: boolean }) => {
    setCenterRequest((r) => ({ id, seq: (r?.seq ?? 0) + 1 }));
    if (opts?.focusDetails) setFocusDetailsSeq((s) => s + 1);
  }, []);

  const unpin = useCallback(
    (id: string | null) =>
      setPersist((p) => ({
        ...p,
        pins: { ...p.pins, [state.layoutMode]: id ? p.pins[state.layoutMode].filter((x) => x !== id) : [] },
      })),
    [state.layoutMode],
  );

  const ctx: ExplorerContextValue = {
    index,
    state,
    dispatch,
    client,
    size,
    overview,
    displayed,
    neighborStep,
    pinned,
    unpin,
    revealNode,
  };

  // ── 재배치 ──
  const [relayoutBusy, setRelayoutBusy] = useState(false);
  const relayout = async () => {
    if (!overviewPositions) return;
    setRelayoutBusy(true);
    const mode = state.layoutMode;
    try {
      const nodes = overview.nodeIds.map((id) => ({
        id,
        subject: index.nodeById.get(id)!.subject,
        x: overviewPositions[id]?.x,
        y: overviewPositions[id]?.y,
        fixed: pinned.has(id),
      }));
      const edges = overview.edgeIds.map((id) => {
        const e = index.edgeById.get(id)!;
        return { source: e.source, target: e.target, weight: effectiveWeightOf(e, state.filters) };
      });
      const result = await layoutClient.force(nodes, edges, { mode, subjectOrder: SUBJECT_ORDER });
      if (!result) return;
      setPersist((p) => ({ ...p, overrides: { ...p.overrides, [mode]: { ...p.overrides[mode], ...result } } }));
      setRelayoutSeq((s) => s + 1);
    } catch {
      addNotice("재배치에 실패해 마지막 배치를 유지합니다. 잠시 후 다시 시도하세요.");
    } finally {
      setRelayoutBusy(false);
    }
  };
  const resetLayout = () => {
    setPersist((p) => ({
      ...p,
      overrides: { ...p.overrides, [state.layoutMode]: {} },
      pins: { ...p.pins, [state.layoutMode]: [] },
    }));
    setRelayoutSeq((s) => s + 1);
  };
  const onDragFree = (id: string, pos: { x: number; y: number }) => {
    if (state.mode !== "overview") return;
    const mode = state.layoutMode;
    setPersist((p) => ({
      ...p,
      overrides: { ...p.overrides, [mode]: { ...p.overrides[mode], [id]: pos } },
      pins: { ...p.pins, [mode]: p.pins[mode].includes(id) ? p.pins[mode] : [...p.pins[mode], id] },
    }));
  };

  // ── 공유·내보내기 ──
  const share = async () => {
    syncUrl();
    try {
      await navigator.clipboard.writeText(window.location.href);
      return true;
    } catch {
      return false;
    }
  };

  const modeLabel = { overview: "전체 보기", focus: "중심 탐색", hierarchy: "학습 흐름", table: "목록" }[state.mode];
  const conditionText =
    state.mode === "hierarchy"
      ? `학습 위계 점수 ${state.hierarchyMinimumWeight} 이상 · ${state.filters.subjects.length ? state.filters.subjects.join("·") : "전체 교과"}${state.focusNodeId ? ` · 중심 ${state.focusNodeId}` : ""}`
      : `${describeFilters(state.filters)}${state.mode === "focus" && state.focusNodeId ? ` · 중심 ${state.focusNodeId} · ${state.hops}-hop` : ""}`;

  const exportJson = async (scope: "visible" | "matching") => {
    let nodeIds: string[];
    let edgeIds: string[];
    if (state.mode === "focus" && focus) {
      const r =
        scope === "visible"
          ? focus
          : selectFocus(index, state.filters, focus.centerId, { hops: state.hops, limit: Infinity, showNeighborEdges: state.showNeighborEdges });
      nodeIds = r.nodeIds;
      edgeIds = r.edgeIds;
    } else if (state.mode === "hierarchy" && hier) {
      nodeIds = hier.nodeIds;
      edgeIds = hier.edges.map((e) => e.id);
    } else {
      nodeIds = overview.nodeIds;
      edgeIds = overview.edgeIds;
    }
    const { nodes, edges } = await client.exportItems(nodeIds, edgeIds);
    const hierarchyMode = state.mode === "hierarchy";
    const json = buildJsonExport({
      datasetVersion: dv,
      schemaVersion: summary.schemaVersion,
      mode: state.mode,
      scope,
      scopeDescription: `${modeLabel} · ${conditionText}`,
      filters: state.filters,
      hierarchy: hierarchyMode
        ? { minimumWeight: state.hierarchyMinimumWeight, includeCrossSubject: state.hierarchyIncludeCrossSubject, depth: state.hierarchyDepth }
        : undefined,
      focusNodeId: state.focusNodeId,
      nodes,
      edges,
      effectiveWeight: Object.fromEntries(
        edges.map((e) => [e.id, hierarchyMode ? e.dimension_weights.learning_hierarchy : effectiveWeightOf(index.edgeById.get(e.id)!, state.filters)]),
      ),
      direction: hierarchyMode
        ? Object.fromEntries(
            edges.filter((e) => e.learning_hierarchy).map((e) => [e.id, { from: e.learning_hierarchy!.foundation, to: e.learning_hierarchy!.application }]),
          )
        : undefined,
    });
    downloadBlob(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }), exportFileName("json", dv));
  };

  const exportPng = async (full: boolean) => {
    const handle = viewportRef.current;
    if (!handle || !view) throw new Error("Graph 화면이 준비되지 않았습니다.");
    const graph = await handle.png(full);
    const legend: PngLegendItem[] =
      state.mode === "hierarchy"
        ? [{ label: "학습 위계 (foundation → application)", color: RELATION_COLORS.learning_hierarchy, kind: "line" }]
        : state.filters.relationTypes.map((t) => ({
            label: RELATION_LABELS[t],
            color: RELATION_COLORS[t],
            kind: RELATION_LINE_STYLES[t] === "solid" ? "line" : RELATION_LINE_STYLES[t],
          }));
    const blob = await composePng({
      graph,
      title: `${TITLE} — ${modeLabel}`,
      conditions: [
        conditionText,
        `표시: 성취기준 ${fmt(view.nodeIds.length)} · 관계 ${fmt(view.edgeIds.length)} · ${full ? "화면 맞춤" : "현재 viewport"} · 데이터 버전 ${dv}`,
      ],
      legend,
      note: `${state.mode === "hierarchy" ? HIERARCHY_NOTE : INFERENCE_NOTE} 선 두께는 관계 점수(1–5)이며 학생 성취도나 확률이 아닙니다. ${LAYOUT_NOTE}`,
    });
    downloadBlob(blob, exportFileName("png", dv));
  };

  // ── 상태 표시줄 ──
  const status = useMemo(() => {
    const notes: string[] = [];
    let text = "";
    if (state.mode === "focus" && focus) {
      text = `중심 ${focus.centerId} · 1-hop ${fmt(focus.shownFirst.length)} / ${fmt(focus.firstHop.length)}`;
      if (state.hops === 2) text += ` · 2-hop ${fmt(focus.shownSecond.length)} / ${fmt(focus.secondHopTotal)}`;
      text += ` · 관계 ${fmt(focus.edgeIds.length)}`;
      if (focus.shownFirst.length < focus.firstHop.length) {
        notes.push(`조건에 맞는 ${fmt(focus.firstHop.length)}개 중 ${fmt(focus.shownFirst.length)}개 표시 — 상세의 연결 목록에서 전체를 볼 수 있습니다`);
      }
      if (focus.centerOutOfFilter) notes.push("중심 기준은 비교를 위해 유지");
    } else if (state.mode === "hierarchy" && hier) {
      text = `학습 연결 ${fmt(hier.edges.length)} / ${fmt(hierarchyTotal)} · 성취기준 ${fmt(hier.nodeIds.length)}`;
    } else {
      text = `성취기준 ${fmt(overview.nodeIds.length)} / ${fmt(index.nodes.length)} · 관계 ${fmt(overview.edgeIds.length)} / ${fmt(index.edges.length)}`;
      if (overview.noTypes) notes.push("관계 유형을 선택하세요");
      else if (overview.isolated.size) notes.push(`현재 조건에 맞는 관계 없음 ${fmt(overview.isolated.size)}개 (옅게 표시)`);
      if (overview.external.size) notes.push(`직접 연결된 타 교과 ${fmt(overview.external.size)}개 포함`);
    }
    return { text, notes };
  }, [state.mode, state.hops, focus, hier, hierarchyTotal, overview, index]);

  const activeFilterCount =
    state.filters.subjects.length +
    state.filters.domains.length +
    (state.filters.relationTypes.length !== 4 ? 1 : 0) +
    (state.filters.subjectRelation !== "all" ? 1 : 0);

  // ── 중앙 영역 ──
  const graphMode = state.mode === "table" ? null : state.mode;
  let centerOverlay: ReactNode = null;
  if (state.mode === "focus" && !state.focusNodeId) {
    centerOverlay = (
      <CenterMessage>
        <p className="font-semibold text-gray-800">중심으로 볼 성취기준을 고르세요.</p>
        <p className="text-[13px]">검색하거나 전체 보기에서 성취기준을 누른 뒤 “이 기준 중심으로 보기”를 선택합니다.</p>
      </CenterMessage>
    );
  } else if (state.mode === "hierarchy" && hier?.cycle) {
    centerOverlay = (
      <CenterMessage>
        <p className="font-semibold text-gray-800">학습 연결에 순환(cycle)이 있어 자동 배치를 중단했습니다.</p>
        <p className="text-[13px]">관련 코드: {hier.cycle.join(", ")}</p>
        <p className="text-[12px]">원본의 학습 방향은 바꾸지 않았습니다. 목록 보기와 상세는 계속 사용할 수 있습니다.</p>
      </CenterMessage>
    );
  } else if (state.mode === "hierarchy" && hierLayout?.for === hier && hierLayout?.error) {
    centerOverlay = (
      <CenterMessage>
        <p className="font-semibold text-gray-800">학습 흐름 배치를 계산하지 못했습니다.</p>
        <p className="text-[12px]">{hierLayout.error}</p>
        <button type="button" onClick={() => setHierRetry((n) => n + 1)} className="min-h-11 rounded-lg bg-red-600 px-4 text-[14px] font-semibold text-white">
          다시 시도
        </button>
      </CenterMessage>
    );
  } else if (state.mode === "hierarchy" && hier && !hier.centerId && hier.edges.length === 0) {
    centerOverlay = <CenterMessage>현재 조건에 맞는 학습 연결이 없습니다. 학습 위계 점수 기준을 낮추거나 교과를 바꿔 보세요.</CenterMessage>;
  } else if (graphMode && !view) {
    centerOverlay = <CenterMessage spinner>{state.mode === "hierarchy" ? "학습 흐름 배치 계산 중…" : "배치 준비 중…"}</CenterMessage>;
  }

  const showGraph = !!graphMode && !(state.mode === "focus" && !state.focusNodeId) && !(state.mode === "hierarchy" && hier?.cycle);

  // overview 에서 조건에 맞는 관계가 하나도 없을 때의 완화 control
  const emptyEdgesHint =
    state.mode === "overview" && view && overview.edgeIds.length === 0 ? (
      <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-xl border border-gray-200 bg-white/95 px-4 py-2.5 text-center shadow-md">
        <p className="text-[13px] text-gray-700">{overview.noTypes ? "관계 유형을 선택하세요." : "현재 조건에 맞는 관계가 없습니다."}</p>
        <button
          type="button"
          onClick={() =>
            overview.noTypes
              ? dispatch({ type: "SET_TYPES", relationTypes: ["content", "competency", "learning_hierarchy", "other"] })
              : dispatch({ type: "SET_MIN_WEIGHT", weight: Math.max(1, state.filters.minimumWeight - 1) as Weight })
          }
          className="mt-1 min-h-9 text-[13px] font-medium text-red-600 hover:underline"
        >
          {overview.noTypes ? "모든 유형 선택" : `관계 점수 기준을 ${Math.max(1, state.filters.minimumWeight - 1)} 이상으로 낮추기`}
        </button>
      </div>
    ) : null;

  const center = (
    <div className="relative min-h-0 min-w-0 flex-1 bg-white">
      {state.mode === "table" ? (
        tableTab === "standards" ? <StandardsTable /> : <RelationsTable />
      ) : (
        <>
          {showGraph && (
            <GraphErrorBoundary onShowTable={() => dispatch({ type: "SET_MODE", mode: "table" })}>
              <GraphViewport
                mode={graphMode!}
                elements={view?.elements ?? []}
                layoutKey={view?.layoutKey ?? "empty"}
                positions={view?.positions ?? {}}
                selectedNodeId={state.selectedNodeId}
                selectedEdgeId={state.selectedEdgeId}
                focusNodeId={state.focusNodeId}
                comparisonNodeIds={state.comparisonNodeIds}
                pinned={pinned}
                labelLimit={labelLimit}
                subjectTitles={state.mode === "overview" && state.layoutMode === "subject"}
                centerRequest={centerRequest}
                lookup={(id) => index.nodeById.get(id)}
                onReady={(h) => {
                  viewportRef.current = h;
                }}
                onNodeTap={(id) => dispatch({ type: "SELECT_NODE", id })}
                onEdgeTap={(edgeId) => dispatch({ type: "SELECT_EDGE", id: edgeId })}
                onNodeDragFree={onDragFree}
              />
            </GraphErrorBoundary>
          )}
          {centerOverlay}
          {emptyEdgesHint}
          {state.mode === "hierarchy" && view && (
            <p className="absolute left-3 top-3 z-10 rounded-lg bg-amber-50/95 px-3 py-1.5 text-[12px] font-medium text-amber-800 shadow-sm">
              {HIERARCHY_NOTE}
              {hier?.centerHasNoLinks && <span className="ml-1 font-semibold">· 이 기준에는 기록된 학습 연결 없음</span>}
            </p>
          )}
          {showGraph && view && (
            <div className="absolute bottom-3 left-3 z-10 flex gap-1.5">
              <IconButton label="확대" onClick={() => viewportRef.current?.zoomBy(1.25)}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
              </IconButton>
              <IconButton label="축소" onClick={() => viewportRef.current?.zoomBy(0.8)}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 12h14" /></svg>
              </IconButton>
              <IconButton label="화면 맞춤" onClick={() => viewportRef.current?.fit()}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
              </IconButton>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ── 오른쪽 panel ──
  const hasSelection = !!(state.selectedNodeId || state.selectedEdgeId);
  const panelBody = (
    <RightPanel
      tab={panelTab}
      onTab={setPanelTab}
      headingRef={headingRef}
      onClose={() => setPersist((p) => ({ ...p, rightCollapsed: true }))}
    />
  );
  let right: ReactNode = null;
  if (size === "wide") {
    right = persist.rightCollapsed ? (
      <div className="flex w-11 shrink-0 flex-col items-center border-l border-gray-200 bg-white pt-2">
        <IconButton label="상세 panel 펼치기" onClick={() => setPersist((p) => ({ ...p, rightCollapsed: false }))}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </IconButton>
      </div>
    ) : (
      <aside
        aria-label="상세"
        className={`flex shrink-0 flex-col border-l border-gray-200 bg-white ${panelTab === "compare" ? "w-[560px]" : "w-[360px]"}`}
      >
        {panelBody}
      </aside>
    );
  } else if ((hasSelection || panelTab === "compare") && !persist.rightCollapsed) {
    right =
      size === "medium" ? (
        <aside aria-label="상세" className="absolute inset-y-0 right-0 z-20 flex w-[380px] max-w-[92%] flex-col border-l border-gray-200 bg-white shadow-2xl">
          {panelBody}
        </aside>
      ) : (
        <aside aria-label="상세" className="absolute inset-x-0 bottom-0 z-20 flex max-h-[60%] flex-col rounded-t-2xl border-t border-gray-200 bg-white shadow-2xl">
          {panelBody}
        </aside>
      );
  }

  const graph = (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={`flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5 ${compact ? "flex-wrap" : "min-h-16"}`}>
          <h1 className="shrink-0 text-[17px] font-bold text-gray-900">{TITLE}</h1>
          <div className={`flex min-w-0 justify-center ${compact ? "order-last w-full" : "flex-1 px-2"}`}>
            <SearchBox />
          </div>
          <div className="ml-auto flex shrink-0 gap-1.5">
            <ShareButton onShare={share} />
            <ExportMenu
              onJson={exportJson}
              onPng={exportPng}
              pngAvailable={showGraph && !!view}
              limited={state.mode === "focus" && !!focus && (focus.shownFirst.length < focus.firstHop.length || focus.shownSecond.length < focus.secondHopTotal)}
            />
          </div>
        </div>

        <GraphToolbar
          onToggleFilters={size === "wide" ? undefined : () => setFiltersOpen((v) => !v)}
          filtersOpen={filtersOpen}
          activeFilterCount={activeFilterCount}
          relayoutBusy={relayoutBusy}
          onRelayout={relayout}
          onResetLayout={resetLayout}
          pinCount={pinned.size}
          onUnpinAll={() => unpin(null)}
          focusStats={focus ? { shown: focus.shownFirst.length, total: focus.firstHop.length, displayedNodes: focus.nodeIds.length } : null}
          hierarchyCanExpand={!!hier?.canExpand}
          tableTab={tableTab}
          onTableTab={setTableTab}
        />

        {notices.length > 0 && (
          <div className="shrink-0 space-y-1 border-b border-amber-200 bg-amber-50 px-4 py-2">
            {notices.map((n) => (
              <div key={n} className="flex items-start gap-2 text-[13px] text-amber-900">
                <p className="flex-1">{n}</p>
                <button type="button" onClick={() => setNotices((l) => l.filter((x) => x !== n))} className="shrink-0 text-[12px] font-medium text-amber-700 hover:underline">
                  닫기
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex min-h-0 flex-1">
          {size === "wide" ? (
            <aside aria-label="필터" className="w-64 shrink-0 border-r border-gray-200 bg-white">
              <FilterPanel />
            </aside>
          ) : (
            filtersOpen && (
              <>
                <div className="absolute inset-0 z-30 bg-black/20" onClick={() => setFiltersOpen(false)} aria-hidden />
                <aside aria-label="필터" className="absolute inset-y-0 left-0 z-40 w-[300px] max-w-[88%] bg-white shadow-2xl">
                  <FilterPanel onClose={() => setFiltersOpen(false)} />
                </aside>
              </>
            )
          )}
          {center}
          {right}
        </div>

        <GraphStatus summary={status.text} notes={status.notes} hierarchy={state.mode === "hierarchy"} />
      </div>
  );
  return <ExplorerContext.Provider value={ctx}>{renderWorkspace ? renderWorkspace(graph) : graph}</ExplorerContext.Provider>;
}

// ── 오른쪽 panel 내용 ────────────────────────────────────────

function RightPanel({
  tab,
  onTab,
  headingRef,
  onClose,
}: {
  tab: "details" | "compare";
  onTab: (t: "details" | "compare") => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}) {
  const { state, dispatch, index } = useExplorer();
  const tabClass = (on: boolean) =>
    `min-h-10 flex-1 rounded-md text-[13px] font-semibold transition ${on ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`;

  let body: ReactNode;
  if (tab === "compare") body = <ComparisonPanel />;
  else if (state.selectedEdgeId && index.edgeById.has(state.selectedEdgeId)) {
    body = (
      <EdgeDetails
        key={state.selectedEdgeId}
        id={state.selectedEdgeId}
        headingRef={headingRef}
        onBack={state.selectedNodeId ? () => dispatch({ type: "SELECT_EDGE", id: null }) : undefined}
      />
    );
  } else if (state.selectedNodeId && index.nodeById.has(state.selectedNodeId)) {
    body = <NodeDetails key={state.selectedNodeId} id={state.selectedNodeId} headingRef={headingRef} />;
  } else {
    body = (
      <div className="space-y-2 text-[13px] leading-[1.6] text-gray-500">
        <p className="font-semibold text-gray-700">선택한 성취기준</p>
        <p>Graph에서 성취기준이나 관계를 누르거나 검색 결과를 고르면 원문과 연결 근거가 여기에 표시됩니다.</p>
        <p>목록 보기에서도 같은 상세를 키보드로 열 수 있습니다.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2">
        <div role="tablist" aria-label="상세 panel" className="flex flex-1 gap-0.5 rounded-lg bg-gray-100 p-0.5">
          <button type="button" role="tab" aria-selected={tab === "details"} onClick={() => onTab("details")} className={tabClass(tab === "details")}>
            상세
          </button>
          <button type="button" role="tab" aria-selected={tab === "compare"} onClick={() => onTab("compare")} className={tabClass(tab === "compare")}>
            비교 {state.comparisonNodeIds.length}/2
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="상세 panel 접기"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{body}</div>
    </>
  );
}
