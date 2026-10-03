// 학습 흐름 — foundation → application 방향 그래프 (사양 §3.3, §4.3, §10.2)
// 일반 edge 의 source·target 저장 순서는 쓰지 않는다.

import { codeCompare, makeFilterContext, type GraphIndex } from "./selectors";
import type { GraphFilterState } from "./types";

export interface DirectedEdge {
  id: string;
  /** foundation */
  source: string;
  /** application */
  target: string;
  weight: number;
}

export interface HierarchyOptions {
  minimumWeight: number;
  includeCrossSubject: boolean;
  centerId: string | null;
  /** 중심에서 따라갈 단계 수 (0 = 제한 없음) */
  depth: number;
}

export interface HierarchyResult {
  centerId: string | null;
  nodeIds: string[];
  edges: DirectedEdge[];
  /** 중심 기준에 기록된 학습 연결이 없다 */
  centerHasNoLinks: boolean;
  /** 현재 조건에서 더 넓힐 수 있는 단계가 남았는가 */
  canExpand: boolean;
  /** cycle 에 걸린 code (없으면 null) */
  cycle: string[] | null;
}

export function toDirected(index: GraphIndex, minimumWeight: number): DirectedEdge[] {
  const out: DirectedEdge[] = [];
  for (const e of index.hierarchyEdges) {
    const w = e.dw.learning_hierarchy;
    if (!e.lh || w < minimumWeight) continue;
    out.push({ id: e.id, source: e.lh.foundation, target: e.lh.application, weight: w });
  }
  return out;
}

export function selectHierarchy(
  index: GraphIndex,
  filters: GraphFilterState,
  options: HierarchyOptions,
): HierarchyResult {
  const ctx = makeFilterContext(index, filters);
  const anySubject = filters.subjects.length > 0 || filters.domains.length > 0;
  const center = options.centerId;

  const inScope = (id: string) => id === center || ctx.inScope(id);
  const accepted = toDirected(index, options.minimumWeight).filter((e) => {
    const a = inScope(e.source);
    const b = inScope(e.target);
    if (a && b) return true;
    // 교과를 고른 상태에서 "타 교과 학습 연결 포함"이면 선택 교과와 직접 연결된 타 교과 기준까지
    return anySubject && options.includeCrossSubject && (a || b);
  });

  let nodeIds: string[];
  let edges: DirectedEdge[];
  let canExpand = false;

  if (center) {
    const out = new Map<string, DirectedEdge[]>();
    const inc = new Map<string, DirectedEdge[]>();
    for (const e of accepted) {
      (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
      (inc.get(e.target) ?? inc.set(e.target, []).get(e.target)!).push(e);
    }
    const reached = new Set([center]);
    const walk = (adj: Map<string, DirectedEdge[]>, next: (e: DirectedEdge) => string) => {
      let frontier = [center];
      for (let step = 1; frontier.length && (options.depth === 0 || step <= options.depth); step++) {
        const nextFrontier: string[] = [];
        for (const id of frontier) {
          for (const e of adj.get(id) ?? []) {
            const v = next(e);
            if (!reached.has(v)) {
              reached.add(v);
              nextFrontier.push(v);
            }
          }
        }
        frontier = nextFrontier;
      }
      // 한계 단계에서 멈췄는데 더 갈 곳이 있으면 확장 가능
      if (options.depth !== 0 && frontier.some((id) => (adj.get(id) ?? []).some((e) => !reached.has(next(e))))) {
        canExpand = true;
      }
    };
    walk(out, (e) => e.target); // application 방향 (outgoing)
    walk(inc, (e) => e.source); // foundation 방향 (incoming)
    nodeIds = [...reached];
    edges = accepted.filter((e) => reached.has(e.source) && reached.has(e.target));
  } else {
    const ids = new Set<string>();
    for (const e of accepted) {
      ids.add(e.source);
      ids.add(e.target);
    }
    nodeIds = [...ids];
    edges = accepted;
  }

  nodeIds.sort(codeCompare);
  edges.sort((a, b) => codeCompare(a.id, b.id));
  return {
    centerId: center,
    nodeIds,
    edges,
    centerHasNoLinks: !!center && edges.length === 0,
    canExpand,
    cycle: findCycle(nodeIds, edges),
  };
}

/** Kahn topological sort — 정렬되지 않고 남는 node 가 있으면 cycle 관련 code 를 돌려준다 */
export function findCycle(nodeIds: string[], edges: DirectedEdge[]): string[] | null {
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  const out = new Map<string, string[]>();
  for (const e of edges) {
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e.target);
  }
  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited++;
    for (const v of out.get(id) ?? []) {
      const d = indegree.get(v)! - 1;
      indegree.set(v, d);
      if (d === 0) queue.push(v);
    }
  }
  if (visited === indegree.size) return null;
  return [...indegree.entries()].filter(([, d]) => d > 0).map(([id]) => id).sort(codeCompare);
}
