// 학습 흐름 layout — elkjs layered (사양 §10.2)
// ELK(1.6MB)는 탐색기가 준비된 뒤 Worker 에 미리 불러 두고, 학습 흐름 화면에서 사용한다.

import type { DirectedEdge } from "./hierarchy";

export const ELK_NODE_WIDTH = 120;
export const ELK_NODE_HEIGHT = 56;

const elkOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": "28",
  "elk.layered.spacing.nodeNodeBetweenLayers": "96",
  "elk.edgeRouting": "ORTHOGONAL",
};

export interface LayeredLayout {
  /** Cytoscape 가 쓰는 center 좌표 */
  positions: Record<string, { x: number; y: number }>;
  /** edge id → absolute bend point */
  bends: Record<string, { x: number; y: number }[]>;
}

type ElkInstance = { layout: (graph: unknown, opts?: unknown) => Promise<ElkResult>; terminateWorker?: () => void };
type ElkResult = {
  children?: { id: string; x?: number; y?: number; width?: number; height?: number }[];
  edges?: { id: string; sections?: { bendPoints?: { x: number; y: number }[] }[] }[];
};

// ELK 는 Worker 에서 실행한다. Worker 를 쓸 수 없으면 같은 계산을 main thread 에서 한다.
let workerElk: { elk: Promise<ElkInstance>; failed: Promise<never> } | null = null;
let workerBroken = false;
let mainElk: Promise<ElkInstance> | null = null;

function getWorkerElk() {
  if (!workerElk) {
    let fail: (reason: unknown) => void = () => {};
    const failed = new Promise<never>((_, reject) => {
      fail = reject;
    });
    failed.catch(() => {});
    const elk = import("elkjs/lib/elk-api.js").then(({ default: ELK }) => {
      return new ELK({
        workerFactory: () => {
          const worker = new Worker(new URL("../../workers/elk-layout.worker.ts", import.meta.url), { type: "module" });
          worker.addEventListener("error", (event) => {
            event.preventDefault();
            fail(new Error("ELK Worker 실행 실패"));
          });
          return worker;
        },
      }) as unknown as ElkInstance;
    });
    workerElk = { elk, failed };
  }
  return workerElk;
}

function getMainElk(): Promise<ElkInstance> {
  mainElk ??= import("elkjs/lib/elk.bundled.js").then((mod) => {
    const ELK = (mod as unknown as { default: new () => ElkInstance }).default;
    return new ELK();
  });
  return mainElk;
}

async function runElk(graph: unknown, allowMainThread: boolean): Promise<ElkResult> {
  if (!workerBroken && typeof Worker !== "undefined") {
    try {
      const { elk, failed } = getWorkerElk();
      return await Promise.race([elk.then((e) => e.layout(graph)), failed]);
    } catch (err) {
      workerBroken = true;
      disposeLayered();
      console.warn("[standards-graph] ELK Worker 를 쓸 수 없어 main thread 에서 학습 흐름을 배치합니다.", err);
    }
  }
  if (!allowMainThread) throw new Error("ELK Worker 를 쓸 수 없습니다.");
  return (await getMainElk()).layout(graph);
}

/** 학습 흐름 화면을 열기 전에 ELK 코드를 Worker 에 미리 불러 둔다 (main thread 는 막지 않는다) */
export function warmUpLayered(): void {
  if (typeof Worker === "undefined") return;
  runElk(
    {
      id: "warmup",
      layoutOptions: elkOptions,
      children: [
        { id: "a", width: ELK_NODE_WIDTH, height: ELK_NODE_HEIGHT },
        { id: "b", width: ELK_NODE_WIDTH, height: ELK_NODE_HEIGHT },
      ],
      edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
    },
    false,
  ).catch(() => {});
}

export function disposeLayered(): void {
  workerElk?.elk.then((e) => e.terminateWorker?.()).catch(() => {});
  workerElk = null;
}

export async function layoutLayered(nodeIds: string[], edges: DirectedEdge[]): Promise<LayeredLayout> {
  const graph = {
    id: "root",
    layoutOptions: elkOptions,
    children: nodeIds.map((id) => ({ id, width: ELK_NODE_WIDTH, height: ELK_NODE_HEIGHT })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const result = await runElk(graph, true);

  const positions: LayeredLayout["positions"] = {};
  for (const c of result.children ?? []) {
    // ELK 는 top-left, Cytoscape 는 center
    positions[c.id] = { x: (c.x ?? 0) + (c.width ?? ELK_NODE_WIDTH) / 2, y: (c.y ?? 0) + (c.height ?? ELK_NODE_HEIGHT) / 2 };
  }
  const bends: LayeredLayout["bends"] = {};
  for (const e of result.edges ?? []) {
    const points = (e.sections ?? []).flatMap((s) => s.bendPoints ?? []);
    if (points.length) bends[e.id] = points.map((p) => ({ x: p.x, y: p.y }));
  }
  return { positions, bends };
}

/**
 * absolute bend point 를 Cytoscape segments 의 (weight, distance) 로 바꾼다.
 * edge-distances: node-position 기준 — weight 는 source→target 선분 위 비율, distance 는 수직 거리.
 * 변환할 수 없으면 null (호출한 쪽이 단순 선으로 대신하고 진단을 남긴다).
 */
export function toSegments(
  source: { x: number; y: number },
  target: { x: number; y: number },
  points: { x: number; y: number }[],
): { weights: number[]; distances: number[] } | null {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return null;
  const len = Math.sqrt(len2);
  const weights: number[] = [];
  const distances: number[] = [];
  for (const p of points) {
    const px = p.x - source.x;
    const py = p.y - source.y;
    const w = (px * dx + py * dy) / len2;
    // Cytoscape 의 수직 방향 벡터 (-dy, dx)/len 기준 거리
    const d = (px * -dy + py * dx) / len;
    if (!Number.isFinite(w) || !Number.isFinite(d)) return null;
    weights.push(Math.round(w * 1000) / 1000);
    distances.push(Math.round(d * 10) / 10);
  }
  return { weights, distances };
}
