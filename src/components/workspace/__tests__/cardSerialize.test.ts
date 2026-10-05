import { describe, expect, it } from "vitest";
import { cardHasContent, serializeCardForAI } from "../cardSchemas";
import { personalVisionsText } from "@/lib/vision";

describe("AI 맥락 — 지금 카드에 맞게", () => {
  it("지운 칸(배경 및 맥락)의 예전 값은 빼고, 화면에 보이는 이름으로 보낸다", () => {
    const text = serializeCardForAI("T-1", { vision: "삶과 연결된 배움", vision_keywords: ["삶과 연결", ""], vision_note: "예전 배경" });
    expect(text).toBe("[비전 키워드]\n• 삶과 연결\n[팀 공동 비전] 삶과 연결된 배움");
    expect(text).not.toContain("예전 배경");
  });

  it("분류만 미리 채워 둔 표 행은 내용으로 보지 않는다", () => {
    const groups = [{ category: "교수 방법", idea: "프로젝트 기반 학습" }, { category: "평가 방식", idea: "" }];
    expect(serializeCardForAI("T-2", { direction_groups: groups })).toBe("[수업설계 방향 유목화]\n  교수 방법 | 프로젝트 기반 학습");
    expect(cardHasContent("T-2", { direction_groups: [{ category: "평가 방식", idea: " " }] })).toBe(false);
    expect(cardHasContent("T-1", { vision_note: "예전 배경" })).toBe(false);
  });

  it("개인별 교육비전도 카드 이름으로", () => {
    expect(personalVisionsText({ u1: [{ id: "a", text: " 스스로 묻는 학생 " }, { id: "b", text: "" }] }, () => "안교사"))
      .toBe("[개인별 교육비전]\n• 안교사: 스스로 묻는 학생");
    expect(personalVisionsText({}, () => "")).toBe("");
    // 카드 안의 불릿(줄)마다 하나씩
    expect(personalVisionsText({ u1: [{ id: "a", text: "삶과 연결\n\n 스스로 묻기 " }] }, () => "안교사"))
      .toBe("[개인별 교육비전]\n• 안교사: 삶과 연결\n• 안교사: 스스로 묻기");
  });
});
