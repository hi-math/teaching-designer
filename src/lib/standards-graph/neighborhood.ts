// 중심 탐색 — 1-hop·2-hop (사양 §4.2)

import {
  codeCompare,
  compareRelations,
  edgePasses,
  effectiveWeightOf,
  makeFilterContext,
  type GraphIndex,
  type NodeRelation,
} from "./selectors";
import { subjectRank } from "./subjectPalette";
import type { GraphFilterState, LightEdge } from "./types";

/** 표시 node 가 이 수를 넘으면 추가 확장을 명시적으로 선택하게 한다 */
export const FOCUS_NODE_SOFT_CAP = 150;

export interface SecondHop {
  id: string;
  /** 중심까지의 path 에서 거치는 1-hop 기준 */
  via: string;
  viaEdgeId: string;
  /** path 에서 가장 낮은 effective weight */
  bottleneck: number;
  /** 이 node 에 직접 닿는 effective weight */
  direct: number;
}

export interface FocusResult {
  centerId: string;
  /** 교과·영역 filter 가 중심 기준을 제외하지만 비교를 위해 유지하는 상태 */
  centerOutOfFilter: boolean;
  noTypes: boolean;
  firstHop: NodeRelation[];
  shownFirst: NodeRelation[];
  /** 1-hop 전체를 거쳐 닿는 2-hop 기준 수 */
  secondHopTotal: number;
  /** 표시된 1-hop 을 거쳐 닿는 2-hop 후보 (정렬됨) */
  secondHop: SecondHop[];
  shownSecond: SecondHop[];
  nodeIds: string[];
  edgeIds: string[];
}

export interface FocusOptions {
  hops: 1 | 2;
  limit: number;
  showNeighborEdges: boolean;
}

export function selectFocus(
  index: GraphIndex,
  filters: GraphFilterState,
  centerId: string,
  options: FocusOptions,
): FocusResult {
  const ctx = makeFilterContext(index, filters);
  const center = centerId;

  const firstHop: NodeRelation[] = [];
  for (const e of index.incident.get(center) ?? []) {
    if (!edgePasses(e, ctx, center)) continue;
    const other = index.nodeById.get(e.source === center ? e.target : e.source)!;
    firstHop.push({ edge: e, other, effectiveWeight: effectiveWeightOf(e, filters) });
  }
  firstHop.sort(compareRelations);
  const shownFirst = firstHop.slice(0, options.limit);

  const firstAll = new Set(firstHop.map((r) => r.other.id));
  const firstShown = new Map(shownFirst.map((r) => [r.other.id, r.effectiveWeight]));

  let secondHopTotal = 0;
  const best = new Map<string, SecondHop>();
  if (options.hops === 2) {
    const reachable = new Set<string>();
    for (const r of firstHop) {
      const u = r.other.id;
      for (const e of index.incident.get(u) ?? []) {
        if (!edgePasses(e, ctx, center)) continue;
        const v = e.source === u ? e.target : e.source;
        if (v === center || firstAll.has(v)) continue;
        reachable.add(v);
        const viaWeight = firstShown.get(u);
        if (viaWeight === undefined) continue;
        const direct = effectiveWeightOf(e, filters);
        const cand: SecondHop = { id: v, via: u, viaEdgeId: e.id, bottleneck: Math.min(viaWeight, direct), direct };
        const prev = best.get(v);
        if (
          !prev ||
          cand.bottleneck > prev.bottleneck ||
          (cand.bottleneck === prev.bottleneck && cand.direct > prev.direct) ||
          (cand.bottleneck === prev.bottleneck && cand.direct === prev.direct && codeCompare(cand.via, prev.via) < 0)
        ) {
          best.set(v, cand);
        }
      }
    }
    secondHopTotal = reachable.size;
  }
  const secondHop = [...best.values()].sort(
    (a, b) => b.bottleneck - a.bottleneck || b.direct - a.direct || codeCompare(a.id, b.id),
  );
  const shownSecond = secondHop.slice(0, options.limit);

  const nodeIds = [center, ...shownFirst.map((r) => r.other.id), ...shownSecond.map((s) => s.id)];
  const shown = new Set(nodeIds);
  const firstSet = new Set(shownFirst.map((r) => r.other.id));
  const secondSet = new Set(shownSecond.map((s) => s.id));

  const edgeIds = new Set<string>(shownFirst.map((r) => r.edge.id));
  // 표시된 2-hop 과 1-hop 사이의 실제 path edge 는 모두 보여 준다
  const consider = (e: LightEdge) => {
    if (edgeIds.has(e.id) || !shown.has(e.source) || !shown.has(e.target)) return;
    if (!edgePasses(e, ctx, center)) return;
    const s1 = firstSet.has(e.source), t1 = firstSet.has(e.target);
    const s2 = secondSet.has(e.source), t2 = secondSet.has(e.target);
    const path = (s1 && t2) || (s2 && t1);
    if (path || options.showNeighborEdges) edgeIds.add(e.id);
  };
  for (const id of nodeIds) {
    if (id === center) continue;
    for (const e of index.incident.get(id) ?? []) consider(e);
  }

  return {
    centerId: center,
    centerOutOfFilter: !ctx.inScope(center),
    noTypes: ctx.noTypes,
    firstHop,
    shownFirst,
    secondHopTotal,
    secondHop,
    shownSecond,
    nodeIds,
    edgeIds: [...edgeIds],
  };
}

/**
 * 중심 기준을 가운데 두고 1-hop 을 안쪽 원, 2-hop 을 바깥 원에 둔다.
 * 1-hop 은 교과별로 묶어 각도를 나누고, 2-hop 은 거쳐 오는 1-hop 의 각도 가까이에 둔다.
 * 위치는 가독성을 위한 것이며 거리는 유사성 점수를 뜻하지 않는다.
 */
export function layoutFocus(result: FocusResult): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = { [result.centerId]: { x: 0, y: 0 } };
  const first = [...result.shownFirst].sort(
    (a, b) =>
      subjectRank(a.other.subject) - subjectRank(b.other.subject) ||
      b.effectiveWeight - a.effectiveWeight ||
      codeCompare(a.other.code, b.other.code),
  );
  const n1 = first.length;
  const r1 = Math.max(180, (n1 * 46) / (2 * Math.PI));
  const angle = new Map<string, number>();
  first.forEach((r, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n1);
    angle.set(r.other.id, a);
    pos[r.other.id] = { x: r1 * Math.cos(a), y: r1 * Math.sin(a) };
  });

  const second = [...result.shownSecond].sort(
    (a, b) => (angle.get(a.via) ?? 0) - (angle.get(b.via) ?? 0) || codeCompare(a.id, b.id),
  );
  const n2 = second.length;
  if (n2) {
    const r2 = Math.max(r1 + 170, (n2 * 40) / (2 * Math.PI));
    // 거치는 1-hop 의 각도를 기준으로 두되, 겹치지 않게 최소 간격을 유지한다
    const minGap = ((2 * Math.PI) / n2) * 0.9;
    const angles = second.map((s) => angle.get(s.via) ?? 0);
    for (let i = 1; i < n2; i++) if (angles[i] - angles[i - 1] < minGap) angles[i] = angles[i - 1] + minGap;
    const overflow = angles[n2 - 1] - angles[0] - (2 * Math.PI - minGap);
    if (overflow > 0) for (let i = 0; i < n2; i++) angles[i] -= (overflow * i) / Math.max(1, n2 - 1);
    second.forEach((s, i) => {
      pos[s.id] = { x: r2 * Math.cos(angles[i]), y: r2 * Math.sin(angles[i]) };
    });
  }
  return pos;
}
