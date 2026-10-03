import { describe, expect, it } from "vitest";
import { CardUndoHistory, UNDO_GROUP_MS, UNDO_LIMIT } from "../cardUndo";

const f = (goal: string) => ({ fields: { integrated_goal: goal } });

describe("CardUndoHistory", () => {
  it("이어서 입력하는 동안은 한 단계, 쉬었다 다시 입력하면 새 단계", () => {
    const h = new CardUndoHistory();
    expect(h.remember("A-4", f(""), "group", 0)).toBe(1);
    expect(h.remember("A-4", f("물"), "group", 300)).toBeNull();
    expect(h.remember("A-4", f("물 순"), "group", 600)).toBeNull();
    expect(h.remember("A-4", f("물 순환"), "group", 600 + UNDO_GROUP_MS + 1)).toBe(2);
    expect(h.pop("A-4")?.value).toEqual(f("물 순환"));
    expect(h.pop("A-4")?.value).toEqual(f(""));
    expect(h.pop("A-4")).toBeNull();
  });

  it("지우기·AI 반영(step)은 바로 이어 입력해도 따로 한 단계", () => {
    const h = new CardUndoHistory();
    h.remember("A-4", f(""), "group", 0);
    expect(h.remember("A-4", f("물 순환"), "step", 100)).toBe(2); // 지우기 직전 값
    expect(h.remember("A-4", { fields: {} }, "group", 200)).toBe(3); // 지운 뒤 바로 입력 → 지운 상태가 한 단계
    expect(h.depth("A-4")).toBe(3);
  });

  it("되돌린 뒤 다시 입력하면 되돌린 상태부터 새 단계로 쌓인다", () => {
    const h = new CardUndoHistory();
    h.remember("A-4", f("처음"), "step", 0);
    h.remember("A-4", f("둘째"), "group", 100);
    expect(h.pop("A-4")?.value).toEqual(f("둘째")); // 카드는 이제 "둘째"
    expect(h.remember("A-4", f("둘째"), "group", 150)).toBe(2); // 되돌린 상태가 새 단계
    expect(h.remember("A-4", f("둘째 수정"), "group", 160)).toBeNull(); // 같은 입력 흐름
    expect(h.pop("A-4")?.value).toEqual(f("둘째"));
  });

  it("직전 단계와 같은 값은 다시 쌓지 않는다", () => {
    const h = new CardUndoHistory();
    h.remember("A-4", f("같음"), "step", 0);
    expect(h.remember("A-4", f("같음"), "step", 10)).toBeNull();
    expect(h.depth("A-4")).toBe(1);
  });

  it("카드마다 따로, 최대 단계 수를 넘으면 오래된 것부터 버린다", () => {
    const h = new CardUndoHistory();
    for (let i = 0; i < UNDO_LIMIT + 5; i++) h.remember("T-1", { text: `v${i}` }, "step", i);
    expect(h.depth("T-1")).toBe(UNDO_LIMIT);
    expect(h.depth("A-4")).toBe(0);
    expect(h.pop("T-1")?.value).toEqual({ text: `v${UNDO_LIMIT + 4}` });
  });

  it("A-3 선택 목록도 카드 내용과 함께 되돌린다", () => {
    const h = new CardUndoHistory();
    const snapshot = {
      fields: { core_ideas: [{ subject: '과학', core_idea: '목록 원문' }] },
      selectedIdeas: [{ id: '과학__영역__0', subject: '과학', domain: '영역', content: '목록 원문' }],
      selectedStandards: [],
    };
    h.remember('A-3', snapshot, 'step');
    expect(h.pop('A-3')?.value).toEqual(snapshot);
  });
});
