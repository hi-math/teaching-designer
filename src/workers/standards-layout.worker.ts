/// <reference lib="webworker" />
// Layout Worker — 경량 복사본만 받아 d3-force 위치를 계산한다 (사양 §10.1)

import { runForceLayout } from "@/lib/standards-graph/layout-force";
import type { LayoutWorkerRequest, WorkerResponse } from "@/lib/standards-graph/worker-protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  const req = event.data;
  try {
    const positions = runForceLayout(req.nodes, req.edges, req.options);
    ctx.postMessage({ requestId: req.requestId, type: "FORCE", payload: positions } satisfies WorkerResponse);
  } catch (err) {
    ctx.postMessage({
      requestId: req.requestId,
      type: "ERROR",
      error: { code: "NOT_LOADED", message: err instanceof Error ? err.message : String(err) },
    } satisfies WorkerResponse);
  }
};
