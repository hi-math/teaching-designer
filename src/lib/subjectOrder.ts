// 교과 순서 — 성취기준 검색의 교과 메뉴 순서 (standards_middle.json 에서 교과군이 처음 나오는 순서).
// 데이터 파일을 읽지 않아도 되게 목록으로 두고, 데이터와 어긋나지 않는지는 테스트가 확인한다.

export const SUBJECT_MENU_ORDER = [
  "국어", "도덕", "사회", "수학", "과학", "기술·가정", "정보", "체육", "음악", "미술", "영어", "제2외국어", "한문",
  "환경", "보건", "진로와 직업",
];

/** 교과군 안의 과목·따로 쓴 이름 → 메뉴의 교과 (역사는 사회, 생활 ○○어는 제2외국어) */
function menuSubject(subject: string): string {
  if (subject === "역사") return "사회";
  if (subject === "기술" || subject === "가정") return "기술·가정";
  if (subject.startsWith("생활 ")) return "제2외국어";
  return subject;
}

/** 메뉴 순서, 같은 교과군이면 교과군 이름 그대로인 과목이 먼저, 메뉴에 없는 교과는 뒤에 가나다순 */
function rank(subject: string): number {
  const i = SUBJECT_MENU_ORDER.indexOf(menuSubject(subject));
  if (i === -1) return SUBJECT_MENU_ORDER.length * 2;
  return i * 2 + (subject === SUBJECT_MENU_ORDER[i] ? 0 : 1);
}

export function compareSubjects(a: string, b: string): number {
  const x = a.trim();
  const y = b.trim();
  return rank(x) - rank(y) || (x === y ? 0 : x.localeCompare(y, "ko"));
}
