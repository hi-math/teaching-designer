import { beforeAll, describe, expect, it } from "vitest";
import { selectFocus } from "../neighborhood";
import { defaultFilters } from "../reducer";
import { compareRelations, edgePasses, makeFilterContext, nodeRelations, type GraphIndex } from "../selectors";
import type { GraphFilterState, Weight } from "../types";
import { loadRealIndex } from "./fixtures";

let index: GraphIndex;
beforeAll(async () => {
  ({ index } = await loadRealIndex());
});

const filters = (patch: Partial<GraphFilterState> = {}): GraphFilterState => ({ ...defaultFilters(), ...patch });
const opts = { hops: 1 as const, limit: 30, showNeighborEdges: false };

describe("중심 탐색", () => {
  it.each([
    [1, 11],
    [3, 3],
  ])("FOCUS-01 [9국01-09] minimum %i → 관계 %i개", (w, count) => {
    const f = filters({ minimumWeight: w as Weight });
    expect(selectFocus(index, f, "[9국01-09]", opts).firstHop).toHaveLength(count);
    expect(nodeRelations(index, f, "[9국01-09]")).toHaveLength(count);
  });

  it("FOCUS-02 표시 한도와 전체 결과 수를 구분하고 정해진 순서로 정렬", () => {
    const busiest = [...index.incident.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
    const r = selectFocus(index, filters({ minimumWeight: 1 }), busiest, opts);
    expect(r.firstHop.length).toBeGreaterThan(30);
    expect(r.shownFirst).toHaveLength(30);
    for (let i = 1; i < r.firstHop.length; i++) {
      expect(compareRelations(r.firstHop[i - 1], r.firstHop[i])).toBeLessThanOrEqual(0);
    }
  });

  it("FOCUS-03 2-hop 은 filter 를 통과한 실제 path 가 있는 기준만", () => {
    const f = filters({ minimumWeight: 3 });
    const r = selectFocus(index, f, "[9과01-01]", { ...opts, hops: 2 });
    const ctx = makeFilterContext(index, f);
    const first = new Set(r.shownFirst.map((x) => x.other.id));
    expect(r.shownSecond.length).toBeGreaterThan(0);
    expect(r.secondHopTotal).toBeGreaterThanOrEqual(r.secondHop.length);
    for (const s of r.shownSecond) {
      expect(first.has(s.via)).toBe(true);
      expect(first.has(s.id)).toBe(false);
      const e = index.edgeById.get(s.viaEdgeId)!;
      expect([e.source, e.target].sort()).toEqual([s.via, s.id].sort());
      expect(edgePasses(e, ctx, r.centerId)).toBe(true);
    }
  });

  it("교과 filter 가 중심을 제외해도 중심은 유지, 나머지에는 filter 적용", () => {
    const r = selectFocus(index, filters({ subjects: ["수학"], minimumWeight: 1 }), "[9국01-09]", opts);
    expect(r.centerOutOfFilter).toBe(true);
    expect(r.nodeIds[0]).toBe("[9국01-09]");
    for (const rel of r.firstHop) expect(rel.other.subject).toBe("수학");
  });
});
