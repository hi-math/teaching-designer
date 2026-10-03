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

  it("HTML 은 그리지 않는다", () => {
    const html = render("<script>alert(1)</script> <b>굵게</b>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>");
  });
});
