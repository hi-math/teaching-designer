import { CARD_SCHEMAS } from "@/components/workspace/cardSchemas";

// AI 답변을 어느 카드에 반영할지 — 질문이 다른 카드를 분명히 가리키면 그 카드, 아니면 선택한 카드.
// 예전에는 선택한 카드에만 반영해, T-1 을 선택한 채 "T-2 수업설계 방향 만들어 줘"라고 물으면 T-1 기준으로 판정했다.
// 가리키는 순서: 카드 코드(T-2) → 카드 이름(수업설계 방향 수립) → 칸 이름(팀 공동 비전).
// 여러 카드가 걸리면 선택한 카드가 그중에 있을 때만 그대로 두고, 아니면 선택한 카드로 (모호하면 옮기지 않는다).

/** 반영할 수 있는 카드(칸이 있는 카드)만 */
const APPLY_CODES = Object.entries(CARD_SCHEMAS).filter(([, s]) => s.fields.length > 0).map(([code]) => code);

const squash = (text: string) => text.replace(/\s+/g, "");

/** 다른 이름 안에 통째로 들어 있는 짧은 이름은 뺀다 (주제 선정 ⊂ 주제 선정 기준) */
function longestOnly(hits: { code: string; name: string }[]): string[] {
  const kept = hits.filter((h) => !hits.some((o) => o !== h && o.name.length > h.name.length && o.name.includes(h.name)));
  return [...new Set(kept.map((h) => h.code))];
}

function pick(codes: string[], selected: string | undefined): string | null {
  if (codes.length === 1) return codes[0];
  if (codes.length > 1) return selected && codes.includes(selected) ? selected : null;
  return null;
}

export function targetCard(question: string, selected: string | undefined, cardLabels: Record<string, string> = {}): string | undefined {
  if (!selected) return selected;
  const q = squash(question);

  // 1) 카드 코드 — 대소문자 무시, 앞뒤가 다른 코드의 일부가 아닐 때만 (T-1 ≠ T-12)
  const codes = APPLY_CODES.filter((code) => new RegExp(`(^|[^A-Za-z0-9])${code.replace("-", "\\s*-\\s*")}(?![0-9])`, "i").test(question));
  const byCode = pick(codes, selected);
  if (byCode) return byCode;
  if (codes.length > 1) return selected;

  // 2) 카드 이름 — 띄어쓰기 무시, 끝의 "수립"·"설계" 같은 말 없이 불러도 (수업설계 방향 수립 → 수업설계 방향)
  const cardHits = APPLY_CODES.flatMap((code) => {
    const label = cardLabels[code];
    if (!label) return [];
    const words = label.trim().split(/\s+/);
    const names = [label, ...(words.length >= 3 ? [words.slice(0, -1).join(" ")] : [])].map(squash).filter((n) => n.length >= 3);
    return names.filter((n) => q.includes(n)).map((name) => ({ code, name }));
  });
  const byLabel = pick(longestOnly(cardHits), selected);
  if (byLabel) return byLabel;
  if (longestOnly(cardHits).length > 1) return selected;

  // 3) 칸 이름 — 카드에 하나뿐인 칸 이름으로 (팀 공동 비전 → T-1)
  const fieldHits = APPLY_CODES.flatMap((code) => CARD_SCHEMAS[code].fields
    .map((f) => squash((f.label ?? "").replace(/\(.*?\)/g, "")))
    .filter((n) => n.length >= 4 && q.includes(n))
    .map((name) => ({ code, name })));
  return pick(longestOnly(fieldHits), selected) ?? selected;
}
