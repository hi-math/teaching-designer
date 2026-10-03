// 카드별 되돌리기 기록
//
// 내가 카드를 바꾸기 직전의 값을 카드마다 쌓는다. 다른 참여자의 변경은 실시간 반영 경로를 타서 여기 쌓이지 않는다.
// - group: 카드에서 직접 입력 — 이어서 입력하는 동안(UNDO_GROUP_MS 이내)은 한 단계로 묶는다
// - step : 지우기·AI 반영·검색 결과처럼 한 번에 바뀌는 변경 — 따로 한 단계
// 브라우저 메모리에만 두므로 새로고침하면 사라진다 — 오래된 상태는 버전 관리로 되돌린다.

/** 되돌리기 한 단계에 담는 값 — 구조화 카드는 필드 전체, 텍스트 카드는 글 */
export type CardValue = { fields: Record<string, unknown>; selectedIdeas?: unknown[]; selectedStandards?: unknown[] } | { text: string };
export type UndoMode = "group" | "step";

export const UNDO_LIMIT = 30;
export const UNDO_GROUP_MS = 1500;

export class CardUndoHistory {
  private stacks: Record<string, CardValue[]> = {};
  private lastEditAt: Record<string, number> = {};

  /**
   * 바뀌기 직전 값(current)을 기록한다.
   * 쌓였으면 새 단계 수를, 이어 쓰기로 묶였거나 직전 단계와 같아 건너뛰었으면 null 을 돌려준다.
   */
  remember(code: string, current: CardValue, mode: UndoMode, now = Date.now()): number | null {
    const typing = mode === "group" && now - (this.lastEditAt[code] ?? -Infinity) < UNDO_GROUP_MS;
    // step 뒤에 이어 입력하면 바뀐 상태부터 새 단계로 쌓이게 시각을 지운다
    this.lastEditAt[code] = mode === "group" ? now : -Infinity;
    if (typing) return null;
    const stack = this.stacks[code] ?? [];
    const top = stack[stack.length - 1];
    if (top && same(top, current)) return null;
    this.stacks[code] = [...stack, current].slice(-UNDO_LIMIT);
    return this.stacks[code].length;
  }

  /** 직전 단계를 꺼낸다. 되돌린 뒤 다시 입력하면 되돌린 상태부터 새 단계로 쌓인다 */
  pop(code: string): { value: CardValue; depth: number } | null {
    const stack = this.stacks[code] ?? [];
    const value = stack[stack.length - 1];
    if (!value) return null;
    this.stacks[code] = stack.slice(0, -1);
    this.lastEditAt[code] = -Infinity;
    return { value, depth: this.stacks[code].length };
  }

  depth(code: string): number {
    return this.stacks[code]?.length ?? 0;
  }
}

function same(a: CardValue, b: CardValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
