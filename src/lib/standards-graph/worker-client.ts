// Worker client (사양 §9.5)
// - Data Worker 를 쓰지 못하면 같은 engine 코드를 main thread 에서 동적으로 불러온다.
// - Layout Worker 가 실패해도 Data Worker 는 그대로 두고, layout 만 main thread 에서 계산한다.
// - 검색·layout 은 최신 requestId 의 응답만 반영하고, 오래된 응답은 null 로 돌려준다.

import { EngineError, type DataEngine, type EdgeDetails, type LoadStage } from "./data-engine";
import type { ForceInputEdge, ForceInputNode, ForceOptions } from "./layout-force";
import type { SearchResult } from "./search";
import type { GraphSummary, StandardEdge, StandardNode } from "./types";
import type { DataWorkerRequest, LayoutWorkerRequest, WorkerResponse } from "./worker-protocol";

/** Worker 자체가 실행되지 못했거나 중간에 멈춘 경우 */
export class WorkerUnavailable extends Error {}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  onStage?: (stage: LoadStage) => void;
};

type RequestBody<T> = T extends unknown ? Omit<T, "requestId"> : never;

class WorkerChannel<Req extends { requestId: number }> {
  private pending = new Map<number, Pending>();
  private nextId = 1;
  dead = false;

  constructor(private worker: Worker) {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      const p = this.pending.get(msg.requestId);
      if (!p) return;
      if (msg.type === "PROGRESS") {
        if (msg.stage) p.onStage?.(msg.stage);
        return;
      }
      this.pending.delete(msg.requestId);
      if (msg.type === "ERROR") p.reject(new EngineError(msg.error!));
      else p.resolve(msg.payload);
    };
    const fail = (event: Event) => {
      event.preventDefault();
      this.dead = true;
      for (const p of this.pending.values()) p.reject(new WorkerUnavailable("Worker 실행 실패"));
      this.pending.clear();
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
  }

  request(body: RequestBody<Req>, onStage?: (stage: LoadStage) => void): Promise<unknown> {
    if (this.dead) return Promise.reject(new WorkerUnavailable("Worker 종료됨"));
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onStage });
      this.worker.postMessage({ ...body, requestId });
    });
  }

  terminate() {
    this.dead = true;
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new WorkerUnavailable("Worker 종료됨"));
    this.pending.clear();
  }
}

// ── Data client ───────────────────────────────────────────────

export interface DataClient {
  readonly backend: "worker" | "main" | "pending";
  load(onStage?: (stage: LoadStage) => void): Promise<GraphSummary>;
  /** 더 새로운 검색이 시작됐으면 null */
  search(query: string, limit: number): Promise<SearchResult | null>;
  nodeDetails(id: string): Promise<StandardNode>;
  edgeDetails(id: string): Promise<EdgeDetails>;
  exportItems(nodeIds: string[], edgeIds: string[]): Promise<{ nodes: StandardNode[]; edges: StandardEdge[] }>;
  dispose(): void;
}

export function createDataClient(manifestPath: string): DataClient {
  // Worker 안에서는 상대 경로의 기준이 페이지가 아니므로 절대 URL 로 넘긴다
  const manifestUrl = typeof location !== "undefined" ? new URL(manifestPath, location.href).href : manifestPath;
  let channel: WorkerChannel<DataWorkerRequest> | null = null;
  let engine: Promise<DataEngine> | null = null;
  let backend: DataClient["backend"] = "pending";
  let searchSeq = 0;
  const nodeCache = new Map<string, Promise<StandardNode>>();

  const mainEngine = (onStage?: (stage: LoadStage) => void) => {
    engine ??= (async () => {
      const { createDataEngine } = await import("./data-engine");
      const e = createDataEngine({ yieldEvery: 100 });
      await e.load(manifestUrl, onStage);
      return e;
    })();
    return engine;
  };

  async function call<T>(body: RequestBody<DataWorkerRequest>, local: (e: DataEngine) => T): Promise<T> {
    if (channel && !channel.dead) {
      try {
        return (await channel.request(body)) as T;
      } catch (err) {
        if (!(err instanceof WorkerUnavailable)) throw err;
        console.warn("[standards-graph] Data Worker 가 멈춰 main thread 로 전환합니다.");
        backend = "main";
      }
    }
    return local(await mainEngine());
  }

  return {
    get backend() {
      return backend;
    },

    async load(onStage) {
      if (typeof Worker !== "undefined") {
        try {
          channel = new WorkerChannel(
            new Worker(new URL("../../workers/standards-data.worker.ts", import.meta.url), { type: "module" }),
          );
          const summary = (await channel.request({ type: "LOAD", manifestUrl }, onStage)) as GraphSummary;
          backend = "worker";
          return summary;
        } catch (err) {
          // 데이터 자체의 문제는 main thread 에서도 같으므로 그대로 알린다
          if (err instanceof EngineError) throw err;
          console.warn("[standards-graph] Data Worker 를 시작하지 못해 main thread 로 전환합니다.", err);
          channel?.terminate();
          channel = null;
        }
      }
      backend = "main";
      const { createDataEngine } = await import("./data-engine");
      const e = createDataEngine({ yieldEvery: 100 });
      const summary = await e.load(manifestUrl, onStage);
      engine = Promise.resolve(e);
      return summary;
    },

    async search(query, limit) {
      const seq = ++searchSeq;
      const result = await call({ type: "SEARCH", query, limit }, (e) => e.search(query, limit));
      return seq === searchSeq ? result : null;
    },

    nodeDetails(id) {
      let p = nodeCache.get(id);
      if (!p) {
        p = call({ type: "NODE_DETAILS", id }, (e) => e.nodeDetails(id));
        p.catch(() => nodeCache.delete(id));
        nodeCache.set(id, p);
      }
      return p;
    },

    edgeDetails(id) {
      return call({ type: "EDGE_DETAILS", id }, (e) => e.edgeDetails(id));
    },

    exportItems(nodeIds, edgeIds) {
      return call({ type: "EXPORT", nodeIds, edgeIds }, (e) => e.exportItems(nodeIds, edgeIds));
    },

    dispose() {
      channel?.terminate();
      channel = null;
      nodeCache.clear();
    },
  };
}

// ── Layout client ─────────────────────────────────────────────

export interface LayoutClient {
  /** 더 새로운 layout 요청이 시작됐으면 null */
  force(
    nodes: ForceInputNode[],
    edges: ForceInputEdge[],
    options: ForceOptions,
  ): Promise<Record<string, { x: number; y: number }> | null>;
  dispose(): void;
}

export function createLayoutClient(): LayoutClient {
  let channel: WorkerChannel<LayoutWorkerRequest> | null = null;
  let seq = 0;

  const ensureChannel = () => {
    if (channel && !channel.dead) return channel;
    if (channel?.dead || typeof Worker === "undefined") return null;
    try {
      channel = new WorkerChannel(
        new Worker(new URL("../../workers/standards-layout.worker.ts", import.meta.url), { type: "module" }),
      );
    } catch (err) {
      console.warn("[standards-graph] Layout Worker 를 시작하지 못해 main thread 에서 계산합니다.", err);
      channel = null;
    }
    return channel;
  };

  return {
    async force(nodes, edges, options) {
      const mine = ++seq;
      let positions: Record<string, { x: number; y: number }> | undefined;
      const ch = ensureChannel();
      if (ch) {
        try {
          positions = (await ch.request({ type: "FORCE", nodes, edges, options })) as Record<string, { x: number; y: number }>;
        } catch (err) {
          if (!(err instanceof WorkerUnavailable)) throw err;
          console.warn("[standards-graph] Layout Worker 가 멈춰 main thread 에서 계산합니다.");
        }
      }
      if (!positions) {
        const { runForceLayout } = await import("./layout-force");
        positions = runForceLayout(nodes, edges, options);
      }
      return mine === seq ? positions : null;
    },
    dispose() {
      channel?.terminate();
      channel = null;
    },
  };
}
