// 관계 유형·weight 규칙 (사양 §3.2, §6.2)

import type { DimensionWeight, LightEdge, RelationType, StandardEdge, Weight } from "./types";

export const RELATION_LABELS: Record<RelationType, string> = {
  content: "내용",
  competency: "역량",
  learning_hierarchy: "학습 위계",
  other: "기타",
};

export const RELATION_COLORS: Record<RelationType, string> = {
  content: "#475569",
  competency: "#2563EB",
  learning_hierarchy: "#B45309",
  other: "#7C3AED",
};

export const RELATION_LINE_STYLES: Record<RelationType, "solid" | "dashed" | "dotted"> = {
  content: "solid",
  competency: "dashed",
  learning_hierarchy: "solid",
  other: "dotted",
};

/** 여러 유형이 같은 점수일 때 대표 스타일 우선순위 */
const TIE_PRIORITY: RelationType[] = ["learning_hierarchy", "content", "competency", "other"];

export const WEIGHT_STYLES: Record<Weight, { width: number; opacity: number; label: string }> = {
  1: { width: 0.6, opacity: 0.12, label: "약한 관련" },
  2: { width: 0.8, opacity: 0.18, label: "부분 관련" },
  3: { width: 1.2, opacity: 0.3, label: "중간 관련" },
  4: { width: 1.8, opacity: 0.48, label: "높은 관련" },
  5: { width: 2.6, opacity: 0.68, label: "매우 높은 관련" },
};

type WeightedEdge = Pick<LightEdge, "dw"> | Pick<StandardEdge, "dimension_weights">;

function dims(edge: WeightedEdge): Record<RelationType, DimensionWeight> {
  return "dw" in edge ? edge.dw : edge.dimension_weights;
}

/** 선택한 유형 중 가장 높은 점수. 선택한 유형에 해당하는 관계가 없으면 0. */
export function getEffectiveWeight(
  edge: WeightedEdge,
  selectedTypes: readonly RelationType[],
): DimensionWeight {
  const d = dims(edge);
  let max = 0;
  for (const type of selectedTypes) if (d[type] > max) max = d[type];
  return max as DimensionWeight;
}

export function passesRelationFilter(
  edge: WeightedEdge,
  selectedTypes: readonly RelationType[],
  minimumWeight: Weight,
): boolean {
  return getEffectiveWeight(edge, selectedTypes) >= minimumWeight;
}

/** 대표 스타일 유형: 선택 유형 중 점수가 가장 높은 것, 동점이면 TIE_PRIORITY 순 */
export function representativeType(
  edge: WeightedEdge,
  selectedTypes: readonly RelationType[],
): RelationType | null {
  const d = dims(edge);
  let best: RelationType | null = null;
  for (const type of TIE_PRIORITY) {
    if (!selectedTypes.includes(type) || d[type] === 0) continue;
    if (best === null || d[type] > d[best]) best = type;
  }
  return best;
}

/** 0보다 큰 점수를 가진 유형 (badge 표시용) */
export function activeTypes(edge: WeightedEdge): RelationType[] {
  const d = dims(edge);
  return TIE_PRIORITY.filter((t) => d[t] > 0);
}
