import { describe, expect, it } from "vitest";
import { targetCard } from "../cardTarget";

const LABELS: Record<string, string> = {
  "T-1": "비전 설정", "T-2": "수업설계 방향 수립", "T-3": "역할 분담", "A-1": "주제 선정 기준", "A-2": "주제 선정",
  "DI-2": "수업 기록", "E-2": "수업설계 과정 성찰", "A-5": "초안 미리보기",
};

describe("AI 답변을 반영할 카드", () => {
  it("질문이 다른 카드를 코드·이름·칸 이름으로 분명히 가리키면 그 카드", () => {
    expect(targetCard("T-2 내용 만들어 줘", "T-1", LABELS)).toBe("T-2");
    expect(targetCard("t - 2 정리해줘", "T-1", LABELS)).toBe("T-2");
    expect(targetCard("수업설계 방향 만들어 줘", "T-1", LABELS)).toBe("T-2");
    expect(targetCard("팀 공동 비전 문장을 만들어 줘", "A-2", LABELS)).toBe("T-1");
    expect(targetCard("주제 선정 기준을 정리해 줘", "T-1", LABELS)).toBe("A-1");
  });

  it("가리키는 게 없거나 모호하면 선택한 카드", () => {
    expect(targetCard("좋아, 두 번째 걸로 할게", "T-1", LABELS)).toBe("T-1");
    expect(targetCard("T-2 와 A-1 을 비교해 줘", "T-3", LABELS)).toBe("T-3");
    // 역할 분담: T-3 카드 이름이 칸 이름(DI-2)보다 먼저
    expect(targetCard("역할 분담 표를 만들어 줘", "T-1", LABELS)).toBe("T-3");
    // 여러 카드가 걸려도 선택한 카드가 그중에 있으면 그대로
    expect(targetCard("T-1 비전을 T-2 방향에 맞춰 다듬어 줘", "T-1", LABELS)).toBe("T-1");
  });

  it("칸이 없는 카드(초안 미리보기)로는 옮기지 않고, 카드를 고르지 않았으면(아이디어 도출) 그대로 없음", () => {
    expect(targetCard("A-5 초안 미리보기 만들어 줘", "T-1", LABELS)).toBe("T-1");
    expect(targetCard("T-2 만들어 줘", undefined, LABELS)).toBeUndefined();
  });
});
