import { beforeAll, describe, expect, it } from "vitest";
import { getEffectiveWeight, passesRelationFilter } from "../relations";
import { defaultFilters } from "../reducer";
import { selectOverview, type GraphIndex } from "../selectors";
import type { GraphFilterState, LightEdge, Weight } from "../types";
import { loadRealIndex } from "./fixtures";

let index: GraphIndex;
beforeAll(async () => {
  ({ index } = await loadRealIndex());
});

const filters = (patch: Partial<GraphFilterState> = {}): GraphFilterState => ({ ...defaultFilters(), ...patch });

describe("weight filter (전체 유형)", () => {
  it.each([
    [1, 5466, 0],
    [2, 4195, 8],
    [3, 2281, 73],
    [4, 798, 258],
    [5, 269, 516],
  ])("minimum %i → edge %i, 관계 없는 node %i", (w, edges, isolated) => {
    const r = selectOverview(index, filters({ minimumWeight: w as Weight }));
    expect(r.edgeIds).toHaveLength(edges);
    expect(r.nodeIds).toHaveLength(714);
    expect(r.isolated.size).toBe(isolated);
  });

  it("FILTER-05 여러 유형의 동일 edge 는 한 번만", () => {
    const r = selectOverview(index, filters({ minimumWeight: 1 }));
    expect(new Set(r.edgeIds).size).toBe(r.edgeIds.length);
  });

  it("FILTER-06 다른 교과 edge 3,348", () => {
    const r = selectOverview(index, filters({ minimumWeight: 1, subjectRelation: "cross" }));
    expect(r.edgeIds).toHaveLength(3348);
  });

  it("관계 유형을 하나도 고르지 않으면 edge 없음, node 는 유지", () => {
    const r = selectOverview(index, filters({ relationTypes: [] }));
    expect(r.noTypes).toBe(true);
    expect(r.edgeIds).toHaveLength(0);
    expect(r.nodeIds).toHaveLength(714);
  });
});

describe("FILTER-04 선택 유형의 점수로 판정", () => {
  const edge: LightEdge = {
    id: "edge:fixture",
    source: "[A]",
    target: "[B]",
    weight: 5,
    dw: { content: 1, competency: 5, learning_hierarchy: 0, other: 0 },
    cross: false,
    lh: null,
  };
  it("내용만 · minimum 4 → 제외", () => {
    expect(getEffectiveWeight(edge, ["content"])).toBe(1);
    expect(passesRelationFilter(edge, ["content"], 4)).toBe(false);
  });
  it("내용+역량 · minimum 4 → 포함", () => {
    expect(passesRelationFilter(edge, ["content", "competency"], 4)).toBe(true);
  });
  it("실제 데이터에서도 유형별 점수만 쓴다", () => {
    const r = selectOverview(index, filters({ relationTypes: ["content"], minimumWeight: 4 }));
    for (const id of r.edgeIds) expect(index.edgeById.get(id)!.dw.content).toBeGreaterThanOrEqual(4);
  });
});

describe("교과·영역 filter 결합", () => {
  it("교과 1개 + 다른 교과: 타 교과 endpoint 를 더한다", () => {
    const r = selectOverview(index, filters({ subjects: ["수학"], subjectRelation: "cross", minimumWeight: 3 }));
    expect(r.edgeIds.length).toBeGreaterThan(0);
    for (const id of r.edgeIds) {
      const e = index.edgeById.get(id)!;
      const subjects = [index.nodeById.get(e.source)!.subject, index.nodeById.get(e.target)!.subject];
      expect(e.cross).toBe(true);
      expect(subjects).toContain("수학");
    }
    for (const id of r.external) expect(index.nodeById.get(id)!.subject).not.toBe("수학");
  });

  it("여러 교과: 그 교과들 사이의 edge 만", () => {
    const r = selectOverview(index, filters({ subjects: ["수학", "과학"], subjectRelation: "cross", minimumWeight: 1 }));
    for (const id of r.edgeIds) {
      const e = index.edgeById.get(id)!;
      const s = [index.nodeById.get(e.source)!.subject, index.nodeById.get(e.target)!.subject].sort();
      expect(s).toEqual(["과학", "수학"]);
    }
    expect(r.external.size).toBe(0);
  });

  it("영역 filter 는 선택 교과 쪽 endpoint 에만", () => {
    const info = index.subjects.find((s) => s.subject === "수학")!;
    const run = (domain: string) =>
      selectOverview(index, filters({ subjects: ["수학"], domains: [["수학", domain]], subjectRelation: "cross", minimumWeight: 1 }));
    const domain = info.domains.map((d) => d.domain).find((d) => run(d).edgeIds.length > 0)!;
    const r = run(domain);
    for (const id of r.edgeIds) {
      const e = index.edgeById.get(id)!;
      const math = [e.source, e.target].map((x) => index.nodeById.get(x)!).find((n) => n.subject === "수학")!;
      expect(math.domain).toBe(domain);
    }
  });
});
