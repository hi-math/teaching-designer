import { IDEATION_ROW, generationKey, type IdeationDraft } from "./model";
import type { StandardEdge, StandardNode } from "@/lib/standards-graph/types";

export type StoredContent = Record<string, unknown>;
export type ContentMap = Record<string, StoredContent | null>;
export const APPLICATION_ROWS = ["A-2", "A-3", "A-4", "__selected_standards", IDEATION_ROW];
export function comparable(content: StoredContent | null | undefined): unknown {
  if (!content) return null;
  return content.type === "structured" ? content.fields : content;
}
function fields(content: StoredContent | null | undefined): Record<string, unknown> {
  return content?.type === "structured" && content.fields && typeof content.fields === "object" ? content.fields as Record<string, unknown> : {};
}
function structured(before: StoredContent | null | undefined, patch: Record<string, unknown>) {
  return { ...before, type: "structured", fields: { ...fields(before), ...patch } };
}

export function buildApplication(draft: IdeationDraft, nodes: StandardNode[], edges: StandardEdge[], before: ContentMap): ContentMap {
  if (draft.generatedFor !== generationKey(draft.conditions, draft.seedIds, draft.datasetVersion)) throw new Error("조건이 변경되었습니다. 후보를 다시 만들어 주세요.");
  const c = draft.candidates.find(x => x.id === draft.selectedId);
  if (!c || !draft.rationale.trim()) throw new Error("주제를 선택하고 선정 사유를 입력하세요.");
  const selected = new Set(c.standardIds);
  if (selected.size < 2 || draft.seedIds.some(id => !selected.has(id))) throw new Error("필수 성취기준이 누락되었습니다.");
  const standards = nodes.filter(n => selected.has(n.id));
  if (standards.length !== selected.size || new Set(standards.map(n => n.subject)).size < 2) throw new Error("두 교과 이상의 유효한 성취기준이 필요합니다.");
  if (c.edgeIds.some(id => !edges.some(e => e.id === id && selected.has(e.source) && selected.has(e.target)))) throw new Error("연결 근거를 확인하지 못했습니다.");
  const items = standards.map(n => ({ code: n.code, subject: n.subject, domain: n.domain, content: n.content, keywords: n.keywords, explanation: n.explanation, grade_group: n.grade_group }));
  const existingItems = Array.isArray(before.__selected_standards?.items) ? before.__selected_standards!.items as { code: string }[] : [];
  const normalizedCode = (s: string) => s.replace(/[\[\]\s]/g, "");
  const combined = new Map(existingItems.map(s => [normalizedCode(s.code), s]));
  items.forEach(s => combined.set(normalizedCode(s.code), s));
  const existingRows = fields(before["A-3"]).achievement_standards;
  const rows: { subject: string; standard: string }[] = Array.isArray(existingRows) ? [...existingRows] : [];
  for (const n of standards) {
    if (!rows.some(r => typeof r.standard === "string" && r.standard.includes(n.code))) rows.push({ subject: n.subject, standard: `${n.code} ${n.content}` });
  }
  const existingCandidates = fields(before["A-2"]).candidates;
  const oldNarrative = String(fields(before["A-4"]).integration_narrative ?? "").trim();
  const narrative = `${c.title}\n${c.integration}\n${c.roles.map(r => `${r.subject}: ${r.role}`).join("\n")}`;
  return {
    "A-2": structured(before["A-2"], {
      candidates: [...new Set([...(Array.isArray(existingCandidates) ? existingCandidates : []), ...draft.candidates.map(x => x.title)])],
      final_topic: c.title, selection_rationale: draft.rationale,
    }),
    "A-3": structured(before["A-3"], { achievement_standards: rows }),
    "A-4": structured(before["A-4"], { integration_narrative: oldNarrative.includes(narrative) ? oldNarrative : [oldNarrative, narrative].filter(Boolean).join("\n\n") }),
    __selected_standards: { type: "standards", items: [...combined.values()] },
    [IDEATION_ROW]: { type: "structured", fields: draft },
  };
}
