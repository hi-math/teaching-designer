import { ideaSubject, type IdeationDraft } from "./model";

// 적합성 판단 기준 — with AI(추천 후보와 누른 영역의 카드)와 자동 판단(판단이 없는 카드)이 함께 쓴다.
// 카드마다 인접한 영역에 비추어 본다. 추천과 판단의 기준이 같아야 추천하자마자 낮음이 되는 일이 없다.

export const FIT_SCALE = "score 3: 적합(기준과 직결), 2: 보통(보조적), 1: 낮음(기준과 거리가 멀거나, 조건의 학년에 맞지 않거나, 다른 항목과 겹쳐 빼는 편이 나음). 교과는 조건의 교과뿐 아니라 인접 영역에 있는 교과도 맞는 것으로 봅니다(융합수업). 낮음은 분명할 때만 주세요. reason 은 판단 근거 한 문장.";

export const FIT_BASIS = {
  elements: "수업주제와 핵심아이디어",
  ideas: "수업주제·하위요소와 성취기준",
  standards: "핵심아이디어(아직 없으면 수업주제)",
} as const;

/** 핵심아이디어 교과(ideas.json) ↔ 성취기준 교과 — 역사는 사회 교과군, 생활 외국어는 제2외국어 */
export function standardInSubject(subject: string, s: { subject: string; subject_group: string }): boolean {
  return s.subject === subject || s.subject_group === subject || (subject === "생활 외국어" && s.subject_group === "제2외국어");
}
export function ideaSubjectOfStandard(s: { subject: string; subject_group: string }): string {
  return s.subject_group === "제2외국어" ? "생활 외국어" : s.subject;
}

/** AI 문장(이유·하위요소·수업주제)에 섞여 나온 카드 ID 를 교과·내용으로 바꾼다 — 성취기준 ID 는 코드 그대로라 둔다.
 *  ID 를 한두 글자 빠뜨려 쓰기도 해서, 그대로 맞는 ID 가 없으면 앞부분이 같은 ID 로 찾는다. */
export function idReplacer(d: IdeationDraft, catalogIdeas: { id: string; subject: string }[] = []): (text: string) => string {
  const labels = new Map<string, string>([
    ...catalogIdeas.map((i) => [i.id, `${i.subject} 핵심아이디어`] as const),
    ...d.ideas.map((i) => [i.id, `${ideaSubject(i)} 핵심아이디어`] as const),
    ...d.elements.filter((e) => e.text.trim()).map((e) => [e.id, `‘${e.text.trim()}’`] as const),
  ]);
  const ids = [...labels.keys()].sort((a, b) => b.length - a.length);
  const kinds: Record<string, string> = { id: "핵심아이디어", el: "하위요소", ln: "연결" };
  return (text) => ids.reduce((t, id) => t.split(id).join(labels.get(id)!), text)
    .replace(/\b(el|id|ln)_[0-9a-z]{6,}\b/g, (id, kind: string) => labels.get(ids.find((k) => k.slice(0, 9) === id.slice(0, 9)) ?? "") ?? kinds[kind]);
}
