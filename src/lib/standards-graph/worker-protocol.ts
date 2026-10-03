// Worker 메시지 계약 (사양 §9.5)

import type { EngineErrorInfo, LoadStage } from "./data-engine";
import type { ForceInputEdge, ForceInputNode, ForceOptions } from "./layout-force";

export type DataWorkerRequest =
  | { requestId: number; type: "LOAD"; manifestUrl: string }
  | { requestId: number; type: "SEARCH"; query: string; limit: number }
  | { requestId: number; type: "NODE_DETAILS"; id: string }
  | { requestId: number; type: "EDGE_DETAILS"; id: string }
  | { requestId: number; type: "EXPORT"; nodeIds: string[]; edgeIds: string[] };

export type LayoutWorkerRequest = {
  requestId: number;
  type: "FORCE";
  nodes: ForceInputNode[];
  edges: ForceInputEdge[];
  options: ForceOptions;
};

export type WorkerResponse = {
  requestId: number;
  type: string;
  datasetVersion?: string;
  payload?: unknown;
  /** LOAD 진행 단계 알림 */
  stage?: LoadStage;
  error?: EngineErrorInfo;
};
