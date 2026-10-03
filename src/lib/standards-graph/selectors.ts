// 표시 후보 계산 — raw graph 와 filter 상태만 받는 pure function (사양 §5.3, §8.2)

import { getEffectiveWeight } from "./relations";
import { compareSubjects } from "./subjectPalette";
import type { GraphFilterState, GraphSummary, LightEdge, LightNode } from "./types";
import { pairKey } from "./validate";

export interface SubjectInfo {
  subject: string;
  group: string;
  count: number;
  domains: { domain: string; count: number }[];
}

export interface GraphIndex {
  summary: GraphSummary;
  nodes: LightNode[];
  nodeById: Map<string, LightNode>;
  edges: LightEdge[];
  edgeById: Map<string, LightEdge>;
  /** undirected 인접 edge */
  incident: Map<string, LightEdge[]>;
  pairEdge: Map<string, LightEdge>;
  subjects: SubjectInfo[];
  hierarchyEdges: LightEdge[];
}

export function codeCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildGraphIndex(summary: GraphSummary): GraphIndex {
  const nodeById = new Map(summary.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(summary.edges.map((e) => [e.id, e]));
  const incident = new Map<string, LightEdge[]>();
  const pairEdge = new Map<string, LightEdge>();
  for (const n of summary.nodes) incident.set(n.id, []);
  for (const e of summary.edges) {
    incident.get(e.source)?.push(e);
    incident.get(e.target)?.push(e);
    pairEdge.set(pairKey(e.source, e.target), e);
  }

  const bySubject = new Map<string, { group: string; count: number; domains: Map<string, number> }>();
  for (const n of summary.nodes) {
    let s = bySubject.get(n.subject);
    if (!s) bySubject.set(n.subject, (s = { group: n.subjectGroup, count: 0, domains: new Map() }));
    s.count++;
    s.domains.set(n.domain, (s.domains.get(n.domain) ?? 0) + 1);
  }
  // 영역은 원본에 나온 순서(order)대로 둔다
  const subjects: SubjectInfo[] = [...bySubject.entries()]
    .sort(([a], [b]) => compareSubjects(a, b))
    .map(([subject, s]) => ({
      subject,
      group: s.group,
      count: s.count,
      domains: [...s.domains.entries()].map(([domain, count]) => ({ domain, count })),
    }));

  return {
    summary,
    nodes: summary.nodes,
    nodeById,
    edges: summary.edges,
    edgeById,
    incident,
    pairEdge,
    subjects,
    hierarchyEdges: summary.edges.filter((e) => e.lh !== null),
  };
}

// ── filter 결합 ───────────────────────────────────────────────

export interface FilterContext {
  filters: GraphFilterState;
  noTypes: boolean;
  /** 교과·영역 filter 로 정한 node 집합에 속하는가 */
  inScope: (id: string) => boolean;
  /** 교과 1개 + "다른 교과": 선택 교과와 직접 연결된 타 교과 endpoint 를 더한다 */
  singleSubjectCross: boolean;
}

export function makeFilterContext(index: GraphIndex, filters: GraphFilterState): FilterContext {
  const subjects = new Set(filters.subjects);
  const domainsBySubject = new Map<string, Set<string>>();
  for (const [subject, domain] of filters.domains) {
    if (!domainsBySubject.has(subject)) domainsBySubject.set(subject, new Set());
    domainsBySubject.get(subject)!.add(domain);
  }
  const inScope = (id: string) => {
    const n = index.nodeById.get(id);
    if (!n) return false;
    if (subjects.size && !subjects.has(n.subject)) return false;
    const domains = domainsBySubject.get(n.subject);
    return !domains || domains.has(n.domain);
  };
  return {
    filters,
    noTypes: filters.relationTypes.length === 0,
    inScope,
    singleSubjectCross: filters.subjects.length === 1 && filters.subjectRelation === "cross",
  };
}

/**
 * 관계 유형·weight·교과 관계·교과/영역 범위를 모두 통과하는가.
 * @param exempt 범위 검사에서 제외할 node (중심 기준)
 */
export function edgePasses(edge: LightEdge, ctx: FilterContext, exempt: string | null = null): boolean {
  const { filters } = ctx;
  if (ctx.noTypes) return false;
  if (getEffectiveWeight(edge, filters.relationTypes) < filters.minimumWeight) return false;
  if (filters.subjectRelation === "same" && edge.cross) return false;
  if (filters.subjectRelation === "cross" && !edge.cross) return false;
  const a = edge.source === exempt || ctx.inScope(edge.source);
  const b = edge.target === exempt || ctx.inScope(edge.target);
  if (a && b) return true;
  // 교과 1개 + 다른 교과: 선택 교과 쪽에만 영역 filter 를 적용하고 타 교과 endpoint 는 그대로 포함
  return ctx.singleSubjectCross && (a || b);
}

export function effectiveWeightOf(edge: LightEdge, filters: GraphFilterState): number {
  return getEffectiveWeight(edge, filters.relationTypes);
}

// ── 전체 보기 ─────────────────────────────────────────────────

export interface OverviewResult {
  nodeIds: string[];
  edgeIds: string[];
  /** 현재 조건에서의 관계 수 */
  degree: Map<string, number>;
  /** 표시는 하지만 현재 조건에 맞는 관계가 없는 node */
  isolated: Set<string>;
  /** 교과 1개 + 다른 교과 규칙으로 더해진 타 교과 node */
  external: Set<string>;
  noTypes: boolean;
}

export function selectOverview(index: GraphIndex, filters: GraphFilterState): OverviewResult {
  const ctx = makeFilterContext(index, filters);
  const nodeIds: string[] = [];
  const shown = new Set<string>();
  for (const n of index.nodes) {
    if (ctx.inScope(n.id)) {
      nodeIds.push(n.id);
      shown.add(n.id);
    }
  }

  const edgeIds: string[] = [];
  const degree = new Map<string, number>();
  const external = new Set<string>();
  for (const e of index.edges) {
    if (!edgePasses(e, ctx)) continue;
    edgeIds.push(e.id);
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    for (const id of [e.source, e.target]) {
      if (!shown.has(id)) {
        shown.add(id);
        external.add(id);
        nodeIds.push(id);
      }
    }
  }

  const isolated = new Set(nodeIds.filter((id) => !degree.has(id)));
  return { nodeIds, edgeIds, degree, isolated, external, noTypes: ctx.noTypes };
}

// ── 한 성취기준의 연결 목록 ────────────────────────────────────

export interface NodeRelation {
  edge: LightEdge;
  other: LightNode;
  effectiveWeight: number;
}

/** effectiveWeight DESC → cross_subject DESC → code ASC */
export function compareRelations(a: NodeRelation, b: NodeRelation): number {
  return (
    b.effectiveWeight - a.effectiveWeight ||
    Number(b.edge.cross) - Number(a.edge.cross) ||
    codeCompare(a.other.code, b.other.code)
  );
}

/** 현재 조건에 맞는 연결 (기준 node 자신은 범위 검사에서 제외) */
export function nodeRelations(index: GraphIndex, filters: GraphFilterState, nodeId: string): NodeRelation[] {
  const ctx = makeFilterContext(index, filters);
  const out: NodeRelation[] = [];
  for (const e of index.incident.get(nodeId) ?? []) {
    if (!edgePasses(e, ctx, nodeId)) continue;
    const other = index.nodeById.get(e.source === nodeId ? e.target : e.source)!;
    out.push({ edge: e, other, effectiveWeight: effectiveWeightOf(e, filters) });
  }
  return out.sort(compareRelations);
}

/** 두 성취기준 사이에 기록된 직접 edge */
export function directEdge(index: GraphIndex, a: string, b: string): LightEdge | null {
  return index.pairEdge.get(pairKey(a, b)) ?? null;
}
