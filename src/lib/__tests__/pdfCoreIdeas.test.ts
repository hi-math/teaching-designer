import { describe, expect, it, vi } from "vitest";

// PDF 2.2 교과별 핵심 아이디어 표 — DB 와 브라우저는 가짜로 두고 만들어진 HTML 만 본다
const mock = vi.hoisted(() => ({ html: "" }));
const idea = (id: string, subject: string, content: string) => ({
  id, official: { catalogId: `${subject}__영역__1`, subject, domain: "영역", content }, revision: null, subject, via: "manual",
});
const std = (code: string, subject: string) => ({ id: code, code, subject, domain: "", content: "", note: "", via: "manual" });
const link = (id: string, from: string, to: string, strength: number, reason: string, review = false) => ({ id, from, to, via: "ai", strength, reason, review });
const TABLES: Record<string, unknown> = {
  lessons: { title: "급식 잔반 줄이기", target_grade: "중2", related_subjects: "과학, 사회, 수학", num_classes: null, num_students: null, total_sessions: 6, created_date: null },
  lesson_members: [],
  profiles: [],
  activity_contents: [
    { activity_code: "A-3", content: { type: "structured", fields: {
      core_ideas: [
        { subject: "과학", core_idea: "과학적 탐구는 일상의 문제를 해결한다." },
        { subject: "수학", core_idea: "자료를 분석하면 합리적으로 결정할 수 있다." },
        { subject: "사회", core_idea: "지역 문제는 주민의 참여로 해결된다." },
      ],
      achievement_standards: [
        { subject: "과학", standard: "[9과01-01] 과학적 탐구 방법을 이해한다." },
        { subject: "수학", standard: "[9수04-03] 상대도수를 구하고 해석한다." },
        { subject: "사회", standard: "[9사01-01] 지역 문제를 탐구한다." },
      ],
    } } },
    { activity_code: "__ideation", content: { type: "structured", fields: {
      schemaVersion: 2, dataVersion: "", conditions: { subjects: ["과학", "수학", "사회"], grade: "중2" }, topic: "급식 잔반 줄이기",
      elements: [],
      ideas: [idea("id_sci", "과학", "과학적 탐구는 일상의 문제를 해결한다."), idea("id_math", "수학", "자료를 분석하면 합리적으로 결정할 수 있다.")],
      standards: [std("[9과01-01]", "과학"), std("[9과02-01]", "과학"), std("[9수04-03]", "수학")],
      elementIdeaLinks: [],
      ideaStandardLinks: [
        link("ln_1", "id_sci", "[9과01-01]", 3, "잔반 원인을 탐구 방법으로 조사한다."),
        link("ln_2", "id_sci", "[9과02-01]", 2, "보고서에 없는 성취기준"),
        link("ln_3", "id_sci", "[9수04-03]", 2, "다시 검토할 연결", true),
        link("ln_4", "id_math", "[9수04-03]", 2, "잔반 자료를 상대도수로 분석한다."),
        link("ln_5", "id_math", "[9과01-01]", 3, "탐구 결과를 수치로 판단한다."),
      ],
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

describe("PDF 2.2 교과별 핵심 아이디어", () => {
  it("핵심 아이디어마다 확정한 연결의 성취기준과 이유 — 강한 순서, 보고서에 없는 기준·다시 검토할 연결은 빼고, 연결이 없으면 같은 교과 기준", async () => {
    const res = await GET(new Request("http://localhost/api/pdf?lessonId=00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(200);
    const s22 = mock.html.slice(mock.html.indexOf("2.2 교과별 핵심 아이디어"), mock.html.indexOf("2.3 성취기준 분석"));
    expect(s22).toContain("<svg");
    expect(s22).toContain("연결 성취기준");
    expect(s22).toContain("연결 이유");
    const rows = s22.split("<tr>").slice(2);
    expect(rows).toHaveLength(3);

    const [sci, math, soc] = rows;
    expect(sci).toContain("[9과01-01]");
    expect(sci).toContain("잔반 원인을 탐구 방법으로 조사한다.");
    expect(sci).not.toContain("[9과02-01]");
    expect(sci).not.toContain("[9수04-03]");
    expect(sci).not.toContain("<strong>");

    expect(math.indexOf("[9과01-01]")).toBeLessThan(math.indexOf("[9수04-03]"));
    expect(math).toContain("<strong>[9과01-01]</strong> 탐구 결과를 수치로 판단한다.");
    expect(math).toContain("<strong>[9수04-03]</strong> 잔반 자료를 상대도수로 분석한다.");

    expect(soc).toContain("[9사01-01]");
    expect(soc).toMatch(/<td class="">\s*<\/td><\/tr>/);
  });
});
