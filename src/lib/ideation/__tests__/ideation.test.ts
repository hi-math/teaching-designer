import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildBundles, emptyDraft, generationKey, readDraft, validateCandidates, DEFAULT_CRITERIA, type TopicCandidate } from "../model";
import { buildApplication, comparable } from "../application";
import type { StandardEdge, StandardNode } from "@/lib/standards-graph/types";

const root = path.join(process.cwd(), "public/standard/graph");
const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
const nodes: StandardNode[] = JSON.parse(readFileSync(path.join(process.cwd(), "public", manifest.files.nodes.url), "utf8")).nodes;
const edges: StandardEdge[] = JSON.parse(readFileSync(path.join(process.cwd(), "public", manifest.files.edges.url), "utf8")).edges;
const conditions = { subjects: ["과학", "사회"], grade: "중2", sessions: 6, interest: "기후변화", criteria: DEFAULT_CRITERIA, vision: "지역 문제 해결" };
const seeds = ["[9과17-01]"];
const bundles = buildBundles(nodes, edges, seeds, conditions.subjects);

function candidate(bundle = bundles[0]): TopicCandidate {
  return {
    id: "topic-1", bundleId: bundle.id, title: "우리 지역 기후 대응 제안", question: "지역 특성에 맞는 대응은?", product: "제안서", integration: "과학적 설명을 지역 대응 평가에 활용",
    roles: [...new Set(bundle.standardIds.map(id => nodes.find(n => n.id === id)!.subject))].map(subject => ({ subject, role: `${subject} 근거 검토`, standardIds: bundle.standardIds.filter(id => nodes.find(n => n.id === id)!.subject === subject) })),
    activities: ["원인 탐구", "대응 검토"], requirements: ["지역 자료 확보 확인"],
    evaluations: conditions.criteria.map(criterion => ({ criterion, rating: "충분함", reason: "근거 검토" })),
    standardIds: bundle.standardIds, edgeIds: bundle.edgeIds, warnings: bundle.warnings,
  };
}
function draft() {
  const d = emptyDraft(conditions, seeds);
  d.datasetVersion = manifest.datasetVersion;
  d.candidates = [candidate()]; d.selectedId = "topic-1"; d.rationale = "학생 삶과 연결";
  d.generatedFor = generationKey(d.conditions, seeds, d.datasetVersion);
  return d;
}

describe("evidence retrieval on the shipped graph", () => {
  it("preserves required standards, subject scope and the six-standard bound", () => {
    for (const b of bundles) {
      expect(b.standardIds).toContain(seeds[0]);
      expect(b.standardIds.length).toBeLessThanOrEqual(6);
      expect(b.standardIds.every(id => conditions.subjects.includes(nodes.find(n => n.id === id)!.subject))).toBe(true);
      expect(b.edgeIds.every(id => { const e = edges.find(e => e.id === id)!; return b.standardIds.includes(e.source) && b.standardIds.includes(e.target) && e.dimension_weights[b.id] >= 2; })).toBe(true);
    }
  });
  it("does not recommend a content relation merely because its hierarchy is strong", () => {
    const a = nodes.find(n => n.id === seeds[0])!, b = nodes.find(n => n.id === "[9사(지리)08-02]")!;
    const source = edges.find(e => e.source === a.id && e.target === b.id)!;
    const hierarchyOnly = { ...source, dimension_weights: { content: 0, competency: 0, other: 0, learning_hierarchy: 5 } } as StandardEdge;
    expect(buildBundles([a, b], [hierarchyOnly], [a.id], conditions.subjects)[0].standardIds).toEqual([a.id]);
  });
  it("rejects unknown IDs and seeds outside participating subjects", () => {
    expect(() => buildBundles(nodes, edges, ["fake"], conditions.subjects)).toThrow();
    expect(() => buildBundles(nodes, edges, seeds, ["사회"])).toThrow();
  });
  it("retains disconnected mandatory standards and explains the missing evidence", () => {
    const ids = [seeds[0], "[9사(지리)08-02]"];
    const b = buildBundles(nodes, [], ids, conditions.subjects)[0];
    expect(b.standardIds).toEqual(ids);
    expect(b.warnings.join(" ")).toContain("기록된 연결이 없습니다");
  });
});

describe("AI output validation", () => {
  it("attaches canonical evidence and leaves operating conditions unconfirmed", () => {
    const result = validateCandidates({ candidates: bundles.map(b => ({ ...candidate(b), edgeIds: ["invented"] })) }, bundles, nodes, conditions.criteria);
    expect(result[0].edgeIds).toEqual(bundles[0].edgeIds);
    expect(result[0].evaluations.find(e => e.criterion === "운영 가능성")?.rating).toBe("확인 필요");
  });
  it("rejects invented standard IDs, missing roles and repeated perspectives", () => {
    const raw = bundles.map(b => candidate(b));
    raw[0].roles[0].standardIds = ["invented"];
    expect(() => validateCandidates({ candidates: raw }, bundles, nodes, conditions.criteria)).toThrow();
    expect(() => validateCandidates({ candidates: [candidate(), candidate(), candidate()] }, bundles, nodes, conditions.criteria)).toThrow();
  });
  it("requires every selection criterion", () => {
    const raw = bundles.map(b => candidate(b)); raw[0].evaluations.pop();
    expect(() => validateCandidates({ candidates: raw }, bundles, nodes, conditions.criteria)).toThrow();
  });
});

describe("reviewed application", () => {
  it("preserves original goals, core ideas and status, and adds without duplicate standards", () => {
    const d = draft();
    const before = { "A-2": { type: "structured", fields: { candidates: ["기존 후보"], final_topic: "기존 주제" }, status: "completed" }, "A-3": { type: "structured", fields: { core_ideas: [{ core_idea: "기존 교육과정 핵심 아이디어" }], achievement_standards: [{ subject: "과학", standard: `${seeds[0]} 기존 교사 메모` }] } }, "A-4": { type: "structured", fields: { integrated_goal: "교사의 목표", integration_narrative: "기존 연계 설명" } } };
    const result = buildApplication(d, nodes, edges, before);
    expect(result["A-2"]?.status).toBe("completed");
    const a3 = result["A-3"]?.fields as Record<string, unknown>;
    expect(a3.core_ideas).toEqual(before["A-3"].fields.core_ideas);
    expect((a3.achievement_standards as { standard: string }[]).filter(r => r.standard.includes(seeds[0]))).toHaveLength(1);
    expect((result["A-4"]?.fields as Record<string, unknown>).integrated_goal).toBe("교사의 목표");
    expect(buildApplication(d, nodes, edges, result)).toEqual(result);
  });
  it("blocks stale candidates and candidates missing required standards", () => {
    const d = draft(); d.conditions = { ...conditions, sessions: 4 };
    expect(() => buildApplication(d, nodes, edges, {})).toThrow("조건이 변경");
    const bad = draft(); bad.candidates[0].standardIds = bad.candidates[0].standardIds.filter(id => id !== seeds[0]);
    expect(() => buildApplication(bad, nodes, edges, {})).toThrow("필수");
  });
  it("compares structured fields independently of activity completion status", () => {
    expect(comparable({ type: "structured", fields: { text: "동일" }, status: "completed" })).toEqual({ text: "동일" });
    expect(comparable(null)).toBe(null);
  });
  it("rejects malformed saved drafts and keeps generation identity stable across seed ordering", () => {
    expect(readDraft({ schemaVersion: 1 })).toBe(null);
    expect(readDraft(draft())).not.toBe(null);
    expect(generationKey(conditions, ["a", "b"], "v")).toBe(generationKey(conditions, ["b", "a"], "v"));
  });
});
