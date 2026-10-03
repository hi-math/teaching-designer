/// <reference lib="webworker" />
// Data Worker — JSON 로드·validation·검색 index·상세 조회 (사양 §8.2, §9.5)

import { createDataEngine, EngineError } from "@/lib/standards-graph/data-engine";
import type { DataWorkerRequest, WorkerResponse } from "@/lib/standards-graph/worker-protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const engine = createDataEngine();
let datasetVersion: string | undefined;

const post = (msg: WorkerResponse) => ctx.postMessage(msg);

ctx.onmessage = async (event: MessageEvent<DataWorkerRequest>) => {
  const req = event.data;
  try {
    switch (req.type) {
      case "LOAD": {
        const summary = await engine.load(req.manifestUrl, (stage) =>
          post({ requestId: req.requestId, type: "PROGRESS", stage }),
        );
        datasetVersion = summary.datasetVersion;
        post({ requestId: req.requestId, type: "LOADED", datasetVersion, payload: summary });
        break;
      }
      case "SEARCH":
        post({ requestId: req.requestId, type: "SEARCH", datasetVersion, payload: engine.search(req.query, req.limit) });
        break;
      case "NODE_DETAILS":
        post({ requestId: req.requestId, type: "NODE_DETAILS", datasetVersion, payload: engine.nodeDetails(req.id) });
        break;
      case "EDGE_DETAILS":
        post({ requestId: req.requestId, type: "EDGE_DETAILS", datasetVersion, payload: engine.edgeDetails(req.id) });
        break;
      case "EXPORT":
        post({ requestId: req.requestId, type: "EXPORT", datasetVersion, payload: engine.exportItems(req.nodeIds, req.edgeIds) });
        break;
    }
  } catch (err) {
    const info =
      err instanceof EngineError
        ? err.info
        : { code: "NOT_LOADED" as const, message: err instanceof Error ? err.message : String(err) };
    post({ requestId: req.requestId, type: "ERROR", error: info });
  }
};
