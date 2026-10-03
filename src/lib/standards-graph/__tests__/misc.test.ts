import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { createDataEngine } from "../data-engine";
import { buildJsonExport } from "../export";
import { initialViewState } from "../reducer";
import type { GraphIndex } from "../selectors";
import { readViewState, writeViewState } from "../url-state";
import { validateDataset } from "../validate";
import { createDataClient } from "../worker-client";
import { loadRealIndex, readFiles } from "./fixtures";

let index: GraphIndex;
let engine: ReturnType<typeof createDataEngine>;
beforeAll(async () => {
  ({ index, engine } = await loadRealIndex());
});

describe("validation", () => {
  it("실제 데이터는 통과", () => {
    const { nodes, edges } = readFiles();
    expect(validateDataset(nodes, edges)).toEqual([]);
  });

  it("DATA-03 endpoint·중복 pair·weight 오류를 알린다", () => {
    const { nodes, edges } = readFiles();
    const e0 = edges.edges[0];
    const broken = {
      ...edges,
      edges: [
        { ...e0, target: "[없는코드]" },
        { ...edges.edges[1], weight: 2 as const },
        ...edges.edges.slice(2),
        { ...edges.edges[2], id: "dup" },
      ],
    };
    const codes = validateDataset(nodes, broken).map((i) => i.code);
    expect(codes).toContain("EDGE_ENDPOINT");
    expect(codes).toContain("EDGE_WEIGHT");
    expect(codes).toContain("EDGE_PAIR_DUPLICATE");
  });

  it("최상위가 array 면 구조 오류", () => {
    expect(validateDataset([], []).map((i) => i.code)).toEqual(["NODES_SHAPE", "EDGES_SHAPE"]);
  });
});

describe("검색", () => {
  it("SEARCH-01 대괄호 포함·생략이 같은 기준을 찾는다", () => {
    expect(engine.search("[9국01-09]", 20).hits[0]).toMatchObject({ id: "[9국01-09]", tier: 0 });
    expect(engine.search("9국01-09", 20).hits[0]).toMatchObject({ id: "[9국01-09]", tier: 0 });
  });

  it("단계 순서대로 정렬", () => {
    const r = engine.search("9수01", 50);
    expect(r.hits[0].tier).toBe(1);
    expect(r.hits.every((h, i) => i === 0 || h.tier >= r.hits[i - 1].tier)).toBe(true);
  });

  it("여러 검색어는 AND", () => {
    const r = engine.search("과학 탐구", 700);
    expect(r.total).toBeGreaterThan(0);
    for (const h of r.hits) {
      const n = engine.nodeDetails(h.id);
      const text = `${n.code} ${n.content} ${n.keywords.join(" ")} ${n.subject} ${n.domain}`.replace(/\s+/g, " ");
      expect(text.includes("과학") && text.includes("탐구")).toBe(true);
    }
  });
});

describe("URL 상태", () => {
  it("STATE-01 교과·유형·weight·중심 code·hop·mode 복원", () => {
    const s = initialViewState();
    s.mode = "focus";
    s.focusNodeId = "[9국01-09]";
    s.selectedNodeId = "[9국01-09]";
    s.filters.subjects = ["국어", "수학"];
    s.filters.domains = [["수학", index.subjects.find((x) => x.subject === "수학")!.domains[0].domain]];
    s.filters.relationTypes = ["content", "learning_hierarchy"];
    s.filters.minimumWeight = 2;
    s.hops = 2;
    s.comparisonNodeIds = ["[9국01-09]", "[9수01-01]"];
    const params = new URLSearchParams("view=ideation");
    writeViewState(params, s, index.summary.datasetVersion);
    const back = readViewState(new URLSearchParams(params.toString()), index, index.summary.datasetVersion, false);
    expect(back.missing).toEqual([]);
    expect(back.versionChanged).toBeNull();
    expect(back.state).toEqual(s);
    expect(params.get("view")).toBe("ideation");
  });

  it("없는 code 는 기본 화면으로 복구하며 알린다", () => {
    const back = readViewState(new URLSearchParams("mode=focus&focus=9없음01-01&dv=old"), index, "new", false);
    expect(back.state.mode).toBe("overview");
    expect(back.missing).toContain("9없음01-01");
    expect(back.versionChanged).toBe("old");
  });
});

describe("내보내기", () => {
  it("EXPORT-01 endpoint 가 모두 포함되고 원래 weight·학습 방향 보존", () => {
    const edgeIds = index.hierarchyEdges.slice(0, 20).map((e) => e.id);
    const { nodes, edges } = engine.exportItems([], edgeIds);
    const ids = new Set(nodes.map((n) => n.id));
    for (const e of edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true);

    const out = buildJsonExport({
      datasetVersion: "x",
      schemaVersion: "2.0",
      mode: "hierarchy",
      scope: "visible",
      scopeDescription: "",
      filters: initialViewState().filters,
      focusNodeId: null,
      nodes,
      edges,
      effectiveWeight: {},
      direction: Object.fromEntries(
        edges.map((e) => [e.id, { from: e.learning_hierarchy!.foundation, to: e.learning_hierarchy!.application }]),
      ),
    });
    const original = new Map(readFiles().edges.edges.map((e) => [e.id, e]));
    for (const e of out.edges) expect(e).toEqual(original.get(e.id));
  });
});

describe("STATE-02 응답 순서", () => {
  it("빠른 연속 검색에서 오래된 응답은 버린다", async () => {
    const publicDir = path.resolve(__dirname, "../../../../public");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string) =>
      new Response(new Uint8Array(readFileSync(path.join(publicDir, String(input)))))) as typeof fetch;
    try {
      const client = createDataClient("/standard/graph/manifest.json");
      await client.load();
      const [first, second] = await Promise.all([client.search("수학", 20), client.search("과학", 20)]);
      expect(first).toBeNull();
      expect(second?.query).toBe("과학");
      client.dispose();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
