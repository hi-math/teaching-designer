import { beforeAll, describe, expect, it } from "vitest";
import { findCycle, selectHierarchy, toDirected } from "../hierarchy";
import { defaultFilters } from "../reducer";
import { buildGraphIndex, type GraphIndex } from "../selectors";
import type { LightEdge } from "../types";
import { loadRealIndex } from "./fixtures";

let index: GraphIndex;
beforeAll(async () => {
  ({ index } = await loadRealIndex());
});

const all = (minimumWeight: number, centerId: string | null = null, depth = 2) =>
  selectHierarchy(index, defaultFilters(), { minimumWeight, includeCrossSubject: false, centerId, depth });

describe("학습 흐름", () => {
  it("HIER-01 minimum 3 → 246", () => expect(all(3).edges).toHaveLength(246));
  it("HIER-02 minimum 4 → 219", () => expect(all(4).edges).toHaveLength(219));
  it("현재 데이터에는 cycle 이 없다", () => expect(all(1).cycle).toBeNull());

  it("HIER-03 방향 확인", () => {
    const edges = all(3).edges;
    expect(edges.some((e) => e.source === "[9수01-01]" && e.target === "[9수01-02]")).toBe(true);
    expect(edges.some((e) => e.source === "[9과12-01]" && e.target === "[9과12-02]")).toBe(true);
    expect(edges.some((e) => e.source === "[9수01-02]" && e.target === "[9수01-01]")).toBe(false);
  });

  it("HIER-04 source·target 저장 순서와 무관하게 foundation → application", () => {
    const swapped: LightEdge[] = index.summary.edges.map((e) => ({ ...e, source: e.target, target: e.source }));
    const idx = buildGraphIndex({ ...index.summary, edges: swapped });
    const a = toDirected(index, 3).map((e) => `${e.source}>${e.target}`).sort();
    const b = toDirected(idx, 3).map((e) => `${e.source}>${e.target}`).sort();
    expect(b).toEqual(a);
  });

  it("HIER-05 여러 foundation 이 한 application 으로 합류", () => {
    const edges = all(3).edges;
    const into = new Map<string, number>();
    for (const e of edges) into.set(e.target, (into.get(e.target) ?? 0) + 1);
    const [target, count] = [...into.entries()].sort((x, y) => y[1] - x[1])[0];
    expect(count).toBeGreaterThan(1);
    const r = all(3, target, 1);
    expect(r.edges.filter((e) => e.target === target)).toHaveLength(count);
  });

  it("중심 기준에 학습 연결이 없으면 따로 표시", () => {
    const linked = new Set(index.hierarchyEdges.flatMap((e) => [e.source, e.target]));
    const lonely = index.nodes.find((n) => !linked.has(n.id))!.id;
    const r = all(3, lonely);
    expect(r.centerHasNoLinks).toBe(true);
    expect(r.nodeIds).toEqual([lonely]);
  });

  it("cycle 검사 (Kahn)", () => {
    const cyc = findCycle(["a", "b", "c", "d"], [
      { id: "1", source: "a", target: "b", weight: 3 },
      { id: "2", source: "b", target: "c", weight: 3 },
      { id: "3", source: "c", target: "b", weight: 3 },
      { id: "4", source: "c", target: "d", weight: 3 },
    ]);
    expect(cyc).toEqual(["b", "c", "d"]);
  });
});
