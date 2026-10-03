import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChatMarkdown from "../ChatMarkdown";

const render = (text: string) => renderToStaticMarkup(createElement(ChatMarkdown, { text }));

describe("ChatMarkdown", () => {
  it("따옴표 뒤에 한글 조사가 붙은 굵은 글씨도 ** 없이 그린다", () => {
    const html = render('지침이 요구하는 **"평가 질문"**이 불완전하고, **"우선순위"**와 **"기준 간 긴장 관계"**를 짚지 않음');
    expect(html).not.toContain("**");
    expect(html).toContain("<strong");
    expect(html).toContain("&quot;평가 질문&quot;</strong>이");
  });

  it("개조식 불릿과 하위 불릿을 목록으로 그린다", () => {
    const html = render("- 한 줄 총평: 비전과 정합적\n- 보완할 점\n  - [A-2] 우선순위 합의 필요");
    expect(html.match(/<ul/g)?.length).toBe(2);
    expect(html.match(/<li/g)?.length).toBe(3);
  });

  it("굵은 글씨만 있는 줄은 불릿 없는 소제목, 문장 안의 굵은 글씨는 빨간 강조", () => {
    const html = render("**잘 맞는 점**\n- 목표에 **데이터 탐구**가 드러남\n**보완할 점**\n- 평가 준거 필요");
    // 소제목 두 개 — 목록 항목이 아니라 굵은 문단
    expect(html.match(/<p class="mt-3[^"]*font-bold[^"]*">잘 맞는 점<\/p>/)).not.toBeNull();
    expect(html.match(/<p class="mt-3[^"]*font-bold[^"]*">보완할 점<\/p>/)).not.toBeNull();
    // 앞 항목의 이어지는 글로 붙지 않고 목록이 둘로 나뉜다
    expect(html.match(/<li/g)?.length).toBe(2);
    expect(html).toContain('<strong class="font-semibold text-[#D1260F]">데이터 탐구</strong>');
  });

  it("목록 바로 위 짧은 한 줄도 소제목 (굵게 쓰지 않은 예전 답변)", () => {
    const html = render("한 줄 총평\n- 목표가 비전과 단절됨\n\n현재 목표는 좋습니다.\n- 다만 보완 필요");
    expect(html.match(/font-bold[^"]*">한 줄 총평<\/p>/)).not.toBeNull();
    // 문장부호로 끝나는 줄은 소제목이 아니다
    expect(html).toContain('<p class="mb-2 last:mb-0">현재 목표는 좋습니다.</p>');
  });

  it("불릿 달린 소제목 + 하위 불릿(예전 형식)은 불릿을 뗀다", () => {
    const html = render("- 보완할 점\n  - [A-2] 우선순위 합의 필요");
    expect(html).toMatch(/<li class="[^"]*-ml-5 list-none">/);
  });

  it("HTML 은 그리지 않는다", () => {
    const html = render("<script>alert(1)</script> <b>굵게</b>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>");
  });
});
