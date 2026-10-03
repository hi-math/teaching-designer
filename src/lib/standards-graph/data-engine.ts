// 데이터 로드·validation·index·상세 조회 (사양 §9.3)
// Data Worker 와 main thread fallback 이 같은 코드를 쓴다.

import { buildSearchDocs, searchDocs, type SearchDoc, type SearchResult } from "./search";
import type {
  DataIssue,
  EdgesFile,
  GraphSummary,
  LightEdge,
  LightNode,
  NodesFile,
  OverviewLayoutFile,
  StandardEdge,
  StandardNode,
  StandardsGraphManifest,
} from "./types";
import { validateDataset } from "./validate";

export type LoadStage = "read" | "prepare";

export type EngineErrorCode = "NETWORK" | "PARSE" | "VERSION_MISMATCH" | "VALIDATION" | "NOT_LOADED" | "NOT_FOUND";

export interface EngineErrorInfo {
  code: EngineErrorCode;
  message: string;
  /** 실패한 자산 종류 (manifest / nodes / edges / layout) */
  asset?: string;
  itemId?: string;
  issues?: DataIssue[];
  versions?: Record<string, string>;
}

export class EngineError extends Error {
  info: EngineErrorInfo;
  constructor(info: EngineErrorInfo) {
    super(info.message);
    this.info = info;
  }
}

export interface EdgeDetails {
  edge: StandardEdge;
  source: StandardNode;
  target: StandardNode;
}

export interface DataEngine {
  load(manifestUrl: string, onStage?: (stage: LoadStage) => void): Promise<GraphSummary>;
  search(query: string, limit: number): SearchResult;
  nodeDetails(id: string): StandardNode;
  edgeDetails(id: string): EdgeDetails;
  exportItems(nodeIds: string[], edgeIds: string[]): { nodes: StandardNode[]; edges: StandardEdge[] };
}

const PREVIEW_LENGTH = 100;
const SHORT_LENGTH = 24;

export function displayText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clip(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

async function fetchAsset(url: string, asset: string, init?: RequestInit): Promise<ArrayBuffer> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new EngineError({ code: "NETWORK", asset, message: `${asset} 파일을 받지 못했습니다 (네트워크 오류).` });
  }
  if (!res.ok) {
    throw new EngineError({ code: "NETWORK", asset, message: `${asset} 파일을 받지 못했습니다 (HTTP ${res.status}).` });
  }
  return res.arrayBuffer();
}

function parseJson<T>(buf: ArrayBuffer, asset: string): T {
  try {
    return JSON.parse(new TextDecoder("utf-8").decode(buf)) as T;
  } catch {
    throw new EngineError({ code: "PARSE", asset, message: `${asset} 파일이 올바른 JSON이 아닙니다.` });
  }
}

async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * @param yieldEvery main thread 에서 실행할 때 index 생성 중간중간 UI 에 차례를 넘길 항목 수
 */
export function createDataEngine(options: { yieldEvery?: number } = {}): DataEngine {
  let nodeById = new Map<string, StandardNode>();
  let edgeById = new Map<string, StandardEdge>();
  let docs: SearchDoc[] = [];
  let loaded = false;

  const pause = async (i: number) => {
    if (options.yieldEvery && i > 0 && i % options.yieldEvery === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  };

  const requireLoaded = () => {
    if (!loaded) throw new EngineError({ code: "NOT_LOADED", message: "데이터가 아직 준비되지 않았습니다." });
  };

  return {
    async load(manifestUrl, onStage) {
      onStage?.("read");
      const manifestBuf = await fetchAsset(manifestUrl, "manifest", { cache: "no-cache" });
      const manifest = parseJson<StandardsGraphManifest>(manifestBuf, "manifest");
      // Worker 는 blob URL 에서 실행될 수 있으므로 자산 경로를 manifest 기준 절대 URL 로 바꾼다
      const resolve = (url: string) => {
        try {
          return new URL(url, manifestUrl).href;
        } catch {
          return url;
        }
      };

      const [nodesBuf, edgesBuf, layoutBuf] = await Promise.all([
        fetchAsset(resolve(manifest.files.nodes.url), "nodes"),
        fetchAsset(resolve(manifest.files.edges.url), "edges"),
        fetchAsset(resolve(manifest.files.overviewLayout.url), "layout").catch(() => null),
      ]);

      onStage?.("prepare");
      const [nodesHash, edgesHash] = await Promise.all([sha256Hex(nodesBuf), sha256Hex(edgesBuf)]);
      if (
        (nodesHash && nodesHash !== manifest.files.nodes.sha256) ||
        (edgesHash && edgesHash !== manifest.files.edges.sha256)
      ) {
        throw new EngineError({
          code: "VERSION_MISMATCH",
          message: "받은 데이터 파일이 manifest의 버전과 다릅니다.",
          versions: {
            datasetVersion: manifest.datasetVersion,
            "manifest nodes": manifest.files.nodes.sha256.slice(0, 16),
            "받은 nodes": (nodesHash ?? "").slice(0, 16),
            "manifest edges": manifest.files.edges.sha256.slice(0, 16),
            "받은 edges": (edgesHash ?? "").slice(0, 16),
          },
        });
      }

      const nodesFile = parseJson<NodesFile>(nodesBuf, "nodes");
      const edgesFile = parseJson<EdgesFile>(edgesBuf, "edges");
      const issues = validateDataset(nodesFile, edgesFile);
      if (issues.length) {
        const mismatch = issues.find((i) => i.code === "SOURCE_MISMATCH");
        throw new EngineError({
          code: mismatch ? "VERSION_MISMATCH" : "VALIDATION",
          message: mismatch ? "node 파일과 edge 파일의 원본 버전이 다릅니다." : "데이터 구조 검사에 실패했습니다.",
          issues,
          versions: mismatch
            ? {
                datasetVersion: manifest.datasetVersion,
                "nodes source_sha256": String(nodesFile.meta.source_sha256).slice(0, 16),
                "edges source_sha256": String(edgesFile.meta.source_sha256).slice(0, 16),
              }
            : undefined,
        });
      }

      let layout: OverviewLayoutFile | null = null;
      if (layoutBuf) {
        try {
          const parsed = parseJson<OverviewLayoutFile>(layoutBuf, "layout");
          if (parsed.datasetVersion === manifest.datasetVersion) layout = parsed;
          else console.warn("[standards-graph] overview-layout 의 datasetVersion 이 달라 저장된 배치를 쓰지 않습니다.");
        } catch {
          console.warn("[standards-graph] overview-layout.json 을 읽지 못했습니다.");
        }
      }

      nodeById = new Map();
      const lightNodes: LightNode[] = [];
      for (let i = 0; i < nodesFile.nodes.length; i++) {
        await pause(i);
        const n = nodesFile.nodes[i];
        nodeById.set(n.id, n);
        const text = displayText(n.content);
        lightNodes.push({
          id: n.id,
          code: n.code,
          order: n.order,
          subject: n.subject,
          subjectGroup: n.subject_group,
          domain: n.domain,
          preview: clip(text, PREVIEW_LENGTH),
          short: clip(text, SHORT_LENGTH),
        });
      }
      docs = buildSearchDocs(nodesFile.nodes);

      edgeById = new Map();
      const lightEdges: LightEdge[] = [];
      for (let i = 0; i < edgesFile.edges.length; i++) {
        await pause(i);
        const e = edgesFile.edges[i];
        edgeById.set(e.id, e);
        lightEdges.push({
          id: e.id,
          source: e.source,
          target: e.target,
          weight: e.weight,
          dw: { ...e.dimension_weights },
          cross: e.cross_subject,
          lh: e.learning_hierarchy
            ? {
                foundation: e.learning_hierarchy.foundation,
                application: e.learning_hierarchy.application,
                weight: e.learning_hierarchy.weight,
              }
            : null,
        });
      }

      const topicCatalog: Record<string, string> = {};
      for (const [id, entry] of Object.entries(edgesFile.meta.topic_catalog ?? {})) topicCatalog[id] = entry.label;
      const method = (edgesFile.meta.method ?? {}) as Record<string, unknown>;

      loaded = true;
      return {
        datasetVersion: manifest.datasetVersion,
        schemaVersion: manifest.schemaVersion,
        generatedDate: manifest.generatedDate,
        nodes: lightNodes,
        edges: lightEdges,
        topicCatalog,
        competencyCatalog: { ...(edgesFile.meta.competency_catalog ?? {}) },
        weightRubric: { ...(edgesFile.meta.weight_rubric ?? {}) },
        method: {
          description: String(method.description ?? ""),
          model: String(method.model ?? ""),
          edgeWeight: String(method.edge_weight ?? ""),
          learningHierarchy: String(method.learning_hierarchy ?? ""),
        },
        layout,
      };
    },

    search(query, limit) {
      requireLoaded();
      return searchDocs(docs, query, limit);
    },

    nodeDetails(id) {
      requireLoaded();
      const node = nodeById.get(id);
      if (!node) throw new EngineError({ code: "NOT_FOUND", itemId: id, message: `성취기준을 찾을 수 없습니다: ${id}` });
      return node;
    },

    edgeDetails(id) {
      requireLoaded();
      const edge = edgeById.get(id);
      if (!edge) throw new EngineError({ code: "NOT_FOUND", itemId: id, message: `관계를 찾을 수 없습니다: ${id}` });
      return { edge, source: nodeById.get(edge.source)!, target: nodeById.get(edge.target)! };
    },

    exportItems(nodeIds, edgeIds) {
      requireLoaded();
      const edges = edgeIds.map((id) => edgeById.get(id)).filter((e): e is StandardEdge => !!e);
      // 모든 edge endpoint 가 node 목록에 들어가도록 보충한다
      const ids = new Set(nodeIds);
      for (const e of edges) {
        ids.add(e.source);
        ids.add(e.target);
      }
      const nodes = [...ids].map((id) => nodeById.get(id)).filter((n): n is StandardNode => !!n);
      return { nodes, edges };
    },
  };
}
