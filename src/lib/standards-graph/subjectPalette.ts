// 교과별 고정 색상 — 정렬 순서가 바뀌어도 색이 바뀌지 않도록 이름으로 직접 매핑한다.
//
// 21개 교과를 색만으로 구분할 수는 없으므로(범주형 색은 8개가 한계) 교과군마다
// 하나의 색 계열을 쓰고, 같은 계열 안에서는 명도만 달리한다.
// 교과 식별은 언제나 교과명(tooltip·목록·상세·범례)이 담당하고 색은 보조 수단이다.
//
// 계열 기준색 8개는 dataviz 기본 팔레트(인접 쌍 CVD ΔE ≥ 9.1, 정상 시각 ΔE ≥ 19.6)이고,
// 같은 계열의 변형은 OKLCH에서 hue·chroma를 유지한 채 L만 옮겨 계산한 값이다.
//
// 이 파일은 scripts/prepare-standards-graph.ts 에서도 직접 import 하므로
// 런타임 import 를 두지 않는다.

export interface SubjectColor {
  /** 채움색 */
  fill: string;
  /** 계열 이름 (범례 묶음) */
  family: string;
}

export const SUBJECT_FAMILIES: { family: string; label: string }[] = [
  { family: "korean", label: "국어" },
  { family: "math", label: "수학" },
  { family: "science", label: "과학" },
  { family: "social", label: "사회·역사" },
  { family: "ethics", label: "도덕" },
  { family: "tech", label: "기술·가정·정보" },
  { family: "arts", label: "예체능" },
  { family: "language", label: "외국어·한문" },
];

/** 화면·배치에서 쓰는 교과 순서 (교과 anchor 배치 순서이기도 하다) */
export const SUBJECT_ORDER: string[] = [
  "국어",
  "수학",
  "과학",
  "사회",
  "역사",
  "도덕",
  "기술·가정",
  "정보",
  "체육",
  "음악",
  "미술",
  "영어",
  "한문",
  "생활 독일어",
  "생활 프랑스어",
  "생활 스페인어",
  "생활 중국어",
  "생활 일본어",
  "생활 러시아어",
  "생활 아랍어",
  "생활 베트남어",
  "환경",
  "보건",
  "진로와 직업",
];

export const SUBJECT_PALETTE: Record<string, SubjectColor> = {
  국어: { fill: "#eb6834", family: "korean" },
  수학: { fill: "#2a78d6", family: "math" },
  과학: { fill: "#1baf7a", family: "science" },
  사회: { fill: "#eda100", family: "social" },
  역사: { fill: "#b37907", family: "social" },
  도덕: { fill: "#e34948", family: "ethics" },
  "기술·가정": { fill: "#008300", family: "tech" },
  정보: { fill: "#42ac3c", family: "tech" },
  체육: { fill: "#9f3964", family: "arts" },
  음악: { fill: "#e87ba4", family: "arts" },
  미술: { fill: "#c05781", family: "arts" },
  영어: { fill: "#4a3aa7", family: "language" },
  한문: { fill: "#a4a2fe", family: "language" },
  "생활 독일어": { fill: "#5b4fbd", family: "language" },
  "생활 프랑스어": { fill: "#6358c7", family: "language" },
  "생활 스페인어": { fill: "#6b61d1", family: "language" },
  "생활 중국어": { fill: "#736adc", family: "language" },
  "생활 일본어": { fill: "#7c74e6", family: "language" },
  "생활 러시아어": { fill: "#847df0", family: "language" },
  "생활 아랍어": { fill: "#8d86fa", family: "language" },
  "생활 베트남어": { fill: "#9692fe", family: "language" },
  // 중학교 선택 교과(별책18) — 범례 묶음은 가까운 계열에 둔다
  환경: { fill: "#0e7f62", family: "science" },
  보건: { fill: "#5cc4a2", family: "science" },
  "진로와 직업": { fill: "#c66a12", family: "social" },
};

/** 매핑에 없는 교과(새 데이터 버전)는 중립 회색으로 표시한다 */
export const UNKNOWN_SUBJECT_COLOR = "#8a8f98";

export function subjectColor(subject: string): string {
  return SUBJECT_PALETTE[subject]?.fill ?? UNKNOWN_SUBJECT_COLOR;
}

/** SUBJECT_ORDER 기준 정렬 키. 목록에 없는 교과는 뒤로 보내고 이름순으로 둔다. */
export function subjectRank(subject: string): number {
  const i = SUBJECT_ORDER.indexOf(subject);
  return i === -1 ? SUBJECT_ORDER.length : i;
}

export function compareSubjects(a: string, b: string): number {
  return subjectRank(a) - subjectRank(b) || a.localeCompare(b, "ko");
}
