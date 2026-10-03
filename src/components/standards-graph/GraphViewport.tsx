"use client";

// Graph viewport — Cytoscape 인스턴스 생성·정리, element diff, 이벤트 전달 (사양 §8.2, §6)
// React 는 node 마다 DOM 을 만들지 않는다. 교과 배경 제목·tooltip·주변 관계 목록만 DOM overlay 로 그린다.

import cytoscape, {
  type Core,
  type EdgeSingular,
  type ElementDefinition,
  type EventObject,
  type NodeSingular,
  type StylesheetJson,
} from "cytoscape";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { RELATION_COLORS, RELATION_LINE_STYLES, WEIGHT_STYLES } from "@/lib/standards-graph/relations";
import type { Positions } from "@/lib/standards-graph/renderer-adapter";
import { codeCompare } from "@/lib/standards-graph/selectors";
import { RELATION_TYPES, WEIGHTS, type LightNode, type Weight } from "@/lib/standards-graph/types";
import { SubjectTag } from "./ui";

export interface GraphViewportHandle {
  zoomBy: (factor: number) => void;
  fit: () => void;
  png: (full: boolean) => Promise<Blob>;
}

export interface GraphViewportProps {
  mode: "overview" | "focus" | "hierarchy";
  elements: ElementDefinition[];
  /** 바뀌면 positions 를 모든 node 에 적용하고 화면을 맞춘다 */
  layoutKey: string;
  positions: Positions;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  focusNodeId: string | null;
  comparisonNodeIds: string[];
  pinned: Set<string>;
  /** viewport 당 자동 label 최대 수 */
  labelLimit: number;
  subjectTitles: boolean;
  centerRequest: { id: string; seq: number } | null;
  lookup: (id: string) => LightNode | undefined;
  onReady: (handle: GraphViewportHandle | null) => void;
  onNodeTap: (id: string) => void;
  onEdgeTap: (edgeId: string) => void;
  onNodeDragFree?: (id: string, position: { x: number; y: number }) => void;
}

const FONT = 'Pretendard, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const NEARBY_PX = 8;
const MAX_ZOOM = 4;
const FIT_MAX_ZOOM = 1.6;

function buildStyle(mode: GraphViewportProps["mode"]): StylesheetJson {
  return [
    {
      selector: "node",
      style: {
        width: "data(size)",
        height: "data(size)",
        "background-color": "data(color)",
        "border-width": 1,
        "border-color": "#ffffff",
        label: "",
        "font-family": FONT,
        "font-size": 10,
        color: "#1f2937",
        "text-valign": "bottom",
        "text-margin-y": 3,
        "text-outline-width": 2,
        "text-outline-color": "#ffffff",
        "min-zoomed-font-size": 8,
        "overlay-opacity": 0,
      },
    },
    {
      // 현재 조건에 맞는 관계가 없는 node: 채움 opacity 0.45 + 옅은 테두리
      selector: "node[isolated = 1]",
      style: { "background-opacity": 0.45, "border-color": "#9ca3af", "border-width": 1 },
    },
    { selector: "node.lbl", style: { label: "data(label)" } },
    {
      selector: mode === "hierarchy" ? "node.lbl, node.long" : "node.lbl.long",
      style: { label: "data(long)", "text-wrap": "wrap", "text-max-width": "116px", "text-justification": "center" },
    },
    {
      selector: "node.pinned",
      style: { "outline-width": 2, "outline-color": "#f59e0b", "outline-offset": 2, "outline-opacity": 1 },
    },
    {
      selector: "node.center",
      style: { "border-width": 3, "border-color": "#111827", label: "data(label)", "min-zoomed-font-size": 0, "font-weight": 700, "z-index": 20 },
    },
    {
      selector: "node.hover",
      style: { "border-width": 2, "border-color": "#111827", label: "data(label)", "min-zoomed-font-size": 0, "z-index": 30, "font-weight": 600 },
    },
    {
      selector: "node.sel",
      style: {
        width: 22,
        height: 22,
        "border-width": 3,
        "border-color": "#111827",
        label: "data(label)",
        "min-zoomed-font-size": 0,
        "font-weight": 700,
        "font-size": 11,
        "z-index": 40,
      },
    },
    {
      // 비교 대상은 선택 상태보다 뒤에 두어 번호 label 과 이중 테두리가 유지되게 한다
      selector: "node.cmp",
      style: {
        "border-style": "double",
        "border-width": 6,
        "border-color": "#111827",
        label: (ele: NodeSingular) => `${ele.hasClass("cmp1") ? "①" : "②"} ${ele.data("code")}`,
        "min-zoomed-font-size": 0,
        "font-weight": 700,
        "z-index": 35,
      },
    },
    {
      // 방향이 없는 일반 관계는 haystack 으로 그린다 — edge 가 수천 개여도 교차점 계산이 없어 빠르다
      selector: "edge",
      style: { "curve-style": "haystack", "haystack-radius": 0, "overlay-opacity": 0, "font-family": FONT },
    },
    ...WEIGHTS.map((w) => ({
      selector: `edge.w${w}`,
      style: { width: WEIGHT_STYLES[w].width, opacity: WEIGHT_STYLES[w].opacity },
    })),
    ...RELATION_TYPES.map((t) => ({
      selector: `edge.t-${t}`,
      style: { "line-color": RELATION_COLORS[t], "line-style": RELATION_LINE_STYLES[t] },
    })),
    {
      // 학습 흐름: foundation → application 화살표
      selector: "edge.flow",
      style: {
        "curve-style": "straight",
        "line-color": RELATION_COLORS.learning_hierarchy,
        "target-arrow-shape": "triangle",
        "target-arrow-color": RELATION_COLORS.learning_hierarchy,
        "arrow-scale": 0.9,
        opacity: 0.75,
      },
    },
    {
      selector: "edge.flow[segW]",
      style: {
        "curve-style": "segments",
        "edge-distances": "node-position",
        "segment-weights": (ele: EdgeSingular) => ele.data("segW"),
        "segment-distances": (ele: EdgeSingular) => ele.data("segD"),
      },
    },
    { selector: "edge.dim", style: { opacity: 0.05 } },
    { selector: "edge.hl", style: { opacity: 0.95, "z-index": 10 } },
    {
      selector: "edge.sel",
      style: {
        width: (ele: EdgeSingular) => WEIGHT_STYLES[ele.data("w") as Weight].width + 2.5,
        opacity: 1,
        label: "data(edgeLabel)",
        "font-size": 11,
        "font-weight": 600,
        color: "#111827",
        "text-background-color": "#ffffff",
        "text-background-opacity": 0.92,
        "text-background-padding": "2px",
        "z-index": 50,
      },
    },
  ];
}

/** 화면 상태 class — element 를 갱신할 때도 유지한다 */
const STATE_CLASSES = new Set(["sel", "center", "cmp", "cmp1", "cmp2", "pinned", "lbl", "long", "hover", "dim", "hl"]);

/** element diff: 없어진 것은 지우고, 새것은 더하고, 남은 것은 data·style class 만 갱신한다 */
function applyElements(cy: Core, elements: ElementDefinition[]) {
  const want = new Map(elements.map((e) => [String(e.data.id), e]));
  cy.batch(() => {
    // 하나씩 지우면 element 수에 비례해 느려지므로 한 번에 지운다
    cy.remove(cy.elements().filter((ele) => !want.has(ele.id())));
    const toAdd: ElementDefinition[] = [];
    for (const [id, def] of want) {
      const ele = cy.getElementById(id);
      if (ele.empty()) {
        toAdd.push(def);
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, source: _s, target: _t, ...rest } = def.data as Record<string, unknown>;
      const cur = ele.data() as Record<string, unknown>;
      const changed =
        Object.keys(rest).some((k) => cur[k] !== rest[k]) ||
        Object.keys(cur).some((k) => !(k in rest) && k !== "id" && k !== "source" && k !== "target");
      if (changed) {
        ele.removeData();
        ele.data(rest);
      }
      const kept = ele.classes().filter((c) => STATE_CLASSES.has(c));
      const next = [...kept, ...String(def.classes ?? "").split(" ").filter(Boolean)];
      if (next.join(" ") !== ele.classes().join(" ")) ele.classes(next);
    }
    if (toAdd.length) cy.add(toAdd);
  });
}

function distanceToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

type Hover =
  | { kind: "node"; id: string; x: number; y: number }
  | { kind: "edge"; label: string; x: number; y: number }
  | null;

export default function GraphViewport(props: GraphViewportProps) {
  const {
    mode,
    elements,
    layoutKey,
    positions,
    selectedNodeId,
    selectedEdgeId,
    focusNodeId,
    comparisonNodeIds,
    pinned,
    labelLimit,
    subjectTitles,
    centerRequest,
    lookup,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const frameRef = useRef<number | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [nearby, setNearby] = useState<{ x: number; y: number; items: { edgeId: string; label: string }[] } | null>(null);
  const [titles, setTitles] = useState<{ subject: string; x: number; y: number }[]>([]);

  // ── label 한도 · 교과 배경 제목 ───────────────────────────────
  const refreshOverlay = useEffectEvent(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const ext = cy.extent();
    const zoom = cy.zoom();
    const nodes = cy.nodes();
    const inView = nodes.filter((n) => {
      const p = n.position();
      return p.x >= ext.x1 && p.x <= ext.x2 && p.y >= ext.y1 && p.y <= ext.y2;
    });
    const ranked = inView
      .toArray()
      .sort((a, b) => b.data("rank") - a.data("rank") || codeCompare(a.id(), b.id()))
      .slice(0, labelLimit);
    const keep = new Set(ranked.map((n) => n.id()));
    // 중심 탐색에서 충분히 확대하면 본문 앞 24자를 덧붙인다
    const long = mode === "focus" && zoom >= 1.25;
    cy.batch(() => {
      nodes.forEach((n) => {
        n.toggleClass("lbl", keep.has(n.id()));
        n.toggleClass("long", long);
      });
    });

    if (!subjectTitles) {
      setTitles((t) => (t.length ? [] : t));
      return;
    }
    // 교과마다 node 위치의 중앙값에 둔다 (교과 밖으로 멀리 떨어진 기준에 끌려가지 않도록)
    const groups = new Map<string, { xs: number[]; ys: number[] }>();
    nodes.forEach((node) => {
      const p = node.position();
      const s = node.data("subject") as string;
      const g = groups.get(s) ?? { xs: [], ys: [] };
      g.xs.push(p.x);
      g.ys.push(p.y);
      groups.set(s, g);
    });
    const median = (v: number[]) => {
      const sorted = [...v].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    const pan = cy.pan();
    // 큰 교과부터 놓고, 이미 놓인 제목과 겹치는 제목은 생략한다
    const placed: { subject: string; x: number; y: number; w: number }[] = [];
    [...groups.entries()]
      .filter(([, g]) => g.xs.length >= 3)
      .sort((a, b) => b[1].xs.length - a[1].xs.length)
      .forEach(([subject, g]) => {
        const x = median(g.xs) * zoom + pan.x;
        const y = median(g.ys) * zoom + pan.y;
        const w = subject.length * 17 + 8;
        if (placed.every((p) => Math.abs(p.x - x) > (p.w + w) / 2 || Math.abs(p.y - y) > 30)) placed.push({ subject, x, y, w });
      });
    setTitles(placed.map(({ subject, x, y }) => ({ subject, x, y })));
  });

  const scheduleOverlay = useEffectEvent(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      refreshOverlay();
    });
  });

  // ── 이벤트 ────────────────────────────────────────────────────
  const handleNodeTap = useEffectEvent((id: string) => props.onNodeTap(id));
  const handleEdgeTap = useEffectEvent((edgeId: string) => props.onEdgeTap(edgeId));
  const handleDragFree = useEffectEvent((id: string, pos: { x: number; y: number }) => props.onNodeDragFree?.(id, pos));
  const handleReady = useEffectEvent((handle: GraphViewportHandle | null) => props.onReady(handle));

  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: buildStyle("overview"),
      minZoom: 0.05,
      maxZoom: MAX_ZOOM,
      boxSelectionEnabled: false,
      autounselectify: true,
      // pan·zoom 중에는 직전 화면을 texture 로 옮겨 그린다 (표시량은 그대로, 조작 중 표현만 단순화)
      textureOnViewport: true,
    });
    cyRef.current = cy;

    cy.on("tap", "node", (e: EventObject) => {
      setNearby(null);
      handleNodeTap(e.target.id());
    });
    // 누른 지점 가까이(8px)를 지나는 관계. 여러 개면 정확한 항목을 고르는 "주변 관계" 목록을 연다.
    const pickEdge = (e: EventObject, tapped: EdgeSingular | null) => {
      const p = e.position;
      const threshold = NEARBY_PX / cy.zoom();
      const hits: { edge: EdgeSingular; d: number }[] = [];
      cy.edges().forEach((edge) => {
        const pts = [edge.source().position(), ...(edge.data("segW") ? (edge.segmentPoints() ?? []) : []), edge.target().position()];
        let d = Infinity;
        for (let i = 1; i < pts.length; i++) d = Math.min(d, distanceToSegment(p, pts[i - 1], pts[i]));
        if (d <= threshold || edge === tapped) hits.push({ edge, d: edge === tapped ? -1 : d });
      });
      hits.sort((a, b) => a.d - b.d);
      if (hits.length === 1) {
        setNearby(null);
        handleEdgeTap(hits[0].edge.data("edgeId"));
      } else if (hits.length > 1) {
        const rp = e.renderedPosition;
        setNearby({
          x: rp.x,
          y: rp.y,
          items: hits.slice(0, 12).map(({ edge }) => ({
            edgeId: edge.data("edgeId"),
            label: `${edge.source().id()} — ${edge.target().id()} · ${edge.data("edgeLabel")}`,
          })),
        });
      } else setNearby(null);
    };
    cy.on("tap", "edge", (e: EventObject) => pickEdge(e, e.target as EdgeSingular));
    cy.on("tap", (e: EventObject) => {
      if (e.target === cy) pickEdge(e, null);
    });

    cy.on("mouseover", "node", (e: EventObject) => {
      const node = e.target as NodeSingular;
      cy.batch(() => {
        node.addClass("hover");
        cy.edges().addClass("dim");
        node.connectedEdges().removeClass("dim").addClass("hl");
      });
      const rp = node.renderedPosition();
      setHover({ kind: "node", id: node.id(), x: rp.x, y: rp.y });
    });
    cy.on("mouseout", "node", (e: EventObject) => {
      cy.batch(() => {
        (e.target as NodeSingular).removeClass("hover");
        cy.edges().removeClass("dim hl");
      });
      setHover(null);
    });
    cy.on("mouseover", "edge", (e: EventObject) => {
      const edge = e.target as EdgeSingular;
      edge.addClass("hl");
      const rp = edge.renderedMidpoint();
      setHover({ kind: "edge", label: `${edge.source().id()} — ${edge.target().id()} · ${edge.data("edgeLabel")}`, x: rp.x, y: rp.y });
    });
    cy.on("mouseout", "edge", (e: EventObject) => {
      (e.target as EdgeSingular).removeClass("hl");
      setHover(null);
    });
    cy.on("dragfree", "node", (e: EventObject) => {
      const node = e.target as NodeSingular;
      handleDragFree(node.id(), { ...node.position() });
    });
    cy.on("viewport", () => {
      setHover(null);
      setNearby(null);
      scheduleOverlay();
    });
    cy.on("position", "node", () => scheduleOverlay());

    handleReady({
      zoomBy: (factor) => {
        cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
      },
      fit: () => {
        cy.maxZoom(FIT_MAX_ZOOM);
        cy.fit(undefined, 40);
        cy.maxZoom(MAX_ZOOM);
      },
      png: (full) =>
        cy.png({ output: "blob-promise", bg: "#ffffff", full, scale: 2, maxWidth: 4096, maxHeight: 4096 }),
    });

    return () => {
      handleReady(null);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    cyRef.current?.style(buildStyle(mode));
  }, [mode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyElements(cy, elements);
    scheduleOverlay();
  }, [elements]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const p = positions[n.id()];
        if (p) n.position(p);
      });
    });
    // 기준이 몇 개뿐일 때 지나치게 확대되지 않도록 화면 맞춤의 확대 상한을 둔다
    cy.maxZoom(FIT_MAX_ZOOM);
    let restored = false;
    const restore = () => {
      if (restored || cy.destroyed()) return;
      restored = true;
      cy.maxZoom(MAX_ZOOM);
      // 애니메이션이 끝난 viewport 기준으로 label·배경 제목을 다시 계산한다
      refreshOverlay();
    };
    if (prefersReducedMotion()) {
      cy.fit(undefined, 40);
      restore();
    } else {
      cy.animate({ fit: { eles: cy.elements(), padding: 40 } }, { duration: 280, complete: restore });
    }
    scheduleOverlay();
    // complete 가 호출되지 않는 경우(애니메이션이 중단된 경우)를 대비한다
    const fallback = setTimeout(restore, 450);
    return () => clearTimeout(fallback);
    // positions 는 layoutKey 와 함께 바뀐다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // 선택·비교·pin 상태 class
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const cmp = new Map(comparisonNodeIds.map((id, i) => [id, i + 1]));
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const id = n.id();
        n.toggleClass("sel", id === selectedNodeId);
        n.toggleClass("center", id === focusNodeId && mode !== "overview");
        n.toggleClass("cmp", cmp.has(id));
        n.toggleClass("cmp1", cmp.get(id) === 1);
        n.toggleClass("cmp2", cmp.get(id) === 2);
        n.toggleClass("pinned", mode === "overview" && pinned.has(id));
      });
      cy.edges().forEach((e) => {
        e.toggleClass("sel", !!selectedEdgeId && e.data("edgeId") === selectedEdgeId);
      });
    });
  }, [elements, selectedNodeId, selectedEdgeId, focusNodeId, comparisonNodeIds, pinned, mode]);

  useEffect(() => {
    scheduleOverlay();
  }, [labelLimit, subjectTitles, mode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !centerRequest) return;
    const node = cy.getElementById(centerRequest.id);
    if (node.empty()) return;
    const zoom = Math.max(cy.zoom(), 1.1);
    if (prefersReducedMotion()) {
      cy.zoom(zoom);
      cy.center(node);
    } else {
      cy.animate({ center: { eles: node }, zoom }, { duration: 300 });
    }
  }, [centerRequest]);

  // 크기 변화 (panel 열고 닫기)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      cyRef.current?.resize();
      scheduleOverlay();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hoverNode = hover?.kind === "node" ? lookup(hover.id) : undefined;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* 교과 배경 제목 — node 가 아닌 화면 annotation 이며, canvas 뒤에 그린다 */}
      {subjectTitles && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {titles.map((t) => (
            <span
              key={t.subject}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[18px] font-bold text-gray-300"
              style={{ left: t.x, top: t.y }}
            >
              {t.subject}
            </span>
          ))}
        </div>
      )}

      {/* Cytoscape 가 container 를 position: relative 로 바꾸므로 inset 대신 크기를 직접 준다 */}
      <div ref={containerRef} className="h-full w-full" />

      {hoverNode && hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 w-72 -translate-x-1/2 rounded-lg border border-gray-200 bg-white/95 p-2.5 shadow-lg"
          style={{ left: hover.x, top: hover.y + 16 }}
        >
          <p className="text-[12px] font-semibold text-gray-900">{hoverNode.code}</p>
          <SubjectTag subject={hoverNode.subject} domain={hoverNode.domain} />
          <p className="mt-1 text-[12px] leading-[1.5] text-gray-600">{hoverNode.preview}</p>
        </div>
      )}
      {hover?.kind === "edge" && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-gray-900/90 px-2 py-1 text-[12px] text-white"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          {hover.label}
        </div>
      )}

      {nearby && (
        <div
          className="absolute z-30 w-80 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
          style={{ left: Math.max(8, nearby.x - 160), top: nearby.y + 12 }}
        >
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-[12px] font-semibold text-gray-500">주변 관계 {nearby.items.length}개</p>
            <button type="button" onClick={() => setNearby(null)} className="text-[12px] text-gray-400 hover:text-gray-700">
              닫기
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {nearby.items.map((item) => (
              <li key={item.edgeId}>
                <button
                  type="button"
                  onClick={() => {
                    setNearby(null);
                    props.onEdgeTap(item.edgeId);
                  }}
                  className="w-full rounded-lg px-2 py-2 text-left text-[12px] text-gray-700 hover:bg-gray-50"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
