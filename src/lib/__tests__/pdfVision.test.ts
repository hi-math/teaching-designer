import { describe, expect, it, vi } from "vitest";

// PDF 보고서의 팀 준비(T-1·T-2) — DB 와 브라우저는 가짜로 두고 만들어진 HTML 만 본다
const mock = vi.hoisted(() => ({ html: "" }));
const TABLES: Record<string, unknown> = {
  lessons: { title: "급식 잔반 줄이기", target_grade: "중2", related_subjects: "과학, 사회", num_classes: null, num_students: null, total_sessions: 6, created_date: null },
  lesson_members: [{ user_id: "u-an" }, { user_id: "u-kim" }],
  profiles: [{ id: "u-an", display_name: "안교사", email: null }, { id: "u-kim", display_name: "김교사", email: null }],
  activity_contents: [
    { activity_code: "T-1", content: { type: "structured", fields: { vision: "삶과 연결된 배움을 함께 만든다", vision_keywords: ["삶과 연결", " ", "스스로 묻는 학생"], vision_note: "예전 배경" } } },
    { activity_code: "T-1__vision_u-kim", content: { type: "visions", items: [{ id: "k", text: "배운 것을 삶의 문제에 연결" }] } },
    { activity_code: "T-1__vision_u-an", content: { type: "visions", items: [{ id: "a", text: "스스로 질문하는 학생" }, { id: "b", text: "  " }] } },
    { activity_code: "T-2", content: { type: "structured", fields: {
      direction_groups: [{ category: "교수 방법", idea: "프로젝트 기반 학습" }, { category: "평가 방식", idea: "" }],
      directions: ["학생 주도 탐구"],
    } } },
  ],
};
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const result = { data: TABLES[table], error: null };
      const builder = {
        select: () => builder, eq: () => builder, in: () => builder,
        single: async () => result,
        then: (resolve: (v: typeof result) => unknown) => resolve(result),
      };
      return builder;
    },
  }),
}));
vi.mock("@sparticuz/chromium-min", () => ({ default: { executablePath: async () => "x", args: [] } }));
vi.mock("playwright-core", () => ({
  chromium: {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          setContent: async (html: string) => { mock.html = html; },
          evaluate: async () => undefined,
          pdf: async () => Buffer.from("pdf"),
        }),
      }),
      close: async () => undefined,
    }),
  },
}));
import { GET } from "@/app/api/pdf/route";

describe("PDF 팀 준비", () => {
  it("T-1 은 개인별 교육비전(참여자 순서) → 비전 키워드 → 공동 비전, T-2 는 유목화 표(아이디어를 쓴 행만) → 확정안", async () => {
    const res = await GET(new Request("http://localhost/api/pdf?lessonId=00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(200);
    const t1 = mock.html.slice(mock.html.indexOf("1.1 팀 공동 비전"), mock.html.indexOf("1.2 수업설계 방향"));
    expect(t1.indexOf("안교사")).toBeLessThan(t1.indexOf("김교사"));
    expect(t1).toContain("스스로 질문하는 학생");
    expect(t1).toContain("배운 것을 삶의 문제에 연결");
    expect(t1).toContain("삶과 연결 · 스스로 묻는 학생");
    expect(t1.indexOf("비전 키워드")).toBeLessThan(t1.indexOf("공동 비전</span>"));
    expect(t1).not.toContain("예전 배경");
    const t2 = mock.html.slice(mock.html.indexOf("1.2 수업설계 방향"), mock.html.indexOf("1.3 역할 배분"));
    expect(t2).toContain("수업설계 방향 유목화");
    expect(t2).toContain("프로젝트 기반 학습");
    expect(t2).not.toContain("평가 방식");
    expect(t2).toContain("수업설계 방향 확정안");
    expect(t2).toContain("학생 주도 탐구");
  });
});
