import type { StandardEdge, StandardNode } from "@/lib/standards-graph/types";

export const IDEATION_ROW = "__ideation";
export const DEFAULT_CRITERIA = ["교육과정 적합성", "교과별 기여", "학생 삶과의 연결", "운영 가능성", "평가 가능성"];
export const STRATEGIES = ["content", "competency", "other"] as const;
export type Strategy = typeof STRATEGIES[number];
export const STRATEGY_LABELS: Record<Strategy, string> = { content: "공통 내용", competency: "공통 수행 역량", other: "교과 간 상호보완" };
export const RATINGS = ["충분함", "보완 필요", "확인 필요"] as const;
export type Rating = typeof RATINGS[number];

export interface IdeationConditions {
  subjects: string[];
  grade: string;
  sessions: number | null;
  interest: string;
  criteria: string[];
  vision: string;
}
export interface EvidenceBundle {
  id: Strategy;
  standardIds: string[];
  edgeIds: string[];
  warnings: string[];
}
export interface TopicCandidate {
  id: string;
  bundleId: Strategy;
  title: string;
  question: string;
  product: string;
  integration: string;
  roles: { subject: string; role: string; standardIds: string[] }[];
  activities: string[];
  requirements: string[];
  evaluations: { criterion: string; rating: Rating; reason: string }[];
  standardIds: string[];
  edgeIds: string[];
  warnings: string[];
}
export interface IdeationDraft {
  schemaVersion: 1;
  datasetVersion: string;
  conditions: IdeationConditions;
  seedIds: string[];
  candidates: TopicCandidate[];
  selectedId: string | null;
  rationale: string;
  generatedFor: string | null;
}

export function generationKey(conditions: IdeationConditions, seedIds: string[], version: string) {
  return JSON.stringify([version, { ...conditions, subjects: [...conditions.subjects].sort() }, [...seedIds].sort()]);
}

export function emptyDraft(conditions: IdeationConditions, seedIds: string[] = []): IdeationDraft {
  return { schemaVersion: 1, datasetVersion: "", conditions, seedIds, candidates: [], selectedId: null, rationale: "", generatedFor: null };
}

/** Reject malformed persisted data before it reaches the UI. */
export function readDraft(value: unknown): IdeationDraft | null {
  if (!value || typeof value !== "object") return null;
  const d = value as IdeationDraft;
  if (d.schemaVersion !== 1 || !d.conditions || !Array.isArray(d.conditions.subjects) ||
    !Array.isArray(d.conditions.criteria) || !Array.isArray(d.seedIds) || !Array.isArray(d.candidates)) return null;
  if (![...d.conditions.subjects, ...d.conditions.criteria, ...d.seedIds].every(x => typeof x === "string")) return null;
  if (![d.conditions.grade, d.conditions.interest, d.conditions.vision, d.rationale, d.datasetVersion].every(x => typeof x === "string")) return null;
  if (d.conditions.sessions !== null && (!Number.isInteger(d.conditions.sessions) || d.conditions.sessions < 1 || d.conditions.sessions > 60)) return null;
  if (d.selectedId !== null && typeof d.selectedId !== "string") return null;
  if (d.generatedFor !== null && typeof d.generatedFor !== "string") return null;
  if (d.seedIds.length > 6 || d.candidates.length > 3 || d.conditions.criteria.length > 10) return null;
  if (!d.candidates.every(isCandidate)) return null;
  return d;
}

function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(v => typeof v === "string"); }
export function isCandidate(value: unknown): value is TopicCandidate {
  if (!value || typeof value !== "object") return false;
  const c = value as TopicCandidate;
  return [c.id, c.title, c.question, c.product, c.integration].every(v => typeof v === "string" && v.trim().length > 0) &&
    STRATEGIES.includes(c.bundleId) && strings(c.standardIds) && strings(c.edgeIds) && strings(c.warnings) &&
    strings(c.activities) && strings(c.requirements) && Array.isArray(c.roles) && c.roles.every(r =>
      r && typeof r.subject === "string" && typeof r.role === "string" && strings(r.standardIds)) &&
    Array.isArray(c.evaluations) && c.evaluations.every(e => e && typeof e.criterion === "string" &&
      typeof e.reason === "string" && RATINGS.includes(e.rating));
}

/** Relation dimensions are used separately; a high hierarchy weight is not content relevance. */
export function buildBundles(nodes: StandardNode[], edges: StandardEdge[], seedIds: string[], subjects: string[]): EvidenceBundle[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const seeds = [...new Set(seedIds)];
  if (!seeds.length || seeds.length > 6 || seeds.some(id => !byId.has(id))) throw new Error("성취기준을 1~6개 선택하세요.");
  const allowed = new Set(subjects);
  if (seeds.some(id => !allowed.has(byId.get(id)!.subject))) throw new Error("담은 성취기준의 교과를 참여 교과에 포함하세요.");
  const scoped = edges.filter(e => allowed.has(byId.get(e.source)!.subject) && allowed.has(byId.get(e.target)!.subject));
  return STRATEGIES.map(strategy => {
    const selected = new Set(seeds);
    const distances = new Map(seeds.map(id => [id, 0]));
    const evidence = new Set<string>();
    // Direct neighbors first; at most two hops and six standards in a candidate.
    while (selected.size < 6) {
      const currentSubjects = new Set([...selected].map(id => byId.get(id)!.subject));
      const frontier = scoped.flatMap(e => {
        const a = selected.has(e.source), b = selected.has(e.target);
        if (a === b) return [];
        const from = a ? e.source : e.target, to = a ? e.target : e.source;
        const depth = (distances.get(from) ?? 2) + 1;
        const strength = e.dimension_weights[strategy];
        if (depth > 2 || strength < 2) return [];
        return [{ e, to, depth, strength, newSubject: !currentSubjects.has(byId.get(to)!.subject) }];
      }).sort((a, b) => Number(b.newSubject) - Number(a.newSubject) || a.depth - b.depth || b.strength - a.strength || a.e.id.localeCompare(b.e.id));
      const next = frontier[0];
      if (!next) break;
      if (selected.size >= Math.max(3, seeds.length) && !next.newSubject) break;
      selected.add(next.to); distances.set(next.to, next.depth); evidence.add(next.e.id);
    }
    for (const e of scoped) if (selected.has(e.source) && selected.has(e.target) && e.dimension_weights[strategy] >= 2) evidence.add(e.id);
    const used = new Set([...selected].map(id => byId.get(id)!.subject));
    const warnings: string[] = [];
    if (used.size < 2) warnings.push("이 관점에서는 교과 간 연결 근거가 부족합니다. 참여 교과나 출발 기준을 조정하세요.");
    const missing = subjects.filter(s => !used.has(s));
    if (missing.length) warnings.push(`이 묶음에 포함되지 않은 참여 교과: ${missing.join(", ")}`);
    const reached = new Set<string>();
    const todo = [[...selected][0]];
    while (todo.length) {
      const id = todo.pop()!;
      if (reached.has(id)) continue;
      reached.add(id);
      for (const e of scoped) if (evidence.has(e.id)) {
        if (e.source === id) todo.push(e.target);
        if (e.target === id) todo.push(e.source);
      }
    }
    if (reached.size < selected.size) warnings.push("일부 기준 사이에는 기록된 연결이 없습니다. 공동 과제에 기여하는 이유를 교사가 검토해야 합니다.");
    return { id: strategy, standardIds: [...selected], edgeIds: [...evidence], warnings };
  });
}

/** IDs and coverage come from our bundles, never from AI text. */
export function validateCandidates(value: unknown, bundles: EvidenceBundle[], nodes: StandardNode[], criteria: string[]): TopicCandidate[] {
  const raw = (value as { candidates?: unknown[] } | null)?.candidates;
  if (!Array.isArray(raw) || raw.length !== 3) throw new Error("후보 3개를 완성하지 못했습니다. 다시 시도하세요.");
  const byId = new Map(nodes.map(n => [n.id, n]));
  const seen = new Set<string>();
  return raw.map((item, i) => {
    const r = item as TopicCandidate;
    const bundle = bundles.find(b => b.id === r?.bundleId);
    if (!bundle || seen.has(bundle.id)) throw new Error("후보의 연결 근거가 올바르지 않습니다.");
    seen.add(bundle.id);
    const c = { ...r, id: `topic-${i + 1}`, standardIds: bundle.standardIds, edgeIds: bundle.edgeIds, warnings: bundle.warnings };
    if (!isCandidate(c) || c.title.length > 150 || !c.roles.length || c.activities.length < 2 || !c.requirements.length) throw new Error("후보 형식을 확인하지 못했습니다.");
    const covered = new Set<string>();
    for (const role of c.roles) {
      if (!role.role.trim() || !role.standardIds.length || role.standardIds.some(id => !bundle.standardIds.includes(id) || byId.get(id)?.subject !== role.subject)) throw new Error("교과별 역할에 잘못된 성취기준이 포함되었습니다.");
      role.standardIds.forEach(id => covered.add(id));
    }
    if (bundle.standardIds.some(id => !covered.has(id))) throw new Error("후보에서 성취기준의 역할이 누락되었습니다.");
    if (c.evaluations.length !== criteria.length || criteria.some(x => c.evaluations.filter(e => e.criterion === x).length !== 1)) throw new Error("선정 기준별 검토가 누락되었습니다.");
    // Actual school resources and pacing are not known to the model.
    c.evaluations = c.evaluations.map(e => /운영|진도|자료|차시|예산/.test(e.criterion) ? { ...e, rating: "확인 필요" } : e);
    return c;
  });
}
