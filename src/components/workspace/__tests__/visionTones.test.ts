import { describe, expect, it } from "vitest";
import { personTones } from "../VisionBoard";
import { getSubjectBadge } from "../CardFields";

describe("개인별 교육비전 카드 색", () => {
  it("가능하면 그 사람 교과의 색, 겹치거나 교과가 없으면 남은 색 — 사람마다 다르다", () => {
    const subjects: Record<string, string> = { a: "수학", b: "수학", c: "과학" };
    const tones = personTones(["c", "b", "a", "d"], (uid) => subjects[uid]);
    expect(tones.a).toEqual(getSubjectBadge("수학"));
    expect(tones.c).toEqual(getSubjectBadge("과학"));
    const colors = Object.values(tones).map((t) => t.bg);
    expect(new Set(colors).size).toBe(4);
  });

  it("누가 보든, 넘겨준 순서와 관계없이 같은 색", () => {
    const subjectOf = (uid: string) => ({ x: "국어", y: "국어" } as Record<string, string>)[uid];
    expect(personTones(["y", "x", "z"], subjectOf)).toEqual(personTones(["z", "x", "y"], subjectOf));
  });
});
