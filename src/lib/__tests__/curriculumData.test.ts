import { describe, expect, it } from "vitest";
import { getStandards } from "@/lib/standards";
import { getCoreIdeas, standardCandidates } from "@/lib/curriculumCatalog";
import { ideaSubjectOfStandard } from "@/lib/ideation/fit";

// 중학교 선택 교과(교육부 고시 제2022-33호 [별책18]) — 환경·보건·진로와 직업
const ELECTIVES = { 환경: { prefix: "[9환", domains: 5, standards: 19 }, 보건: { prefix: "[9보", domains: 5, standards: 26 }, "진로와 직업": { prefix: "[9진로", domains: 3, standards: 14 } };

describe("성취기준·핵심아이디어 데이터", () => {
  it("성취기준 코드는 겹치지 않고, 검색에 쓰는 필드를 모두 갖는다", () => {
    const standards = getStandards();
    expect(new Set(standards.map((s) => s.code)).size).toBe(standards.length);
    for (const s of standards) {
      expect(s.content.trim()).not.toBe("");
      expect(Array.isArray(s.keywords)).toBe(true);
    }
  });

  it("선택 교과의 성취기준과 핵심아이디어가 같은 교과·영역 이름으로 이어진다", () => {
    const standards = getStandards();
    const ideas = getCoreIdeas();
    for (const [subject, want] of Object.entries(ELECTIVES)) {
      const mine = standards.filter((s) => s.subject === subject);
      expect(mine).toHaveLength(want.standards);
      expect(mine.every((s) => s.code.startsWith(want.prefix) && s.subject_group === subject && ideaSubjectOfStandard(s) === subject)).toBe(true);
      const domains = [...new Set(mine.map((s) => s.domain))];
      expect(domains).toHaveLength(want.domains);
      expect([...new Set(ideas.filter((i) => i.subject === subject).map((i) => i.domain))]).toEqual(domains);
    }
  });

  it("관련 교과에 띄어 쓴 교과명이 있어도 그 교과를 먼저 찾는다", () => {
    const top = standardCandidates("일과 여가의 의미를 탐구하는 수업", "진로와 직업,사회", 5);
    expect(top[0].subject).toBe("진로와 직업");
  });
});
