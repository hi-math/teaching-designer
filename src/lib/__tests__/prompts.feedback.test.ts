import { describe, expect, it } from "vitest";
import { buildPageContextBlock, type PageContext } from "../prompts";

const long = "가".repeat(1500);

const base: PageContext = {
  projectTitle: "우리 동네 물 이야기",
  selectedActivityCode: "A-4",
  activityInputs: {
    "T-1": "학생이 지역 문제를 스스로 탐구하는 수업",
    "A-2": long,
    "A-4": "지역 하천의 물 순환과 생활 속 물 사용을 연결해 물 관리 방안을 제안한다.",
  },
  selectedStandards: [{ code: "[9과01-01]", subject: "과학", domain: "과학과 사회", content: "과학적 탐구 방법을 이해한다." }],
  targetGrade: "중학교 2학년",
  relatedSubjects: "과학, 사회",
  totalSessions: 6,
  cardLabels: { "T-1": "팀 비전", "A-2": "주제 선정", "A-4": "통합 수업 목표", "Ds-1": "평가 계획" },
};

describe("buildPageContextBlock — with AI 피드백", () => {
  const out = buildPageContextBlock({ ...base, intent: "feedback" });

  it("모든 카드를 흐름 순서대로, 빈 카드는 (미작성)으로 싣는다", () => {
    expect(out).toContain("### 수업설계 전체 흐름");
    expect(out).toContain("수업 기본정보: 대상 학년: 중학교 2학년 · 관련 교과: 과학, 사회 · 총 차시: 6차시");
    expect(out.indexOf("**[T-1 팀 비전]**")).toBeLessThan(out.indexOf("**[A-2 주제 선정]**"));
    expect(out.indexOf("**[A-2 주제 선정]**")).toBeLessThan(out.indexOf("**[Ds-1 평가 계획]** (미작성)"));
    expect(out).toContain("**[A-4 통합 수업 목표]** ← 피드백 대상");
  });

  it("다른 카드는 1200자까지 싣는다 (일반 대화의 200자 요약보다 길게)", () => {
    expect(out).toContain(`${"가".repeat(1200)}…`);
    expect(out).not.toContain("가".repeat(1201));
    expect(out).not.toContain("### 선행 카드 요약 (R5)");
  });

  it("성취기준을 싣고, 확인 멘트 대신 피드백 지침으로 끝낸다", () => {
    expect(out).toContain("### 성취기준 (R1)");
    expect(out).not.toContain("응답 마지막 확인 멘트 (아래 문장으로 끝낼 것)");
    expect(out).toContain("## with AI 피드백 요청");
    expect(out.trimEnd().endsWith("이 응답에는 '응답 마지막 확인 멘트'를 붙이지 않습니다.")).toBe(true);
  });

  it("intent 가 없으면 예전 그대로 (200자 요약 + 확인 멘트)", () => {
    const normal = buildPageContextBlock(base);
    expect(normal).toContain("### 선행 카드 요약 (R5)");
    expect(normal).toContain("응답 마지막 확인 멘트");
    expect(normal).not.toContain("수업설계 전체 흐름");
    expect(normal).not.toContain("### 성취기준 (R1)"); // A-4 는 r1 을 싣지 않는다
  });
});
