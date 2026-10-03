// 화면 문구 도우미

import { RELATION_LABELS } from "@/lib/standards-graph/relations";
import { RELATION_TYPES, type GraphFilterState } from "@/lib/standards-graph/types";

/** 받침 유무에 따라 "와/과" 를 붙인다 */
export function withWa(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return `${word}와`;
  return (last - 0xac00) % 28 ? `${word}과` : `${word}와`;
}

/** toolbar 의 문장형 조건 요약 */
export function describeFilters(filters: GraphFilterState): string {
  const parts: string[] = [];
  parts.push(filters.subjects.length ? filters.subjects.join("·") : "전체 교과");
  if (filters.domains.length) parts.push(`영역 ${filters.domains.map(([, d]) => d).join("·")}`);
  if (filters.subjectRelation === "same") parts.push("같은 교과 안의 관계");
  if (filters.subjectRelation === "cross") {
    parts.push(
      filters.subjects.length === 1
        ? `${withWa(filters.subjects[0])} 직접 연결된 다른 교과 관계`
        : filters.subjects.length > 1
          ? "선택 교과 사이의 관계"
          : "다른 교과 사이의 관계",
    );
  }
  if (!filters.relationTypes.length) parts.push("관계 유형 선택 없음");
  else if (filters.relationTypes.length === RELATION_TYPES.length) parts.push("모든 관계 유형");
  else parts.push(filters.relationTypes.map((t) => RELATION_LABELS[t]).join("·"));
  parts.push(`관계 점수 ${filters.minimumWeight} 이상`);
  return parts.join(" · ");
}

export const fmt = (n: number) => n.toLocaleString("ko-KR");

export const INFERENCE_NOTE = "성취기준의 내용과 수행 목표를 바탕으로 추론한 관계입니다.";
export const HIERARCHY_NOTE = "성취기준 내용을 바탕으로 추론한 권장 학습 연결입니다.";
export const LAYOUT_NOTE =
  "배치에서 가까운 위치는 공식적인 유사성 점수나 학습 순서를 뜻하지 않습니다. 교과별 배치는 교과끼리 모아 두고, 관계 중심 배치는 관계가 많은 기준끼리 모이도록 계산한 화면용 배치입니다.";
