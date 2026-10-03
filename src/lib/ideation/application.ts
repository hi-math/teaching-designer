import { IDEATION_ROW, ideaText, type IdeationDraft } from "./model";
import { bracketCode } from "@/lib/standardCode";

// 아이디어 도출 → 수업 설계 반영. 서버에서만 부르고, 공식 원문은 항상 데이터에서 다시 읽는다.
// 반영은 더하기만 한다 — 아이디어 도출에서 지웠다는 이유로 수업 설계 카드의 항목을 지우지 않는다.

export type StoredContent = Record<string, unknown>;
export type ContentMap = Record<string, StoredContent | null>;
export const APPLICATION_ROWS = ["A-2", "A-3", "A-4", "__selected_standards", "__selected_ideas", IDEATION_ROW];

/** 공식 데이터 — 핵심아이디어(ideas.json)와 성취기준(standards_middle.json) */
export interface IdeationCatalog {
  ideas: { id: string; subject: string; domain: string; content: string }[];
  standards: { code: string; subject: string; domain: string; content: string; keywords: string[]; explanation: string; grade_group: string }[];
}

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
const normalizedCode = (s: string) => s.replace(/[\[\]\s]/g, "");
const filled = (row: Record<string, unknown>) => Object.values(row).some((v) => String(v ?? "").trim());

/**
 * 저장 전에 공식 원문을 데이터와 맞춘다.
 * 데이터에 없는 성취기준 코드는 빼고(연결도 정리), 목록에 없는 핵심아이디어는 교사 작성 항목으로 남긴다.
 */
export function canonicalize(draft: IdeationDraft, catalog: IdeationCatalog, dataVersion: string): IdeationDraft {
  const ideaById = new Map(catalog.ideas.map((i) => [i.id, i]));
  const stdByCode = new Map(catalog.standards.map((s) => [s.code, s]));
  const ideas = draft.ideas.map((idea) => {
    if (!idea.official) return idea;
    const official = ideaById.get(idea.official.catalogId);
    if (!official) return { ...idea, official: null, revision: ideaText(idea), subject: idea.official.subject };
    return { ...idea, official: { catalogId: official.id, subject: official.subject, domain: official.domain, content: official.content }, subject: official.subject };
  });
  const standards = draft.standards.flatMap((s) => {
    const data = stdByCode.get(s.code);
    return data ? [{ ...s, subject: data.subject, domain: data.domain, content: data.content }] : [];
  });
  const kept = new Set(standards.map((s) => s.id));
  return { ...draft, dataVersion, ideas, standards, ideaStandardLinks: draft.ideaStandardLinks.filter((l) => kept.has(l.to)) };
}

/** 확정한 연결(다시 검토할 연결 제외)로 만든 연계 설명 — 교사 수정본·직접 작성한 핵심아이디어도 여기에 담긴다 */
export function buildNarrative(draft: IdeationDraft): string {
  const ideaById = new Map(draft.ideas.map((i) => [i.id, i]));
  const stdById = new Map(draft.standards.map((s) => [s.id, s]));
  const elementLinks = draft.elementIdeaLinks.filter((l) => !l.review);
  const standardLinks = draft.ideaStandardLinks.filter((l) => !l.review);
  if (!elementLinks.length && !standardLinks.length) return "";
  const codesOf = (ideaIds: string[]) => [...new Set(standardLinks.filter((l) => ideaIds.includes(l.from)).map((l) => stdById.get(l.to)?.code).filter(Boolean))];
  const lines: string[] = [];
  const covered = new Set<string>();
  for (const el of draft.elements) {
    const ideaIds = elementLinks.filter((l) => l.from === el.id).map((l) => l.to).filter((id) => ideaById.has(id));
    if (!ideaIds.length || !el.text.trim()) continue;
    ideaIds.forEach((id) => covered.add(id));
    const codes = codesOf(ideaIds);
    lines.push(`- ${el.text.trim()}: ${ideaIds.map((id) => ideaText(ideaById.get(id)!)).join(" / ")}${codes.length ? ` → ${codes.join(", ")}` : ""}`);
  }
  for (const idea of draft.ideas) {
    if (covered.has(idea.id)) continue;
    const codes = codesOf([idea.id]);
    if (codes.length) lines.push(`- ${ideaText(idea)} → ${codes.join(", ")}`);
  }
  if (!lines.length) return "";
  return [draft.topic.trim(), ...lines].filter(Boolean).join("\n");
}

/** `before` 는 반영 직전의 저장값. 바뀌는 행만 돌려주고, 아이디어 도출 초안(__ideation)은 항상 함께 저장한다 */
export function buildApplication(draft: IdeationDraft, catalog: IdeationCatalog, before: ContentMap): ContentMap {
  const changes: ContentMap = {};

  // A-2 최종 주제
  const topic = draft.topic.trim();
  if (topic && String(fields(before["A-2"]).final_topic ?? "").trim() !== topic) {
    changes["A-2"] = structured(before["A-2"], { final_topic: topic });
  }

  // 공식 핵심아이디어·성취기준 → 선택 항목과 A-3 표 (원문은 데이터에서)
  const ideaById = new Map(catalog.ideas.map((i) => [i.id, i]));
  const stdByCode = new Map(catalog.standards.map((s) => [s.code, s]));
  const ideas = [...new Map(draft.ideas.flatMap((i) => {
    const official = i.official && ideaById.get(i.official.catalogId);
    return official ? [[official.id, official] as const] : [];
  })).values()];
  const standards = [...new Map(draft.standards.flatMap((s) => {
    const data = stdByCode.get(s.code);
    return data ? [[data.code, data] as const] : [];
  })).values()];

  const existingIdeas = Array.isArray(before.__selected_ideas?.items) ? before.__selected_ideas!.items as { id: string }[] : [];
  const addIdeas = ideas.filter((i) => !existingIdeas.some((e) => e.id === i.id));
  if (addIdeas.length) {
    changes.__selected_ideas = { ...before.__selected_ideas, type: "ideas", items: [...existingIdeas, ...addIdeas.map(({ id, subject, domain, content }) => ({ id, subject, domain, content }))] };
  }
  const existingStandards = Array.isArray(before.__selected_standards?.items) ? before.__selected_standards!.items as { code: string }[] : [];
  const addStandards = standards.filter((s) => !existingStandards.some((e) => normalizedCode(e.code) === normalizedCode(s.code)));
  if (addStandards.length) {
    changes.__selected_standards = { ...before.__selected_standards, type: "standards", items: [...existingStandards, ...addStandards.map(({ code, subject, domain, content, keywords, explanation, grade_group }) => ({ code, subject, domain, content, keywords, explanation, grade_group }))] };
  }

  const a3 = fields(before["A-3"]);
  const ideaRows = (Array.isArray(a3.core_ideas) ? a3.core_ideas as Record<string, string>[] : []).filter(filled);
  const stdRows = (Array.isArray(a3.achievement_standards) ? a3.achievement_standards as Record<string, string>[] : []).filter(filled);
  const newIdeaRows = ideas.filter((i) => !ideaRows.some((r) => r.subject === i.subject && r.core_idea === i.content))
    .map((i) => ({ subject: i.subject, core_idea: i.content }));
  const newStdRows = standards.filter((s) => !stdRows.some((r) => normalizedCode(String(r.standard ?? "")).includes(normalizedCode(s.code))))
    .map((s) => ({ subject: s.subject, standard: `${bracketCode(s.code)} ${s.content}` }));
  if (newIdeaRows.length || newStdRows.length) {
    changes["A-3"] = structured(before["A-3"], {
      ...(newIdeaRows.length ? { core_ideas: [...ideaRows, ...newIdeaRows] } : {}),
      ...(newStdRows.length ? { achievement_standards: [...stdRows, ...newStdRows] } : {}),
    });
  }

  // A-4 연계 설명 — 이미 같은 설명이 있으면 덧붙이지 않는다
  const narrative = buildNarrative(draft);
  const oldNarrative = String(fields(before["A-4"]).integration_narrative ?? "").trim();
  if (narrative && !oldNarrative.includes(narrative)) {
    changes["A-4"] = structured(before["A-4"], { integration_narrative: [oldNarrative, narrative].filter(Boolean).join("\n\n") });
  }

  if (!Object.keys(changes).length) throw new Error("수업 설계에 반영할 새 내용이 없습니다.");
  changes[IDEATION_ROW] = { type: "structured", fields: draft };
  return changes;
}
