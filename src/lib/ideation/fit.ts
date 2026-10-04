// 적합성 판단 기준 — with AI(누른 영역의 카드)와 자동 판단(판단이 없는 카드)이 함께 쓴다.
// 카드마다 인접한 영역에 비추어 본다.

export const FIT_SCALE = "score 3: 적합(기준과 직결), 2: 보통(보조적), 1: 낮음(기준과 거리가 멀거나, 조건의 교과·학년에 맞지 않거나, 다른 항목과 겹쳐 빼는 편이 나음). 낮음은 분명할 때만 주세요. reason 은 판단 근거 한 문장.";

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
