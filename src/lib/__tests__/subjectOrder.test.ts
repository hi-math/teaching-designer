import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SUBJECT_MENU_ORDER, compareSubjects } from "@/lib/subjectOrder";

describe("교과 순서", () => {
  it("성취기준 검색 메뉴와 같은 순서 (데이터에서 교과군이 처음 나오는 순서)", () => {
    const { standards } = JSON.parse(readFileSync(path.join(process.cwd(), "public", "standard", "standards_middle.json"), "utf8")) as {
      standards: { order: number; subject_group: string }[];
    };
    const first = new Map<string, number>();
    for (const s of standards) if (s.subject_group && !first.has(s.subject_group)) first.set(s.subject_group, s.order);
    expect([...first.keys()].sort((a, b) => first.get(a)! - first.get(b)!)).toEqual(SUBJECT_MENU_ORDER);
  });

  it("교과군 안의 과목은 교과군 자리에, 메뉴에 없는 교과는 뒤에 가나다순", () => {
    const sorted = ["영어", "기타", "역사", "과학", "생활 일본어", "가정", "사회", "국어", "가나"].sort(compareSubjects);
    expect(sorted).toEqual(["국어", "사회", "역사", "과학", "가정", "영어", "생활 일본어", "가나", "기타"]);
  });
});
