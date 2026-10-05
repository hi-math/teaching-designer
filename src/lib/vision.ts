// T-1 개인별 교육비전 — 참가자마다 자기 행(T-1__vision_<userId>)에만 쓴다.
// 카드 필드 한 줄에 모두 담으면 여러 명이 동시에 입력할 때 마지막 저장이 다른 사람의 글을 덮어쓴다.
// 비전 키워드·팀 공동 비전은 T-1 카드 필드에 그대로 둔다.

export const VISION_PREFIX = "T-1__vision_";
export const VISION_MAX_TEXT = 2000;

export type VisionEntry = { id: string; text: string };
export type VisionMap = Record<string, VisionEntry[]>;

export const visionCode = (userId: string) => `${VISION_PREFIX}${userId}`;

export function newVisionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
}

/** 개인별 교육비전 행이면 작성자와 항목, 아니면 null (깨진 항목은 버린다) */
export function readVisionRow(code: string, content: unknown): { userId: string; items: VisionEntry[] } | null {
  if (!code.startsWith(VISION_PREFIX)) return null;
  const userId = code.slice(VISION_PREFIX.length);
  if (!userId) return null;
  const raw = (content as { items?: unknown } | null)?.items;
  const items = Array.isArray(raw)
    ? raw.flatMap((v) => {
      const e = v as Partial<VisionEntry> | null;
      return e && typeof e.id === "string" && typeof e.text === "string" ? [{ id: e.id, text: e.text.slice(0, VISION_MAX_TEXT) }] : [];
    })
    : [];
  return { userId, items };
}

export const visionContent = (items: VisionEntry[]) => ({ type: "visions", items });
