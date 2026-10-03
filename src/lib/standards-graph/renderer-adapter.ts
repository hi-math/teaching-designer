// renderer element 생성 (사양 §8.2, §9.3)
// 원본 ID 를 보존하고, renderer 에는 ID·코드·교과·스타일 속성·effective weight·위치만 담는다.

import type { ElementDefinition } from "cytoscape";
import type { HierarchyResult } from "./hierarchy";
import type { LayeredLayout } from "./layout-layered";
import { toSegments } from "./layout-layered";
import type { FocusResult } from "./neighborhood";
import { getEffectiveWeight, RELATION_LABELS, representativeType } from "./relations";
import type { GraphIndex, OverviewResult } from "./selectors";
import { subjectColor } from "./subjectPalette";
import type { GraphFilterState, LightEdge, LightNode, RelationType, Weight } from "./types";

export type Positions = Record<string, { x: number; y: number }>;

export const NODE_SIZE = { overview: 14, focus: 18, center: 22, hierarchy: 18 } as const;

function nodeData(n: LightNode, extra: Record<string, unknown>) {
  return {
    id: n.id,
    code: n.code,
    label: n.code,
    long: `${n.code}\n${n.short}`,
    subject: n.subject,
    color: subjectColor(n.subject),
    ...extra,
  };
}

/**
 * 일반 화면 edge — 굵기·투명도(w1–w5)와 색·선 모양(t-유형)은 class 로 준다.
 * edge 가 수천 개일 때 data mapper 보다 style 갱신·삭제 비용이 작다.
 */
function edgeElement(edge: LightEdge, types: readonly RelationType[]): ElementDefinition {
  const eff = (getEffectiveWeight(edge, types) || 1) as Weight;
  const rep = representativeType(edge, types) ?? "content";
  return {
    group: "edges",
    data: {
      id: edge.id,
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      w: eff,
      edgeLabel: `${eff} · ${RELATION_LABELS[rep]}`,
      cross: edge.cross ? 1 : 0,
    },
    classes: `w${eff} t-${rep}`,
  };
}

export function buildOverviewElements(
  index: GraphIndex,
  result: OverviewResult,
  filters: GraphFilterState,
  positions: Positions,
): ElementDefinition[] {
  const els: ElementDefinition[] = [];
  for (const id of result.nodeIds) {
    const n = index.nodeById.get(id)!;
    els.push({
      group: "nodes",
      data: nodeData(n, {
        size: NODE_SIZE.overview,
        isolated: result.isolated.has(id) ? 1 : 0,
        rank: result.degree.get(id) ?? 0,
      }),
      position: positions[id] ? { ...positions[id] } : { x: 0, y: 0 },
    });
  }
  for (const id of result.edgeIds) els.push(edgeElement(index.edgeById.get(id)!, filters.relationTypes));
  return els;
}

export function buildFocusElements(
  index: GraphIndex,
  result: FocusResult,
  filters: GraphFilterState,
  positions: Positions,
): ElementDefinition[] {
  const role = new Map<string, string>([[result.centerId, "center"]]);
  for (const r of result.shownFirst) role.set(r.other.id, "first");
  for (const s of result.shownSecond) role.set(s.id, "second");

  const els: ElementDefinition[] = [];
  for (const id of result.nodeIds) {
    const n = index.nodeById.get(id)!;
    const r = role.get(id)!;
    els.push({
      group: "nodes",
      data: nodeData(n, {
        size: r === "center" ? NODE_SIZE.center : NODE_SIZE.focus,
        isolated: 0,
        rank: r === "center" ? 1000 : r === "first" ? 100 : 10,
        role: r,
      }),
      position: positions[id] ? { ...positions[id] } : { x: 0, y: 0 },
    });
  }
  for (const id of result.edgeIds) els.push(edgeElement(index.edgeById.get(id)!, filters.relationTypes));
  return els;
}

/** 학습 흐름: 방향 edge 의 renderer id 는 "h:" 를 붙여 일반 edge 와 구분한다 */
export function hierarchyRendererId(edgeId: string): string {
  return `h:${edgeId}`;
}

export function buildHierarchyElements(
  index: GraphIndex,
  result: HierarchyResult,
  layout: LayeredLayout,
  onDiagnostic?: (message: string) => void,
): ElementDefinition[] {
  const els: ElementDefinition[] = [];
  for (const id of result.nodeIds) {
    const n = index.nodeById.get(id)!;
    els.push({
      group: "nodes",
      data: nodeData(n, {
        size: id === result.centerId ? NODE_SIZE.center : NODE_SIZE.hierarchy,
        isolated: 0,
        rank: id === result.centerId ? 1000 : 100,
        role: id === result.centerId ? "center" : "flow",
      }),
      position: layout.positions[id] ? { ...layout.positions[id] } : { x: 0, y: 0 },
    });
  }
  for (const e of result.edges) {
    const data: Record<string, unknown> = {
      id: hierarchyRendererId(e.id),
      edgeId: e.id,
      source: e.source,
      target: e.target,
      w: e.weight,
      edgeLabel: `${e.weight} · 학습 위계`,
    };
    const points = layout.bends[e.id];
    const s = layout.positions[e.source];
    const t = layout.positions[e.target];
    if (points?.length && s && t) {
      const seg = toSegments(s, t, points);
      if (seg) {
        data.segW = seg.weights;
        data.segD = seg.distances;
      } else {
        onDiagnostic?.(`segment 변환 실패: ${e.id}`);
      }
    }
    els.push({ group: "edges", data, classes: `w${e.weight} flow` });
  }
  return els;
}
